const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nhip-test-"));
process.env.DB_PATH = path.join(dir, "test.sqlite");
const { db, mutate, data, server, ensureReady } = require("./server");
before(ensureReady);
after(async () => db.close());
const hr = { id: 1, role: "admin" },
  employee = { id: 3, role: "employee" },
  ctv = { id: 21, role: "contractor" };
test("Phiên đăng nhập tồn tại qua cold start và đăng xuất thu hồi phiên", async () => {
  const crypto = require("node:crypto"),
    { spawnSync } = require("node:child_process");
  const token = crypto.randomBytes(32).toString("hex"),
    hashed = crypto.createHash("sha256").update(token).digest("hex");
  await db
    .prepare("INSERT INTO sessions(token,person,expires) VALUES(?,?,?)")
    .run(hashed, 21, Date.now() + 60000);
  const request = (url, method = "GET") => {
    const script = `const {handler}=require('./server');let status,body;handler({url:process.env.TEST_URL,method:process.env.TEST_METHOD,headers:{cookie:'sid='+process.env.TEST_COOKIE},body:{}},{writeHead(s){status=s},setHeader(){},end(b){body=b;console.log(JSON.stringify({status,body:JSON.parse(body)}));require('./database').close()}});`;
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: __dirname,
      env: {
        ...process.env,
        TEST_COOKIE: token,
        TEST_URL: url,
        TEST_METHOD: method,
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.equal(request("/api/data").body.user.id, 21);
  assert.equal(request("/api/logout", "POST").status, 200);
  assert.equal(request("/api/data").status, 401);
});
test("Lỗi giữa thao tác hoàn tác database và nhật ký", async () => {
  const before = await db.prepare("SELECT hours FROM settings").get();
  await assert.rejects(
    () =>
      db.transaction(async () => {
        await mutate(hr, {
          action: "settings",
          hours: 6,
          breakMinutes: 30,
          start: "08:00",
          end: "16:00",
        });
        throw Error("Giả lập lỗi");
      }),
    /Giả lập lỗi/,
  );
  assert.equal(
    (await db.prepare("SELECT hours FROM settings").get()).hours,
    before.hours,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM audit WHERE action='settings'")
        .get()
    ).n,
    0,
  );
});
test("Dữ liệu mẫu đủ 20 nội bộ và 8 CTV", async () => {
  assert.equal(
    (await data(hr)).people.filter((x) => x.type === "Nội bộ").length,
    20,
  );
  assert.equal(
    (await data(hr)).people.filter((x) => x.type === "Cộng tác viên").length,
    8,
  );
});
test("Quyền máy chủ và dữ liệu cá nhân", async () => {
  assert.equal((await data(ctv)).people.length, 1);
  assert.ok((await data(ctv)).attendance.every((a) => a.person === 21));
  await assert.rejects(
    async () => await mutate(employee, { action: "settings", hours: 8 }),
    /quyền/,
  );
  await assert.rejects(
    async () =>
      await mutate(employee, { action: "checkout", id: 1, note: "test" }),
    /quyền/,
  );
  await assert.rejects(
    async () => await mutate(employee, { action: "approveResult", id: 1 }),
    /quyền/,
  );
});
test("Phát hiện trùng ca", async () => {
  const s = await db.prepare("SELECT * FROM shifts WHERE id=1").get();
  await assert.rejects(
    async () =>
      await mutate(hr, {
        action: "shift",
        title: "Trùng",
        start: s.start,
        end: s.end,
        people: [21],
        lead: 21,
      }),
    /Trùng lịch/,
  );
});
test("Từ chối ca cần lý do", async () => {
  const u = { id: 22, role: "contractor" };
  await assert.rejects(
    async () =>
      await mutate(u, { action: "respond", id: 2, status: "Từ chối" }),
    /lý do/,
  );
  await mutate(u, {
    action: "respond",
    id: 2,
    status: "Từ chối",
    reason: "Bận",
  });
  assert.equal(
    (await db.prepare("SELECT status FROM assignments WHERE id=2").get())
      .status,
    "Từ chối",
  );
});
test("Thiếu check-out không được duyệt", async () =>
  await assert.rejects(
    async () =>
      await mutate(hr, {
        action: "approveTime",
        id: 2,
        hours: 8,
        reason: "Kiểm tra",
      }),
    /check-out/,
  ));
test("Định vị lỗi cho phép giải trình, không tự hoàn thành ca", async () => {
  await assert.rejects(
    async () => await mutate(employee, { action: "checkin" }),
    /giải trình/,
  );
  await mutate(employee, { action: "checkin", note: "Không cấp quyền vị trí" });
  const a = await db.prepare("SELECT * FROM attendance WHERE person=3").get();
  assert.equal(a.lat, null);
  assert.equal(a.status, "Chờ duyệt");
  await mutate(employee, {
    action: "checkout",
    id: a.id,
    note: "Thiết bị không có GPS",
  });
  assert.ok(
    (await db.prepare("SELECT checkout FROM attendance WHERE id=?").get(a.id))
      .checkout,
  );
});
test("Điều chỉnh thiếu check-out và duyệt giờ riêng biệt", async () => {
  await mutate(ctv, {
    action: "request",
    kind: "Điều chỉnh công",
    attendance: 2,
    start: "2026-10-13T09:00:00+07:00",
    end: "2026-10-13T17:00:00+07:00",
    reason: "Quên check-out",
  });
  const r = await db.prepare("SELECT * FROM requests ORDER BY id DESC").get();
  await mutate(hr, {
    action: "approveRequest",
    id: r.id,
    accept: true,
    reason: "Đối chiếu xác nhận",
  });
  let a = await db.prepare("SELECT * FROM attendance WHERE id=2").get();
  assert.equal(a.hours, 7);
  assert.equal(a.approved, 0);
  await mutate(hr, {
    action: "approveTime",
    id: 2,
    hours: 7,
    reason: "Đã kiểm tra",
  });
  assert.equal(
    (await db.prepare("SELECT approved FROM attendance WHERE id=2").get())
      .approved,
    7,
  );
});
test("Từ chối bàn giao đưa ca về đang thực hiện", async () => {
  await mutate(hr, {
    action: "approveResult",
    id: 1,
    accept: false,
    reason: "Thiếu biên bản",
  });
  assert.equal(
    (await db.prepare("SELECT status FROM shifts WHERE id=2").get()).status,
    "Đang thực hiện",
  );
  assert.ok((await db.prepare("SELECT COUNT(*) n FROM audit").get()).n > 0);
});
test("Đơn giá phân công giữ lịch sử", async () => {
  const before = (
    await db.prepare("SELECT rate FROM assignments WHERE id=1").get()
  ).rate;
  await db.prepare("UPDATE people SET rate=999999 WHERE id=21").run();
  assert.equal(
    (await db.prepare("SELECT rate FROM assignments WHERE id=1").get()).rate,
    before,
  );
});
test("API đăng nhập và chống truy cập chưa xác thực", async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const root = "http://127.0.0.1:" + server.address().port;
  try {
    assert.equal((await fetch(root + "/api/data")).status, 401);
    const r = await fetch(root + "/api/login", {
      method: "POST",
      body: JSON.stringify({ email: "user21@demo.vn", password: "Demo@123" }),
    });
    assert.equal(r.status, 200);
    const cookie = r.headers.get("set-cookie").split(";")[0];
    const data = await (
      await fetch(root + "/api/data", { headers: { cookie } })
    ).json();
    assert.equal(data.user.id, 21);
    assert.equal(data.people.length, 1);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

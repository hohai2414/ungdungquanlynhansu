const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const db = require("./database");

const hash = (p) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(p, salt, 32).toString("hex");
};
const verify = (p, h) => {
  const [s, v] = h.split(":");
  return crypto.timingSafeEqual(
    crypto.scryptSync(p, s, 32),
    Buffer.from(v, "hex"),
  );
};
const now = () => new Date().toISOString(),
  day = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
      new Date(),
    );
let initialization;
async function ensureReady() {
  if (!initialization)
    initialization = initialize().catch((e) => {
      initialization = undefined;
      throw e;
    });
  return initialization;
}
async function initialize() {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS people(id INTEGER PRIMARY KEY,name TEXT,email TEXT UNIQUE,phone TEXT,type TEXT,role TEXT,team TEXT,manager INTEGER,start TEXT,active INTEGER DEFAULT 1,area TEXT,skills TEXT,availability TEXT,rate REAL,unit TEXT,password TEXT); CREATE TABLE IF NOT EXISTS shifts(id INTEGER PRIMARY KEY,title TEXT,project TEXT,location TEXT,map TEXT,start TEXT,end TEXT,lead INTEGER,required INTEGER,instructions TEXT,deliverable TEXT,status TEXT DEFAULT 'Chờ xác nhận'); CREATE TABLE IF NOT EXISTS assignments(id INTEGER PRIMARY KEY,shift INTEGER REFERENCES shifts(id),person INTEGER REFERENCES people(id),status TEXT,reason TEXT,rate REAL,unit TEXT,UNIQUE(shift,person)); CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY,person INTEGER REFERENCES people(id),shift INTEGER REFERENCES shifts(id),checkin TEXT,checkout TEXT,lat REAL,lng REAL,note TEXT,evidence TEXT,hours REAL DEFAULT 0,approved REAL DEFAULT 0,status TEXT DEFAULT 'Chờ duyệt',payment TEXT DEFAULT 'Tiền dự kiến'); CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY,person INTEGER REFERENCES people(id),kind TEXT,start TEXT,end TEXT,quantity REAL,reason TEXT,status TEXT DEFAULT 'Chờ duyệt',attendance INTEGER,assignment INTEGER); CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY,shift INTEGER REFERENCES shifts(id),person INTEGER REFERENCES people(id),note TEXT,evidence TEXT,status TEXT DEFAULT 'Chờ duyệt'); CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor INTEGER,action TEXT,entity TEXT,reason TEXT,time TEXT); CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,hours REAL,breakMinutes REAL,start TEXT,end TEXT); INSERT OR IGNORE INTO settings VALUES(1,8,60,'08:00','17:00');`,
  );
  await await db.exec(
    "CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,person INTEGER REFERENCES people(id),expires INTEGER);",
  );
  await db.transaction(async () => {
    const seedPassword = process.env.DEMO_PASSWORD || "Demo@123";
    if (
      process.env.VERCEL &&
      (!process.env.DEMO_PASSWORD || seedPassword.length < 5) &&
      !(await db.prepare("SELECT id FROM people LIMIT 1").get())
    )
      fail(
        "Thêm DEMO_PASSWORD tối thiểu 5 ký tự vào Vercel để khởi tạo tài khoản mẫu.",
        503,
      );
    if (!(await db.prepare("SELECT id FROM people LIMIT 1").get())) {
      const names = [
        "Nguyễn Minh Anh",
        "Trần Quốc Huy",
        "Lê Thu Hà",
        "Phạm Đức Long",
        "Hoàng Ngọc Mai",
        "Vũ Hải Nam",
        "Đặng Thanh Tâm",
        "Bùi Gia Hân",
        "Đỗ Tuấn Kiệt",
        "Ngô Phương Linh",
        "Dương Việt Hoàng",
        "Lý Bảo Ngọc",
        "Phan Minh Khang",
        "Trịnh Thảo Vy",
        "Mai Quang Vinh",
        "Cao Khánh An",
        "Võ Thành Đạt",
        "Lâm Như Quỳnh",
        "Huỳnh Nhật Minh",
        "Tạ Hoài Phương",
        "Nguyễn Văn Sơn",
        "Trần Mỹ Duyên",
        "Lê Anh Tú",
        "Phạm Ngọc Ánh",
        "Vũ Đức Hùng",
        "Đỗ Bảo Trâm",
        "Bùi Minh Đức",
        "Hoàng Thanh Ngân",
      ];
      for (const [i, n] of names.entries())
        await db
          .prepare("INSERT INTO people VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(
            i + 1,
            n,
            `user${i + 1}@demo.vn`,
            `090${String(i + 1).padStart(7, "0")}`,
            i < 20 ? "Nội bộ" : "Cộng tác viên",
            i === 0
              ? "admin"
              : i === 1
                ? "manager"
                : i < 20
                  ? "employee"
                  : "contractor",
            i < 20 ? "Vận hành" : "Hiện trường",
            2,
            "2026-01-01",
            1,
            "TP. Hồ Chí Minh",
            "Khảo sát, chụp ảnh",
            "Thứ 2 – Thứ 7",
            80000,
            "giờ",
            hash(seedPassword),
          );
      const d = day();
      for (const [i, s] of [
        [
          "Khảo sát mặt bằng · Quận 1",
          "Nova Retail",
          "12 Nguyễn Huệ",
          "09:00",
          "17:00",
          2,
          3,
        ],
        [
          "Kiểm kê thiết bị · Thủ Đức",
          "Green Office",
          "Thủ Đức",
          "08:00",
          "16:00",
          2,
          2,
        ],
        [
          "Báo cáo vận hành tuần",
          "Nội bộ",
          "Văn phòng",
          "08:00",
          "17:00",
          2,
          2,
        ],
      ].entries()) {
        await db
          .prepare(
            "INSERT INTO shifts(title,project,location,map,start,end,lead,required,instructions,deliverable,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            s[0],
            s[1],
            s[2],
            "https://maps.google.com/?q=" + encodeURIComponent(s[2]),
            d + "T" + s[3] + ":00+07:00",
            d + "T" + s[4] + ":00+07:00",
            s[5],
            s[6],
            "Kiểm tra danh sách trước khi bắt đầu. Liên hệ người phụ trách khi phát sinh.",
            "Ảnh và biên bản hoàn thành",
            i === 1 ? "Chờ duyệt" : "Chờ xác nhận",
          );
      }
      for (const x of [
        [1, 21, "Đã nhận"],
        [1, 22, "Chờ xác nhận"],
        [2, 23, "Đã nhận"],
        [3, 3, "Đã nhận"],
      ])
        await db
          .prepare(
            "INSERT INTO assignments(shift,person,status,rate,unit) VALUES(?,?,?,?,?)",
          )
          .run(...x, 80000, "giờ");
      await db
        .prepare(
          "INSERT INTO requests(person,kind,start,end,quantity,reason) VALUES(?,?,?,?,?,?)",
        )
        .run(5, "Nghỉ phép", d, d, 0.5, "Việc gia đình");
      await db
        .prepare(
          "INSERT INTO attendance(person,shift,checkin,checkout,hours,note) VALUES(?,?,?,?,?,?)",
        )
        .run(
          23,
          2,
          d + "T08:05:00+07:00",
          d + "T16:00:00+07:00",
          6.9167,
          "Dữ liệu minh họa",
        );
      await db
        .prepare(
          "INSERT INTO attendance(person,shift,checkin,note) VALUES(?,?,?,?)",
        )
        .run(21, 1, d + "T09:20:00+07:00", "Dữ liệu minh họa: thiếu check-out");
      await db
        .prepare("INSERT INTO results(shift,person,note) VALUES(?,?,?)")
        .run(2, 23, "Đã kiểm kê 32 thiết bị. Chờ xác nhận biên bản.");
    }
  });
}
const managers = ["admin", "manager"];
async function audit(u, a, e, r) {
  await db
    .prepare(
      "INSERT INTO audit(actor,action,entity,reason,time) VALUES(?,?,?,?,?)",
    )
    .run(u.id, a, String(e), r || "", now());
}
function fail(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  throw e;
}
function allowed(u, roles) {
  if (!roles.includes(u.role))
    fail("Bạn không có quyền thực hiện thao tác này.", 403);
}
function own(u, id) {
  if (!managers.includes(u.role) && u.id !== id)
    fail("Dữ liệu nằm ngoài quyền truy cập.", 403);
}
const all = async (sql, ...args) => await db.prepare(sql).all(...args),
  get = async (sql, ...args) => await db.prepare(sql).get(...args);
async function data(u) {
  const m = managers.includes(u.role);
  const people = await all(
    "SELECT id,name,email,phone,type,role,team,manager,start,active,area,skills,availability,rate,unit FROM people" +
      (m ? "" : " WHERE id=?"),
    ...(m ? [] : [u.id]),
  );
  return {
    user: u,
    people,
    shifts: await all(
      "SELECT * FROM shifts" +
        (m
          ? ""
          : " WHERE id IN (SELECT shift FROM assignments WHERE person=?)"),
      ...(m ? [] : [u.id]),
    ),
    assignments: await all(
      "SELECT * FROM assignments" + (m ? "" : " WHERE person=?"),
      ...(m ? [] : [u.id]),
    ),
    attendance: await all(
      "SELECT * FROM attendance" + (m ? "" : " WHERE person=?"),
      ...(m ? [] : [u.id]),
    ),
    requests: await all(
      "SELECT * FROM requests" + (m ? "" : " WHERE person=?"),
      ...(m ? [] : [u.id]),
    ),
    results: await all(
      "SELECT * FROM results" + (m ? "" : " WHERE person=?"),
      ...(m ? [] : [u.id]),
    ),
    audit: m ? await all("SELECT * FROM audit ORDER BY id DESC LIMIT 100") : [],
    settings: await get("SELECT * FROM settings"),
    today: day(),
  };
}
async function mutate(u, b) {
  const m = managers.includes(u.role);
  switch (b.action) {
    case "person":
      allowed(u, ["admin"]);
      if (!b.name || !b.email) fail("Nhập họ tên và email.");
      if (!["admin", "manager", "employee", "contractor"].includes(b.role))
        fail("Vai trò không hợp lệ.");
      if (b.id) {
        await db
          .prepare(
            "UPDATE people SET name=?,email=?,phone=?,type=?,role=?,team=?,active=?,area=?,skills=?,availability=?,rate=?,unit=? WHERE id=?",
          )
          .run(
            b.name,
            b.email,
            b.phone || "",
            b.type,
            b.role,
            b.team || "",
            b.active ? 1 : 0,
            b.area || "",
            b.skills || "",
            b.availability || "",
            Number(b.rate) || 0,
            b.unit || "giờ",
            b.id,
          );
      } else {
        if (!b.password || b.password.length < 8)
          fail("Mật khẩu tối thiểu 8 ký tự.");
        await db
          .prepare(
            "INSERT INTO people(name,email,phone,type,role,team,manager,start,active,area,skills,availability,rate,unit,password) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            b.name,
            b.email,
            b.phone || "",
            b.type,
            b.role,
            b.team || "",
            2,
            day(),
            1,
            b.area || "",
            b.skills || "",
            b.availability || "",
            Number(b.rate) || 0,
            b.unit || "giờ",
            hash(b.password),
          );
      }
      break;
    case "shift":
      allowed(u, managers);
      if (
        !b.title ||
        !b.start ||
        !b.end ||
        Date.parse(b.end) <= Date.parse(b.start) ||
        !b.people?.length ||
        !b.people.includes(Number(b.lead))
      )
        fail("Kiểm tra tên, thời gian và người phụ trách thuộc nhóm tham gia.");
      for (const id of b.people) {
        const p = await get("SELECT * FROM people WHERE id=? AND active=1", id);
        if (!p) fail("Nhân sự không hoạt động.");
        const conflict = await get(
          "SELECT s.title FROM shifts s JOIN assignments a ON s.id=a.shift WHERE a.person=? AND a.status NOT IN ('Từ chối','Hủy') AND s.status!='Hủy' AND s.start<? AND s.end>?",
          id,
          b.end,
          b.start,
        );
        if (conflict) fail("Trùng lịch: " + p.name + " · " + conflict.title);
        if (
          await get(
            "SELECT id FROM requests WHERE person=? AND kind='Nghỉ phép' AND status='Đã duyệt' AND start<=? AND end>=?",
            id,
            b.end.slice(0, 10),
            b.start.slice(0, 10),
          )
        )
          fail(p.name + " có nghỉ phép đã duyệt.");
      }
      const sid = (
        await db
          .prepare(
            "INSERT INTO shifts(title,project,location,map,start,end,lead,required,instructions,deliverable) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            b.title,
            b.project || "",
            b.location || "",
            b.map || "",
            b.start,
            b.end,
            b.lead,
            Math.max(1, Number(b.required) || 1),
            b.instructions || "",
            b.deliverable || "",
          )
      ).lastInsertRowid;
      for (const id of b.people) {
        const p = await get("SELECT * FROM people WHERE id=?", id);
        await db
          .prepare(
            "INSERT INTO assignments(shift,person,status,rate,unit) VALUES(?,?,?,?,?)",
          )
          .run(sid, id, "Chờ xác nhận", p.rate, p.unit);
      }
      break;
    case "respond": {
      const a = await get("SELECT * FROM assignments WHERE id=?", b.id);
      if (!a) fail("Không tìm thấy ca.");
      own(u, a.person);
      if (a.status !== "Chờ xác nhận") fail("Ca đã được phản hồi.");
      if (!["Đã nhận", "Từ chối"].includes(b.status))
        fail("Trạng thái không hợp lệ.");
      if (b.status === "Từ chối" && !b.reason) fail("Cần lý do từ chối.");
      await db
        .prepare("UPDATE assignments SET status=?,reason=? WHERE id=?")
        .run(b.status, b.reason || "", b.id);
      break;
    }
    case "checkin": {
      let s = null;
      if (b.shift) {
        s = await get("SELECT * FROM shifts WHERE id=?", b.shift);
        const a = await get(
          "SELECT * FROM assignments WHERE shift=? AND person=?",
          b.shift,
          u.id,
        );
        if (
          !s ||
          !a ||
          !["Đã nhận", "Đang thực hiện"].includes(a.status) ||
          s.status === "Hủy"
        )
          fail("Bạn cần nhận ca trước khi chấm công.");
      } else if (u.role === "contractor") fail("Cộng tác viên phải chọn ca.");
      if (
        await get(
          "SELECT id FROM attendance WHERE person=? AND checkout IS NULL",
          u.id,
        )
      )
        fail("Bạn còn một lượt chưa check-out.");
      if ((b.lat == null || b.lng == null) && !b.note)
        fail("Không có vị trí: cần giải trình hoặc ghi chú.");
      await db
        .prepare(
          "INSERT INTO attendance(person,shift,checkin,lat,lng,note,evidence) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          u.id,
          b.shift || null,
          now(),
          b.lat ?? null,
          b.lng ?? null,
          b.note || "",
          b.evidence || "",
        );
      if (s) {
        await db
          .prepare(
            "UPDATE assignments SET status='Đang thực hiện' WHERE shift=? AND person=?",
          )
          .run(b.shift, u.id);
        await db
          .prepare("UPDATE shifts SET status='Đang thực hiện' WHERE id=?")
          .run(b.shift);
      }
      break;
    }
    case "checkout": {
      const a = await get("SELECT * FROM attendance WHERE id=?", b.id);
      if (!a) fail("Không tìm thấy lượt công.");
      own(u, a.person);
      if (a.checkout) fail("Đã check-out.");
      if ((b.lat == null || b.lng == null) && !b.note)
        fail("Cần giải trình khi không có vị trí.");
      const h = Math.max(
        0,
        (Date.now() - Date.parse(a.checkin)) / 3600000 -
          (await get("SELECT breakMinutes FROM settings")).breakMinutes / 60,
      );
      await db
        .prepare(
          "UPDATE attendance SET checkout=?,hours=?,note=?,evidence=? WHERE id=?",
        )
        .run(
          now(),
          h,
          a.note +
            "\nCheck-out: " +
            (b.note || "") +
            " " +
            (b.lat != null ? `${b.lat},${b.lng}` : ""),
          b.evidence || a.evidence,
          b.id,
        );
      break;
    }
    case "result": {
      const a = await get(
        "SELECT * FROM assignments WHERE shift=? AND person=?",
        b.shift,
        u.id,
      );
      if (!a || !["Đã nhận", "Đang thực hiện"].includes(a.status))
        fail("Bạn chưa nhận ca này.");
      if (!b.note) fail("Nhập kết quả bàn giao.");
      await db
        .prepare(
          "INSERT INTO results(shift,person,note,evidence) VALUES(?,?,?,?)",
        )
        .run(b.shift, u.id, b.note, b.evidence || "");
      await db
        .prepare("UPDATE shifts SET status='Chờ duyệt' WHERE id=?")
        .run(b.shift);
      break;
    }
    case "approveResult": {
      allowed(u, managers);
      const r = await get("SELECT * FROM results WHERE id=?", b.id);
      if (!r || r.status !== "Chờ duyệt") fail("Kết quả đã xử lý.");
      if (!b.reason) fail("Nhập lý do xác nhận.");
      await db
        .prepare("UPDATE results SET status=? WHERE id=?")
        .run(b.accept ? "Đã duyệt" : "Từ chối", b.id);
      await db
        .prepare("UPDATE shifts SET status=? WHERE id=?")
        .run(b.accept ? "Hoàn thành" : "Đang thực hiện", r.shift);
      break;
    }
    case "approveTime": {
      allowed(u, managers);
      const a = await get("SELECT * FROM attendance WHERE id=?", b.id);
      if (!a || !a.checkout)
        fail("Cần check-out hoặc điều chỉnh dữ liệu trước.");
      if (
        !b.reason ||
        !Number.isFinite(Number(b.hours)) ||
        Number(b.hours) < 0 ||
        Number(b.hours) > 24
      )
        fail("Nhập số giờ hợp lệ và lý do.");
      await db
        .prepare(
          "UPDATE attendance SET approved=?,status='Đã duyệt' WHERE id=?",
        )
        .run(Number(b.hours), b.id);
      break;
    }
    case "request":
      if (
        !["Nghỉ phép", "Lịch rảnh/bận", "Hủy ca", "Điều chỉnh công"].includes(
          b.kind,
        ) ||
        !b.reason
      )
        fail("Cần loại yêu cầu và lý do.");
      if (u.role === "contractor" && b.kind === "Nghỉ phép")
        fail("Cộng tác viên sử dụng lịch rảnh/bận.");
      if (b.attendance) {
        const a = await get(
          "SELECT * FROM attendance WHERE id=?",
          b.attendance,
        );
        if (!a) fail("Không tìm thấy công.");
        own(u, a.person);
      }
      if (b.assignment) {
        const a = await get(
          "SELECT * FROM assignments WHERE id=?",
          b.assignment,
        );
        if (!a) fail("Không tìm thấy ca.");
        own(u, a.person);
      }
      if (
        ["Nghỉ phép", "Lịch rảnh/bận"].includes(b.kind) &&
        (!b.start || !b.end || b.end < b.start)
      )
        fail("Kiểm tra khoảng ngày.");
      if (
        b.kind === "Điều chỉnh công" &&
        (!b.attendance ||
          !b.start ||
          !b.end ||
          Date.parse(b.end) <= Date.parse(b.start))
      )
        fail("Chọn lượt công và thời gian đúng.");
      if (b.kind === "Hủy ca" && !b.assignment) fail("Chọn ca cần hủy.");
      await db
        .prepare(
          "INSERT INTO requests(person,kind,start,end,quantity,reason,attendance,assignment) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          u.id,
          b.kind,
          b.start || "",
          b.end || "",
          Number(b.quantity) || 1,
          b.reason,
          b.attendance || null,
          b.assignment || null,
        );
      break;
    case "approveRequest": {
      allowed(u, managers);
      const r = await get("SELECT * FROM requests WHERE id=?", b.id);
      if (!r || r.status !== "Chờ duyệt" || !b.reason)
        fail("Yêu cầu đã xử lý hoặc thiếu lý do.");
      await db
        .prepare("UPDATE requests SET status=? WHERE id=?")
        .run(b.accept ? "Đã duyệt" : "Từ chối", b.id);
      if (b.accept && r.kind === "Hủy ca")
        await db
          .prepare("UPDATE assignments SET status='Hủy',reason=? WHERE id=?")
          .run(b.reason, r.assignment);
      if (b.accept && r.kind === "Điều chỉnh công") {
        const h = Math.max(
          0,
          (Date.parse(r.end) - Date.parse(r.start)) / 3600000 -
            (await get("SELECT breakMinutes FROM settings")).breakMinutes / 60,
        );
        await db
          .prepare(
            "UPDATE attendance SET checkin=?,checkout=?,hours=?,approved=0,status='Chờ duyệt' WHERE id=?",
          )
          .run(r.start, r.end, h, r.attendance);
      }
      break;
    }
    case "payment":
      allowed(u, ["admin"]);
      if (
        !["Tiền dự kiến", "Đã duyệt thanh toán", "Đã thanh toán"].includes(
          b.status,
        ) ||
        !b.reason
      )
        fail("Nhập trạng thái và lý do.");
      if (
        !(await get(
          "SELECT id FROM attendance WHERE id=? AND status='Đã duyệt'",
          b.id,
        ))
      )
        fail("Công chưa được duyệt.");
      await db
        .prepare("UPDATE attendance SET payment=? WHERE id=?")
        .run(b.status, b.id);
      break;
    case "cancelShift":
      allowed(u, managers);
      if (!b.reason) fail("Cần lý do hủy ca.");
      await db.prepare("UPDATE shifts SET status='Hủy' WHERE id=?").run(b.id);
      await db
        .prepare("UPDATE assignments SET status='Hủy' WHERE shift=?")
        .run(b.id);
      break;
    case "settings":
      allowed(u, ["admin"]);
      if (
        !(
          b.hours > 0 &&
          b.hours <= 24 &&
          b.breakMinutes >= 0 &&
          b.breakMinutes < 1440
        )
      )
        fail("Cấu hình giờ không hợp lệ.");
      await db
        .prepare(
          "UPDATE settings SET hours=?,breakMinutes=?,start=?,end=? WHERE id=1",
        )
        .run(b.hours, b.breakMinutes, b.start, b.end);
      break;
    default:
      fail("Thao tác không hợp lệ.");
  }
  await audit(u, b.action, b.id || b.shift || "", b.reason || b.note || "");
  return await data(u);
}
async function handler(req, res) {
  const send = (s, v, type = "application/json") => {
    res.writeHead(s, {
      "Content-Type": type + "; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    res.end(type === "application/json" ? JSON.stringify(v) : v);
  };
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") {
      return send(
        200,
        fs.readFileSync(path.join(__dirname, "index.html"), "utf8"),
        "text/html",
      );
    }
    if (!url.pathname.startsWith("/api/"))
      return send(404, { error: "Không tìm thấy" });
    await ensureReady();
    if (url.pathname === "/api/health" && req.method === "GET")
      return send(200, {
        ok: true,
        storage: process.env.TURSO_DATABASE_URL ? "remote" : "local",
      });
    let b = {};
    if (req.method === "POST") {
      if (
        req.headers.origin &&
        req.headers.origin !==
          `${process.env.VERCEL ? "https" : "http"}://${req.headers.host}`
      )
        fail("Nguồn yêu cầu không hợp lệ.", 403);
      let raw = "";
      if (req.body !== undefined) {
        b = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      } else {
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 4e6) fail("Tệp quá lớn.", 413);
        }
        b = JSON.parse(raw || "{}");
      }
    }
    if (url.pathname === "/api/login") {
      if (req.method !== "POST") fail("Phương thức không hợp lệ.", 405);
      const p = await get(
        "SELECT * FROM people WHERE email=? AND active=1",
        b.email,
      );
      if (!p || !verify(String(b.password || ""), p.password))
        fail("Email hoặc mật khẩu không đúng.", 401);
      const token = crypto.randomBytes(32).toString("hex");
      await db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      await db
        .prepare("INSERT INTO sessions(token,person,expires) VALUES(?,?,?)")
        .run(
          crypto.createHash("sha256").update(token).digest("hex"),
          p.id,
          Date.now() + 28800000,
        );
      res.setHeader(
        "Set-Cookie",
        `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.VERCEL ? "; Secure" : ""}`,
      );
      return send(200, { ok: true });
    }
    const token = (req.headers.cookie || "").match(/sid=([^;]+)/)?.[1],
      session = token
        ? await db
            .prepare("SELECT person AS id,expires FROM sessions WHERE token=?")
            .get(crypto.createHash("sha256").update(token).digest("hex"))
        : null;
    if (!session || session.expires < Date.now())
      fail("Vui lòng đăng nhập.", 401);
    const p = await get(
      "SELECT * FROM people WHERE id=? AND active=1",
      session.id,
    );
    if (!p) fail("Tài khoản đã ngừng hoạt động.", 401);
    const u = { id: p.id, name: p.name, role: p.role, type: p.type };
    if (url.pathname === "/api/data" && req.method === "GET")
      return send(200, await data(u));
    if (url.pathname === "/api/logout" && req.method === "POST") {
      await db
        .prepare("DELETE FROM sessions WHERE token=?")
        .run(crypto.createHash("sha256").update(token).digest("hex"));
      res.setHeader(
        "Set-Cookie",
        "sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" +
          (process.env.VERCEL ? "; Secure" : ""),
      );
      return send(200, { ok: true });
    }
    if (url.pathname === "/api/action" && req.method === "POST") {
      const d = await db.transaction(() => mutate(u, b));
      return send(200, d);
    }
    fail("Không tìm thấy API.", 404);
  } catch (e) {
    const expected = !!e.status || e.message.includes("UNIQUE");
    if (!expected) console.error("Request failed:", e.code || e.name);
    send(e.status || (e.message.includes("UNIQUE") ? 400 : 503), {
      error: e.message.includes("UNIQUE")
        ? "Email đã được sử dụng."
        : expected
          ? e.message
          : "Không kết nối được cơ sở dữ liệu. Kiểm tra URL, token và trạng thái database trong cấu hình máy chủ.",
    });
  }
}
const server = http.createServer(handler);
if (require.main === module)
  server.listen(process.env.PORT || 3000, "127.0.0.1", () =>
    console.log("Ứng dụng: http://localhost:" + (process.env.PORT || 3000)),
  );
module.exports = { server, handler, db, mutate, data, ensureReady };

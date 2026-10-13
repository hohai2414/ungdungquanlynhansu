const { test } = require("node:test");
const assert = require("node:assert/strict");
test("Remote adapter uses HTTP SDK, preserves transactions, rolls back and returns serializable IDs", async () => {
  const sdkPath = require.resolve("@libsql/client/web");
  const sdk = require(sdkPath),
    original = require.cache[sdkPath].exports;
  const events = [];
  let txId = 0;
  const remote = {
    execute: async ({ sql, args }) => {
      events.push(["root", sql, args]);
      return { rows: [{ id: 1 }], lastInsertRowid: 7n, rowsAffected: 1 };
    },
    executeMultiple: async (sql) => events.push(["schema", sql]),
    transaction: async (mode) => {
      const id = ++txId;
      events.push(["begin", id, mode]);
      return {
        closed: false,
        execute: async ({ sql, args }) => {
          events.push(["tx", id, sql, args]);
          return { rows: [{ id }], lastInsertRowid: 9n, rowsAffected: 1 };
        },
        commit: async () => events.push(["commit", id]),
        rollback: async () => events.push(["rollback", id]),
        close: () => events.push(["close", id]),
      };
    },
    close() {},
  };
  const oldUrl = process.env.TURSO_DATABASE_URL,
    oldToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://example.turso.io";
  process.env.TURSO_AUTH_TOKEN = "synthetic-test-token";
  require.cache[sdkPath].exports = {
    ...sdk,
    createClient: (opts) => {
      assert.equal(opts.url, process.env.TURSO_DATABASE_URL);
      return remote;
    },
  };
  delete require.cache[require.resolve("./database")];
  const db = require("./database");
  try {
    await db.exec("CREATE TABLE sample(id INTEGER)");
    assert.equal((await db.prepare("INSERT").run(2)).lastInsertRowid, 7);
    await Promise.all([
      db.transaction(async () => {
        assert.equal((await db.prepare("READ").get()).id, 1);
        await new Promise((r) => setTimeout(r, 10));
        await db.prepare("UPDATE").run(3);
      }),
      db.transaction(async () => {
        assert.equal((await db.prepare("READ").get()).id, 2);
      }),
    ]);
    assert.ok(
      events.findIndex((e) => e[0] === "commit" && e[1] === 1) <
        events.findIndex((e) => e[0] === "begin" && e[1] === 2),
    );
    await assert.rejects(
      () =>
        db.transaction(async () => {
          await db.prepare("UPDATE").run(4);
          throw Error("reject");
        }),
      /reject/,
    );
    assert.ok(events.some((e) => e[0] === "rollback" && e[1] === 3));
    assert.equal(events.filter((e) => e[0] === "root").length, 1);
  } finally {
    db.close();
    require.cache[sdkPath].exports = original;
    delete require.cache[require.resolve("./database")];
    if (oldUrl === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = oldUrl;
    if (oldToken === undefined) delete process.env.TURSO_AUTH_TOKEN;
    else process.env.TURSO_AUTH_TOKEN = oldToken;
  }
});

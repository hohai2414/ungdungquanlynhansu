const path = require("node:path");
const { AsyncLocalStorage } = require("node:async_hooks");
const context = new AsyncLocalStorage();
let connection;
let queue = Promise.resolve();
function client() {
  if (connection) return connection;
  if (process.env.TURSO_DATABASE_URL) {
    if (!process.env.TURSO_AUTH_TOKEN)
      throw Object.assign(
        new Error("Thiếu TURSO_AUTH_TOKEN trong cấu hình máy chủ."),
        { status: 503 },
      );
    if (!/^(libsql|https):\/\//.test(process.env.TURSO_DATABASE_URL))
      throw Object.assign(
        new Error("TURSO_DATABASE_URL phải là URL database từ xa."),
        { status: 503 },
      );
    connection = {
      remote: require("@libsql/client/web").createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }),
    };
  } else {
    if (process.env.VERCEL)
      throw Object.assign(
        new Error(
          "Chưa cấu hình database. Thêm TURSO_DATABASE_URL và TURSO_AUTH_TOKEN trong Vercel rồi Redeploy. Xem DEPLOY_VERCEL.md.",
        ),
        { status: 503 },
      );
    const { DatabaseSync } = require("node:sqlite");
    connection = {
      local: new DatabaseSync(
        process.env.DB_PATH || path.join(__dirname, "hr.sqlite"),
      ),
    };
    connection.local.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
  }
  return connection;
}
const db = {
  prepare(sql) {
    const execute = async (args, kind) => {
      const c = client();
      if (c.local) return c.local.prepare(sql)[kind](...args);
      const result = await (context.getStore() || c.remote).execute({
        sql,
        args,
      });
      if (kind === "get") return result.rows[0];
      if (kind === "all") return result.rows;
      return {
        lastInsertRowid: Number(result.lastInsertRowid),
        changes: result.rowsAffected,
      };
    };
    return {
      get: (...args) => execute(args, "get"),
      all: (...args) => execute(args, "all"),
      run: (...args) => execute(args, "run"),
    };
  },
  async exec(sql) {
    const c = client();
    if (c.local) return c.local.exec(sql);
    return (context.getStore() || c.remote).executeMultiple(sql);
  },
  async transaction(fn) {
    const previous = queue;
    let release;
    queue = new Promise((r) => (release = r));
    await previous;
    let tx;
    try {
      const c = client();
      if (c.local) {
        c.local.exec("BEGIN IMMEDIATE");
        try {
          const result = await fn();
          c.local.exec("COMMIT");
          return result;
        } catch (e) {
          c.local.exec("ROLLBACK");
          throw e;
        }
      }
      tx = await c.remote.transaction("write");
      const result = await context.run(tx, fn);
      await tx.commit();
      return result;
    } catch (e) {
      if (tx && !tx.closed) await tx.rollback();
      throw e;
    } finally {
      tx?.close();
      release();
    }
  },
  close() {
    connection?.local?.close();
    connection?.remote?.close();
    connection = undefined;
  },
};
module.exports = db;

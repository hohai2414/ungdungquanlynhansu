const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
test("Vercel cold start serves HTML without writing SQLite; missing DB gives actionable 503", () => {
  const script = `const handler=require('./api/index');async function request(url){let status,body,headers;await handler({url,method:'GET',headers:{}},{writeHead(s,h){status=s;headers=h},end(b){body=b}});return {status,body,headers}};(async()=>console.log(JSON.stringify([await request('/'),await request('/api/data')])) )();`;
  const env = { ...process.env, VERCEL: "1" };
  delete env.TURSO_DATABASE_URL;
  delete env.TURSO_AUTH_TOKEN;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: __dirname,
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const [page, api] = JSON.parse(result.stdout);
  assert.equal(page.status, 200);
  assert.match(page.body, /UEH Core HR/);
  assert.equal(api.status, 503);
  assert.match(JSON.parse(api.body).error, /TURSO_DATABASE_URL/);
});
test("Explicit Vercel entrypoint and routing configuration", () => {
  const config = require("./vercel.json");
  assert.equal(typeof require("./api/index"), "function");
  assert.ok(
    config.routes.some(
      (r) => r.src === "/api/(.*)" && r.dest === "/api/index.js",
    ),
  );
  assert.ok(
    config.builds.some(
      (b) => b.use === "@vercel/static" && b.src === "index.html",
    ),
  );
  assert.equal(require("./package.json").engines.node, "24.x");
});

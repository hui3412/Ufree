import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker from "../backend/worker.mjs";
import { CloudStorage } from "../backend/cloud-storage.mjs";
import { measureDatabase, requestRoute } from "../backend/request-metrics.mjs";
import { fixture } from "./helpers/cloud-db.mjs";
const person = (course = "Fictional course") => ({
  semester: "Fall 2026",
  source_file: "private-test.png",
  classes: [{ day: "Monday", start: "09:00", end: "10:00", course }],
  unknown: { kept: true },
});
test("public status and unknown routes never query the database", async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 100; i++)
      assert.equal((await f.call(null, "/health")).status, 200);
    assert.equal(
      f.db.queries,
      0,
      "public health never accesses D1, even on cold start",
    );
    f.db.queries = 0;
    for(let i=0;i<100;i++)assert.equal((await f.call(null,'/')).data.database,'not-checked');
    assert.equal(f.db.queries,0,'root liveness probes never access D1');
    const a = await f.seed("unknown_route");
    for (let i = 0; i < 30; i++)
      assert.equal((await f.call(a, "/unknown-private-path")).status, 404);
    assert.equal(f.db.queries, 0);
  } finally {
    f.sql.close();
  }
});
test("normal revision requests use one indexed auth read and do not rewrite fresh activity", async () => {
  const f = fixture();
  try {
    const a = await f.seed("light_revision");
    f.db.queries = 0;
    const r = await f.call(a, "/revision");
    assert.equal(r.status, 200);
    assert.equal(r.data.inboxRevision, 0);
    assert.equal(f.db.queries, 1);
    f.sql.prepare("UPDATE users SET last_active=0 WHERE id=?").run(a.id);
    f.db.queries = 0;
    await f.call(a, "/revision");
    assert.equal(f.db.queries, 2);
    f.db.queries = 0;
    await f.call(a, "/revision");
    assert.equal(f.db.queries, 1);
    f.sql.exec("DELETE FROM sessions");
    assert.equal(
      (await f.call(a, "/revision")).status,
      401,
      "session revocation still applies immediately",
    );
  } finally {
    f.sql.close();
  }
});
test("opt-in metrics record only normalized routes and aggregate query counts", async () => {
  const f = fixture();
  const logs = [],
    original = console.info;
  try {
    const a = await f.seed("metrics_private");
    console.info = (value) => logs.push(value);
    const r = await worker.fetch(
      new Request("https://api.test/revision", {
        headers: {
          Authorization: "Bearer " + a.token,
          Origin: "https://hui3412.github.io",
        },
      }),
      { DB: f.db, REQUEST_METRICS: "1" },
    );
    assert.equal(r.status, 200);
    assert.equal(logs.length, 1);
    const log = JSON.parse(logs[0]);
    assert.equal(log.route, "/revision");
    assert.equal(log.dbStatements, 1);
    assert.equal(
      log.rowsRead,
      null,
      "unavailable local metadata is not reported as zero reads",
    );
    assert.ok(!logs[0].includes(a.token));
    assert.ok(!logs[0].includes(a.username));
    assert.ok(!logs[0].includes(a.id));
    assert.equal(requestRoute("/shares/" + "a".repeat(64)), "/shares/:code");
    assert.equal(requestRoute("/private-literal"), "unknown");
  } finally {
    console.info = original;
    f.sql.close();
  }
});
test("completed collections skip migration scans; newly inserted legacy data is converted and clears its flag", async () => {
  const f = fixture();
  try {
    const a = await f.seed("compaction_flag");
    await f.update(a, "Personal", person());
    f.db.queries = 0;
    await f.call(a, "/sync?since=0");
    assert.ok(
      f.db.queries <= 4,
      "auth + revision delta + batched envelopes and timetable reads only",
    );
    f.sql
      .prepare(
        "INSERT INTO records(user_id,name,payload,revision) VALUES(?,?,?,1)",
      )
      .run(a.id, "p:Legacy", JSON.stringify(person("Legacy")));
    assert.equal(
      f.sql.prepare("SELECT needs_compaction FROM users WHERE id=?").get(a.id)
        .needs_compaction,
      1,
    );
    const response = await f.call(a, "/sync?since=0");
    assert.equal(response.status, 200);
    assert.equal(
      f.sql.prepare("SELECT needs_compaction FROM users WHERE id=?").get(a.id)
        .needs_compaction,
      0,
    );
    assert.match(
      f.sql
        .prepare(
          "SELECT payload FROM records WHERE user_id=? AND name='p:Legacy'",
        )
        .get(a.id).payload,
      /^@UF1:/,
    );
  } finally {
    f.sql.close();
  }
});

test("admin diagnostics reject guests and ordinary accounts before querying D1", async () => {
 const f=fixture();
 try {
  const secret='fictional-admin-secret-for-local-testing-only';
  const call=(token,enabled=true,method='POST')=>worker.fetch(new Request('https://api.test/admin/diagnostics',{method,headers:token?{Authorization:'Bearer '+token}:{}}),{DB:f.db,...(enabled?{ADMIN_DIAGNOSTICS_TOKEN:secret}:{})});
  const user=await f.seed('not_an_admin'); f.db.queries=0;
  assert.equal((await call()).status,401);
  assert.equal((await call(user.token)).status,401);
  assert.equal((await call(secret,false)).status,503);
  assert.equal((await call(secret,true,'GET')).status,405);
  assert.equal(f.db.queries,0);
  const good=await call(secret); assert.equal(good.status,200);
  assert.equal((await good.json()).migration,'0007_attached_accounts.sql');
  assert.equal(f.db.queries,2);
  for (const path of ['/','/health']) {
   const r=await worker.fetch(new Request('https://api.test'+path),{});
   assert.equal(r.status,200); assert.equal((await r.json()).database,'not-checked');
  }
 } finally {f.sql.close();}
});
test("D1 daily quota errors return a structured pause until midnight UTC",async()=>{
 let calls=0;
 const db={prepare(){calls++;throw Error("Your account has exceeded D1's free tier daily row read limit. [code: 7500]");}};
 const r=await worker.fetch(new Request('https://api.test/revision',{headers:{Authorization:'Bearer '+'a'.repeat(64)}}),{DB:db});
 assert.equal(r.status,429);const data=await r.json();
 assert.equal(data.code,'DAILY_QUOTA_EXHAUSTED');assert.ok(data.retryAt>Date.now());
 assert.equal(new Date(data.retryAt).getUTCHours(),0); assert.equal(calls,1);
 assert.ok(Number(r.headers.get('Retry-After'))>0);
});

test('public health stays database-free even before required storage migrations',async()=>{
 const f=fixture({through:'0003_cloud_compression.sql'});
 try{
  const a=await f.seed('legacy_schema_hotfix');
  assert.equal((await f.call(null,'/')).status,200);
  f.db.queries=0;assert.equal((await f.call(null,'/health')).status,200);assert.equal(f.db.queries,0);
 }finally{f.sql.close();}
});

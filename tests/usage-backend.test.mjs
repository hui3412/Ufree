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
test("logical quota counters remain exact for compression, updates, tombstones and live copies", async () => {
  const f = fixture();
  try {
    const a = await f.seed("quota_a"),
      b = await f.seed("quota_b");
    const expected = (u) =>
      Number(
        f.sql
          .prepare(
            "SELECT COALESCE(SUM(CASE WHEN substr(r.payload,1,5)='@UF1:' THEN COALESCE(o.logical_bytes,o.raw_bytes) ELSE length(CAST(r.payload AS BLOB)) END),0) AS n FROM records r LEFT JOIN cloud_objects o ON o.id=substr(r.payload,6) WHERE r.user_id=? AND r.name NOT LIKE 'f:%'",
          )
          .get(u.id).n,
      );
    const quota = (u) =>
      f.sql.prepare("SELECT storage_bytes FROM users WHERE id=?").get(u.id)
        .storage_bytes;
    for (const u of [a, b]) {
      await f.update(u, "Personal", person());
      assert.equal(quota(u), expected(u));
    }
    const follow = await f.call(a, "/connections/request", {
      username: b.username,
      sharePersonal: true,
    });
    await f.call(b, "/connections/respond", {
      id: follow.data.id,
      decision: "accepted",
      sharePersonal: true,
    });
    assert.equal(quota(b), expected(b));
    await f.update(a, "Personal", person("Edited"));
    assert.equal(quota(a), expected(a));
    assert.equal(quota(b), expected(b));
    await f.update(a, "Personal", null);
    assert.equal(quota(a), 0);
    assert.equal(quota(b), expected(b));
    f.sql
      .prepare(
        "INSERT INTO records(user_id,name,payload,revision) VALUES(?,?,?,1)",
      )
      .run(a.id, "p:Legacy", JSON.stringify(person()));
    assert.equal(quota(a), expected(a));
    await new CloudStorage(f.db).compact({ userId: a.id });
    assert.equal(quota(a), expected(a));
    f.sql.prepare("DELETE FROM records WHERE user_id=?").run(a.id);
    assert.equal(quota(a), 0);
    f.sql
      .prepare("UPDATE users SET storage_bytes=? WHERE id=?")
      .run(10 * 1024 * 1024, a.id);
    assert.equal((await f.update(a, "Too large", person())).status, 413);
  } finally {
    f.sql.close();
  }
});
test("inbox revisions detect new deliveries and follow requests without fetching pending schedules", async () => {
  const f = fixture();
  try {
    const a = await f.seed("inbox_a"),
      b = await f.seed("inbox_b");
    await f.update(a, "Personal", person());
    await f.update(b, "Personal", person());
    await f.call(a, "/deliveries", {
      username: b.username,
      people: { Saved: person() },
      confirmed: true,
    });
    let check = await f.call(b, "/revision");
    assert.equal(check.data.inboxRevision, 1);
    assert.equal(check.data.people, undefined);
    const inbox = await f.call(b, "/deliveries");
    assert.equal(inbox.data.inboxRevision, 1);
    await f.call(b, "/deliveries/respond", {
      id: inbox.data.deliveries[0].id,
      decision: "declined",
    });
    assert.equal((await f.call(b, "/revision")).data.inboxRevision, 2);
    const follow = await f.call(a, "/connections/request", {
      username: b.username,
      sharePersonal: true,
    });
    assert.equal((await f.call(b, "/revision")).data.inboxRevision, 3);
    await f.call(b, "/connections/respond", {
      id: follow.data.id,
      decision: "declined",
    });
    assert.equal((await f.call(b, "/revision")).data.inboxRevision, 4);
  } finally {
    f.sql.close();
  }
});
test("expiry and pending-inbox query plans use matching indexes", () => {
  const f = fixture();
  try {
    for (const [sql, args, index] of [
      [
        "DELETE FROM sessions WHERE expires_at<=?",
        [Date.now()],
        "sessions_expiry",
      ],
      [
        "DELETE FROM rate_limits WHERE window<?",
        [Date.now()],
        "rate_limits_expiry",
      ],
      [
        "SELECT id FROM deliveries WHERE recipient_id=? AND status='pending' ORDER BY created_at LIMIT 10",
        ["fictional"],
        "deliveries_pending_order",
      ],
      [
        "SELECT id FROM connections WHERE recipient_id=? AND status='pending' ORDER BY created_at LIMIT 100",
        ["fictional"],
        "connections_pending_order",
      ],
    ])
      assert.match(
        f.sql
          .prepare("EXPLAIN QUERY PLAN " + sql)
          .all(...args)
          .map((r) => r.detail)
          .join(" "),
        new RegExp(index),
      );
  } finally {
    f.sql.close();
  }
});
test("the additive migration initializes existing quota and pending inboxes without changing payloads", async () => {
  const f = fixture({ through: "0003_cloud_compression.sql" });
  try {
    const a = await f.seed("existing_usage");
    const payload = JSON.stringify(person());
    f.sql
      .prepare(
        "INSERT INTO records(user_id,name,payload,revision) VALUES(?,?,?,1)",
      )
      .run(a.id, "p:Personal", payload);
    f.sql
      .prepare(
        "INSERT INTO deliveries(id,sender_id,recipient_id,sender_name,payload,created_at,status) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        "test",
        a.id,
        a.id,
        "fictional",
        JSON.stringify({ Saved: person() }),
        Date.now(),
        "pending",
      );
    f.sql.exec(
      fs.readFileSync(
        new URL(
          "../backend/migrations/0004_usage_efficiency.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const u = f.sql
      .prepare("SELECT storage_bytes,inbox_revision FROM users WHERE id=?")
      .get(a.id);
    assert.equal(u.storage_bytes, Buffer.byteLength(payload));
    assert.equal(u.inbox_revision, 1);
    assert.equal(
      f.sql.prepare("SELECT payload FROM records").get().payload,
      payload,
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
  assert.equal((await good.json()).migration,'0005_schedule_content.sql');
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

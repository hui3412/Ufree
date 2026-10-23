import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import {
  CloudStorage,
  encodeObject,
  canonical,
  PREFIX,
} from "../backend/cloud-storage.mjs";
import worker from "../backend/worker.mjs";
import { fixture } from "./helpers/cloud-db.mjs";
const person = (course = "Fictional Math") => ({
  semester: "Fall 2026",
  source_file: "privé-📚.png",
  extra: {
    future: ["é", "e\u0301", "\ud800", null, false, 17],
    unknown: "MUST KEEP",
  },
  classes: Array.from({ length: 35 }, () => ({
    day: "Monday",
    start: "09:00",
    end: "10:00",
    course,
    course_code: "201-NYA-05",
    section: "00001",
    room: "TEST-100",
    instructor: "Fictional Teacher",
    kind: "lecture",
    privateNote: "PRESERVE PRIVATELY",
  })),
});
const all = (f, u) => f.call(u, "/sync?since=0");
const expireLease = (f) => f.sql.exec("UPDATE cloud_objects SET last_used=0");
test("lossless full JSON round trips preserve unknown fields, Unicode, arrays, nulls and empty schedules", async () => {
  const f = fixture(),
    storage = new CloudStorage(f.db);
  try {
    const values = [
      person(),
      { classes: [], future: [] },
      JSON.parse(
        '{"classes":[],"__proto__":{"notLost":true},"constructor":"literal"}',
      ),
      { nested: [[{ x: "\\u0000\u0000" }]], n: -1.25, b: false, z: null },
    ];
    for (const value of values) {
      const p = await storage.prepare(value);
      await storage.stage([p]);
      assert.deepEqual(await storage.record(p.ref), value);
    }
    const reordered = Object.fromEntries(Object.entries(person()).reverse());
    assert.equal(
      (await encodeObject(person())).id,
      (await encodeObject(reordered)).id,
    );
    assert.notEqual(
      (await encodeObject({ x: "é" })).id,
      (await encodeObject({ x: "e\u0301" })).id,
    );
    assert.notEqual(
      (await encodeObject([1, 2])).id,
      (await encodeObject([2, 1])).id,
    );
    assert.equal(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}');
  } finally {
    f.sql.close();
  }
});
test("separate accounts reference one immutable compressed schedule; editing and deleting one copy preserves the other", async () => {
  const f = fixture();
  try {
    const a = await f.seed("dedup_a"),
      b = await f.seed("dedup_b");
    const original = person();
    assert.equal((await f.update(a, "Personal", original)).status, 200);
    assert.equal((await f.update(b, "Other name", original)).status, 200);
    const refs = f.sql
      .prepare("SELECT payload FROM records WHERE name LIKE 'p:%'")
      .all();
    assert.equal(refs[0].payload, refs[1].payload);
    assert.match(refs[0].payload, /^@UF1:[a-f0-9]{64}$/);
    const object = f.sql
      .prepare("SELECT * FROM cloud_objects WHERE id=?")
      .get(refs[0].payload.slice(5));
    assert.equal(object.codec, "deflate-raw");
    assert.ok(object.stored_bytes < object.raw_bytes * 0.25);
    assert.equal(
      f.sql.prepare("SELECT count(*) AS n FROM cloud_objects").get().n,
      2,
      "shared timetable and full schedule envelope",
    );
    assert.deepEqual(
      (await all(f, b)).data.changes.find((r) => r.name === "p:Other name")
        .value,
      original,
    );
    const edited = person("Edited only by A");
    assert.equal((await f.update(a, "Personal", edited)).status, 200);
    assert.deepEqual(
      (await all(f, b)).data.changes.find((r) => r.name === "p:Other name")
        .value,
      original,
    );
    assert.equal((await f.update(a, "Personal", null)).status, 200);
    expireLease(f);
    await new CloudStorage(f.db).collect();
    assert.deepEqual(
      (await all(f, b)).data.changes.find((r) => r.name === "p:Other name")
        .value,
      original,
    );
    assert.equal(
      f.sql.prepare("SELECT count(*) AS n FROM cloud_objects").get().n,
      2,
    );
    assert.equal((await f.call(a, "/objects/" + object.id)).status, 404);
    assert.equal((await f.call(null, "/sync?since=0")).status, 401);
  } finally {
    f.sql.close();
  }
});
test("snapshot and inbox manifests reuse account objects and remain fixed after edits, deletion and collection", async () => {
  const f = fixture();
  try {
    const a = await f.seed("snapshot_a"),
      b = await f.seed("snapshot_b");
    const original = person();
    await f.update(a, "Personal", original);
    const people = { One: original, Two: original };
    const share = await f.call(a, "/shares", { people });
    assert.equal(share.status, 201);
    const delivery = await f.call(a, "/deliveries", {
      username: b.username,
      people,
      confirmed: true,
    });
    assert.equal(delivery.status, 201);
    const shareRow = f.sql.prepare("SELECT * FROM shares").get(),
      deliveryRow = f.sql.prepare("SELECT * FROM deliveries").get();
    assert.equal(shareRow.payload, deliveryRow.payload);
    assert.equal(
      f.sql.prepare("SELECT count(*) AS n FROM cloud_objects").get().n,
      3,
      "one full schedule, shared timetable and collection manifest",
    );
    await f.update(a, "Personal", person("Later edit"));
    await f.update(a, "Personal", null);
    expireLease(f);
    await new CloudStorage(f.db).collect();
    assert.deepEqual(
      (await f.call(null, "/shares/" + share.data.code.slice(5))).data.people,
      people,
    );
    assert.deepEqual(
      (await f.call(b, "/deliveries")).data.deliveries[0].people,
      people,
    );
    f.sql.exec("DELETE FROM shares");
    await new CloudStorage(f.db).collect();
    assert.deepEqual(
      (await f.call(b, "/deliveries")).data.deliveries[0].people,
      people,
    );
    f.sql.exec("DELETE FROM deliveries");
    await new CloudStorage(f.db).collect();
    assert.equal(
      f.sql.prepare("SELECT count(*) AS n FROM cloud_objects").get().n,
      0,
    );
  } finally {
    f.sql.close();
  }
});
test("existing JSON migrates without data loss or own revision changes, and all old sharing remains readable", async () => {
  const f = fixture({ through: "0002_live_following.sql" });
  try {
    const a = await f.seed("legacy_a"),
      b = await f.seed("legacy_b"),
      original = person();
    for (const u of [a, b]) {
      f.sql
        .prepare(
          "INSERT INTO records(user_id,name,payload,revision) VALUES(?,?,?,1)",
        )
        .run(u.id, "p:Personal", JSON.stringify(original));
      f.sql.prepare("UPDATE users SET revision=1 WHERE id=?").run(u.id);
    }
    f.sql
      .prepare(
        "INSERT INTO shares(id,owner_id,payload,created_at,expires_at) VALUES(?,?,?,?,?)",
      )
      .run(
        "a".repeat(64),
        a.id,
        JSON.stringify({ Saved: original }),
        Date.now(),
        Date.now() + 100000,
      );
    f.sql.exec(
      fs.readFileSync(
        new URL(
          "../backend/migrations/0003_cloud_compression.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const name of ["0004_usage_efficiency.sql","0005_schedule_content.sql","0006_complete_cloud_shares.sql"]) f.sql.exec(fs.readFileSync(new URL("../backend/migrations/"+name,import.meta.url),"utf8"));
    const storage = new CloudStorage(f.db);
    assert.deepEqual(
      await storage.people(
        f.sql.prepare("SELECT payload FROM shares").get().payload,
      ),
      { Saved: original },
    );
    assert.equal(await storage.compact({ limit: 10 }), 3);
    assert.equal(await f.revision(a), 1);
    assert.deepEqual((await all(f, a)).data.changes[0].value, original);
    assert.deepEqual(
      (await f.call(null, "/shares/" + "a".repeat(64))).data.people,
      { Saved: original },
    );
    assert.equal(
      f.sql
        .prepare(
          "SELECT count(DISTINCT payload) AS n FROM records WHERE name='p:Personal'",
        )
        .get().n,
      1,
    );
  } finally {
    f.sql.close();
  }
});
test("large incompressible values are chunked below D1 row limits and corruption is rejected", async () => {
  const f = fixture();
  try {
    const storage = new CloudStorage(f.db);
    const value = {
      classes: [],
      opaque: randomBytes(150000).toString("base64"),
    };
    const p = await storage.prepare(value);
    await storage.stage([p]);
    const id = p.ref.slice(5);
    assert.ok(
      f.sql
        .prepare("SELECT count(*) AS n FROM cloud_chunks WHERE object_id=?")
        .get(id).n > 1,
    );
    assert.deepEqual(await storage.record(p.ref), value);
    f.sql
      .prepare("UPDATE cloud_chunks SET data=? WHERE object_id=? AND part=0")
      .run(new Uint8Array([0, 0]), id);
    await assert.rejects(new CloudStorage(f.db).record(p.ref));
    await assert.rejects(
      encodeObject({ huge: "x".repeat(3 * 1024 * 1024) }),
      /limit/,
    );
  } finally {
    f.sql.close();
  }
});
test("deduplication reuses complete live schedules and stop-following GC cannot delete either private schedule", async () => {
  const f = fixture();
  try {
    const a = await f.seed("live_storage_a"),
      b = await f.seed("live_storage_b");
    await f.update(a, "Personal", person());
    await f.update(b, "Personal", person());
    const request = await f.call(a, "/connections/request", {
      username: b.username,
      sharePersonal: true,
    });
    assert.equal(request.status, 200);
    assert.equal(
      (
        await f.call(b, "/connections/respond", {
          id: request.data.id,
          decision: "accepted",
          sharePersonal: true,
        })
      ).status,
      200,
    );
    let delta = (await all(f, b)).data;
    const live = delta.changes.find((r) => r.name === "f:" + a.id).value.person;
    assert.equal(live.source_file, person().source_file);
    assert.deepEqual(live.extra, person().extra);
    assert.equal(live.classes[0].privateNote, person().classes[0].privateNote);
    assert.equal(live.classes[0].kind, "lecture");
    await f.update(a, "Personal", person("New live version"));
    delta = (await all(f, b)).data;
    assert.equal(
      delta.changes.find((r) => r.name === "f:" + a.id).value.person.classes[0]
        .course,
      "New live version",
    );
    await f.call(b, "/connections/remove", { id: request.data.id });
    expireLease(f);
    await new CloudStorage(f.db).collect();
    assert.deepEqual(
      (await all(f, a)).data.changes.find((r) => r.name === "p:Personal").value,
      person("New live version"),
    );
    assert.deepEqual(
      (await all(f, b)).data.changes.find((r) => r.name === "p:Personal").value,
      person(),
    );
  } finally {
    f.sql.close();
  }
});
test("bounded metadata preload avoids one D1 query per schedule and inactive staging leases are reclaimed", async () => {
  const f = fixture();
  try {
    const storage = new CloudStorage(f.db),
      people = Object.fromEntries(
        Array.from({ length: 90 }, (_, i) => [
          "Fictional " + i,
          { classes: [], unique: i },
        ]),
      );
    const prepared = await storage.collection(people);
    await storage.stage([prepared]);
    f.sql
      .prepare(
        "INSERT INTO shares(id,payload,created_at,expires_at) VALUES(?,?,?,?)",
      )
      .run("b".repeat(64), prepared.ref, Date.now(), Date.now() + 100000);
    f.db.queries = 0;
    assert.deepEqual(await new CloudStorage(f.db).people(prepared.ref), people);
    assert.ok(f.db.queries < 10, "batch reads avoid 90 separate lookups");
    const orphan = await storage.prepare({ unused: true });
    await storage.stage([orphan]);
    await storage.collect();
    assert.ok(
      f.sql
        .prepare("SELECT id FROM cloud_objects WHERE id=?")
        .get(orphan.ref.slice(5)),
    );
    expireLease(f);
    await storage.collect();
    assert.equal(
      f.sql
        .prepare("SELECT id FROM cloud_objects WHERE id=?")
        .get(orphan.ref.slice(5)),
      undefined,
    );
    assert.deepEqual(await new CloudStorage(f.db).people(prepared.ref), people);
  } finally {
    f.sql.close();
  }
});
test("maximum-size collection writes are batched within D1 parameter and query budgets", async () => {
  const f = fixture();
  try {
    const storage = new CloudStorage(f.db),
      people = Object.fromEntries(
        Array.from({ length: 2000 }, (_, i) => [
          "Fictional " + i,
          { classes: [], unique: i },
        ]),
      );
    const prepared = await storage.collection(people);
    f.db.queries = 0;
    await storage.stage([prepared]);
    assert.ok(
      f.db.queries < 300,
      "bulk insertion avoids thousands of D1 queries",
    );
    assert.deepEqual(await new CloudStorage(f.db).people(prepared.ref), people);
  } finally {
    f.sql.close();
  }
});
test("a failed chunk transaction leaves no partially stored object or changed account reference", async () => {
  const f = fixture();
  try {
    const a = await f.seed("failure_a");
    await f.update(a, "Personal", person());
    const before = f.sql
      .prepare("SELECT payload FROM records WHERE user_id=?")
      .get(a.id).payload;
    const prepared = await new CloudStorage(f.db).prepare({
      classes: [],
      opaque: randomBytes(100000).toString("base64"),
    });
    f.sql.exec(
      "CREATE TRIGGER fictional_failure BEFORE INSERT ON cloud_chunks WHEN NEW.part=1 BEGIN SELECT RAISE(ABORT,'fictional failure'); END",
    );
    await assert.rejects(
      new CloudStorage(f.db).stage([prepared]),
      /fictional failure/,
    );
    assert.equal(
      f.sql
        .prepare("SELECT id FROM cloud_objects WHERE id=?")
        .get(prepared.ref.slice(5)),
      undefined,
    );
    assert.equal(
      f.sql.prepare("SELECT payload FROM records WHERE user_id=?").get(a.id)
        .payload,
      before,
    );
    assert.deepEqual(
      (await all(f, a)).data.changes.find((r) => r.name === "p:Personal").value,
      person(),
    );
  } finally {
    f.sql.close();
  }
});

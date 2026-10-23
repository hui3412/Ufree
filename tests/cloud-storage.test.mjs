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

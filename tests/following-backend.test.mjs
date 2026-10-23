import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import worker from "../backend/worker.mjs";
const person = (course = "Fictional Math") => ({
  semester: "Fall 2026",
  source_file: "private-filename",
  school: "private-field",
  classes: [
    {
      day: "Monday",
      start: "09:00",
      end: "10:00",
      course,
      room: "TEST-100",
      instructor: "Fictional Teacher",
      privateNote: "Never publish",
    },
  ],
});
async function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const name of fs
    .readdirSync(new URL("../backend/migrations/", import.meta.url))
    .sort())
    sql.exec(
      fs.readFileSync(
        new URL("../backend/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  const db = {
    prepare(query) {
      let args = [];
      return {
        bind(...values) {
          args = values.map((value) =>
            value instanceof ArrayBuffer ? new Uint8Array(value) : value,
          );
          return this;
        },
        async first() {
          return sql.prepare(query).get(...args) || null;
        },
        async all() {
          return { results: sql.prepare(query).all(...args) };
        },
        async run() {
          return {
            meta: { changes: Number(sql.prepare(query).run(...args).changes) },
          };
        },
      };
    },
    async batch(list) {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const item of list) results.push(await item.run());
        sql.exec("COMMIT");
        return results;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  async function seed(username) {
    const id = crypto.randomUUID(),
      token = crypto.randomUUID().replaceAll("-", "").repeat(2);
    const hash = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ).toString("hex");
    sql
      .prepare(
        "INSERT INTO users(id,username,password_hash,school,personal_schedule,created_at,last_active,revision) VALUES(?,?,?,?,?,?,?,1)",
      )
      .run(
        id,
        username,
        "unused-fixture-hash",
        "Private school",
        "Personal",
        Date.now(),
        Date.now(),
      );
    sql
      .prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_refreshed_at) VALUES(?,?,?,?,?)")
      .run(hash, id, Date.now() + 10000000, Date.now(), Date.now());
    sql
      .prepare("INSERT INTO records VALUES(?,?,?,1)")
      .run(id, "p:Personal", JSON.stringify(person()));
    return { id, username, token };
  }
  async function call(actor, path, data) {
    const response = await worker.fetch(
      new Request("https://api.test" + path, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          Origin: "https://hui3412.github.io",
          ...(actor ? { Authorization: "Bearer " + actor.token } : {}),
          ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      { DB: db },
    );
    return { status: response.status, data: await response.json() };
  }
  const revision = async (a) => (await call(a, "/revision")).data.revision;
  const update = async (a, name, value) =>
    call(a, "/sync", {
      baseRevision: await revision(a),
      changes: [{ name: "p:" + name, value }],
    });
  const delta = async (a, since = 0) =>
    (await call(a, "/sync?since=" + since)).data;
  const follow = async (a, b) =>
    call(a, "/connections/request", {
      username: b.username,
      sharePersonal: true,
    });
  return { sql, db, seed, call, revision, update, delta, follow };
}
test("authenticated substring search is case-insensitive, literal, capped at ten and never exposes private profiles", async () => {
  const f = await fixture();
  try {
    const me = await f.seed("search_owner");
    for (let i = 0; i < 13; i++)
      await f.seed("alex_" + String(i).padStart(2, "0"));
    await f.seed("alexx00");
    const results = await f.call(me, "/users/search", { query: "AlEx_" });
    assert.equal(results.status, 200);
    assert.equal(results.data.users.length, 10);
    assert.equal(new Set(results.data.users.map((x) => x.username)).size, 10);
    for (const row of results.data.users) {
      assert.deepEqual(Object.keys(row).sort(), ["connection", "username"]);
      assert.match(row.username, /alex_/);
    }
    assert.equal(
      (await f.call(null, "/users/search", { query: "alex" })).status,
      401,
    );
    assert.equal(
      (await f.call(me, "/users/search", { query: "%" })).status,
      400,
    );
    const peer = (await f.call(me, "/users/search", { query: "alex_00" })).data
      .users[0];
    await f.call(me, "/blocks", { username: peer.username, blocked: true });
    assert.equal(
      (await f.call(me, "/users/search", { query: "alex_00" })).data.users
        .length,
      0,
    );
  } finally {
    f.sql.close();
  }
});
test("follow requests notify only the recipient and both personal schedules remain private until explicit follow-back", async () => {
  const f = await fixture();
  try {
    const a = await f.seed("follow_a"),
      b = await f.seed("follow_b"),
      c = await f.seed("outsider");
    assert.equal(
      (await f.call(a, "/connections/request", { username: b.username }))
        .status,
      400,
    );
    const request = await f.follow(a, b);
    assert.equal(request.status, 200);
    assert.equal((await f.follow(a, b)).status, 409);
    assert.equal(
      (await f.call(b, "/deliveries")).data.followRequests[0].sender,
      a.username,
    );
    assert.equal(
      (await f.call(c, "/deliveries")).data.followRequests.length,
      0,
    );
    assert.equal(
      (await f.delta(b)).changes.some((x) => x.name.startsWith("f:")),
      false,
    );
    assert.equal(
      (
        await f.call(a, "/connections/respond", {
          id: request.data.id,
          decision: "accepted",
          sharePersonal: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.call(b, "/connections/respond", {
          id: request.data.id,
          decision: "accepted",
        })
      ).status,
      400,
    );
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
    for (const [viewer, source] of [
      [a, b],
      [b, a],
    ]) {
      const row = (await f.delta(viewer)).changes.find(
        (x) => x.name === "f:" + source.id,
      );
      assert.equal(row.value.username, source.username);
      assert.equal(row.value.person.classes[0].course, "Fictional Math");
      assert.equal(row.value.person.school, person().school);
      assert.equal(row.value.person.source_file, person().source_file);
      assert.equal(row.value.person.classes[0].privateNote, person().classes[0].privateNote);
    }
    assert.equal(
      (await f.call(b, "/deliveries")).data.followRequests.length,
      0,
    );
    assert.equal((await f.call(c, "/connections")).data.connections.length, 0);
  } finally {
    f.sql.close();
  }
});
test("personal edits propagate both ways through server revisions while unrelated schedules and fixed snapshots do not", async () => {
  const f = await fixture();
  try {
    const a = await f.seed("live_a"),
      b = await f.seed("live_b");
    const req = await f.follow(a, b);
    await f.call(b, "/connections/respond", {
      id: req.data.id,
      decision: "accepted",
      sharePersonal: true,
    });
    const bBefore = await f.revision(b);
    const share = (
      await f.call(a, "/shares", {
        people: { Saved: person("Original snapshot") },
      })
    ).data;
    assert.equal(
      (await f.update(a, "Personal", person("Updated A"))).status,
      200,
    );
    assert.ok((await f.revision(b)) > bBefore);
    assert.equal(
      (await f.delta(b, bBefore)).changes.find((x) => x.name === "f:" + a.id)
        .value.person.classes[0].course,
      "Updated A",
    );
    assert.equal(
      (
        await f.call(b, "/sync", {
          baseRevision: bBefore,
          changes: [{ name: "p:Offline", value: person() }],
        })
      ).status,
      409,
    );
    assert.equal((await f.update(b, "Offline", person())).status, 200);
    assert.equal(
      (await f.update(b, "Personal", person("Updated B"))).status,
      200,
    );
    assert.equal(
      (await f.delta(a)).changes.find((x) => x.name === "f:" + b.id).value
        .person.classes[0].course,
      "Updated B",
    );
    const after = await f.revision(b);
    await f.update(a, "Private other", person("Never shared"));
    assert.equal(await f.revision(b), after);
    assert.equal(
      (await f.delta(b)).changes.some((x) => x.name === "p:Private other"),
      false,
    );
    assert.equal(
      (await f.call(null, "/shares/" + share.code.slice(5))).data.people.Saved
        .classes[0].course,
      "Original snapshot",
    );
    assert.equal(
      (
        await f.call(b, "/sync", {
          baseRevision: await f.revision(b),
          changes: [{ name: "f:" + a.id, value: person("forged") }],
        })
      ).status,
      400,
    );
  } finally {
    f.sql.close();
  }
});
test("personal selection, deletion, stop-following and blocking update only live copies and respect ownership", async () => {
  const f = await fixture();
  try {
    const a = await f.seed("revoke_a"),
      b = await f.seed("revoke_b"),
      c = await f.seed("revoke_c");
    const request = await f.follow(a, b);
    await f.call(b, "/connections/respond", {
      id: request.data.id,
      decision: "accepted",
      sharePersonal: true,
    });
    await f.update(b, "Saved independent", person("Kept snapshot"));
    await f.update(a, "New personal", person("Selected replacement"));
    assert.equal(
      (
        await f.call(a, "/profile/personal-schedule", {
          name: "New personal",
          expected: "Personal",
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.delta(b)).changes.find((x) => x.name === "f:" + a.id).value
        .person.classes[0].course,
      "Selected replacement",
    );
    assert.equal(
      (
        await f.call(a, "/profile/personal-schedule", {
          name: "Personal",
          expected: "Personal",
        })
      ).status,
      409,
    );
    await f.update(a, "New personal", null);
    assert.equal(
      (await f.delta(b)).changes.find((x) => x.name === "f:" + a.id).value,
      null,
    );
    await f.update(a, "New personal", person("Back"));
    await f.call(c, "/connections/remove", { id: request.data.id });
    assert.equal(
      (await f.call(b, "/connections")).data.connections[0].status,
      "accepted",
    );
    await f.call(b, "/blocks", { username: a.username, blocked: true });
    for (const [viewer, source] of [
      [a, b],
      [b, a],
    ])
      assert.equal(
        (await f.delta(viewer)).changes.find((x) => x.name === "f:" + source.id)
          .value,
        null,
      );
    const rev = await f.revision(b);
    await f.update(a, "New personal", person("Must not arrive"));
    assert.equal(await f.revision(b), rev);
    assert.ok(
      (await f.delta(b)).changes.find((x) => x.name === "p:Saved independent")
        .value,
    );
    assert.equal((await f.follow(a, b)).status, 400);
    assert.equal(
      (await f.call(a, "/users/search", { query: "revoke_b" })).data.users
        .length,
      0,
    );
  } finally {
    f.sql.close();
  }
});
test("declining and cancelling requests grant no schedule access; stop-following removes both grants", async () => {
  const f = await fixture();
  try {
    const a = await f.seed("end_a"),
      b = await f.seed("end_b"),
      c = await f.seed("end_c");
    let req = await f.follow(a, b);
    await f.call(b, "/connections/respond", {
      id: req.data.id,
      decision: "declined",
    });
    assert.equal(
      (await f.delta(b)).changes.some((x) => x.name.startsWith("f:")),
      false,
    );
    assert.equal((await f.follow(a, b)).status, 429);
    req = await f.follow(a, c);
    await f.call(a, "/connections/remove", { id: req.data.id });
    assert.equal(
      (await f.call(c, "/deliveries")).data.followRequests.length,
      0,
    );
    f.sql.prepare("UPDATE connections SET created_at=0").run();
    req = await f.follow(a, b);
    await f.call(b, "/connections/respond", {
      id: req.data.id,
      decision: "accepted",
      sharePersonal: true,
    });
    await f.call(a, "/connections/remove", { id: req.data.id });
    assert.equal(
      (await f.delta(b)).changes.find((x) => x.name === "f:" + a.id).value,
      null,
    );
    const before = await f.revision(b);
    await f.update(a, "Personal", person("No longer shared"));
    assert.equal(await f.revision(b), before);
  } finally {
    f.sql.close();
  }
});

test('following each other directly grants both current personal schedules and login sync sees later edits',async()=>{
 const f=await fixture();try{
 const a=await f.seed('mutual_test'),b=await f.seed('mutual_test2');
 assert.equal((await f.follow(a,b)).status,200);
 assert.equal((await f.delta(b)).changes.some(r=>r.name==='f:'+a.id),false);
 const mutual=await f.follow(b,a);assert.equal(mutual.status,200);assert.equal(mutual.data.status,'accepted');
 assert.deepEqual((await f.delta(a)).changes.find(r=>r.name==='f:'+b.id).value.person,person());
 assert.deepEqual((await f.delta(b)).changes.find(r=>r.name==='f:'+a.id).value.person,person());
 const since=await f.revision(b);const edited=person('Updated for next login');assert.equal((await f.update(a,'Personal',edited)).status,200);
 assert.deepEqual((await f.delta(b,since)).changes.find(r=>r.name==='f:'+a.id).value.person,edited);
 assert.equal((await f.call(a,'/connections/remove',{id:mutual.data.id})).status,200);
 assert.equal((await f.delta(b)).changes.find(r=>r.name==='f:'+a.id).value,null);
 }finally{f.sql.close();}
});

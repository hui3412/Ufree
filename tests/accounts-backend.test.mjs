import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import worker from "../backend/worker.mjs";
const origin = "https://hui3412.github.io";
function database() {
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
          const result = sql.prepare(query).run(...args);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        sql.exec("COMMIT");
        return out;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, sql };
}
const person = {
  semester: "Fall 2026",
  classes: [{ day: "Monday", start: "09:00", end: "10:00" }],
};
function client(db) {
  return async (path, data, token, requestOrigin = origin) => {
    const response = await worker.fetch(
      new Request("https://api.test" + path, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          Origin: requestOrigin,
          ...(data === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      { DB: db },
    );
    return {
      status: response.status,
      data: await response.json(),
      headers: response.headers,
    };
  };
}
const signup = (call, name) =>
  call("/auth/signup", {
    username: name,
    password: "fictional-secret-123",
    school: "marianopolis",
    personalSchedule: "Alex",
    people: { Alex: person },
    consent: true,
  });
test("accounts, access controls, revision conflicts, passwords, immutable snapshots, inbox and blocking", async () => {
  const { db, sql } = database(),
    call = client(db);
  let r = await call("/health");
  assert.equal(r.data.database, "not-checked");
  assert.equal((await call("/revision", undefined, null)).status, 401);
  assert.equal(
    (await call("/health", undefined, null, "https://youfree.ca")).status,
    403,
  );
  const a = (await signup(call, "Fictional_A")).data,
    b = (await signup(call, "fictional_b")).data;
  assert.equal((await signup(call, "FICTIONAL_A")).status, 409);
  assert.equal(a.user.username, "fictional_a");
  assert.throws(() => sql.prepare("UPDATE users SET username=? WHERE id=?").run("FICTIONAL_A", b.user.id), /UNIQUE/);
  assert.equal(
    (
      await call(
        "/sync",
        { baseRevision: 0, changes: [{ name: "p:Alex", value: person }] },
        a.token,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/sync",
        { baseRevision: 0, changes: [{ name: "p:Bad", value: person }] },
        a.token,
      )
    ).status,
    409,
  );
  assert.equal(
    (await call("/sync?since=0", undefined, b.token)).data.changes.length,
    0,
  );
  r = await call("/sync?since=0", undefined, a.token);
  assert.equal(r.data.revision, 1);
  assert.equal(r.data.changes[0].name, "p:Alex");
  const share = (await call("/shares", { people: { Alex: person } }, a.token))
    .data;
  const stored = sql.prepare("SELECT * FROM shares").get();
  assert.equal(stored.expires_at - stored.created_at, 48 * 3600000);
  assert.deepEqual((await call("/shares/" + share.code.slice(5))).data.people, {
    Alex: person,
  });
  assert.equal(
    (
      await call(
        "/sync",
        { baseRevision: 1, changes: [{ name: "p:Alex", value: null }] },
        a.token,
      )
    ).status,
    200,
  );
  assert.deepEqual(
    (await call("/shares/" + share.code.slice(5))).data.people,
    { Alex: person },
    "a source deletion never changes a shared snapshot",
  );
  assert.equal(
    (
      await call(
        "/auth/password",
        { currentPassword: "wrong-password", newPassword: "fictional-new-123" },
        a.token,
      )
    ).status,
    401,
  );
  const other = (
    await call("/auth/login", {
      username: "FiCtIoNaL_A",
      password: "fictional-secret-123",
    })
  ).data;
  assert.equal(
    (
      await call(
        "/auth/password",
        {
          currentPassword: "fictional-secret-123",
          newPassword: "fictional-new-123",
          signOutOthers: true,
        },
        a.token,
      )
    ).status,
    200,
  );
  assert.equal((await call("/revision", undefined, other.token)).status, 401);
  assert.equal(
    (await call("/auth/session", undefined, a.token)).data.user.username,
    "fictional_a",
  );
  assert.equal(
    (
      await call(
        "/deliveries",
        { username: "FiCtIoNaL_B", people: { Alex: person }, confirmed: true },
        a.token,
      )
    ).status,
    201,
  );
  const inbox = (await call("/deliveries", undefined, b.token)).data.deliveries;
  assert.equal(inbox[0].sender, "fictional_a");
  assert.equal(
    (await call("/sync?since=0", undefined, b.token)).data.changes.length,
    0,
    "delivery never inserts schedules automatically",
  );
  await call(
    "/deliveries/respond",
    { id: inbox[0].id, decision: "declined" },
    b.token,
  );
  assert.equal(
    (await call("/deliveries", undefined, b.token)).data.deliveries.length,
    0,
  );
  await call("/blocks", { username: "fictional_a", blocked: true }, b.token);
  assert.equal(
    (
      await call(
        "/deliveries",
        { username: "fictional_b", people: { Alex: person }, confirmed: true },
        a.token,
      )
    ).status,
    400,
  );
  sql.prepare("UPDATE shares SET expires_at=?").run(Date.now() - 1);
  assert.equal((await call("/shares/" + share.code.slice(5))).status, 404);
  sql.close();
});
test("five failed logins enforce a server-side ten-minute wait and later retries remain possible", async () => {
  const { db, sql } = database(),
    call = client(db);
  await signup(call, "fictional_lock");
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await call("/auth/login", {
          username: "fictional_lock",
          password: "fictional-wrong-123",
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await call("/auth/login", {
        username: "fictional_lock",
        password: "fictional-secret-123",
      })
    ).status,
    429,
  );
  sql.prepare("UPDATE attempts SET next_attempt=0").run();
  assert.equal(
    (
      await call("/auth/login", {
        username: "fictional_lock",
        password: "fictional-wrong-123",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("/auth/login", {
        username: "fictional_lock",
        password: "fictional-secret-123",
      })
    ).status,
    429,
  );
  sql.prepare("UPDATE attempts SET next_attempt=0").run();
  assert.equal(
    (
      await call("/auth/login", {
        username: "fictional_lock",
        password: "fictional-secret-123",
      })
    ).status,
    200,
  );
  sql.close();
});
test("expiry cleanup never deletes inactive accounts before warning policy approval", async () => {
  const { db, sql } = database(),
    call = client(db);
  await signup(call, "fictional_old");
  sql.prepare("UPDATE users SET last_active=0").run();
  await worker.scheduled({}, { DB: db });
  assert.equal(
    sql.prepare("SELECT count(*) AS count FROM users").get().count,
    1,
  );
  sql.close();
});

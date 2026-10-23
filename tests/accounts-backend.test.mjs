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
  classes: [{ day: "Monday", course:"Test course", start: "09:00", end: "10:00" }],
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
    school: "Fictional School",
    personalSchedule: "Personal",
    people: { Personal: person },
    consent: true,
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

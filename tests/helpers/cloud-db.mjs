import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import worker from "../../backend/worker.mjs";
export function fixture({ through = null } = {}) {
  const sql = new DatabaseSync(":memory:");
  sql.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  for (const name of fs
    .readdirSync(new URL("../../backend/migrations/", import.meta.url))
    .sort()) {
    if (through && name > through) continue;
    sql.exec(
      fs.readFileSync(
        new URL("../../backend/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
    sql.prepare("INSERT INTO d1_migrations(name) VALUES(?)").run(name);
  }
  const db = {
    queries: 0,
    prepare(query) {
      let args = [];
      return {
        bind(...values) {
          args = values.map((v) =>
            v instanceof ArrayBuffer ? new Uint8Array(v) : v,
          );
          return this;
        },
        async first() {
          db.queries++;
          return sql.prepare(query).get(...args) || null;
        },
        async all() {
          db.queries++;
          return { results: sql.prepare(query).all(...args) };
        },
        async run() {
          db.queries++;
          return {
            meta: { changes: Number(sql.prepare(query).run(...args).changes) },
          };
        },
      };
    },
    async batch(items) {
      sql.exec("BEGIN");
      try {
        const result = [];
        for (const item of items) result.push(await item.run());
        sql.exec("COMMIT");
        return result;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
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
        "INSERT INTO users(id,username,password_hash,school,personal_schedule,created_at,last_active) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        id,
        username,
        "fictional-hash",
        "Fictional school",
        "Personal",
        Date.now(),
        Date.now(),
      );
    sql
      .prepare(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
      )
      .run(hash, id, Date.now() + 86400000);
    return { id, token, username };
  }
  async function call(user, path, data) {
    const response = await worker.fetch(
      new Request("https://api.test" + path, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          Origin: "https://hui3412.github.io",
          ...(user ? { Authorization: "Bearer " + user.token } : {}),
          ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      { DB: db },
    );
    return { status: response.status, data: await response.json() };
  }
  const revision = async (user) =>
    (await call(user, "/revision")).data.revision;
  const update = async (user, name, value) =>
    call(user, "/sync", {
      baseRevision: await revision(user),
      changes: [{ name: "p:" + name, value }],
    });
  return { sql, db, seed, call, revision, update };
}

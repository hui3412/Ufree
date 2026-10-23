import { measureDatabase, requestRoute } from "./request-metrics.mjs";
import { CloudStorage } from "./cloud-storage.mjs";
import { following, followRequests } from "./following.mjs";
import { passwordHash } from "./native-passwords.mjs";
export { passwordHash } from "./native-passwords.mjs";
import { bytesToHex } from "@noble/hashes/utils";

const ORIGIN = "https://hui3412.github.io";
const HOUR = 3600000,
  DAY = HOUR * 24;
const encoder = new TextEncoder();
const RELEASE = "account-deletion-free-crypto-v2";
const random = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (value) =>
  bytesToHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const statement = (db, sql, ...args) => db.prepare(sql).bind(...args);
const one = (db, sql, ...args) => statement(db, sql, ...args).first();
const run = (db, sql, ...args) => statement(db, sql, ...args).run();
const rows = async (db, sql, ...args) =>
  (await statement(db, sql, ...args).all()).results;
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function requestPasswordHash(env, username, password, salt = random()) {
  // Production uses the bound coordinator; local Node tests can use the same native implementation.
  if (!env.PASSWORD_CRYPTO) return passwordHash(password, salt);
  const scope = await digest(username.toLowerCase());
  return env.PASSWORD_CRYPTO.getByName(scope).derive(password, salt);
}
async function verify(password, stored, env, username) {
  const pieces = stored.split("$");
  if (
    pieces.length !== 6 ||
    pieces.slice(0, 4).join("$") !== "scrypt$32768$8$3"
  )
    return false;
  return safeEqual(await requestPasswordHash(env, username, password, pieces[4]), stored);
}
function credentials(body) {
  if (
    typeof body.username !== "string" ||
    !/^[A-Za-z0-9_]{3,24}$/.test(body.username)
  )
    fail("Use 3–24 letters, numbers or underscores for the username.");
  if (
    typeof body.password !== "string" ||
    body.password.length < 12 ||
    body.password.length > 128
  )
    fail("Use a password with 12–128 characters.");
  return body.username.toLowerCase();
}
export function validatePeople(people) {
  if (
    !people ||
    typeof people !== "object" ||
    Array.isArray(people) ||
    Object.keys(people).length > 2000
  )
    fail("Invalid schedule collection.");
  for (const [name, person] of Object.entries(people)) {
    if (
      !name.trim() ||
      name.length > 200 ||
      ["__proto__", "constructor", "prototype"].includes(name) ||
      !person ||
      typeof person !== "object" ||
      !Array.isArray(person.classes) ||
      person.classes.length > 500
    )
      fail("Invalid schedule.");
    for (const item of person.classes) {
      if (
        ![
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ].includes(item.day) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.end) ||
        item.end <= item.start
      )
        fail("Invalid class day or time.");
    }
  }
  if (encoder.encode(JSON.stringify(people)).length > 2 * 1024 * 1024)
    fail("The selected schedules exceed the 2 MB test limit.", 413);
}
async function bodyJSON(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    fail("JSON required.", 415);
  const reader = request.body?.getReader();
  if (!reader) fail("JSON required.");
  let chunks = [],
    size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 3 * 1024 * 1024) {
      await reader.cancel();
      fail("Request too large.", 413);
    }
    chunks.push(value);
  }
  try {
    const data = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      data.set(c, offset);
      offset += c.length;
    }
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    fail("Invalid JSON.");
  }
}
async function throttle(db, key, limit, windowMs) {
  const window = Math.floor(Date.now() / windowMs) * windowMs;
  const result = await one(
    db,
    "INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
    key,
    window,
  );
  if (result.count > limit)
    fail("Delivery or request limit reached. Try again later.", 429);
}
async function loginGate(db, keys) {
  for (const key of keys) {
    const entry = await one(
      db,
      "SELECT next_attempt FROM attempts WHERE key=?",
      key,
    );
    if (entry?.next_attempt > Date.now())
      fail("Wait 10 minutes before trying again.", 429);
  }
}
async function failedLogin(db, keys) {
  const result = await db.batch(
    keys.map((key) =>
      statement(
        db,
        "INSERT INTO attempts(key,failures,next_attempt) VALUES(?,1,0) ON CONFLICT(key) DO UPDATE SET failures=failures+1,next_attempt=CASE WHEN failures+1>=5 THEN ? ELSE 0 END WHERE next_attempt<=?",
        key,
        Date.now() + 600000,
        Date.now(),
      ),
    ),
  );
  if (result.some((item) => item.meta.changes !== 1))
    fail("Wait 10 minutes before trying again.", 429);
}
async function newSession(db, id) {
  const token = random();
  const expiresAt = Date.now() + 30 * DAY;
  await run(
    db,
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    await digest(token),
    id,
    expiresAt,
  );
  return { token, expiresAt };
}
async function authenticate(request, db) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) fail("Sign in to continue.", 401);
  const hash = await digest(token);
  const user = await one(
    db,
    "SELECT u.*,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
    hash,
    Date.now(),
  );
  if (!user)
    fail(
      "Your session expired. Sign in again; pending local changes are retained.",
      401,
    );
  if (user.last_active < Date.now() - HOUR)
    await run(
      db,
      "UPDATE users SET last_active=? WHERE id=? AND last_active<?",
      Date.now(),
      user.id,
      Date.now() - HOUR,
    );
  return user;
}
const profile = (user) => ({
  id: user.id,
  username: user.username,
  school: user.school,
  personalSchedule: user.personal_schedule,
});
export default {
  async fetch(request, env) {
    const diagnostics =
      env.REQUEST_METRICS === "1" ? measureDatabase(env.DB) : null;
    const db = diagnostics?.db || env.DB;
    let responseStatus = 500;
    const headers = {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    };
    const origin = request.headers.get("origin");
    if (origin === ORIGIN)
      Object.assign(headers, {
        "Access-Control-Allow-Origin": ORIGIN,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
      });
    const respond = (data, status = 200) => {
      responseStatus = status;
      return Response.json(data, { status, headers });
    };
    try {
      const path = new URL(request.url).pathname;
      if (origin && origin !== ORIGIN) fail("Origin not allowed.", 403);
      if (request.method === "OPTIONS") {
        responseStatus = 204;
        return new Response(null, { status: 204, headers });
      }
      if (!["GET", "POST"].includes(request.method))
        fail("Method not allowed.", 405);
      if (requestRoute(path) === "unknown") fail("Not found.", 404);
      if (request.method === "GET" && ["/", "/health"].includes(path))
        return respond({ service: "youfreetest", status: "ok", database: "not-checked", release: RELEASE });
      if (["/admin/diagnostics", "/admin/compact"].includes(path)) {
        if (request.method !== "POST") fail("Method not allowed.", 405);
        // A separate server-only secret grants diagnostics, never an ordinary account session.
        const token = request.headers.get("authorization")?.match(/^Bearer (.{32,256})$/)?.[1];
        if (!env.ADMIN_DIAGNOSTICS_TOKEN) fail("Admin diagnostics are disabled.", 503);
        if (!token || !safeEqual(await digest(token), await digest(env.ADMIN_DIAGNOSTICS_TOKEN)))
          fail("Admin authorization required.", 401);
        if (path === "/admin/compact") {
          if (!db) fail("Database unavailable.",503);
          const input = await bodyJSON(request);
          const limit = input.limit ?? 10;
          if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) fail("Invalid maintenance limit.");
          const storage = new CloudStorage(db);
          const complete = input.mode === "complete-shares";
          if (input.mode && !complete) fail("Invalid maintenance mode.");
          const completed = complete ? await storage.repairShares({limit}) : await storage.repack({limit});
          const pending = await one(db,complete ? "SELECT count(*) AS n FROM cloud_share_repair WHERE status='pending'" : "SELECT count(*) AS n FROM cloud_repack");
          return respond({completed,pending:pending.n});
        }
        if (!db || (await one(db, "SELECT 1 AS ok"))?.ok !== 1)
          fail("Database unavailable.", 503);
        const migration = await one(db, "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1");
        return respond({ service: "youfreetest", release: RELEASE, database: "connected", migration: migration?.name || null, checkedAt: new Date().toISOString() });
      }
      const storage = new CloudStorage(db);
      if (!db) fail("Database unavailable.", 503);
      if (!["GET", "POST"].includes(request.method))
        fail("Method not allowed.", 405);
      const input = request.method === "POST" ? await bodyJSON(request) : null;
      if (path === "/auth/signup" && input) {
        const username = credentials(input);
        await throttle(
          db,
          `signup:${request.headers.get("cf-connecting-ip") || "unknown"}`,
          5,
          HOUR,
        );
        if (
          typeof input.school !== "string" ||
          !input.school.trim() ||
          input.school.length > 200
        )
          fail("School is required.");
        validatePeople(input.people);
        if (!Object.hasOwn(input.people, input.personalSchedule))
          fail("Select your personal schedule.");
        if (input.consent !== true)
          fail("Confirm the initial upload of your local collection.");
        const id = crypto.randomUUID(),
          now = Date.now(),
          hash = await requestPasswordHash(env, username, input.password);
        try {
          await run(
            db,
            "INSERT INTO users(id,username,password_hash,school,personal_schedule,created_at,last_active) VALUES(?,?,?,?,?,?,?)",
            id,
            username,
            hash,
            input.school.trim(),
            input.personalSchedule,
            now,
            now,
          );
        } catch (error) {
          if (/unique/i.test(error.message))
            fail("That username is unavailable.", 409);
          throw error;
        }
        // Signup creates identity only; the client queues and resumes the initial copy through /sync.
        const session = await newSession(db, id);
        return respond(
          {
            ...session,
            user: {
              id,
              username,
              school: input.school.trim(),
              personalSchedule: input.personalSchedule,
            },
          },
          201,
        );
      }
      if (path === "/auth/login" && input) {
        if (
          typeof input.username !== "string" ||
          !/^[A-Za-z0-9_]{3,24}$/.test(input.username) ||
          typeof input.password !== "string" ||
          input.password.length > 128
        )
          fail("Incorrect username or password.", 401);
        const username = input.username.toLowerCase();
        const keys = [
          `login:${username}`,
          `login-ip:${request.headers.get("cf-connecting-ip") || "unknown"}`,
        ];
        await loginGate(db, keys);
        await failedLogin(db, keys);
        const user = await one(
          db,
          "SELECT * FROM users WHERE username=?",
          username,
        );
        const valid = await verify(
          input.password,
          user?.password_hash ||
            `scrypt$32768$8$3$${"0".repeat(64)}$${"0".repeat(64)}`,
          env, username,
        );
        if (!valid || !user) fail("Incorrect username or password.", 401);
        await db.batch(
          keys.map((key) =>
            statement(db, "DELETE FROM attempts WHERE key=?", key),
          ),
        );
        await run(
          db,
          "UPDATE users SET last_active=? WHERE id=?",
          Date.now(),
          user.id,
        );
        return respond({
          ...(await newSession(db, user.id)),
          user: profile(user),
        });
      }
      if (path.startsWith("/shares/") && request.method === "GET") {
        const id = path.slice("/shares/".length);
        if (!/^[a-f0-9]{64}$/.test(id)) fail("Invalid cloud code.");
        await throttle(
          db,
          `receive:${request.headers.get("cf-connecting-ip") || "unknown"}`,
          120,
          HOUR,
        );
        const share = await one(
          db,
          "SELECT payload,expires_at FROM shares WHERE id=? AND expires_at>?",
          id,
          Date.now(),
        );
        if (!share) fail("This snapshot expired or does not exist.", 404);
        return respond({
          people: await storage.people(share.payload),
          expiresAt: share.expires_at,
        });
      }
      const user = await authenticate(request, db);
      const followed = await following(request, db, user, input, {
        one,
        rows,
        run,
        statement,
        throttle,
        fail,
      });
      if (followed !== null) return respond(followed);
      if (path === "/auth/session" && request.method === "GET")
        return respond({ user: profile(user), revision: user.revision });
      if (path === "/auth/logout" && input) {
        await run(
          db,
          "DELETE FROM sessions WHERE token_hash=?",
          user.token_hash,
        );
        return respond({ ok: true });
      }
      if (path === "/auth/delete" && input) {
        if (typeof input.currentPassword !== "string" || !input.currentPassword.length || input.currentPassword.length > 128)
          fail("Current password required.");
        if (typeof input.confirmUsername !== "string" || input.confirmUsername.trim().toLowerCase() !== user.username.toLowerCase())
          fail("Type your username to confirm account deletion.");
        await loginGate(db, [`delete:${user.id}`]);
        await failedLogin(db, [`delete:${user.id}`]);
        if (!(await verify(input.currentPassword, user.password_hash, env, user.username)))
          fail("Incorrect current password.", 401);
        // The trigger and foreign-key cascades run inside this one atomic delete.
        // Recheck credentials and session after scrypt to reject concurrent revocation.
        const result = await one(db,
          "DELETE FROM users WHERE id=? AND password_hash=? AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=? AND user_id=users.id AND expires_at>?) RETURNING id",
          user.id, user.password_hash, user.token_hash, Date.now());
        if (result?.id !== user.id)
          fail("Your credentials changed. Sign in again before deleting your account.", 409);
        // Cleanup never deletes objects reachable from another account or an active upload.
        // If the daily quota is exhausted, the scheduled collector retries later.
        try { await storage.collect(); }
        catch { console.warn("Account deleted; unused storage cleanup deferred."); }
        return respond({ ok: true });
      }
      if (path === "/auth/password" && input) {
        if (
          typeof input.currentPassword !== "string" ||
          input.currentPassword.length > 128
        )
          fail("Current password required.");
        await loginGate(db, [`password:${user.id}`]);
        await failedLogin(db, [`password:${user.id}`]);
        if (!(await verify(input.currentPassword, user.password_hash, env, user.username)))
          fail("Incorrect current password.", 401);
        credentials({ username: user.username, password: input.newPassword });
        const hash = await requestPasswordHash(env, user.username, input.newPassword);
        await db.batch([
          statement(
            db,
            "UPDATE users SET password_hash=? WHERE id=?",
            hash,
            user.id,
          ),
          statement(
            db,
            "DELETE FROM attempts WHERE key=?",
            `password:${user.id}`,
          ),
          ...(input.signOutOthers
            ? [
                statement(
                  db,
                  "DELETE FROM sessions WHERE user_id=? AND token_hash<>?",
                  user.id,
                  user.token_hash,
                ),
              ]
            : []),
        ]);
        return respond({ ok: true });
      }
      if (path === "/sync" && request.method === "GET") {
        if (user.needs_compaction) {
          await storage.compact({ userId: user.id, limit: 5 });
          if (!(await storage.hasLegacy(user.id)))
            await run(
              db,
              "UPDATE users SET needs_compaction=0 WHERE id=? AND needs_compaction<>0",
              user.id,
            );
        }
        const since = Number(
          new URL(request.url).searchParams.get("since") || 0,
        );
        if (!Number.isSafeInteger(since) || since < 0 || since > user.revision)
          fail("Invalid revision.");
        // A single read snapshot pairs the revision with its rows, even during concurrent writes.
        const result = await rows(
          db,
          "SELECT u.revision AS current_revision,u.personal_schedule,r.name,r.payload,r.revision FROM users u LEFT JOIN records r ON r.user_id=u.id AND r.revision>? WHERE u.id=?",
          since,
          user.id,
        );
        return respond({
          revision: result[0]?.current_revision ?? user.revision,
          personalSchedule:
            result[0]?.personal_schedule ?? user.personal_schedule,
          changes: await storage.records(result.filter((x) => x.name !== null)),
        });
      }
      if (path === "/revision" && request.method === "GET")
        return respond({
          revision: user.revision,
          personalSchedule: user.personal_schedule,
          inboxRevision: user.inbox_revision,
        });
      if (path === "/sync" && input) {
        if (
          !Number.isSafeInteger(input.baseRevision) ||
          input.baseRevision < 0 ||
          !Array.isArray(input.changes) ||
          !input.changes.length ||
          input.changes.length > 50
        )
          fail("Invalid sync batch.");
        if (user.revision !== input.baseRevision)
          fail("Cloud changed. Reconcile and retry.", 409);
        const seen = new Set();
        for (const change of input.changes) {
          if (
            !change ||
            typeof change.name !== "string" ||
            (change.name !== "@preferences" &&
              (!change.name.startsWith("p:") ||
                !change.name.slice(2).trim() ||
                change.name.length > 202 ||
                ["__proto__", "constructor", "prototype"].includes(
                  change.name.slice(2),
                )))
          )
            fail("Invalid name.");
          if (seen.has(change.name)) fail("Duplicate change.");
          seen.add(change.name);
          if (change.name === "@preferences") {
            if (
              change.value !== null &&
              (typeof change.value !== "object" ||
                JSON.stringify(change.value).length > 100000)
            )
              fail("Invalid preferences.");
          } else if (change.value !== null)
            validatePeople({ [change.name.slice(2)]: change.value });
        }
        // Rollout compatibility: health protection can deploy before quota-blocked migration 0004.
        // Once the migration lands, ordinary saves always use the incremental counter.
        const size = Number.isSafeInteger(user.storage_bytes) ? { size: user.storage_bytes } : await one(
          db,
          "SELECT COALESCE(SUM(CASE WHEN substr(r.payload,1,5)='@UF1:' THEN COALESCE(o.logical_bytes,o.raw_bytes) ELSE length(CAST(r.payload AS BLOB)) END),0) AS size FROM records r LEFT JOIN cloud_objects o ON o.id=substr(r.payload,6) WHERE r.user_id=? AND r.name NOT LIKE 'f:%'",
          user.id,
        );
        const existing = await rows(
          db,
          `SELECT r.name,CASE WHEN substr(r.payload,1,5)='@UF1:' THEN COALESCE(o.logical_bytes,o.raw_bytes) ELSE length(CAST(r.payload AS BLOB)) END AS size FROM records r LEFT JOIN cloud_objects o ON o.id=substr(r.payload,6) WHERE r.user_id=? AND r.name IN (${input.changes.map(() => "?").join(",")})`,
          user.id,
          ...input.changes.map((change) => change.name),
        );
        const sizes = new Map(existing.map((row) => [row.name, row.size || 0]));
        const increase = input.changes.reduce(
          (total, change) =>
            total +
            (change.value === null
              ? 0
              : encoder.encode(JSON.stringify(change.value)).length) -
            (sizes.get(change.name) || 0),
          0,
        );
        if (increase > 0 && size.size + increase > 10 * 1024 * 1024)
          fail("Account test storage limit reached.", 413);
        const prepared = [];
        for (const change of input.changes)
          prepared.push(
            change.value === null
              ? null
              : await storage.prepare(change.value, {
                  schedule: change.name.startsWith("p:"),
                }),
          );
        await storage.stage(prepared.filter(Boolean));
        const next = input.baseRevision + 1;
        const batch = input.changes.map((change, index) =>
          statement(
            db,
            "INSERT INTO records(user_id,name,payload,revision) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND revision=?) ON CONFLICT(user_id,name) DO UPDATE SET payload=excluded.payload,revision=excluded.revision",
            user.id,
            change.name,
            prepared[index]?.ref ?? null,
            next,
            user.id,
            input.baseRevision,
          ),
        );
        batch.push(
          statement(
            db,
            "UPDATE users SET revision=? WHERE id=? AND revision=?",
            next,
            user.id,
            input.baseRevision,
          ),
        );
        const result = await db.batch(batch);
        if (result.at(-1).meta.changes !== 1)
          fail("Cloud changed. Reconcile and retry.", 409);
        return respond({ revision: next });
      }
      if (path === "/shares" && input) {
        validatePeople(input.people);
        if (!Object.keys(input.people).length) fail("Select schedules.");
        await throttle(db, `shares:${user.id}`, 30, DAY);
        const id = random(),
          createdAt = Date.now(),
          expiresAt = createdAt + 48 * HOUR;
        const full = await storage.completePeople(user.id,input.people);
        validatePeople(full.people);
        const prepared = await storage.collection(full.people);
        await storage.stage([prepared]);
        await run(
          db,
          "INSERT INTO shares(id,owner_id,payload,created_at,expires_at) VALUES(?,?,?,?,?)",
          id,
          user.id,
          prepared.ref,
          createdAt,
          expiresAt,
        );
        return respond({ code: `UFC1:${id}`, expiresAt }, 201);
      }
      if (path === "/users/lookup" && input) {
        await throttle(db, `lookup:${user.id}`, 60, HOUR);
        if (typeof input.username !== "string" || input.username.length > 24)
          fail("Enter a username.");
        const found = await one(
          db,
          "SELECT username FROM users WHERE username=?",
          input.username.toLowerCase(),
        );
        return respond({ username: found?.username || null });
      }
      if (path === "/deliveries" && request.method === "GET") {
        const inbox = await rows(
          db,
          "SELECT id,sender_name,payload,created_at FROM deliveries WHERE recipient_id=? AND status='pending' ORDER BY created_at LIMIT 10",
          user.id,
        );
        return respond({
          inboxRevision: user.inbox_revision,
          followRequests: await followRequests(db, user.id, rows),
          deliveries: await Promise.all(
            inbox.map(async (x) => ({
              id: x.id,
              sender: x.sender_name,
              people: await storage.people(x.payload),
              createdAt: x.created_at,
            })),
          ),
        });
      }
      if (path === "/deliveries" && input) {
        validatePeople(input.people);
        if (!Object.keys(input.people).length) fail("Select schedules.");
        if (typeof input.username !== "string" || input.confirmed !== true)
          fail("Verify and confirm the recipient.");
        const recipient = await one(
          db,
          "SELECT id FROM users WHERE username=?",
          input.username.toLowerCase(),
        );
        if (!recipient || recipient.id === user.id)
          fail("Recipient unavailable.");
        const blocked = await one(
          db,
          "SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)",
          recipient.id,
          user.id,
          user.id,
          recipient.id,
        );
        if (blocked) fail("Recipient unavailable.");
        await throttle(db, `send:${user.id}`, 20, DAY);
        await throttle(db, `inbox:${recipient.id}`, 100, DAY);
        const id = crypto.randomUUID();
        const full = await storage.completePeople(user.id,input.people);
        validatePeople(full.people);
        const prepared = await storage.collection(full.people);
        await storage.stage([prepared]);
        await run(
          db,
          "INSERT INTO deliveries(id,sender_id,recipient_id,sender_name,payload,created_at) VALUES(?,?,?,?,?,?)",
          id,
          user.id,
          recipient.id,
          user.username,
          prepared.ref,
          Date.now(),
        );
        return respond({ ok: true }, 201);
      }
      if (path === "/deliveries/respond" && input) {
        if (!["accepted", "declined"].includes(input.decision))
          fail("Choose Accept or Decline.");
        await run(
          db,
          "UPDATE deliveries SET status=? WHERE id=? AND recipient_id=? AND status='pending'",
          input.decision,
          input.id,
          user.id,
        );
        return respond({ ok: true });
      }
      if (path === "/blocks" && input) {
        const target = await one(
          db,
          "SELECT id FROM users WHERE username=?",
          String(input.username).toLowerCase(),
        );
        if (!target || target.id === user.id) fail("Username unavailable.");
        if (input.blocked === false)
          await run(
            db,
            "DELETE FROM blocks WHERE user_id=? AND blocked_id=?",
            user.id,
            target.id,
          );
        else
          await db.batch([
            statement(
              db,
              "INSERT OR IGNORE INTO blocks(user_id,blocked_id) VALUES(?,?)",
              user.id,
              target.id,
            ),
            statement(
              db,
              "UPDATE deliveries SET status='declined' WHERE recipient_id=? AND sender_id=? AND status='pending'",
              user.id,
              target.id,
            ),
          ]);
        return respond({ ok: true });
      }
      fail("Not found.", 404);
    } catch (error) {
      // Daily quota failures must not become a rapid generic-503 retry loop.
      if (/free tier daily row (read|write) limit|\b7500\b/i.test(error.message || "")) {
        const now = new Date(), retryAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
        headers["Retry-After"] = String(Math.ceil((retryAt - Date.now()) / 1000));
        return respond({ error: "Cloud daily quota exhausted. Local data is preserved. Retry after the daily reset.", code: "DAILY_QUOTA_EXHAUSTED", retryAt }, 429);
      }
      // Never return SQL, password hashes, session tokens or stack traces.
      return respond(
        {
          error: error.status
            ? error.message
            : "Service unavailable. Your local data has not been changed.",
        },
        error.status || 503,
      );
    } finally {
      if (diagnostics) {
        const { statements, rowsRead, rowsWritten, complete } =
          diagnostics.stats;
        console.info(
          JSON.stringify({
            event: "ufree_request",
            route: requestRoute(new URL(request.url).pathname),
            method: request.method,
            status: responseStatus,
            dbStatements: statements,
            rowsRead: complete ? rowsRead : null,
            rowsWritten: complete ? rowsWritten : null,
          }),
        );
      }
    }
  },
  async scheduled(_event, env) {
    // No inactivity deletion until a warning channel and grace period are approved.
    const now = Date.now();
    const storage = new CloudStorage(env.DB);
    await env.DB.batch([
      statement(env.DB, "DELETE FROM sessions WHERE expires_at<=?", now),
      statement(env.DB, "DELETE FROM shares WHERE expires_at<=?", now),
      statement(
        env.DB,
        "DELETE FROM rate_limits WHERE window<?",
        now - 2 * DAY,
      ),
    ]);
    await storage.compact({ limit: 100 });
    await storage.repairShares({limit:5});
    await storage.collect(now);
  },
};

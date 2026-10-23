const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Sync, reconcile } = require("../account-sync.js");
const make = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  };
};
const person = (n) => ({ classes: [], semester: "Fall 2026", note: n });
test("concurrent edits preserve both versions and deletions preserve edited conflicts separately", () => {
  const b = { Alex: person("old") };
  let r = reconcile(b, { Alex: person("local") }, { Alex: person("remote") });
  assert.equal(r.records.Alex.note, "remote");
  assert.equal(r.records["Alex (sync conflict 1)"].note, "local");
  r = reconcile(b, {}, { Alex: person("edit") });
  assert.equal(r.records.Alex, undefined);
  assert.equal(r.records["Alex (sync conflict 1)"].note, "edit");
  r = reconcile(b, { Alex: person("edit") }, {});
  assert.equal(r.records.Alex, undefined);
  assert.equal(r.records["Alex (sync conflict 1)"].note, "edit");
  assert.deepEqual({ ...reconcile(b, {}, b).records }, {});
});
test("unchanged checks transfer no schedules and recent checks are reused", async () => {
  const storage = make(),
    calls = [];
  storage.setItem(
    "a",
    JSON.stringify({
      revision: 1,
      base: { Alex: person(1) },
      records: { Alex: person(1) },
      initialized: true,
      conflicts: [],
    }),
  );
  const sync = new Sync({
    storage,
    key: "a",
    request: async (path) => {
      calls.push(path);
      return { revision: 1 };
    },
  });
  await sync.check();
  await sync.check();
  assert.deepEqual(calls, ["/revision"]);
});
test("offline saves survive restart and reconcile with remote changes before uploading only deltas", async () => {
  const storage = make();
  storage.setItem(
    "account",
    JSON.stringify({
      revision: 1,
      base: { Alex: person("old") },
      records: { Alex: person("old") },
      initialized: true,
      conflicts: [],
    }),
  );
  let offline = true,
    revision = 2,
    cloud = { Alex: person("remote"), Sam: person("remote") };
  const calls = [];
  const request = async (path, data) => {
    if (offline) throw Error("offline");
    calls.push({ path, data });
    if (path === "/revision") return { revision };
    if (path.startsWith("/sync?"))
      return {
        revision,
        changes: Object.entries(cloud).map(([name, value]) => ({
          name,
          value,
        })),
      };
    assert.equal(data.baseRevision, revision);
    for (const c of data.changes) {
      if (c.value === null) delete cloud[c.name];
      else cloud[c.name] = c.value;
    }
    return { revision: ++revision };
  };
  let sync = new Sync({ storage, key: "account", request });
  sync.save({ Alex: person("local") });
  clearTimeout(sync.timer);
  await sync.check(true);
  assert.equal(sync.pending(), 1);
  assert.equal(sync.error, "offline");
  offline = false;
  sync = new Sync({ storage, key: "account", request });
  await sync.check(true);
  assert.equal(sync.pending(), 0);
  assert.equal(sync.state.records.Alex.note, "remote");
  assert.equal(sync.state.records["Alex (sync conflict 1)"].note, "local");
  assert.equal(sync.state.records.Sam.note, "remote");
  assert.equal(calls.find((x) => x.data).data.changes.length, 1);
});
test("a lost upload response and a 409 retry do not duplicate edits", async () => {
  const storage = make();
  let revision = 0,
    cloud = {},
    conflict = true;
  const request = async (path, data) => {
    if (path === "/revision") return { revision };
    if (path.startsWith("/sync?"))
      return {
        revision,
        changes: Object.entries(cloud).map(([name, value]) => ({
          name,
          value,
        })),
      };
    if (conflict) {
      conflict = false;
      cloud.Sam = person("other");
      revision++;
      throw Object.assign(Error("conflict"), { status: 409 });
    }
    assert.equal(data.baseRevision, revision);
    for (const c of data.changes) cloud[c.name] = c.value;
    return { revision: ++revision };
  };
  const sync = new Sync({ storage, key: "a", request });
  sync.save({ Alex: person("new") });
  clearTimeout(sync.timer);
  await sync.check(true);
  assert.equal(sync.pending(), 0);
  assert.equal(sync.state.records.Sam.note, "other");
  assert.equal(sync.state.records.Alex.note, "new");
  assert.equal(Object.keys(cloud).length, 2);
});
test("edits made during an upload remain queued after the older upload is acknowledged", async () => {
  const storage = make();
  let sync,
    revision = 0,
    updates = 0;
  const request = async (path, data) => {
    if (path === "/revision") return { revision };
    if (path.startsWith("/sync?")) return { revision, changes: [] };
    if (updates++ === 0) {
      sync.save({ Alex: person("newer") });
      clearTimeout(sync.timer);
    }
    return { revision: ++revision };
  };
  sync = new Sync({ storage, key: "a", request });
  sync.save({ Alex: person("first") });
  clearTimeout(sync.timer);
  await sync.check(true);
  assert.equal(sync.pending(), 0);
  assert.equal(sync.state.base.Alex.note, "newer");
  assert.equal(updates, 2);
});

test("live records always follow server updates and tombstones without uploading private edits", () => {
  const { differences } = require("../account-sync.js");
  const base = { "f:peer": person("old"), "p:own": person("old") };
  const local = {
    "f:peer": person("tampered"),
    "p:own": person("offline edit"),
  };
  let merged = reconcile(base, local, {
    "f:peer": person("new"),
    "p:own": person("old"),
  });
  assert.equal(merged.records["f:peer"].note, "new");
  assert.equal(merged.records["p:own"].note, "offline edit");
  assert.equal(merged.conflicts.length, 0);
  assert.deepEqual(
    differences(base, local).map((r) => r.name),
    ["p:own"],
  );
  merged = reconcile(base, local, { "p:own": person("old") });
  assert.equal(merged.records["f:peer"], undefined);
  assert.equal(merged.records["p:own"].note, "offline edit");
});
test("object key ordering from compressed cloud JSON does not cause edits or conflicts", () => {
  const { differences } = require("../account-sync.js");
  const a = { classes: [], semester: "Fall 2026", custom: { z: 1, a: 2 } },
    b = { custom: { a: 2, z: 1 }, semester: "Fall 2026", classes: [] };
  assert.equal(differences({ "p:Person": a }, { "p:Person": b }).length, 0);
  const r = reconcile({ "p:Person": a }, { "p:Person": b }, { "p:Person": a });
  assert.equal(r.conflicts.length, 0);
  const prefs = { b: "second", a: "first" },
    reverse = { a: "first", b: "second" };
  assert.equal(
    differences({ "@preferences": prefs }, { "@preferences": reverse }).length,
    0,
  );
});
test("recent successful checks are reused across restarts without hiding unsynced edits", async () => {
  const storage = make();
  storage.setItem(
    "recent",
    JSON.stringify({
      revision: 1,
      base: { Alex: person("old") },
      records: { Alex: person("old") },
      initialized: true,
      conflicts: [],
    }),
  );
  let calls = 0;
  const request = async (path, data) => {
    calls++;
    if (path === "/revision") return { revision: 1, inboxRevision: 0 };
    return { revision: 2 };
  };
  await new Sync({ storage, key: "recent", request }).check();
  assert.equal(calls, 1);
  const reopened = new Sync({ storage, key: "recent", request });
  await reopened.check();
  assert.equal(calls, 1);
  reopened.save({ Alex: person("edited") });
  clearTimeout(reopened.timer);
  await reopened.check();
  assert.equal(calls, 3);
  assert.equal(reopened.pending(), 0);
});
test("failed event bursts back off while preserving pending changes, and explicit manual retry works", async () => {
  const storage = make();
  let calls = 0;
  const sync = new Sync({
    storage,
    key: "backoff",
    request: async () => {
      calls++;
      throw Object.assign(Error("unavailable"), { status: 503 });
    },
  });
  sync.save({ Alex: person("offline") });
  clearTimeout(sync.timer);
  await sync.check("save");
  for (let i = 0; i < 100; i++) await sync.check();
  assert.equal(calls, 1);
  assert.equal(sync.pending(), 1);
  assert.ok(sync.state.retryAt > Date.now());
  const reopened = new Sync({ storage, key: "backoff", request: sync.request });
  await reopened.check();
  assert.equal(calls, 1);
  await sync.check(true);
  assert.equal(calls, 2);
  assert.equal(sync.state.records.Alex.note, "offline");
  clearTimeout(sync.timer);
});
test("tabs recheck shared freshness after acquiring the browser lock", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let chain = Promise.resolve();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        request: (key, callback) => {
          const result = chain.then(callback);
          chain = result.catch(() => {});
          return result;
        },
      },
    },
  });
  try {
    const storage = make();
    storage.setItem(
      "tabs",
      JSON.stringify({
        revision: 1,
        base: {},
        records: {},
        initialized: true,
        conflicts: [],
      }),
    );
    let calls = 0;
    const options = {
      storage,
      key: "tabs",
      request: async () => {
        calls++;
        return { revision: 1, inboxRevision: 0 };
      },
    };
    await Promise.all([new Sync(options).check(), new Sync(options).check()]);
    assert.equal(calls, 1);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
});
test("expired sessions do not trigger background upload retries and pending changes stay intact", async () => {
  const storage = make();
  let calls = 0;
  const sync = new Sync({
    storage,
    key: "expired",
    request: async () => {
      calls++;
      throw Object.assign(Error("expired"), { status: 401 });
    },
  });
  sync.save({ Alex: person("pending") });
  clearTimeout(sync.timer);
  await sync.check("save");
  assert.equal(calls, 1);
  assert.equal(sync.authBlocked, true);
  sync.persist({ ...sync.state, retryAt: 0 });
  for (let i = 0; i < 20; i++) await sync.check();
  assert.equal(calls, 1);
  assert.equal(sync.pending(), 1);
  clearTimeout(sync.timer);
});
test("clock rollback does not make persisted freshness suppress checks indefinitely", async () => {
  const storage = make();
  storage.setItem(
    "clock",
    JSON.stringify({
      revision: 1,
      base: {},
      records: {},
      initialized: true,
      conflicts: [],
      checkedAt: Date.now() + 86400000,
      retryAt: Date.now() + 86400000,
    }),
  );
  let calls = 0;
  const sync = new Sync({
    storage,
    key: "clock",
    request: async () => {
      calls++;
      return { revision: 1 };
    },
  });
  await sync.check();
  assert.equal(calls, 1);
});

test('daily quota pauses survive reloads and foreground events without scheduling retries',async()=>{
 const storage=make();let calls=0;
 const retryAt=Date.now()+3600000;
 const options={storage,key:'quota-paused',request:async()=>{calls++;throw Object.assign(Error('daily quota'),{status:429,code:'DAILY_QUOTA_EXHAUSTED',retryAt});}};
 let sync=new Sync(options);sync.save({Alex:person('pending')});clearTimeout(sync.timer);sync.timer=null;
 await sync.check('save');assert.equal(calls,1);assert.equal(sync.timer,null);
 sync=new Sync(options);
 for(let i=0;i<100;i++)await sync.check();
 assert.equal(calls,1);assert.equal(sync.pending(),1);assert.equal(sync.state.retryAt,retryAt);
});

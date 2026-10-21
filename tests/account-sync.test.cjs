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

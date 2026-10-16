const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pack } = require("../schedule-qr-batches.js");
const sized = sizes => async names => "x".repeat(names.reduce((sum, name) => sum + sizes[name], 0));
const members = result => result.groups.flatMap(group => group.names).sort();

test("a selection that fits remains one independent link", async () => {
  let calls = 0;
  const result = await pack(["A", "B"], async () => { calls++; return "one link"; }, { maxBytes: 10 });
  assert.equal(calls, 1);
  assert.equal(result.groups.length, 1);
  assert.deepEqual(members(result), ["A", "B"]);
});

test("redistribution beats greedy packing for mixed large and small people", async () => {
  const sizes = { A: 6, B: 5, C: 3, D: 2, E: 2, F: 2 };
  const greedy = await pack(Object.keys(sizes), sized(sizes), { maxBytes: 10, maxSearchNodes: 0 });
  const optimized = await pack(Object.keys(sizes), sized(sizes), { maxBytes: 10 });
  assert.equal(greedy.groups.length, 3);
  assert.equal(optimized.groups.length, 2);
  assert.deepEqual(members(optimized), Object.keys(sizes));
  assert.ok(optimized.groups.every(group => group.size <= 10));
});

test("packing measures combined compression instead of adding individual sizes", async () => {
  const calls = new Set();
  const result = await pack(["A", "B", "C"], async names => {
    const key = names.join(); assert.equal(calls.has(key), false, "each subset is encoded only once"); calls.add(key);
    return "x".repeat(names.length === 3 ? 20 : names.length === 2 ? 9 : 7);
  }, { maxBytes: 10 });
  assert.equal(result.groups.length, 2);
  assert.deepEqual(members(result), ["A", "B", "C"]);
});

test("a person too large alone is reported explicitly without losing other people", async () => {
  const result = await pack(["Huge", "A", "B"], sized({ Huge: 11, A: 4, B: 4 }), { maxBytes: 10 });
  assert.deepEqual(result.oversized, ["Huge"]);
  assert.deepEqual(members(result), ["A", "B"]);
  assert.equal(result.groups.length, 1);
});

test("bounded optimization still covers everyone exactly once", async () => {
  const names = ["__proto__", "A", "B", "C"], sizes = Object.fromEntries(names.map(name => [name, 6]));
  let calls = 0;
  const result = await pack([...names, "A"], async people => { calls++; return sized(sizes)(people); }, { maxBytes: 10, maxExtraChecks: 0 });
  assert.deepEqual(members(result), [...names].sort());
  assert.equal(result.groups.length, 4);
  assert.equal(calls, names.length + 1);
});

test("QR capacity counts UTF-8 bytes and cancellation discards pending work", async () => {
  const result = await pack(["A", "B"], async names => "é".repeat(names.length), { maxBytes: 3 });
  assert.equal(result.groups.length, 2);
  let cancelled = false;
  await assert.rejects(pack(["A", "B"], async () => { cancelled = true; return "large link"; }, { isCancelled: () => cancelled }), { name: "AbortError" });
  await assert.rejects(pack(["A"], async () => { throw Error("Encoding failed"); }), /Encoding failed/);
});

test("progress advances with real schedule/packing work and finishes only after groups are prepared", async () => {
  const sizes = { A: 6, B: 5, C: 3, D: 2, E: 2, F: 2 }, updates = [];
  const result = await pack(Object.keys(sizes), sized(sizes), { maxBytes: 10, onProgress: info => updates.push({ ...info }) });
  assert.equal(result.groups.length, 2);
  assert.equal(updates[0].progress, 0);
  assert.equal(updates.at(-1).progress, 1);
  assert.equal(updates.at(-1).phase, "complete");
  for (let i = 1; i < updates.length; i++) {
    assert.ok(updates[i].progress >= updates[i - 1].progress && updates[i].progress <= 1);
    assert.ok(updates[i].checked >= updates[i - 1].checked);
  }
  assert.deepEqual([...new Set(updates.filter(info => info.phase === "checking").map(info => info.processed))], [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(updates.some(info => info.phase === "packing"));
  assert.ok(updates.some(info => info.phase === "optimizing" && info.progress > .5));
  assert.ok(updates.every(info => info.phase === "complete" || info.progress < 1));
});

test("empty/cached-fit QR selections complete progress, while failures and cancellation do not", async () => {
  for (const names of [[], ["A", "B"]]) {
    const updates = [];
    await pack(names, async () => { throw Error("cached selection must not encode"); }, { fullLink: "one link", onProgress: info => updates.push(info) });
    assert.equal(updates.at(-1).phase, "complete");
    assert.equal(updates.at(-1).progress, 1);
  }
  const updates = []; let cancelled = false;
  await assert.rejects(pack(["A", "B"], async () => { cancelled = true; return "large"; }, { isCancelled: () => cancelled, onProgress: info => updates.push(info) }), { name: "AbortError" });
  assert.ok(updates.every(info => info.progress < 1));
  await assert.rejects(pack(["A"], async () => { throw Error("Failed to encode"); }, { onProgress: info => updates.push(info) }), /Failed to encode/);
  assert.ok(updates.every(info => info.phase !== "complete"));
});

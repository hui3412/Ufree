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

test("mixed large and small people use a compact greedy result with bounded encoding work", async () => {
  const sizes = { A: 6, B: 5, C: 3, D: 2, E: 2, F: 2 };
  let calls = 0;
  const result = await pack(Object.keys(sizes), async names => { calls++; return sized(sizes)(names); }, { maxBytes: 10 });
  // A perfect search can use two QRs; three is acceptable without backtracking.
  assert.equal(result.groups.length, 3);
  assert.deepEqual(members(result), Object.keys(sizes));
  assert.ok(result.groups.every(group => group.size <= 10));
  assert.ok(calls <= 1 + 3 * Object.keys(sizes).length);
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

test("bounded placement covers unique and special names exactly once", async () => {
  const names = ["__proto__", "A", "B", "C"], sizes = Object.fromEntries(names.map(name => [name, 6]));
  let calls = 0;
  const result = await pack([...names, "A"], async people => { calls++; return sized(sizes)(people); }, { maxBytes: 10 });
  assert.deepEqual(members(result), [...names].sort());
  assert.equal(result.groups.length, 4);
  assert.ok(calls <= 1 + 3 * names.length);
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
  assert.equal(result.groups.length, 3);
  assert.equal(updates[0].progress, 0);
  assert.equal(updates.at(-1).progress, 1);
  assert.equal(updates.at(-1).phase, "complete");
  for (let i = 1; i < updates.length; i++) {
    assert.ok(updates[i].progress >= updates[i - 1].progress && updates[i].progress <= 1);
    assert.ok(updates[i].checked >= updates[i - 1].checked);
  }
  assert.deepEqual([...new Set(updates.filter(info => info.phase === "checking").map(info => info.processed))], [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(updates.some(info => info.phase === "packing"));
  assert.ok(updates.some(info => info.phase === "packing" && info.progress > .5));
  assert.ok(updates.every(info => info.phase !== "optimizing"));
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


for (const count of [50, 100, 250]) test(`${count} people keep combining through the last person instead of exhausting a shared limit`, async () => {
  const names = Array.from({ length: count }, (_, i) => `Person ${String(i + 1).padStart(3, "0")}`);
  let calls = 0;
  const result = await pack(names, async group => { calls++; return "x".repeat(group.length * 4); }, { maxBytes: 10 });
  assert.equal(result.groups.length, count / 2);
  assert.ok(result.groups.every(group => group.names.length === 2 && group.size <= 10));
  assert.deepEqual(members(result), [...names].sort());
  assert.ok(result.groups.some(group => group.names.includes(names.at(-1)) && group.names.length === 2));
  assert.ok(calls <= 1 + 3 * count, "at most two placement encodings per person, plus initial/single checks");
});

test("a failed close-fit candidate still tries the roomiest group using real combined compression", async () => {
  const lengths = { A: 6, B: 5, C: 3, "A,B": 11, "A,C": 11, "B,C": 8, "A,B,C": 15 };
  const result = await pack(["A", "B", "C"], async names => "x".repeat(lengths[names.join()]), { maxBytes: 10 });
  assert.equal(result.groups.length, 2);
  assert.ok(result.groups.some(group => group.names.join() === "B,C"));
});

test("large mixed selections remain compact, oversized schedules are explicit, and packing stays cancellable", async () => {
  const sizes = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`Person ${String(i).padStart(3, "0")}`, [6, 4, 3, 2][i % 4]]));
  sizes.Huge = 11;
  const updates = []; let calls = 0;
  const result = await pack(Object.keys(sizes), async names => { calls++; return sized(sizes)(names); }, { maxBytes: 10, onProgress: info => updates.push(info) });
  assert.deepEqual(result.oversized, ["Huge"]);
  assert.equal(result.groups.flatMap(group => group.names).length, 100);
  assert.ok(result.groups.length <= 42, "near the 38-QR byte lower bound, without an exact search");
  assert.ok(result.groups.every(group => group.size <= 10));
  assert.ok(calls <= 1 + 3 * 101);
  assert.ok(updates.some(info => info.phase === "packing" && info.processed === 100 && info.total === 100));
  let cancelled = false;
  await assert.rejects(pack(Object.keys(sizes), sized(sizes), {
    maxBytes: 10, isCancelled: () => cancelled,
    onProgress: info => { if (info.phase === "packing" && info.processed === 12) cancelled = true; },
  }), { name: "AbortError" });
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { deflateRawSync, deflateSync } = require("node:zlib");
const source = fs.readFileSync(path.join(__dirname, "../schedule-share-code.js"), "utf8");
const plain = x => JSON.parse(JSON.stringify(x));
const fields = ["instructor", "course_code", "section", "semester", "extras"];
function codec(compression = CompressionStream) {
  const c = vm.createContext({ TextEncoder, TextDecoder, Blob, Uint8Array, CompressionStream: compression, DecompressionStream, URL, URLSearchParams, atob, btoa });
  vm.runInContext(source, c); return c.WhosFreeShareCode;
}
const api = codec();
const data = { shared_group: { id: "team-123", name: "Équipe 📚" }, people: {
  Alice: { semester: "Fall 2026", notes: "Keep this", classes: [{ day: "Sunday", start: "08:17", end: "09:38", course: "Physics", room: "A-123", instructor: "Anna de la Cruz", course_code: "203", section: "01", kind: "class", note: "Reviewed" }] },
  Bob: { classes: [] }
} };

test("WF7 group code and links preserve membership, selected details, and the current deployment", async () => {
  const before = plain(data);
  for (const selected of [[], fields]) {
    const code = await api.encode(data, { fields: selected });
    assert.match(code, /^WF7/);
    const decoded = await api.decode(code);
    assert.deepEqual(plain(decoded.shared_group), data.shared_group);
    assert.deepEqual(Object.keys(decoded.people), ["Alice", "Bob"]);
    assert.deepEqual(plain(decoded.share_fields), selected);
    if (selected.length) assert.deepEqual(plain(decoded.people), data.people);
    else { assert.equal(decoded.people.Alice.notes, undefined); assert.equal(decoded.people.Alice.classes[0].instructor, null); }
    for (const base of ["https://hui3412.github.io/Ufree/", "https://youfree.ca/"]) {
      const link = api.createLink(code, base + "?old=yes#old");
      assert.ok(link.startsWith(base + "#import=WFL7"));
      assert.deepEqual(plain(await api.decode(link)), plain(decoded));
      await assert.rejects(api.decode(link.slice(0, -1)), /incomplete|changed|invalid/);
    }
  }
  assert.deepEqual(data, before);
});

test("WF7 uncompressed fallback and compressed variants decode without losing the group", async () => {
  const raw = codec(false), code = await raw.encode(data, { fields });
  const expected = plain(await api.decode(code));
  const checked = api.__test.unbase15(code.slice(4)), bytes = checked.subarray(4);
  for (const [mode, value] of [[code[3], bytes], [({ J: "D", B: "R", T: "U" })[code[3]], deflateRawSync(bytes)], [({ J: "Z", B: "S", T: "V" })[code[3]], deflateSync(bytes)]]) {
    assert.ok(mode);
    assert.deepEqual(plain(await api.decode(api.__test.wrap(value, mode, 7))), expected);
  }
  assert.deepEqual(plain((await raw.decode(await raw.encode(data))).shared_group), data.shared_group);
});

test("WF7 rejects invalid metadata, limits, broken envelopes and damaged codes", async () => {
  for (const shared_group of [null, {}, { id: "bad id", name: "Team" }, { id: "ok", name: " " }, { id: "ok", name: "x".repeat(61) }, { id: "ok", name: "bad\nname" }]) {
    await assert.rejects(api.encode({ ...data, shared_group }, { fields: [] }), /group details/);
  }
  const raw = codec(false), code = await raw.encode(data, { fields: [] });
  const bytes = api.__test.unbase15(code.slice(4)).subarray(4);
  const length = bytes[0] | bytes[1] << 8, core = bytes.subarray(2 + length);
  for (const metadata of [{ v: 2, ...data.shared_group }, { v: 1, id: "ok", name: "" }, { v: 1, id: "!", name: "Team" }]) {
    const text = Buffer.from(JSON.stringify(metadata)), invalid = Uint8Array.from([text.length & 255, text.length >> 8, ...text, ...core]);
    await assert.rejects(api.decode(api.__test.wrap(invalid, code[3], 7)), /group format|group details/);
  }
  for (const invalid of [[], [0, 0, 1], [255, 255, 1], [2, 0, 123]]) await assert.rejects(api.decode(api.__test.wrap(Uint8Array.from(invalid), "J", 7)), /group details|incomplete|changed/);
});

test("all nine WF7 mode envelopes preserve the group and its basic fields", async () => {
  const basic = { people: { A: { classes: [{ day: "Monday", start: "09:00", end: "10:00", course: "Physics", room: "A-100" }] } } };
  const packed = api.__test.pack(basic, false), metadata = Buffer.from(JSON.stringify({ v: 1, ...data.shared_group }));
  const families = [
    ["JDZ", Buffer.from(JSON.stringify(api.__test.packCompact(packed, true)))],
    ["BRS", api.__test.packBinary(packed, 0, false)],
    ["TUV", api.__test.factor5.encode(packed, api.__test.factor5.configs[0], 0)]
  ];
  let expected;
  for (const [modes, core] of families) {
    const length = []; let n = core.length;
    do { const part = n % 128; n = Math.floor(n / 128); length.push(part | (n ? 128 : 0)); } while (n);
    const bytes = Uint8Array.from([metadata.length & 255, metadata.length >> 8, ...metadata, 0, ...length, ...core]);
    for (const [i, value] of [bytes, deflateRawSync(bytes), deflateSync(bytes)].entries()) {
      const imported = plain(await api.decode(api.__test.wrap(value, modes[i], 7)));
      if (!expected) expected = imported;
      assert.deepEqual(imported, expected, modes[i]);
    }
  }
});

test("WF1 through WF6 remain importable and ordinary exports keep their existing version", async () => {
  const ordinary = { people: data.people }, packed = api.__test.pack(ordinary);
  const payload = Buffer.from(JSON.stringify(packed));
  let crc = 0xffffffff;
  for (const byte of payload) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, buffer = 0, encoded = "";
  for (const byte of payload) { buffer = buffer << 8 | byte; bits += 8; while (bits >= 5) { bits -= 5; encoded += alphabet[buffer >>> bits & 31]; } buffer &= (1 << bits) - 1; }
  if (bits) encoded += alphabet[buffer << (5 - bits) & 31];
  const wf1 = "WF1J" + ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0") + encoded;
  const compact = Buffer.from(JSON.stringify(api.__test.packCompact(packed)));
  const wf5 = await api.encode(ordinary), wf6 = await api.encode(ordinary, { fields });
  assert.match(wf5, /^WF5/); assert.match(wf6, /^WF6/);
  const frozen = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/share-code-wf4.json")));
  for (const code of [wf1, api.__test.wrap(compact, "J", 2), api.__test.wrap(compact, "J", 3), frozen.codes.J, wf5, wf6]) {
    const imported = await api.decode(code);
    assert.ok(Object.keys(imported.people).length);
    assert.equal(imported.shared_group, undefined);
  }
});

test("merge maps group members to duplicates, kept/replaced canonical names and Keep both names", async () => {
  const old = { people: { ALICE: data.people.Alice, Bob: { classes: [{ day: "Monday", start: "09:00", end: "10:00", course: "Local" }] } } };
  const incoming = await api.decode(await api.encode(data, { fields }));
  for (const choice of ["old", "replace", "both"]) {
    const result = await api.merge(old, incoming, () => choice);
    assert.equal(result.nameMap.Alice, "ALICE");
    assert.equal(result.nameMap.Bob, choice === "both" ? "Bob 2" : "Bob");
    assert.equal(result.data.shared_group, undefined, "transport metadata is not saved in schedules");
  }
});

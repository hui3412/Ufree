const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { deflateRawSync, deflateSync } = require("node:zlib");
const source = fs.readFileSync(require("node:path").join(__dirname, "../schedule-share-code.js"), "utf8");
function codec(compression = true) {
  const context = vm.createContext({ TextEncoder, TextDecoder, Blob, CompressionStream: compression ? CompressionStream : undefined, DecompressionStream, Uint8Array });
  vm.runInContext(source, context);
  return context.WhosFreeShareCode;
}
const api = codec();
const classItem = { day: "Saturday", start: "11:15", end: "12:05", course: "Chimie générale 📚", room: "900", instructor: "Hui En Qian", kind: "busy_block" };
const data = { schema_version: 1, people: { "Élodie Qian": { source_file: "private-original.jpg", classes: [classItem] }, "Empty Day": { classes: [] } }, nicknames: { private: "not shared" } };
const plain = value => JSON.parse(JSON.stringify(value));
function crafted(payload, compressed = false) {
  const bytes = compressed ? deflateRawSync(Buffer.from(payload)) : Buffer.from(payload);
  return api.__test.wrap(bytes, compressed ? "D" : "J");
}

test("a standalone Unicode code preserves Unicode, weekends, busy labels and empty schedules", async () => {
  const code = await api.encode(data);
  assert.match(code, /^WF5[DJZBRSTUV][0-9a-e][\u3400-\u4dbf\u4e00-\u9fff\uac00-\uc03f]+$/);
  assert.equal([...code].length, code.length, "one UTF-16 code unit per visible character");
  const decoded = await api.decode(code.normalize("NFC").replace(/(.{40})/g, "$1\n"));
  assert.deepEqual(Object.keys(decoded.people), Object.keys(data.people));
  assert.equal(decoded.people["Élodie Qian"].source_file, "Shared code");
  assert.equal(decoded.people["Élodie Qian"].classes[0].day, "Saturday");
  for (const key of Object.keys(classItem)) assert.equal(decoded.people["Élodie Qian"].classes[0][key], key === "instructor" ? "Qian" : classItem[key]);
  assert.equal(decoded.people["Empty Day"].classes.length, 0);
  assert.equal(decoded.nicknames, undefined);
  assert.ok(!JSON.stringify(decoded).includes("private-original"));
});

test("compression reduces message size; uncompressed fallback can be read by the same importer", async () => {
  const collection = { people: { Person: { classes: Array.from({ length: 30 }, () => ({ ...classItem })) } } };
  const compressed = await api.encode(collection);
  const uncompressed = await codec(false).encode(collection);
  assert.match(compressed, /^WF5[DJZBRSTUV]/);
  assert.match(uncompressed, /^WF5[JBT]/);
  assert.ok(compressed.length <= uncompressed.length, "compression is optional when a raw structural layout is shorter");
  assert.deepEqual(plain(await api.decode(compressed)), plain(await api.decode(uncompressed)));
});

test("choosing keep old preserves existing schedules without dropping unrelated people", async () => {
  const oldPerson = { classes: [{ ...classItem, room: "Original room" }] };
  const existing = { schema_version: 1, people: { "Élodie Qian": oldPerson, Unrelated: { classes: [] } } };
  const incoming = await api.decode(await api.encode({ people: { "  ÉLODIE   QIAN ": { classes: [classItem] }, Friend: { classes: [classItem] } } }));
  const result = await api.merge(existing, incoming, () => "old");
  assert.equal(result.added, 1);
  assert.equal(result.kept, 1);
  assert.equal(result.data.people["Élodie Qian"], oldPerson);
  assert.equal(result.data.people.Unrelated, existing.people.Unrelated);
  assert.equal(Object.keys(existing.people).length, 2);
  const repeated = await api.merge(result.data, incoming, () => "old");
  assert.equal(repeated.added, 0);
  assert.equal(repeated.skipped, 1);
  assert.equal(repeated.kept, 1);
});

test("prototype-like names remain ordinary schedule entries", async () => {
  const dangerousNames = JSON.parse('{"people":{"__proto__":{"classes":[]},"constructor":{"classes":[]}}}');
  const decoded = await api.decode(await api.encode(dangerousNames));
  const merged = await api.merge({ people: {} }, decoded);
  assert.equal(Object.keys(merged.data.people).length, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(merged.data.people, "__proto__"), true);
  assert.equal({}.classes, undefined);
});

test("exact timetable equality ignores order and local metadata, but compares every shared field and semester", () => {
  const original = { semester: "Fall 2026", classes: [classItem, { ...classItem, day: "Sunday" }] };
  const copy = { ...original, source_file: "different.jpg", classes: [...original.classes].reverse().map(item => ({ ...item, needs_review: true })) };
  assert.equal(api.__test.sameSchedule(original, copy), true);
  for (const field of ["day", "start", "end", "course", "course_code", "section", "room", "instructor", "kind"]) {
    const changed = { ...original, classes: original.classes.map((item, i) => i ? item : { ...item, [field]: field === "kind" ? "class" : "changed" }) };
    assert.equal(api.__test.sameSchedule(original, changed), false, field);
  }
  assert.equal(api.__test.sameSchedule(original, { ...copy, semester: "Winter 2027" }), false);
  assert.equal(api.__test.sameSchedule({ classes: [] }, { classes: [] }), true);
  assert.equal(api.__test.sameSchedule({ classes: [{ day: "Monday", start: "08:00", end: "10:00" }] },
    { classes: [{ day: "Monday", start: "08:00", end: "09:00" }, { day: "Monday", start: "09:00", end: "10:00" }] }), false);
});

test("only the exact same name and timetable skip automatically; partial overlaps require a choice", async () => {
  const person = end => ({ classes: [{ day: "Monday", start: "08:00", end }] });
  const existing = { people: { David: person("09:00"), "David 2": person("10:00") } };
  let calls = 0;
  const choose = () => { calls++; return "both"; };
  const identical = await api.merge(existing, { people: { " DAVID ": person("09:00") } }, choose);
  assert.equal(identical.skipped, 1); assert.equal(calls, 0);
  const differentName = await api.merge(existing, { people: { Other: person("09:00") } }, choose);
  assert.equal(differentName.added, 1); assert.equal(calls, 0);
  const different = await api.merge(existing, { people: { David: person("10:00") } }, choose);
  assert.equal(calls, 1); assert.equal(different.skipped, 0);
  assert.ok(different.data.people["David 3"], "a numbered person's identical timetable is not a matching name");
  assert.equal(different.data.people.David, existing.people.David);
  await assert.rejects(api.merge(existing, { people: { David: person("09:01") } }), /Choose how/);
});

test("keep both reserves batch names and never overwrites an occupied name", async () => {
  const person = day => ({ classes: [{ day, start: "09:00", end: "10:00" }] });
  const existing = { people: { David: person("Monday"), "DAVID 2": person("Tuesday") } };
  const incoming = { people: { david: person("Wednesday"), "David 3": person("Friday") } };
  const result = await api.merge(existing, incoming, conflict => {
    assert.equal(conflict.newName, "David 4"); return "both";
  });
  assert.equal(result.added, 2);
  assert.equal(result.data.people["David 3"].classes[0].day, "Friday");
  assert.equal(result.data.people["David 4"].classes[0].day, "Wednesday");
  assert.equal(Object.keys(existing.people).length, 2);
  const longName = "D".repeat(120);
  const longResult = await api.merge({ people: { [longName]: person("Monday") } }, { people: { [longName]: person("Friday") } }, () => "both");
  assert.equal(Object.keys(longResult.data.people)[1].length, 120);
});

test("replace and keep old retain the canonical name; failed batches leave input untouched", async () => {
  const old = { classes: [classItem] }, changed = { classes: [{ ...classItem, room: "New room" }] };
  const existing = { people: { David: old, Friend: { classes: [] } } };
  const result = await api.merge(existing, { people: { DAVID: changed } }, () => "replace");
  assert.equal(result.replaced, 1); assert.equal(result.added, 0);
  assert.equal(result.data.people.David, changed); assert.equal(result.data.people.DAVID, undefined);
  const kept = await api.merge(existing, { people: { DAVID: changed } }, () => "old");
  assert.equal(kept.kept, 1); assert.equal(kept.data.people.David, old);
  await assert.rejects(api.merge(existing, { people: { New: { classes: [] }, David: changed } }, () => "invalid"), /Nothing was saved/);
  assert.equal(existing.people.New, undefined); assert.equal(existing.people.David, old);
});

test("damaged, unsupported and malformed codes fail without yielding schedules", async () => {
  const code = await api.encode(data);
  await assert.rejects(api.decode(""), /not a valid/);
  await assert.rejects(api.decode(code.replace(/^WF5/, "WF9")), /not a valid/);
  await assert.rejects(api.decode(code.slice(0, -4)), /incomplete|changed/);
  await assert.rejects(api.decode(code.slice(0, 12) + "!" + code.slice(13)), /not a valid/);
  await assert.rejects(api.decode(crafted("not JSON")), /readable/);
  await assert.rejects(api.decode(crafted('[["Bad",[[0,720,-60]]]]')), /valid schedule data/);
  await assert.rejects(api.decode(crafted('[["Bad",[]],["bad",[]]]')), /repeated/);
  await assert.rejects(api.encode({ people: {} }), /supported schedule/);
  await assert.rejects(api.decode("WF1G01234567OLD"), /incomplete|changed/);
  await assert.rejects(api.decode(code.toLowerCase()), /not a valid/);
  const index = 20;
  const changed = code.slice(0, index) + String.fromCharCode(0x4e00 + ((code.charCodeAt(index) - 0x4e00 + 1) % 16384)) + code.slice(index + 1);
  await assert.rejects(api.decode(changed), /changed/);
});

test("decompression is bounded even when a tiny code expands beyond the limit", async () => {
  const code = crafted(" ".repeat(api.__test.MAX_BYTES + 1), true);
  await assert.rejects(api.decode(code), /too large/);
});


test("dense encoding preserves every byte alignment and survives Unicode normalization", () => {
  for (let length = 4; length < 512; length++) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 197 + length * 13) & 255);
    const text = api.__test.base14(bytes);
    assert.equal(text.length, 1 + Math.ceil(length * 8 / 14));
    assert.equal(text.normalize("NFC"), text);
    assert.equal(text.normalize("NFKC"), text);
    assert.deepEqual(api.__test.unbase14(text), bytes);
  }
  const alphabet = Array.from({ length: 16384 }, (_, i) => String.fromCharCode(0x4e00 + i)).join("");
  assert.equal(alphabet.normalize("NFC"), alphabet);
  assert.equal(alphabet.normalize("NFKC"), alphabet);
  assert.ok(!/\s/.test(alphabet));
});

test("raw and wrapped compression have the same portable result", async () => {
  class OlderCompressionStream {
    constructor(format) {
      if (format === "deflate-raw") throw new TypeError("unsupported");
      return new CompressionStream(format);
    }
  }
  const context = vm.createContext({ TextEncoder, TextDecoder, Blob, CompressionStream: OlderCompressionStream, DecompressionStream, Uint8Array });
  vm.runInContext(source, context);
  const collection = { people: { Person: { classes: Array.from({ length: 30 }, () => ({ ...classItem })) } } };
  const code = await context.WhosFreeShareCode.encode(collection);
  assert.match(code, /^WF5[JBTZSV]/);
  assert.deepEqual(plain(await api.decode(code)), plain(await api.decode(await api.encode(collection))));
  const unavailable = vm.createContext({ TextEncoder, TextDecoder, Blob, Uint8Array });
  vm.runInContext(source, unavailable);
  const bytes = api.__test.packBinary(api.__test.pack(collection, true), 0);
  await assert.rejects(unavailable.WhosFreeShareCode.decode(api.__test.wrap(deflateSync(bytes), "S", 5)), /browser cannot open/);
});

test("arbitrary minute times and unfamiliar course labels survive compact packing", async () => {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const classes = days.map((day, i) => ({ day, start: "09:07", end: "10:13", course: `Unfamiliar course ${i}`, course_code: "XYZ", section: "00001", room: "A-101", instructor: "名字", kind: i % 2 ? "busy_block" : "class" }));
  const code = await api.encode({ people: { Student: { classes } } });
  assert.deepEqual(plain((await api.decode(code)).people.Student.classes), classes.map(item => ({ ...item, course_code: null, section: null })));
  assert.ok(code.length < 180, "a representative week stays short without dropping course labels or minutes");
});

test("compact payload rejects invalid flags, fractions, labels and duplicate person names", async () => {
  for (const row of [[7,540,60], [15,540,60], [-1,540,60], [0,540.5,60], [0,540,60.5], [0,1430,10], [0,540,0], [0,540,60,123], [0,540,60,"x".repeat(201)]]) {
    await assert.rejects(api.decode(crafted(JSON.stringify([["Bad",[row]]]))), /valid schedule data|label/);
  }
  await assert.rejects(api.decode(crafted(JSON.stringify([["Bad",Array(501).fill([0,540,60])]]))), /valid schedule data/);
  await assert.rejects(api.decode(crafted(JSON.stringify(Array(251).fill(["Bad",[]])))), /repeated person names/);
  await assert.rejects(api.decode(api.__test.wrap(deflateSync(Buffer.from("not JSON")), "D")), /could not be opened/);
});


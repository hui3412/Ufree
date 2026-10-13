const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../schedule-share-code.js"), "utf8");
const fields = ["instructor", "course_code", "section", "semester", "extras"];
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function codec(compression = CompressionStream) {
  const context = vm.createContext({ TextEncoder, TextDecoder, Blob, Uint8Array, CompressionStream: compression, DecompressionStream, URL, URLSearchParams, atob, btoa });
  vm.runInContext(source, context); return context.WhosFreeShareCode;
}
const api = codec();
const data = { people: {
  "Élise 📚": { semester: "Fall 2026", source_file: "full schedule.jpg", notes: { language: "fr", checked: false }, classes: [
    { day: "Sunday", start: "08:17", end: "09:38", course: "Calcul différentiel", room: "D-108", instructor: "Anna de la Cruz", course_code: "201-SN2-RE", section: "00001", kind: "class", recognition: { uncertain: ["room"], confidence: 0.9 } },
    { day: "Saturday", start: "22:05", end: "23:59", course: "Club", room: "Gym", instructor: "Wee Keong Lim", course_code: "CLUB", section: "002", kind: "busy_block", note: "Keep this exact text" }
  ] },
  Empty: { classes: [] }
} };

test("WF6 basic exports retain only people, exact timetables, class titles and rooms without editing saved data", async () => {
  const before = plain(data), code = await api.encode(data, { fields: [] }), imported = await api.decode(code);
  assert.match(code, /^WF6/); assert.equal(imported.share_profile, "selected"); assert.deepEqual(plain(imported.share_fields), []);
  const p = imported.people["Élise 📚"], c = p.classes[0];
  assert.equal(p.semester, undefined); assert.equal(p.notes, undefined);
  assert.equal(c.day, "Sunday"); assert.equal(c.start, "08:17"); assert.equal(c.end, "09:38"); assert.equal(c.course, "Calcul différentiel"); assert.equal(c.room, "D-108");
  assert.equal(c.instructor, null); assert.equal(c.course_code, null); assert.equal(c.section, null); assert.equal(c.recognition, undefined);
  assert.equal(p.classes[1].kind, "busy_block"); assert.deepEqual(data, before);
  assert.ok(code.length < (await api.encode(data, { fields })).length);
  const merged = await api.merge(data, imported, () => { throw Error("basic reimport must not conflict"); });
  assert.equal(merged.skipped, 2); assert.deepEqual(plain(merged.data.people), data.people);
});

test("every field combination restores chosen full details and omits unselected details", async () => {
  for (let mask = 0; mask < 32; mask++) {
    const chosen = fields.filter((_, i) => mask & (1 << i)), code = await api.encode(data, { fields: chosen }), imported = await api.decode(code);
    assert.deepEqual(plain(imported.share_fields), chosen);
    const p = imported.people["Élise 📚"], c = p.classes[0], original = data.people["Élise 📚"];
    for (const name of fields.slice(0, 3)) assert.equal(c[name], chosen.includes(name) ? original.classes[0][name] : null, `${mask}/${name}`);
    assert.equal(p.semester, chosen.includes("semester") ? original.semester : undefined);
    assert.deepEqual(plain(p.notes), chosen.includes("extras") ? original.notes : undefined);
    assert.deepEqual(plain(c.recognition), chosen.includes("extras") ? original.classes[0].recognition : undefined);
    const merged = await api.merge(data, imported, () => { throw Error(`unexpected conflict for ${mask}`); });
    assert.equal(merged.skipped, 2);
  }
});

test("WF6 links preserve every selected detail and full metadata including safe prototype-like keys", async () => {
  const full = plain(data);
  full.people["Élise 📚"].notes = JSON.parse('{"__proto__":{"safe":true},"constructor":"text"}');
  const code = await api.encode(full, { fields }), link = api.createLink(code, "https://hui3412.github.io/Ufree/");
  assert.match(link, /#import=WFL6/);
  const imported = await api.decode(link);
  assert.deepEqual(plain(imported.people), full.people);
  assert.deepEqual(plain(await api.decode(link)), plain(await api.decode(code)));
  assert.equal({}.safe, undefined);
});

test("chosen timetable changes and full instructor changes still request a conflict", async () => {
  const incoming = await api.decode(await api.encode(data, { fields: ["instructor"] }));
  const different = plain(data); different.people["Élise 📚"].classes[0].instructor = "Someone de la Cruz";
  let calls = 0;
  const merged = await api.merge(different, incoming, conflict => { calls++; assert.equal(conflict.existingName, "Élise 📚"); return "old"; });
  assert.equal(calls, 1); assert.equal(merged.kept, 1);
  const changedRoom = plain(data); changedRoom.people["Élise 📚"].classes[0].room = "D-109";
  await assert.rejects(api.merge(changedRoom, await api.decode(await api.encode(data, { fields: [] }))), /Choose how/);
});

test("WF6 original JSON fallback preserves full Unicode details without compression", async () => {
  const raw = codec(false), unusual = { people: { "Name\ud800": { classes: [{ day: "Monday", start: "00:01", end: "00:02", course: "Label\udc00", room: "A-001", instructor: "Full\ud800 Name", course_code: "ABC", section: "1", note: "\udc00" }] } } };
  const code = await raw.encode(unusual, { fields });
  const imported = await api.decode(code);
  assert.equal(imported.people["Name\ud800"].classes[0].instructor, "Full\ud800 Name");
  assert.equal(imported.people["Name\ud800"].classes[0].note, "\udc00");
});

test("WF6 rejects malformed field masks, envelopes, metadata references and selected-field bypasses", async () => {
  const wrapped = bytes => api.__test.wrap(Uint8Array.from(bytes), "J", 6);
  for (const bytes of [[32,1,0],[0,128,0],[0,5,0],[0,1,91,0]]) await assert.rejects(api.decode(wrapped(bytes)), /selected schedule|valid|details/);
  const basic = { people: { A: { classes: [{ day: "Monday", start: "09:00", end: "10:00", course: "Physics", room: "A-1" }] } } };
  const core = Buffer.from(JSON.stringify(api.__test.packCompact(api.__test.pack(basic, false), true)));
  assert.ok(core.length < 128);
  for (const extras of [[[1,{},[]]],[[0,{semester:"Fall 2026"},[]]],[[0,{},[[4,{}]]]],[[0,{},[[0,{instructor:"Bypass"}]]]]]) {
    const bytes = [...[16,core.length],...core,...Buffer.from(JSON.stringify(extras))];
    await assert.rejects(api.decode(wrapped(bytes)), /extra schedule details/);
  }
  await assert.rejects(api.encode(data, { fields: ["unknown"] }), /supported export/);
  await assert.rejects(api.encode({ people: [] }, { fields: [] }), /Select schedules/);
  const good = await api.encode(data, { fields }); await assert.rejects(api.decode(good.slice(0,-1)), /incomplete|changed/);
});

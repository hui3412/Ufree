const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const c = vm.createContext({ TextEncoder, TextDecoder, Blob, Uint8Array, CompressionStream, DecompressionStream, URL, URLSearchParams, atob, btoa });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../schedule-share-code.js'), 'utf8'), c);
const api = c.WhosFreeShareCode, h = api.__test;
const plain = value => JSON.parse(JSON.stringify(value));
const fields = ['instructor', 'course_code', 'section', 'semester', 'extras'];
const data = { people: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`TEST ${String(i + 1).padStart(4, '0')}`, {
  semester: 'Fall 2026', source_file: 'synthetic', note: `Person note ${i}`,
  classes: [{ day: 'Sunday', start: '09:17', end: '10:38', course: 'Physics', room: 'A-103', instructor: 'Teacher Example', course_code: '201-NYA-05', section: '00001', kind: 'class', note: `Class note ${i}` }],
}])) };

test('300 schedules export by code and both deployment links, import and merge without losing people', async () => {
  const before = plain(data), code = await api.encode(data, { fields: [] });
  const incoming = await api.decode(code);
  assert.equal(Object.keys(incoming.people).length, 300);
  assert.deepEqual(Object.keys(incoming.people), Object.keys(data.people));
  for (const name of Object.keys(data.people)) {
    assert.equal(incoming.people[name].classes[0].start, '09:17');
    assert.equal(incoming.people[name].classes[0].end, '10:38');
  }
  for (const domain of ['https://youfree.ca/', 'https://hui3412.github.io/Ufree/']) {
    const link = api.createLink(code, domain);
    assert.ok(link.startsWith(domain + '#import='));
    assert.deepEqual(plain(await api.decode(link)), plain(incoming));
  }
  const merged = await api.merge({ people: {} }, incoming);
  assert.equal(merged.added, 300);
  assert.equal((await api.merge(merged.data, incoming)).skipped, 300);
  assert.deepEqual(plain(data), before);
});

test('300-person full-detail and named-group exports retain extras and group identity', async () => {
  const fullCode = await api.encode(data, { fields });
  assert.deepEqual(plain((await api.decode(fullCode)).people), data.people);
  const shared_group = { id: 'large-team', name: 'Stress test group' };
  const groupCode = await api.encode({ ...data, shared_group }, { fields });
  const incoming = await api.decode(api.createLink(groupCode, 'https://youfree.ca/'));
  assert.deepEqual(plain(incoming.people), data.people);
  assert.deepEqual(plain(incoming.shared_group), shared_group);
});

test('all collection reader families accept more than the former 250-person limit', async () => {
  const payload = h.pack(data, true);
  const json = new TextEncoder().encode(JSON.stringify(h.packCompact(payload, true)));
  const expected = plain(await api.decode(h.wrap(json, 'J', 4)));
  const raw = new TextEncoder().encode(JSON.stringify(h.packCompact(payload)));
  assert.equal(Object.keys((await api.decode(h.wrap(raw, 'J', 3))).people).length, 300);
  for (let variant = 0; variant < 3; variant++) for (const dictionary of [false, true]) {
    const bytes = h.packBinary(payload, variant, dictionary);
    assert.deepEqual(plain(await api.decode(h.wrap(bytes, 'B', 5))), expected);
  }
  for (const config of [h.factor5.configs[0], h.factor5.configs.at(-1)]) for (const dictionary of [0, 3]) {
    const bytes = h.factor5.encode(payload, config, dictionary);
    assert.deepEqual(plain(await api.decode(h.wrap(bytes, 'T', 5))), expected);
  }
});

test('larger collections remain bounded and schedule-entry validation is preserved', async () => {
  const people = Object.fromEntries(Array.from({ length: 10001 }, (_, i) => [`P${i}`, { classes: [] }]));
  assert.equal(h.pack({ people: Object.fromEntries(Object.entries(people).slice(0, 10000)) }).p.length, 10000);
  await assert.rejects(api.encode({ people }, { fields: [] }), /too large.*10,000 people/);
  const excessive = { people: Object.fromEntries(Object.keys(data.people).map(name => [name, { classes: Array.from({ length: 34 }, () => data.people[name].classes[0]) }])) };
  assert.throws(() => h.pack(excessive), /too many schedule entries/);
});

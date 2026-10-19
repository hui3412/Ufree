import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const DB = 'whos-free-local-schedules';
const ORDER = 'whos-free-person-order-v1';
const GROUPS = 'whos-free-groups-v1';
const NAME = 'ufree-user-sync-v1';
const URL_KEY = 'https://youfree.ca';
const record = names => ({ data: { people: Object.fromEntries(names.map(name => [name, { semester: 'Fall 2026', classes: [] }])) }, meta: { filename: 'Local schedules' } });
const backup = { version: 1, record: record(['Alice', 'Bob']), storage: {
  [ORDER]: JSON.stringify({ main: ['Bob', 'Alice'] }),
  [GROUPS]: JSON.stringify({ groups: [{ id: 'friends', name: 'Friends', members: ['Alice', 'Bob'] }], showGroups: true }),
  'whos-free-theme': 'light', 'ufree-has-had-schedules-v1': '1',
} };
const wait = async condition => { for (let i = 0; i < 100; i++) { if (condition()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('App did not finish'); };

async function app({ cache = backup, storage = {}, indexedRecord, failCache = false, failLocal = false, failAfter = false, duringRead, separate = false } = {}) {
  const w = new Window({ url: 'https://youfree.ca/', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  w.document.write(read('index.html'));
  w.setInterval = () => 0;
  w.matchMedia = () => ({ matches: true, addEventListener() {} });
  Object.assign(w, { Response, TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  const store = new Map(cache === undefined || cache === null || separate ? [] : [[URL_KEY, typeof cache === 'string' ? cache : JSON.stringify(cache)]]);
  const writes = [], opens = [];
  w.caches = { async open(name) {
    opens.push(name); if (failCache) throw Error('Cache unavailable');
    return { async match(url) { duringRead?.(w); return store.has(url) ? new Response(store.get(url)) : undefined; },
      async put(url, response) { assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), 'application/json');
        // An older write deliberately takes longer.
        if (writes.length === 0) await new Promise(r => setTimeout(r, 15));
        const text = await response.text(); writes.push(JSON.parse(text)); store.set(url, text);
      } };
  } };
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
  if (indexedRecord !== undefined) w.indexedDB = { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { close() {}, transaction() { return { objectStore() { return { get() {
        const get = {}; queueMicrotask(() => { get.result = indexedRecord; get.onsuccess(); }); return get;
      } }; } }; } }; request.onsuccess();
    }); return request;
  } };
  if (failAfter) {
    const set = w.localStorage.setItem.bind(w.localStorage); let count = 0;
    Object.defineProperty(w.localStorage, 'setItem', { value: (key, value) => { if (++count === 3) throw Error('Quota'); set(key, value); }, configurable: true });
  }
  if (failLocal) Object.defineProperty(w.localStorage, 'setItem', { value: () => { throw Error('Quota'); }, configurable: true });
  for (const file of ['schedule-availability.js', 'schedule-share-code.js', 'schedule-groups.js']) w.eval(read(file));
  const source = read('app.js').replace('  init();', `  window.testSync = { state, saveStateToSharedCache, loadStateFromSharedCache,
    saveLocalScheduleRecord, deleteLocalScheduleRecord, savePersonOrders, saveGroupPreferences,
    flush: () => cacheSyncWrites };
  init();`);
  w.eval(source);
  await wait(() => w.testSync.state.deviceReady);
  await w.testSync.flush();
  return { w, api: w.testSync, store, writes, opens, close: () => w.happyDOM.abort() };
}

test('empty launch restores schedules, group membership and order before rendering', async () => {
  const a = await app(); try {
    assert.deepEqual(JSON.parse(JSON.stringify(a.api.state.data)), backup.record.data);
    assert.deepEqual([...a.api.state.personOrders.main], ['Bob', 'Alice']);
    assert.equal(a.api.state.groups[0].name, 'Friends');
    assert.equal(a.api.state.theme, 'light');
    assert.ok(a.w.localStorage.getItem(DB));
    assert.equal(a.w.document.getElementById('firstScheduleWelcome').hidden, true);
    assert.ok(a.opens.every(name => name === NAME));
  } finally { await a.close(); }
});

for (const [label, storage] of [
  ['existing schedules', { [DB]: JSON.stringify(record(['Existing'])) }],
  ['intentional empty collection', { [DB]: JSON.stringify(record([])) }],
  ['existing preferences only', { 'whos-free-theme': 'dark' }],
  ['malformed local record', { [DB]: '{broken' }],
]) test(`restore preserves ${label}`, async () => {
  const a = await app({ storage }); try {
    assert.equal(a.w.localStorage.getItem(DB), storage[DB] ?? null);
    assert.ok(!a.api.state.data.people.Alice);
  } finally { await a.close(); }
});

test('IndexedDB record prevents restoration even with empty localStorage', async () => {
  const a = await app({ indexedRecord: record(['Existing']) }); try {
    assert.deepEqual(Object.keys(a.api.state.data.people), ['Existing']);
    assert.equal(a.w.localStorage.getItem(DB), null);
  } finally { await a.close(); }
});

for (const [label, options] of [
  ['invalid JSON', { cache: 'broken' }], ['invalid schedule', { cache: { ...backup, record: { data: { people: { Alice: { classes: 'invalid' } } } } } }],
  ['unsupported schema', { cache: { ...backup, version: 99 } }], ['unavailable cache', { failCache: true }],
  ['isolated cache partition', { separate: true }], ['local write failure', { failLocal: true }], ['partial restore write failure', { failAfter: true }],
  ['deleted collection backup', { cache: { ...backup, record: null } }],
]) test(`${label} leaves a usable empty app`, async () => {
  const a = await app(options); try {
    assert.equal(a.api.state.hasData, false); assert.equal(a.w.localStorage.getItem(DB), null);
    assert.equal(a.api.state.deviceReady, true);
  } finally { await a.close(); }
});

test('a local write during cache lookup prevents restoration', async () => {
  const a = await app({ duringRead(w) { w.localStorage.setItem(DB, JSON.stringify(record(['New']))); } }); try {
    assert.deepEqual(Object.keys(a.api.state.data.people), ['New']);
  } finally { await a.close(); }
});

test('successful adds, edits, reorders and groups back up their committed data', async () => {
  const a = await app({ cache: null }); try {
    await a.api.saveLocalScheduleRecord(record(['Alice', 'Bob']));
    await a.api.flush();
    assert.deepEqual(Object.keys(a.writes.at(-1).record.data.people), ['Alice', 'Bob']);
    const edited = record(['Alice', 'Bob']); edited.data.people.Alice.classes = [{ day: 'Monday', start: '09:00', end: '10:00' }];
    await a.api.saveLocalScheduleRecord(edited);
    a.api.state.personOrders.main = ['Bob', 'Alice']; a.api.savePersonOrders();
    a.api.state.groups = [{ id: 'friends', name: 'Friends', members: ['Alice', 'Bob'] }]; a.api.saveGroupPreferences();
    await a.api.flush();
    const last = a.writes.at(-1);
    assert.equal(last.record.data.people.Alice.classes[0].start, '09:00');
    assert.deepEqual(JSON.parse(last.storage[ORDER]).main, ['Bob', 'Alice']);
    assert.equal(JSON.parse(last.storage[GROUPS]).groups[0].name, 'Friends');
    assert.equal(last.storage['ufree-has-had-schedules-v1'], '1');
    await a.api.deleteLocalScheduleRecord(); await a.api.flush();
    assert.equal(a.writes.at(-1).record, null, 'deleted data must not come back from the backup');
  } finally { await a.close(); }
});

test('queued writes snapshot their inputs and the latest write wins', async () => {
  const a = await app({ cache: null }); try {
    const first = { count: 1 }; const p1 = a.api.saveStateToSharedCache(first); first.count = 999;
    const p2 = a.api.saveStateToSharedCache({ count: 2 });
    await Promise.all([p1, p2]);
    assert.deepEqual(a.writes.slice(-2).map(item => item.count), [1, 2]);
    assert.equal(JSON.parse(a.store.get(URL_KEY)).count, 2);
  } finally { await a.close(); }
});

test('cache failure does not stop a primary schedule save', async () => {
  const a = await app({ failCache: true }); try {
    await a.api.saveLocalScheduleRecord(record(['Alice'])); await a.api.flush();
    assert.ok(JSON.parse(a.w.localStorage.getItem(DB)).data.people.Alice);
  } finally { await a.close(); }
});

test('offline navigation never reads the JSON backup cache', async () => {
  const listeners = {}; const requestedCaches = [];
  vm.runInNewContext(read('service-worker.js'), { URL, Response,
    self: { location: { origin: 'https://youfree.ca' }, addEventListener(name, fn) { listeners[name] = fn; } },
    caches: { async open(name) { requestedCaches.push(name); return { async match(key) { return key === './index.html' ? new Response('<html>UFree</html>') : undefined; } }; },
      async match() { throw Error('Must not search the user backup cache'); } },
    async fetch() { throw Error('offline'); },
  });
  let response;
  listeners.fetch({ request: { method: 'GET', url: 'https://youfree.ca/', mode: 'navigate' }, respondWith(value) { response = value; } });
  assert.match(await (await response).text(), /<html>/);
  assert.deepEqual(requestedCaches, [read('service-worker.js').match(/const CACHE_NAME = "([^"]+)"/)[1]]);
});

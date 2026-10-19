import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const DB = 'whos-free-local-schedules';
const record = names => ({ data: { people: Object.fromEntries(names.map(name => [name, { semester: 'Fall 2026', classes: [] }])) }, meta: {} });
const plain = value => JSON.parse(JSON.stringify(value));
const wait = async condition => {
  for (let i = 0; i < 150; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('Storage operation did not finish');
};

function indexedStore(initial) {
  const control = { record: initial, failRead: false, failWrite: false, failDelete: false, holdReads: false, pendingReads: [] };
  control.api = { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { close() {}, transaction() {
        const tx = { objectStore() { return {
          get() {
            const get = {}, snapshot = control.record === undefined ? undefined : plain(control.record);
            const finish = () => {
              if (control.failRead) { get.error = Error('Read denied'); get.onerror(); }
              else { get.result = snapshot; get.onsuccess(); }
            };
            if (control.holdReads) control.pendingReads.push(finish); else queueMicrotask(finish);
            return get;
          },
          put(value) {
            const saved = plain(value);
            queueMicrotask(() => {
              if (control.failWrite) { tx.error = Error('Write denied'); tx.onabort(); }
              else { control.record = saved; tx.oncomplete(); }
            });
          },
          delete() {
            queueMicrotask(() => {
              if (control.failDelete) { tx.error = Error('Delete denied'); tx.onabort(); }
              else { control.record = undefined; tx.oncomplete(); }
            });
          },
        }; } };
        return tx;
      } };
      request.onsuccess();
    });
    return request;
  } };
  return control;
}

async function app({ primary, fallback, storage = {}, awaitReady = true, legacy = false } = {}) {
  const w = new Window({ url: 'https://youfree.ca/', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  w.document.write(read(legacy ? 'whos-free-local-ocr/index.html' : 'index.html'));
  w.setInterval = () => 0;
  w.matchMedia = () => ({ matches: true, addEventListener() {} });
  w.confirm = () => true;
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, CompressionStream, DecompressionStream });
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async () => {} } });
  if (primary) w.indexedDB = primary.api;
  if (fallback !== undefined) w.localStorage.setItem(DB, typeof fallback === 'string' ? fallback : JSON.stringify(fallback));
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
  for (const file of ['i18n-fr.js', 'i18n.js', 'schedule-availability.js', 'schedule-groups.js', 'schedule-share-code.js', 'assets/qr/qrcodegen.js', 'schedule-qr-batches.js']) w.eval(read(file));
  const sharingHooks = legacy ? '' : ', openCodePanel, generateShareCode, openPersonQuickShare, exportPersonQuickSchedule';
  w.eval(read(legacy ? 'whos-free-local-ocr/app.js' : 'app.js').replace('  init();', `  window.audit = { state, readLocalScheduleRecord, saveLocalScheduleRecord,
    deleteLocalScheduleRecord, handleLocalScheduleFile, handleSchedulePdfs, handleScheduleImage,
    openManualSchedule ${sharingHooks} };
  init();`));
  if (awaitReady) await wait(() => w.audit.state.deviceReady);
  return { w, api: w.audit, el: id => w.document.getElementById(id), close: () => w.happyDOM.abort() };
}

test('a newer fallback survives IndexedDB recovery, and the next primary save refreshes both copies', async () => {
  const primary = indexedStore(record(['Alice']));
  const a = await app({ primary });
  try {
    primary.failWrite = true;
    await a.api.saveLocalScheduleRecord(record(['Alice', 'Bob']));
    assert.ok(JSON.parse(a.w.localStorage.getItem(DB)).storageRevision > 0);
    primary.failWrite = false;
    assert.deepEqual(Object.keys((await a.api.readLocalScheduleRecord()).data.people), ['Alice', 'Bob']);
    await a.api.saveLocalScheduleRecord(record(['Alice', 'Carol']));
    assert.deepEqual(Object.keys(primary.record.data.people), ['Alice', 'Carol']);
    primary.failRead = true;
    assert.deepEqual(Object.keys((await a.api.readLocalScheduleRecord()).data.people), ['Alice', 'Carol']);
    const b = await app({ primary, fallback: JSON.parse(a.w.localStorage.getItem(DB)) });
    try { assert.deepEqual(Object.keys(b.api.state.data.people), ['Alice', 'Carol']); }
    finally { await b.close(); }
  } finally { await a.close(); }
});

test('revision comparison survives reloads and clock rollback without changing legacy priority', async () => {
  const older = { ...record(['Old']), storageRevision: 200 };
  const newer = { ...record(['New']), storageRevision: 300 };
  const primary = indexedStore(older);
  const a = await app({ primary, fallback: newer });
  try {
    assert.deepEqual(Object.keys(a.api.state.data.people), ['New']);
    a.w.Date.now = () => 1;
    await a.api.saveLocalScheduleRecord(record(['Latest']));
    assert.equal(primary.record.storageRevision, 301);
  } finally { await a.close(); }
  const b = await app({ primary: indexedStore(record(['Primary'])), fallback: record(['Legacy fallback']) });
  try { assert.deepEqual(Object.keys(b.api.state.data.people), ['Primary']); }
  finally { await b.close(); }
});

test('the legacy entry point and main app agree on versioned records after storage recovery', async () => {
  const primary = indexedStore(record(['Alice']));
  const legacy = await app({ primary, legacy: true });
  try {
    primary.failWrite = true;
    await legacy.api.saveLocalScheduleRecord(record(['Alice', 'Bob']));
    const fallback = JSON.parse(legacy.w.localStorage.getItem(DB));
    primary.failWrite = false;
    const main = await app({ primary, fallback });
    try {
      assert.deepEqual(Object.keys(main.api.state.data.people), ['Alice', 'Bob']);
      await main.api.saveLocalScheduleRecord(record(['Alice', 'Carol']));
      assert.deepEqual(Object.keys((await legacy.api.readLocalScheduleRecord()).data.people), ['Alice', 'Carol']);
    } finally { await main.close(); }
  } finally { await legacy.close(); }
});

test('the legacy entry point reports corrupt storage and blocks schedule writes', async () => {
  const a = await app({ legacy: true, fallback: '{broken' });
  try {
    assert.equal(a.api.state.storageReadError, true);
    assert.equal(a.el('manualScheduleButton').disabled, true);
    a.api.openManualSchedule();
    assert.equal(a.api.state.pendingImage, null);
    assert.equal(a.w.localStorage.getItem(DB), '{broken');
  } finally { await a.close(); }
});

test('a quota-limited mirror removes the old fallback instead of retaining stale schedules', async () => {
  const primary = indexedStore(record(['Alice', 'Bob']));
  const a = await app({ primary, fallback: record(['Alice', 'Bob']) });
  try {
    const set = a.w.localStorage.setItem.bind(a.w.localStorage);
    Object.defineProperty(a.w.localStorage, 'setItem', { configurable: true, value: (key, value) => {
      if (key === DB) throw Error('Quota exceeded');
      set(key, value);
    } });
    await a.api.saveLocalScheduleRecord(record(['Alice']));
    assert.equal(a.w.localStorage.getItem(DB), null);
    assert.deepEqual(Object.keys(primary.record.data.people), ['Alice']);
    primary.failRead = true;
    await assert.rejects(a.api.readLocalScheduleRecord(), /could not be read/);
  } finally { await a.close(); }
});

test('corrupt JSON is reported and every schedule-writing entry point preserves the saved bytes', async () => {
  const a = await app({ fallback: '{broken' });
  try {
    assert.equal(a.api.state.storageReadError, true);
    assert.match(a.api.state.loadError, /could not be read/);
    for (const id of ['manualScheduleButton', 'addScheduleImageButton', 'addSchedulePdfButton', 'importSchedulesButton']) assert.equal(a.el(id).disabled, true);
    a.api.openManualSchedule();
    assert.equal(a.api.state.pendingImage, null);
    let readFile = false;
    const event = { target: { files: [{ text: async () => { readFile = true; return JSON.stringify(record(['New']).data); } }] } };
    await a.api.handleLocalScheduleFile(event);
    await a.api.handleSchedulePdfs(event);
    await a.api.handleScheduleImage(event);
    assert.equal(readFile, false);
    a.api.openCodePanel('import');
    a.el('importCodeInput').value = await a.w.WhosFreeShareCode.encode(record(['New']).data, { fields: [] });
    a.el('decodeCodeButton').click();
    await wait(() => !a.api.state.isParsing);
    assert.equal(a.w.localStorage.getItem(DB), '{broken');
    assert.match(a.el('importCodeStatus').textContent, /Nothing was imported/);
    a.w.UFreeI18n.setLanguage('fr');
    assert.match(a.api.state.loadError, /could not be read/);
    assert.match(a.el('peopleList').textContent, /Impossible de lire/);
  } finally { await a.close(); }
});

test('an unreadable IndexedDB without a fallback is not treated as a new installation', async () => {
  const primary = indexedStore(record(['Existing'])); primary.failRead = true;
  const a = await app({ primary });
  try {
    assert.equal(a.api.state.storageReadError, true);
    assert.equal(a.el('manualScheduleButton').disabled, true);
    assert.deepEqual(Object.keys(primary.record.data.people), ['Existing']);
  } finally { await a.close(); }
});

for (const action of ['removeSchedulesButton', 'deletePersonScheduleButton']) test(`failed IndexedDB deletion keeps the collection and reports failure: ${action}`, async () => {
  const primary = indexedStore(record(['Alice']));
  const a = await app({ primary });
  try {
    a.el('closeFirstScheduleWelcome').click();
    if (action === 'removeSchedulesButton') a.el('scheduleDataButton').click();
    else a.el('peopleList').querySelector('[data-person="Alice"] .person-select-button').click();
    primary.failDelete = true;
    a.el(action).click();
    await wait(() => !a.api.state.isParsing);
    assert.equal(a.api.state.hasData, true);
    assert.deepEqual(Object.keys(a.api.state.data.people), ['Alice']);
    assert.deepEqual(Object.keys(primary.record.data.people), ['Alice']);
    assert.match(a.el('toast').textContent, /could not be fully removed/);
    assert.equal(a.api.state.recentChanges.length, 0);
    primary.failDelete = false;
    a.el(action).click();
    await wait(() => !a.api.state.isParsing);
    assert.equal(a.api.state.hasData, false);
    assert.equal(primary.record, undefined);
    assert.equal(a.w.localStorage.getItem(DB), null);
  } finally { await a.close(); }
});

test('fallback deletion failure is also reported and does not claim the collection was removed', async () => {
  const primary = indexedStore(record(['Alice']));
  const a = await app({ primary, fallback: record(['Alice']) });
  try {
    Object.defineProperty(a.w.localStorage, 'removeItem', { configurable: true, value: () => { throw Error('Denied'); } });
    assert.equal(await a.api.deleteLocalScheduleRecord(), false);
    assert.ok(a.w.localStorage.getItem(DB));
    assert.equal(a.api.state.hasData, true);
    assert.deepEqual(Object.keys(primary.record.data.people), ['Alice'], 'a partial deletion restores the primary collection');
  } finally { await a.close(); }
});

test('startup blocks manual, JSON, PDF and picture writes until existing schedules are loaded', async () => {
  const primary = indexedStore(record(['Alice', 'Bob'])); primary.holdReads = true;
  const a = await app({ primary, awaitReady: false });
  try {
    await wait(() => primary.pendingReads.length > 0);
    assert.equal(a.api.state.deviceReady, false);
    for (const id of ['manualScheduleButton', 'addSchedulePdfButton', 'addScheduleImageButton', 'importSchedulesButton', 'decodeCodeButton']) assert.equal(a.el(id).disabled, true);
    a.api.openManualSchedule();
    assert.equal(a.api.state.pendingImage, null);
    let readFile = false;
    const event = { target: { files: [{ text: async () => { readFile = true; return '{}'; } }] } };
    await a.api.handleLocalScheduleFile(event);
    await a.api.handleSchedulePdfs(event);
    await a.api.handleScheduleImage(event);
    assert.equal(readFile, false);
    primary.holdReads = false; primary.pendingReads.splice(0).forEach(finish => finish());
    await wait(() => a.api.state.deviceReady);
    a.api.openManualSchedule(); a.el('imageReviewName').value = 'New'; a.el('saveImageScheduleButton').click();
    await wait(() => !a.api.state.isParsing);
    assert.deepEqual(Object.keys(primary.record.data.people), ['Alice', 'Bob', 'New']);
  } finally { await a.close(); }
});

test('all sharing actions number ambiguous names consistently without renaming saved schedules', async () => {
  const saved = record(['Alice', 'alice', 'alice 2']);
  const a = await app({ fallback: saved });
  try {
    const before = a.w.localStorage.getItem(DB), qrLinks = [];
    const generateQr = a.w.qrcodegen.QrCode.encodeText;
    a.w.qrcodegen.QrCode.encodeText = function(link, level) { qrLinks.push(link); return generateQr.call(this, link, level); };
    a.el('scheduleDataButton').click();
    a.api.openCodePanel('export', true);
    for (const action of ['code', 'link', 'qr']) {
      await a.api.generateShareCode(action);
      const decoded = await a.w.WhosFreeShareCode.decode(a.el('exportCodeOutput').value);
      assert.deepEqual(Object.keys(decoded.people), ['Alice', 'alice 3', 'alice 2']);
      assert.match(a.el('exportCodeStatus').textContent, /alice → alice 3/);
      if (action === 'qr') assert.deepEqual(Object.keys((await a.w.WhosFreeShareCode.decode(qrLinks.at(-1))).people), ['Alice', 'alice 3', 'alice 2']);
    }
    // Force separate batches to verify that independently scanned QR codes use
    // the same aliases, even when each batch contains only one original name.
    a.w.WhosFreeQrBatches.pack = async (names, makeLink) => ({ groups: await Promise.all(names.map(async name => ({ names: [name], link: await makeLink([name]) }))), oversized: [] });
    qrLinks.length = 0;
    await a.api.generateShareCode('qr');
    let merged = null;
    for (const link of [...qrLinks].reverse()) merged = (await a.w.WhosFreeShareCode.merge(merged, await a.w.WhosFreeShareCode.decode(link), () => 'old')).data;
    assert.deepEqual(Object.keys(merged.people).sort(), ['Alice', 'alice 2', 'alice 3']);
    a.el('closeScheduleModal').click();
    a.el('scheduleDataButton').click();
    a.api.openCodePanel('export', true, { id: 'case-group', name: 'Friends', members: ['Alice', 'alice', 'alice 2'] });
    for (const action of ['code', 'link', 'qr']) {
      await a.api.generateShareCode(action);
      const decoded = await a.w.WhosFreeShareCode.decode(a.el('exportCodeOutput').value);
      assert.deepEqual(Object.keys(decoded.people), ['Alice', 'alice 3', 'alice 2']);
      assert.equal(decoded.shared_group.id, 'case-group');
    }
    a.el('closeScheduleModal').click();
    a.api.openPersonQuickShare('alice');
    for (const action of ['code', 'url', 'qr']) {
      await a.api.exportPersonQuickSchedule(action);
      assert.deepEqual(Object.keys((await a.w.WhosFreeShareCode.decode(a.el('personQuickCode').value)).people), ['alice 3']);
    }
    a.w.UFreeI18n.setLanguage('fr');
    assert.match(a.el('personQuickShareStatus').textContent, /noms similaires sont numérotés/);
    assert.equal(a.w.localStorage.getItem(DB), before);
    assert.deepEqual(Object.keys(a.api.state.data.people), ['Alice', 'alice', 'alice 2']);
  } finally { await a.close(); }
});

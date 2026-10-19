import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const SEEN = 'ufree-screenshot-guide-seen-v1';
const wait = async condition => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('Guide interaction did not finish');
};

async function app({ people, storage = {}, blocked = false } = {}) {
  const w = new Window({ url: 'https://youfree.ca/', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  w.document.write(read('index.html'));
  w.matchMedia = () => ({ matches: true, addEventListener() {} });
  Object.assign(w, { TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  if (people) w.localStorage.setItem('whos-free-local-schedules', JSON.stringify({ data: { people }, meta: {} }));
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
  if (blocked) Object.defineProperty(w.localStorage, 'setItem', { configurable: true, value: () => { throw Error('Blocked'); } });
  let clock = 0, nextId = 1, pickerCalls = 0;
  const intervals = new Map();
  w.setInterval = (callback, delay) => { const id = nextId++; intervals.set(id, { callback, delay }); return id; };
  w.clearInterval = id => intervals.delete(id);
  Object.defineProperty(w.performance, 'now', { configurable: true, value: () => clock });
  Object.defineProperty(w.document, 'hidden', { configurable: true, value: false });
  for (const file of ['i18n-fr.js', 'i18n.js', 'schedule-image-guide.js', 'schedule-availability.js', 'schedule-groups.js', 'schedule-share-code.js']) w.eval(read(file));
  const el = id => w.document.getElementById(id);
  const image = el('screenshotGuideModal').querySelector('img');
  let imageTop = 100;
  image.getBoundingClientRect = () => ({ top: imageTop, bottom: imageTop + 200, height: 200 });
  el('screenshotGuideModal').querySelector('.screenshot-guide-card').getBoundingClientRect = () => ({ top: 0, bottom: 700 });
  Object.defineProperty(image, 'complete', { configurable: true, value: false });
  el('scheduleImageInput').click = () => { pickerCalls++; };
  w.eval(read('app.js'));
  await wait(() => !el('decodeCodeButton').disabled);
  el('closeFirstScheduleWelcome').click();
  const advance = ms => {
    clock += ms;
    for (const { callback, delay } of [...intervals.values()]) if (delay === 100) callback();
  };
  const load = () => image.dispatchEvent(new w.Event('load'));
  const open = () => { el('scheduleDataButton').click(); el('addScheduleImageButton').click(); };
  const visible = value => {
    Object.defineProperty(w.document, 'hidden', { configurable: true, value: !value });
    w.document.dispatchEvent(new w.Event('visibilitychange'));
  };
  return { w, el, image, load, open, advance, visible, intervals, imageTop: value => { imageTop = value; }, pickerCalls: () => pickerCalls, close: () => w.happyDOM.abort() };
}

test('the attached example is collapsible beside both picture buttons and first in Help', async () => {
  const a = await app();
  try {
    for (const container of [a.el('addScheduleImageButton').parentElement, a.el('codeImportPanel'), a.el('helpModal')]) {
      const example = container.querySelector('details.screenshot-example');
      assert.ok(example);
      assert.equal(example.open, false);
      assert.match(example.querySelector('img').src, /assets\/examples\/schedule-screenshot.jpg$/);
    }
    const help = a.el('helpModal').querySelector('[role="dialog"]');
    assert.ok(help.children[1].querySelector('.screenshot-example'), 'the guide follows the Help header');
    a.w.UFreeI18n.setLanguage('fr');
    assert.match(help.querySelector('summary').textContent, /capture d’écran/);
  } finally { await a.close(); }
});

test('the first picture picker waits for the image and three seconds, then opens synchronously once', async () => {
  const a = await app();
  try {
    a.open();
    assert.equal(a.el('screenshotGuideModal').hidden, false);
    assert.equal(a.el('screenshotGuideModal').querySelector('details').open, true);
    assert.equal(a.pickerCalls(), 0);
    a.advance(10000);
    assert.equal(a.el('screenshotGuideContinue').disabled, true, 'loading time is not viewing time');
    a.load(); a.advance(2999);
    a.el('screenshotGuideContinue').click();
    assert.equal(a.pickerCalls(), 0);
    a.advance(1);
    assert.equal(a.el('screenshotGuideContinue').disabled, false);
    a.el('screenshotGuideContinue').click();
    assert.equal(a.pickerCalls(), 1, 'the native picker opens in this click');
    assert.equal(a.el('screenshotGuideModal').hidden, true);
    assert.equal(a.w.localStorage.getItem(SEEN), '1');
    assert.equal(a.el('scheduleModal').hasAttribute('inert'), false);
    assert.equal(a.w.document.body.style.overflow, 'hidden', 'the underlying schedule dialog stays open');
    a.el('addScheduleImageButton').click();
    assert.equal(a.pickerCalls(), 2, 'a cancelled file picker does not repeat the introduction');
  } finally { await a.close(); }
});

test('Import and the empty-home picture entry use the same first-use guide', async () => {
  for (const entry of ['import', 'home']) {
    const a = await app();
    try {
      if (entry === 'import') { a.el('homeImportButton').click(); a.el('importScheduleImageButton').click(); }
      else a.el('peopleList').querySelector('.add-picture').click();
      assert.equal(a.el('screenshotGuideModal').hidden, false);
      a.load(); a.advance(3000); a.el('screenshotGuideContinue').click();
      assert.equal(a.pickerCalls(), 1);
    } finally { await a.close(); }
  }
});

test('hidden pages and collapsed examples do not consume the three-second viewing time', async () => {
  const a = await app();
  try {
    a.open(); a.load(); a.advance(1000);
    a.visible(false); a.advance(10000); a.visible(true);
    a.imageTop(900); a.advance(10000);
    assert.match(a.el('screenshotGuideStatus').textContent, /Keep the example visible/);
    a.imageTop(100);
    const details = a.el('screenshotGuideModal').querySelector('details');
    details.open = false; details.dispatchEvent(new a.w.Event('toggle')); a.advance(10000);
    assert.equal(a.el('screenshotGuideContinue').disabled, true);
    details.open = true; details.dispatchEvent(new a.w.Event('toggle'));
    a.advance(1999); assert.equal(a.el('screenshotGuideContinue').disabled, true);
    a.advance(1); assert.equal(a.el('screenshotGuideContinue').disabled, false);
  } finally { await a.close(); }
});

test('cancelling restores focus and restarts an unacknowledged introduction', async () => {
  const a = await app();
  try {
    a.open(); a.load(); a.advance(2000);
    a.w.document.dispatchEvent(new a.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(a.el('screenshotGuideModal').hidden, true);
    assert.equal(a.el('scheduleModal').hidden, false, 'Escape closes only the guide');
    assert.equal(a.w.document.activeElement.id, 'addScheduleImageButton');
    assert.equal(a.w.localStorage.getItem(SEEN), null);
    a.el('addScheduleImageButton').click(); a.load(); a.advance(1000);
    assert.equal(a.el('screenshotGuideContinue').disabled, true);
    a.el('screenshotGuideCancel').click();
    assert.equal(a.pickerCalls(), 0);
    assert.equal([...a.intervals.values()].filter(item => item.delay === 100).length, 0);
  } finally { await a.close(); }
});

for (const options of [
  { storage: { [SEEN]: '1' } },
  { storage: { 'ufree-has-had-schedules-v1': '1' } },
  { people: { Existing: { semester: 'Fall 2026', classes: [] } } },
]) test(`experienced users skip the forced guide: ${JSON.stringify(options)}`, async () => {
  const a = await app(options);
  try { a.open(); assert.equal(a.pickerCalls(), 1); assert.equal(a.el('screenshotGuideModal').hidden, true); }
  finally { await a.close(); }
});

test('a failed example stays locked, can retry, and localizes its countdown and controls', async () => {
  const a = await app();
  try {
    a.open(); a.image.dispatchEvent(new a.w.Event('error')); a.advance(3000);
    assert.equal(a.el('screenshotGuideContinue').disabled, true);
    assert.equal(a.el('screenshotGuideRetry').hidden, false);
    a.el('screenshotGuideRetry').click(); a.load(); a.advance(1000);
    a.w.UFreeI18n.setLanguage('fr');
    assert.match(a.el('screenshotGuideStatus').textContent, /dans 2 secondes/);
    assert.equal(a.el('screenshotGuideContinue').textContent, 'Choisir une capture d’écran');
    a.advance(1000); assert.match(a.el('screenshotGuideStatus').textContent, /dans 1 seconde\./);
    a.advance(1000); a.el('screenshotGuideContinue').click();
    assert.equal(a.pickerCalls(), 1);
  } finally { await a.close(); }
});

test('blocked preference writes keep the acknowledgement for the current session', async () => {
  const a = await app({ blocked: true });
  try {
    a.open(); a.load(); a.advance(3000); a.el('screenshotGuideContinue').click();
    a.el('addScheduleImageButton').click();
    assert.equal(a.pickerCalls(), 2);
  } finally { await a.close(); }
});

test('the guide script and the original attached JPEG are in the offline shell', () => {
  const worker = read('service-worker.js');
  assert.ok(worker.includes('./schedule-image-guide.js?v=131'));
  assert.ok(worker.includes('./assets/examples/schedule-screenshot.jpg'));
  const jpeg = fs.readFileSync(new URL('../assets/examples/schedule-screenshot.jpg', import.meta.url));
  assert.equal(jpeg[0], 0xff); assert.equal(jpeg[1], 0xd8);
});

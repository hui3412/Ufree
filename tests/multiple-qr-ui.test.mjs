import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

const tick = () => new Promise(resolve => setTimeout(resolve, 20));
let seed = 123;
const randomText = length => Array.from({ length }, () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[seed % 62];
}).join("");
const data = { people: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`Person ${i + 1}`, {
  semester: "Fall 2026", source_file: "manual.json", notes: `Personal note ${i + 1}`,
  classes: ["Monday", "Tuesday", "Sunday"].map(day => ({ day, start: "09:00", end: "10:00", course: randomText(180), room: "A-100", course_code: "203-SN1-RE", section: "00001", instructor: `Teacher ${i + 1} Example`, kind: "class" })),
}])) };

async function app(initial, url) {
  const window = new Window({ url, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  window.setInterval = () => 0;
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  Object.assign(window, { TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  if (initial) window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: initial, meta: {} }));
  for (const name of ["schedule-availability.js", "schedule-groups.js", "schedule-share-code.js", "assets/qr/qrcodegen.js", "schedule-qr-batches.js", "app.js"]) window.eval(fs.readFileSync(new URL("../" + name, import.meta.url), "utf8"));
  const el = id => window.document.getElementById(id);
  const wait = async predicate => {
    for (let i = 0; i < 1000; i++) { if (predicate()) return; await tick(); }
    throw Error("QR operation did not finish");
  };
  await tick(); await wait(() => !el("decodeCodeButton").disabled);
  const stored = () => window.localStorage.getItem("whos-free-local-schedules");
  const links = [], generator = window.qrcodegen.QrCode, encode = generator.encodeText;
  generator.encodeText = (link, level) => { links.push(link); return encode.call(generator, link, level); };
  const start = () => {
    el("homeExportButton").click(); el("exportFieldOptions").querySelector(".export-include-all").click();
    el("exportQrButton").click();
    assert.equal(el("multipleQrButton"), null);
  };
  const overflow = async () => { start(); await wait(() => !el("generateCodeButton").disabled); };
  return { window, el, wait, stored, links, overflow, start };
}

for (const base of ["https://hui3412.github.io/Ufree/", "https://youfree.ca/"]) test(`oversized selections create independent QR links on ${base}`, async () => {
  const a = await app(data, base), receiver = await app(null, base);
  try {
    const before = a.stored();
    await a.overflow();
    const fullCode = a.el("exportCodeOutput").value;
    const fullLink = a.el("exportSharePanel").querySelector("textarea").value;
    assert.match(a.el("exportSharePanel").querySelector(".share-link-status").textContent, /independent QR codes cover all/);
    const cards = a.el("multipleQrCodes").querySelectorAll(".qr-batch-card");
    assert.ok(cards.length > 1 && cards.length < 6, "combine multiple people when they fit");
    assert.equal(a.links.length, cards.length);
    assert.equal(a.el("exportQrButton").getAttribute("aria-expanded"), "true");
    assert.equal(a.el("multipleQrProgress").hidden, true);
    assert.equal(a.el("multipleQrProgress").value, 100);
    assert.equal(a.el("exportCodeOutput").value, fullCode);
    assert.equal(a.el("exportSharePanel").querySelector("textarea").value, fullLink);
    const exported = [];
    for (let i = 0; i < a.links.length; i++) {
      const link = a.links[i], url = new URL(link), actual = await a.window.WhosFreeShareCode.decode(link);
      assert.equal(url.origin + url.pathname, base);
      assert.ok(new TextEncoder().encode(link).length <= 2331);
      assert.ok(cards[i].querySelector("svg"));
      assert.equal(cards[i].querySelector("svg rect").getAttribute("fill"), "#fff");
      for (const [name, person] of Object.entries(actual.people)) {
        exported.push(name);
        assert.deepEqual(JSON.parse(JSON.stringify(person)), data.people[name], "all selected details survive independently");
        assert.match(cards[i].textContent, new RegExp(name));
      }
    }
    assert.deepEqual(exported.sort(), Object.keys(data.people).sort());
    assert.equal(a.stored(), before);
    // A normal recipient can import in any order; no multipart assembly is needed.
    for (const link of [...a.links].reverse()) {
      receiver.window.location.hash = new URL(link).hash;
      receiver.window.dispatchEvent(new receiver.window.HashChangeEvent("hashchange"));
      await receiver.wait(() => receiver.el("scheduleModal").hidden && !receiver.el("decodeCodeButton").disabled);
      const count = Object.keys((await a.window.WhosFreeShareCode.decode(link)).people).length;
      assert.match(receiver.el("toast").textContent, new RegExp(`Added ${count} people? · Skipped 0`));
      assert.equal(receiver.el("sharedImportPreview").hidden, true);
    }
    assert.deepEqual(JSON.parse(receiver.stored()).data.people, data.people);
    a.el("exportFieldOptions").querySelector('[data-export-field="instructor"]').click();
    assert.equal(a.el("multipleQrCodes").hidden, true);
    assert.equal(a.el("multipleQrCodes").childElementCount, 0);
    assert.equal(a.el("multipleQrButton"), null);
    assert.equal(a.el("exportQrButton").getAttribute("aria-expanded"), "false");
  } finally { await a.window.happyDOM.abort(); await receiver.window.happyDOM.abort(); }
});

test("selection changes and closing the export discard pending QR results", async () => {
  const a = await app({ people: { A: { classes: [] }, B: { classes: [] } } }, "https://youfree.ca/");
  try {
    a.window.WhosFreeShareCode.createLink = () => "https://youfree.ca/#import=" + "x".repeat(2400);
    let finish;
    a.window.WhosFreeQrBatches.pack = () => new Promise(resolve => { finish = resolve; });
    a.start();
    await a.wait(() => Boolean(finish));
    assert.equal(a.el("multipleQrProgress").hidden, false);
    a.el("exportPeopleList").querySelector("input").click();
    assert.equal(a.el("multipleQrProgress").hidden, true);
    assert.equal(a.el("multipleQrProgress").value, 0);
    finish({ groups: [], oversized: [] }); await tick();
    assert.equal(a.el("multipleQrCodes").hidden, true);
    assert.equal(a.el("multipleQrCodes").childElementCount, 0);
    finish = null;
    a.el("selectAllSchedules").click(); a.el("exportQrButton").click();
    await a.wait(() => Boolean(finish)); a.el("closeScheduleModal").click();
    assert.equal(a.el("multipleQrProgress").hidden, true);
    finish({ groups: [], oversized: [] }); await tick();
    assert.equal(a.el("scheduleModal").hidden, true);
    assert.equal(a.el("multipleQrCodes").childElementCount, 0);
    assert.equal(a.window.document.body.style.overflow, "");
  } finally { await a.window.happyDOM.abort(); }
});

test("an individually oversized person is identified instead of silently omitted", async () => {
  const large = { people: { Huge: { classes: Array.from({ length: 35 }, () => ({ day: "Monday", start: "09:00", end: "10:00", course: randomText(190) })) }, Small: { classes: [] } } };
  const a = await app(large, "https://youfree.ca/");
  try {
    await a.overflow();
    const status = a.el("exportSharePanel").querySelector(".share-link-status");
    assert.equal(status.dataset.tone, "warning");
    assert.match(status.textContent, /1 of 2 people/); assert.match(status.textContent, /Huge cannot fit/);
    assert.deepEqual(Object.keys((await a.window.WhosFreeShareCode.decode(a.links.at(-1))).people), ["Small"]);
  } finally { await a.window.happyDOM.abort(); }
});


test("multiple QR loading bar reflects real callbacks and ignores progress from cancelled requests", async () => {
  const a = await app({ people: { A: { classes: [] }, B: { classes: [] } } }, "https://youfree.ca/");
  try {
    a.window.WhosFreeShareCode.createLink = () => "https://youfree.ca/#import=" + "x".repeat(2400);
    let report, finish;
    a.window.WhosFreeQrBatches.pack = (names, makeLink, options) => {
      report = options.onProgress;
      return new Promise(resolve => { finish = resolve; });
    };
    a.start();
    assert.equal(a.el("multipleQrProgress").hidden, false);
    assert.equal(a.el("multipleQrProgress").value, 0);
    const status = a.el("exportSharePanel").querySelector(".share-link-status");
    assert.ok(status.compareDocumentPosition(a.el("multipleQrProgress")) & a.window.Node.DOCUMENT_POSITION_FOLLOWING);
    await a.wait(() => Boolean(report));
    report({ phase: "checking", processed: 1, progress: .125 });
    const first = a.el("multipleQrProgress").value;
    assert.ok(first > 0 && first < 100);
    assert.match(a.el("multipleQrProgress").getAttribute("aria-valuetext"), /Checking schedules: 1 of 2/);
    report({ phase: "packing", processed: 1, total: 2, progress: .7 });
    assert.ok(a.el("multipleQrProgress").value > first && a.el("multipleQrProgress").value < 100);
    const progress = a.el("multipleQrProgress").value;
    await tick();
    assert.equal(a.el("multipleQrProgress").value, progress, "waiting alone does not advance the bar");
    a.el("closeScheduleModal").click();
    report({ phase: "complete", progress: 1 });
    finish({ groups: [], oversized: [] }); await tick();
    assert.equal(a.el("multipleQrProgress").hidden, true);
    assert.equal(a.el("multipleQrProgress").value, 0);
    a.el("homeExportButton").click();
    assert.equal(a.el("multipleQrProgress").hidden, true);
  } finally { await a.window.happyDOM.abort(); }
});

test("a failed QR generation hides the loading bar and a retry starts fresh", async () => {
  const a = await app({ people: { A: { classes: [] }, B: { classes: [] } } }, "https://youfree.ca/");
  try {
    a.window.WhosFreeShareCode.createLink = () => "https://youfree.ca/#import=" + "x".repeat(2400);
    a.window.WhosFreeQrBatches.pack = async () => { throw Error("Test failure"); };
    await a.overflow();
    assert.equal(a.el("multipleQrProgress").hidden, true);
    assert.match(a.el("exportSharePanel").querySelector(".share-link-status").textContent, /Test failure/);
    let finish;
    a.window.WhosFreeQrBatches.pack = () => new Promise(resolve => { finish = resolve; });
    a.el("exportQrButton").click(); await a.wait(() => Boolean(finish));
    assert.equal(a.el("multipleQrProgress").hidden, false);
    assert.equal(a.el("multipleQrProgress").value, 0);
    finish({ groups: [], oversized: ["A", "B"] }); await a.wait(() => !a.el("exportQrButton").disabled);
    assert.equal(a.el("multipleQrProgress").hidden, true);
    assert.equal(a.el("multipleQrProgress").value, 100);
  } finally { await a.window.happyDOM.abort(); }
});


test('a fitting selection stays one QR without batch cards or an extra button', async () => {
  const a = await app({ people: { Alice: { classes: [] }, Bob: { classes: [] } } }, 'https://youfree.ca/');
  try {
    await a.overflow();
    assert.equal(a.links.length, 1);
    assert.ok(a.el('exportQr').querySelector('svg'));
    assert.equal(a.el('multipleQrCodes').hidden, true);
    assert.equal(a.el('multipleQrCodes').childElementCount, 0);
    assert.deepEqual(Object.keys((await a.window.WhosFreeShareCode.decode(a.links[0])).people), ['Alice', 'Bob']);
    assert.equal(a.el('multipleQrButton'), null);
    assert.equal(a.el('multipleQrProgress').value, 100);
  } finally { await a.window.happyDOM.abort(); }
});

test('QR export still splits when the complete selection exceeds the share encoder limit', async () => {
  const a = await app(data, 'https://youfree.ca/');
  try {
    const original = a.window.WhosFreeShareCode.encode;
    let fullAttempts = 0;
    a.window.WhosFreeShareCode.encode = async (input, options) => {
      if (Object.keys(input.people).length === 6) { fullAttempts++; throw Error('This selection is too large. Export fewer schedules.'); }
      return original(input, options);
    };
    await a.overflow();
    assert.equal(fullAttempts, 1, 'do not repeat a known failed full encoding');
    assert.ok(a.links.length > 1);
    const names = [];
    for (const link of a.links) names.push(...Object.keys((await a.window.WhosFreeShareCode.decode(link)).people));
    assert.deepEqual(names.sort(), Object.keys(data.people).sort());
    assert.equal(a.el('exportCodeOutput').value, '');
    assert.equal(a.el('exportSharePanel').querySelector('textarea').value, '');
  } finally { await a.window.happyDOM.abort(); }
});

test('individual sharing uses the automatic QR flow, preserves details and cancels on close', async () => {
  const a = await app({ people: { Alice: data.people['Person 1'], Bob: { classes: [] } } }, 'https://youfree.ca/');
  try {
    a.el('peopleList').querySelector('[data-person="Alice"] .person-select-button').click();
    a.el('sharePersonScheduleButton').click();
    a.el('personQuickExportFields').querySelector('.export-include-all').click();
    a.el('personQuickQrButton').click();
    await a.wait(() => !a.el('personQuickQrButton').disabled);
    assert.equal(a.links.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify((await a.window.WhosFreeShareCode.decode(a.links[0])).people)), { Alice: data.people['Person 1'] });
    assert.ok(a.el('personQuickQr').querySelector('svg'));
    assert.equal(a.el('personQuickQrCodes').hidden, true);
    a.el('personQuickExportFields').querySelector('[data-export-field="instructor"]').click();
    assert.equal(a.el('personQuickQr').hidden, true);
    let finish;
    a.window.WhosFreeQrBatches.pack = () => new Promise(resolve => { finish = resolve; });
    a.el('personQuickQrButton').click();
    await a.wait(() => Boolean(finish));
    a.el('closePersonQuickShare').click();
    finish({ groups: [{ names: ['Alice'], link: a.links[0] }], oversized: [] }); await tick();
    assert.equal(a.el('personQuickShareModal').hidden, true);
    assert.equal(a.el('personQuickQr').childElementCount, 0);
    assert.equal(a.el('personQuickSharePanel').querySelector('progress').hidden, true);
  } finally { await a.window.happyDOM.abort(); }
});

test('an oversized individual receives a clear alternative and can retry with fewer details', async () => {
  const a = await app({ people: { Huge: { classes: Array.from({ length: 35 }, () => ({ day: 'Monday', start: '09:00', end: '10:00', course: randomText(190) })) }, Bob: { classes: [] } } }, 'https://youfree.ca/');
  try {
    a.el('peopleList').querySelector('[data-person="Huge"] .person-select-button').click();
    a.el('sharePersonScheduleButton').click();
    a.el('personQuickQrButton').click(); await a.wait(() => !a.el('personQuickQrButton').disabled);
    assert.equal(a.links.length, 0);
    assert.match(a.el('personQuickSharePanel').querySelector('.share-link-status').textContent, /Huge cannot fit.*code or link/);
    assert.equal(a.el('personQuickQrButton').getAttribute('aria-expanded'), 'false');
    assert.ok(a.el('personQuickCode').value);
    assert.ok(a.el('personQuickSharePanel').querySelector('textarea').value);
  } finally { await a.window.happyDOM.abort(); }
});

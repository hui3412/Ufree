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
  const overflow = async () => {
    el("homeExportButton").click(); el("exportFieldOptions").querySelector(".export-include-all").click();
    el("exportQrButton").click(); await wait(() => !el("generateCodeButton").disabled);
    assert.equal(el("multipleQrButton").hidden, false);
  };
  return { window, el, wait, stored, links, overflow };
}

for (const base of ["https://hui3412.github.io/Ufree/", "https://youfree.ca/"]) test(`oversized selections create independent QR links on ${base}`, async () => {
  const a = await app(data, base), receiver = await app(null, base);
  try {
    const before = a.stored();
    await a.overflow();
    const fullCode = a.el("exportCodeOutput").value;
    const fullLink = a.el("exportSharePanel").querySelector("textarea").value;
    assert.match(a.el("exportSharePanel").querySelector(".share-link-status").textContent, /Too much data/);
    a.el("multipleQrButton").click(); await a.wait(() => !a.el("multipleQrButton").disabled);
    const cards = a.el("multipleQrCodes").querySelectorAll(".qr-batch-card");
    assert.ok(cards.length > 1 && cards.length < 6, "combine multiple people when they fit");
    assert.equal(a.links.length, cards.length);
    assert.equal(a.el("multipleQrButton").getAttribute("aria-expanded"), "true");
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
    assert.equal(a.el("multipleQrButton").hidden, true);
    assert.equal(a.el("multipleQrButton").getAttribute("aria-expanded"), "false");
  } finally { await a.window.happyDOM.abort(); await receiver.window.happyDOM.abort(); }
});

test("selection changes and closing the export discard pending QR results", async () => {
  const a = await app({ people: { A: { classes: [] }, B: { classes: [] } } }, "https://youfree.ca/");
  try {
    a.window.WhosFreeShareCode.createLink = () => "https://youfree.ca/#import=" + "x".repeat(2400);
    await a.overflow();
    let finish;
    a.window.WhosFreeQrBatches.pack = () => new Promise(resolve => { finish = resolve; });
    a.el("multipleQrButton").click();
    a.el("exportPeopleList").querySelector("input").click();
    finish({ groups: [], oversized: [] }); await tick();
    assert.equal(a.el("multipleQrCodes").hidden, true);
    assert.equal(a.el("multipleQrCodes").childElementCount, 0);
    a.el("selectAllSchedules").click(); a.el("exportQrButton").click();
    await a.wait(() => !a.el("generateCodeButton").disabled);
    a.el("multipleQrButton").click(); a.el("closeScheduleModal").click();
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
    await a.overflow(); a.el("multipleQrButton").click();
    await a.wait(() => !a.el("multipleQrButton").disabled);
    const status = a.el("exportSharePanel").querySelector(".share-link-status");
    assert.equal(status.dataset.tone, "warning");
    assert.match(status.textContent, /1 of 2 people/); assert.match(status.textContent, /Huge cannot fit/);
    assert.deepEqual(Object.keys((await a.window.WhosFreeShareCode.decode(a.links.at(-1))).people), ["Small"]);
  } finally { await a.window.happyDOM.abort(); }
});

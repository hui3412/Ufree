import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

const base = "https://hui3412.github.io/Ufree/";
const person = course => ({ semester: "Fall 2026", classes: [{ day: "Sunday", start: "08:17", end: "09:38", course, room: "D-108", instructor: "Anna de la Cruz" }] });
const data = { people: { Alice: person("Calculus"), Bob: person("Physics") } };
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

async function app(initial = null, url = base) {
  const window = new Window({ url, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  window.setInterval = () => 0;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.confirm = () => true;
  Object.assign(window, { TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  let copied;
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async value => { copied = value; } }, configurable: true });
  if (initial) window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: initial, meta: {} }));
  for (const file of ["schedule-availability.js", "schedule-share-code.js", "assets/qr/qrcodegen.js", "app.js"]) window.eval(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"));
  const el = id => window.document.getElementById(id);
  const wait = async predicate => {
    for (let i = 0; i < 150; i++) { if (predicate()) return; await tick(); }
    throw Error("UI operation did not finish");
  };
  await tick();
  await wait(() => !el("decodeCodeButton").disabled);
  const stored = () => window.localStorage.getItem("whos-free-local-schedules");
  return { window, el, wait, stored, copied: () => copied };
}

test("URL transport preserves compact schedules and rejects damaged links", async () => {
  const a = await app();
  try {
    const api = a.window.WhosFreeShareCode, code = await api.encode(data), link = api.createLink(code, base);
    assert.match(link, /^https:\/\/hui3412\.github\.io\/Ufree\/#import=WFL5[JDZBRSTUV][A-Za-z0-9_-]+$/);
    assert.deepEqual(plain(await api.decode(link)), plain(await api.decode(code)));
    assert.deepEqual(plain(await api.decode(new URL(link).hash.slice(8))), plain(await api.decode(code)));
    assert.equal(api.createLink(code, base + "?discard=yes#old"), link);
    await assert.rejects(api.decode(link.slice(0, -1)), /incomplete|changed/);
    await assert.rejects(api.decode(link + "!"), /incomplete|changed/);
    await assert.rejects(api.decode(base), /does not contain/);
    assert.throws(() => api.createLink(code, "javascript:alert(1)"), /HTTP/);
    assert.throws(() => api.createLink("WF5J0broken", base), /incomplete|invalid/);
  } finally { a.window.happyDOM.abort(); }
});

test("export offers a copyable Ufree link and a locally generated QR; changing selection clears both", async () => {
  const a = await app(data);
  try {
    a.el("exportSchedulesButton").click(); a.el("selectAllSchedules").click(); a.el("generateCodeButton").click();
    await a.wait(() => !a.el("generateCodeButton").disabled);
    const panel = a.el("exportSharePanel"), link = panel.querySelector("textarea").value;
    assert.equal(panel.hidden, false);
    assert.deepEqual(Object.keys((await a.window.WhosFreeShareCode.decode(link)).people), ["Alice", "Bob"]);
    panel.querySelector(".copy-share-link").click(); await tick(); assert.equal(a.copied(), link);
    const button = panel.querySelector(".toggle-share-qr"); button.click();
    const svg = panel.querySelector("svg");
    assert.ok(svg); assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.equal(svg.querySelector("rect").getAttribute("fill"), "#fff");
    assert.equal(svg.querySelector("path").getAttribute("fill"), "#000");
    assert.match(svg.querySelector("path").getAttribute("d"), /^M/);
    button.click(); assert.equal(panel.querySelector(".share-qr").hidden, true);
    a.el("selectAllSchedules").click();
    assert.equal(panel.hidden, true); assert.equal(panel.querySelector("textarea").value, ""); assert.equal(panel.querySelector("svg"), null);
  } finally { a.window.happyDOM.abort(); }
});

test("opening a shared link previews people without saving; only selected schedules are added", async () => {
  const sender = await app();
  const link = sender.window.WhosFreeShareCode.createLink(await sender.window.WhosFreeShareCode.encode(data), base);
  const receiver = await app(null, link);
  try {
    assert.equal(receiver.el("scheduleModal").hidden, false);
    assert.equal(receiver.el("sharedImportPreview").hidden, false);
    assert.equal(receiver.stored(), null);
    assert.equal(receiver.window.location.hash, "");
    assert.equal(receiver.el("decodeCodeButton").textContent, "Add schedules");
    const bob = receiver.el("sharedImportPeople").querySelector('[data-person="Bob"]');
    bob.click(); receiver.el("decodeCodeButton").click();
    await receiver.wait(() => !receiver.el("decodeCodeButton").disabled);
    const saved = JSON.parse(receiver.stored()).data;
    assert.deepEqual(Object.keys(saved.people), ["Alice"]);
    assert.equal(saved.people.Alice.classes[0].start, "08:17");
    assert.equal(saved.people.Alice.classes[0].day, "Sunday");
    assert.equal(saved.people.Alice.classes[0].instructor, "de la Cruz");
    assert.match(receiver.el("importCodeStatus").textContent, /Imported 1 schedule/);
    assert.equal(receiver.el("sharedImportPreview").hidden, true);
  } finally { sender.window.happyDOM.abort(); receiver.window.happyDOM.abort(); }
});

test("cancelling and malformed links leave local schedules unchanged; empty selection cannot import", async () => {
  const sender = await app();
  const link = sender.window.WhosFreeShareCode.createLink(await sender.window.WhosFreeShareCode.encode(data), base);
  const receiver = await app({ people: { Local: person("History") } }, link);
  try {
    const before = receiver.stored();
    for (const checkbox of receiver.el("sharedImportPeople").querySelectorAll("input")) checkbox.click();
    assert.equal(receiver.el("decodeCodeButton").disabled, true);
    receiver.el("closeImportButton").click();
    assert.equal(receiver.stored(), before); assert.equal(receiver.el("sharedImportPreview").hidden, true);
    receiver.el("importCodeButton").click(); receiver.el("importCodeInput").value = base + "#import=WFL5Rbroken!";
    receiver.el("decodeCodeButton").click(); await receiver.wait(() => !receiver.el("decodeCodeButton").disabled);
    assert.equal(receiver.el("importCodeStatus").dataset.tone, "error"); assert.equal(receiver.stored(), before);
  } finally { sender.window.happyDOM.abort(); receiver.window.happyDOM.abort(); }
});

test("pasted links also require confirmation and retain existing duplicate/conflict handling", async () => {
  const a = await app(data);
  try {
    const api = a.window.WhosFreeShareCode;
    const richer = { people: { Alice: { ...person("Different"), classes: [{ ...person("Different").classes[0], course_code: "preserve" }] } } };
    a.el("importCodeButton").click();
    a.el("importCodeInput").value = api.createLink(await api.encode(richer), base);
    const before = a.stored(); a.el("decodeCodeButton").click(); await a.wait(() => !a.el("decodeCodeButton").disabled);
    assert.equal(a.stored(), before); assert.equal(a.el("sharedImportPreview").hidden, false);
    a.el("decodeCodeButton").click(); await a.wait(() => !a.el("codeConflictPrompt").hidden);
    a.el("codeConflictPrompt").querySelector('[data-code-conflict-action="old"]').click();
    await a.wait(() => !a.el("decodeCodeButton").disabled);
    assert.equal(a.stored(), before); assert.match(a.el("importCodeStatus").textContent, /Kept 1 old/);
    a.el("closeImportButton").click(); a.el("importCodeButton").click();
    a.el("importCodeInput").value = api.createLink(await api.encode(data), base);
    a.el("decodeCodeButton").click(); await a.wait(() => !a.el("decodeCodeButton").disabled);
    a.el("decodeCodeButton").click(); await a.wait(() => !a.el("decodeCodeButton").disabled);
    assert.match(a.el("importCodeStatus").textContent, /Skipped 2 identical/); assert.equal(a.stored(), before);
  } finally { a.window.happyDOM.abort(); }
});

test("oversized QR retains the complete link and code, and one-person export contains only that person", async () => {
  const a = await app(data);
  try {
    a.el("exportSchedulesButton").click(); a.el("selectAllSchedules").click(); a.el("generateCodeButton").click();
    await a.wait(() => !a.el("generateCodeButton").disabled);
    const panel = a.el("exportSharePanel"), output = panel.querySelector("textarea");
    const code = a.el("exportCodeOutput").value;
    output.value = base + "#import=" + "x".repeat(2400);
    panel.querySelector(".toggle-share-qr").click();
    assert.match(panel.querySelector(".share-link-status").textContent, /Too much data/);
    assert.equal(output.value.length > 2331, true); assert.equal(a.el("exportCodeOutput").value, code);
    a.el("closeScheduleModal").click(); a.el("viewToggleButton").click();
    a.el("peopleList").querySelector('[data-person="Alice"]').click(); a.el("fullScheduleButton").click();
    a.el("exportPersonScheduleButton").click(); await a.wait(() => !a.el("exportPersonScheduleButton").disabled);
    const personal = a.el("personSharePanel"); assert.equal(personal.hidden, false);
    assert.deepEqual(Object.keys((await a.window.WhosFreeShareCode.decode(personal.querySelector("textarea").value)).people), ["Alice"]);
    personal.querySelector(".toggle-share-qr").click(); assert.ok(personal.querySelector("svg"));
  } finally { a.window.happyDOM.abort(); }
});

test("a fragment opened in an existing tab previews older codes after local schedules have loaded", async () => {
  const a = await app(data);
  try {
    const before = a.stored();
    const frozen = JSON.parse(fs.readFileSync(new URL("fixtures/share-code-wf4.json", import.meta.url), "utf8"));
    a.window.location.hash = "import=" + encodeURIComponent(frozen.codes.J);
    a.window.dispatchEvent(new a.window.HashChangeEvent("hashchange"));
    await a.wait(() => !a.el("sharedImportPreview").hidden);
    assert.equal(a.window.location.hash, "");
    assert.equal(a.stored(), before);
    assert.equal(a.el("sharedImportPeople").querySelectorAll("input").length, 3);
    a.el("closeImportButton").click(); assert.equal(a.stored(), before);
  } finally { a.window.happyDOM.abort(); }
});

test("three-dot export choices start basic and regenerate codes, links and QRs with full selected details", async () => {
  const rich = { people: { Alice: { semester: "Fall 2026", source_file: "original.jpg", notes: "saved note", classes: [{ ...person("Physics").classes[0], kind: "class", course_code: "203-SN1-RE", section: "00002", recognition: { reviewed: true } }] } } };
  const a = await app(rich);
  try {
    const before = a.stored(), options = a.el("exportFieldOptions");
    a.el("exportSchedulesButton").click(); a.el("selectAllSchedules").click();
    assert.equal(options.open, false); assert.equal(options.querySelectorAll("input:checked").length, 0);
    a.el("generateCodeButton").click(); await a.wait(() => !a.el("generateCodeButton").disabled);
    const basicCode = a.el("exportCodeOutput").value;
    assert.match(basicCode, /^WF6/);
    const basic = await a.window.WhosFreeShareCode.decode(basicCode);
    assert.equal(basic.people.Alice.classes[0].instructor, null); assert.equal(basic.people.Alice.semester, undefined);
    options.querySelector('[data-export-field="instructor"]').click();
    assert.equal(a.el("exportCodeOutput").value, ""); assert.equal(a.el("exportSharePanel").hidden, true);
    a.el("generateCodeButton").click(); await a.wait(() => !a.el("generateCodeButton").disabled);
    let exported = await a.window.WhosFreeShareCode.decode(a.el("exportCodeOutput").value);
    assert.equal(exported.people.Alice.classes[0].instructor, "Anna de la Cruz"); assert.equal(exported.people.Alice.classes[0].course_code, null);
    options.querySelector(".export-include-all").click(); assert.equal(options.querySelectorAll("input:checked").length, 5);
    a.el("generateCodeButton").click(); await a.wait(() => !a.el("generateCodeButton").disabled);
    const panel = a.el("exportSharePanel"); exported = await a.window.WhosFreeShareCode.decode(panel.querySelector("textarea").value);
    assert.deepEqual(plain(exported.people), rich.people);
    panel.querySelector(".toggle-share-qr").click(); assert.ok(panel.querySelector("svg"));
    assert.equal(a.stored(), before);
    a.el("closeExportButton").click(); a.el("exportSchedulesButton").click();
    assert.equal(options.querySelectorAll("input:checked").length, 0);
  } finally { a.window.happyDOM.abort(); }
});

test("single-person three-dot choices preserve full teacher names and course details without including anyone else", async () => {
  const rich = { people: { ...data.people, Alice: { ...person("Physics"), classes: [{ ...person("Physics").classes[0], course_code: "203-SN1-RE", section: "00002" }] } } };
  const a = await app(rich);
  try {
    a.el("viewToggleButton").click(); a.el("peopleList").querySelector('[data-person="Alice"]').click(); a.el("fullScheduleButton").click();
    const options = a.el("personExportFieldOptions"); assert.equal(options.querySelectorAll("input:checked").length, 0);
    options.querySelector(".export-include-all").click(); a.el("exportPersonScheduleButton").click();
    await a.wait(() => !a.el("exportPersonScheduleButton").disabled);
    const imported = await a.window.WhosFreeShareCode.decode(a.el("personSharePanel").querySelector("textarea").value);
    assert.deepEqual(Object.keys(imported.people), ["Alice"]);
    assert.equal(imported.people.Alice.classes[0].instructor, "Anna de la Cruz");
    assert.equal(imported.people.Alice.classes[0].course_code, "203-SN1-RE"); assert.equal(imported.people.Alice.classes[0].section, "00002");
    options.querySelector('[data-export-field="instructor"]').click();
    assert.equal(a.el("personWeekCode").value, ""); assert.equal(a.el("personSharePanel").hidden, true);
    options.open = true;
    a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(options.open, false); assert.equal(a.el("personWeekModal").hidden, false);
  } finally { a.window.happyDOM.abort(); }
});

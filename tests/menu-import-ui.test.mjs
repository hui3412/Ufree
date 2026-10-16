import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

const original = { people: { Local: { semester: "Fall 2026", classes: [] } } };
const detected = { name: "New student", person: { semester: "Fall 2026", classes: [{ day: "Monday", start: "09:00", end: "10:00", course: "Physics" }] } };
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

async function app(mobile = false) {
  const window = new Window({ url: "https://youfree.ca/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  window.setInterval = () => 0;
  window.matchMedia = query => ({ matches: query.includes("prefers-reduced-motion") || (mobile && query === "(max-width: 900px)"), addEventListener() {} });
  window.URL.createObjectURL = () => "blob:test";
  window.URL.revokeObjectURL = () => {};
  Object.assign(window, { TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: original, meta: {} }));
  let calls = 0, uploaded;
  window.WhosFreeImageParser = { parseScheduleImage: async file => { calls++; uploaded = file; return structuredClone(detected); } };
  for (const file of ["schedule-availability.js", "schedule-share-code.js", "app.js"]) window.eval(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"));
  const el = id => window.document.getElementById(id);
  const wait = async predicate => {
    for (let i = 0; i < 150; i++) { if (predicate()) return; await tick(); }
    throw Error("Import operation did not finish");
  };
  await tick();
  const stored = () => window.localStorage.getItem("whos-free-local-schedules");
  const open = () => { el("mobileMenuButton").click(); el("homeImportButton").click(); };
  const upload = () => {
    const file = { name: "schedule.png", type: "image/png" };
    Object.defineProperty(el("scheduleImageInput"), "files", { value: [file], configurable: true });
    el("scheduleImageInput").dispatchEvent(new window.Event("change"));
    return file;
  };
  return { window, el, wait, stored, open, upload, calls: () => calls, uploaded: () => uploaded };
}

for (const mobile of [false, true]) test(`one Import panel offers image above code and retains review/save on ${mobile ? "mobile" : "desktop"}`, async () => {
  const a = await app(mobile);
  try {
    const before = a.stored();
    a.open();
    await tick();
    assert.equal(a.el("scheduleModalTitle").textContent, "Import");
    assert.equal(a.el("codeImportPanel").firstElementChild, a.el("importScheduleImageButton"));
    assert.ok(a.el("importScheduleImageButton").compareDocumentPosition(a.el("importCodeField")) & a.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(a.el("importCodeField").closest("[hidden]"), null);
    assert.equal(a.window.document.activeElement, a.el("importScheduleImageButton"));
    a.el("importCodeInput").value = "keep this draft code";
    let pickerCalls = 0;
    a.el("scheduleImageInput").click = () => { pickerCalls++; };
    a.el("importScheduleImageButton").click();
    assert.equal(pickerCalls, 1, "one click directly opens the existing image chooser");
    a.el("scheduleImageInput").dispatchEvent(new a.window.Event("cancel"));
    assert.equal(a.el("importCodeInput").value, "keep this draft code");
    assert.equal(a.el("scheduleModal").hidden, false);
    assert.equal(a.stored(), before);
    const file = a.upload();
    assert.equal(a.el("importScheduleImageButton").disabled, true);
    assert.equal(a.el("decodeCodeButton").disabled, true);
    assert.equal(a.el("importProgressOverlay").hidden, false);
    await a.wait(() => !a.el("imageReview").hidden && a.el("importProgressOverlay").hidden);
    assert.equal(a.calls(), 1);
    assert.equal(a.uploaded(), file);
    assert.equal(a.el("imageReviewName").value, "New student");
    assert.ok(a.el("codeImportPanel").closest("[hidden]"), "review isolates the existing review grid");
    assert.equal(a.stored(), before, "recognition still requires review before saving");
    a.el("cancelImageScheduleButton").click();
    await a.wait(() => a.window.document.activeElement === a.el("importScheduleImageButton"));
    assert.equal(a.el("codeImportPanel").closest("[hidden]"), null);
    assert.equal(a.el("importCodeInput").value, "keep this draft code");
    assert.equal(a.stored(), before);
    a.el("importScheduleImageButton").click();
    assert.equal(pickerCalls, 2);
    a.upload();
    await a.wait(() => !a.el("imageReview").hidden && a.el("importProgressOverlay").hidden);
    a.el("saveImageScheduleButton").click();
    await a.wait(() => a.el("imageReview").hidden && !a.el("decodeCodeButton").disabled);
    assert.deepEqual(Object.keys(JSON.parse(a.stored()).data.people), ["Local", "New student"]);
    assert.deepEqual(JSON.parse(a.stored()).data.people.Local, original.people.Local);
    assert.match(a.el("importImageStatus").textContent, /Saved 1 schedule entries/);
    assert.equal(a.el("importCodeInput").value, "keep this draft code");
    a.el("closeImportButton").click();
    assert.equal(a.el("scheduleModal").hidden, true);
    assert.equal(a.window.document.body.style.overflow, "");
    assert.equal(a.window.document.activeElement.id, "mobileMenuButton");
  } finally { await a.window.happyDOM.abort(); }
});

test("the original Schedules picture button and Import use the same image input", async () => {
  const a = await app();
  try {
    let clicks = 0;
    a.el("scheduleImageInput").click = () => { clicks++; };
    a.open(); a.el("importScheduleImageButton").click();
    assert.equal(clicks, 1);
    a.el("closeImportButton").click(); a.el("scheduleDataButton").click();
    assert.equal(a.el("addScheduleImageButton").closest("[hidden]"), null);
    assert.equal(a.el("addScheduleImageButton").disabled, false);
    a.el("addScheduleImageButton").click();
    assert.equal(clicks, 2);
    a.upload();
    await a.wait(() => !a.el("imageReview").hidden && a.el("importProgressOverlay").hidden);
    a.el("cancelImageScheduleButton").click();
    assert.equal(a.el("addScheduleImageButton").closest("[hidden]"), null);
    assert.equal(a.calls(), 1);
  } finally { await a.window.happyDOM.abort(); }
});

test("failed images show a visible retryable error without changing stored data or typed code", async () => {
  const a = await app();
  try {
    const before = a.stored();
    a.open();
    a.el("importCodeInput").value = "draft code";
    a.window.WhosFreeImageParser.parseScheduleImage = async () => { throw Error("Try a clearer image."); };
    a.upload();
    await a.wait(() => a.el("importProgressOverlay").hidden);
    assert.equal(a.el("importImageStatus").closest("[hidden]"), null);
    assert.equal(a.el("importImageStatus").dataset.tone, "error");
    assert.match(a.el("importImageStatus").textContent, /Try a clearer image/);
    assert.equal(a.window.document.activeElement, a.el("importScheduleImageButton"));
    assert.equal(a.el("importScheduleImageButton").disabled, false);
    assert.equal(a.el("decodeCodeButton").disabled, false);
    assert.equal(a.el("importCodeInput").value, "draft code");
    assert.equal(a.stored(), before);
    a.window.WhosFreeImageParser.parseScheduleImage = async () => structuredClone(detected);
    a.upload();
    await a.wait(() => !a.el("imageReview").hidden && a.el("importProgressOverlay").hidden);
    assert.equal(a.el("imageReviewName").value, "New student");
  } finally { await a.window.happyDOM.abort(); }
});

test("duplicate image schedules retain the existing review choice instead of replacing local data", async () => {
  const a = await app();
  try {
    const before = a.stored(); a.open(); a.upload();
    await a.wait(() => !a.el("imageReview").hidden && a.el("importProgressOverlay").hidden);
    a.el("imageReviewName").value = "Local";
    a.el("saveImageScheduleButton").click();
    await a.wait(() => !a.el("duplicatePicturePrompt").hidden);
    assert.equal(a.stored(), before);
    a.el("duplicatePicturePrompt").querySelector('[data-duplicate-action="cancel"]').click();
    assert.equal(a.el("imageReview").hidden, false);
    a.el("cancelImageScheduleButton").click();
    assert.equal(a.el("codeImportPanel").closest("[hidden]"), null);
    assert.equal(a.stored(), before);
  } finally { await a.window.happyDOM.abort(); }
});

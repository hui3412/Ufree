import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bootstrap = html.match(/<script id="sharedLinkBootstrap">([\s\S]*?)<\/script>/)[1];
const base = "https://hui3412.github.io/Ufree/";
const shared = { schema_version: 1, share_profile: "compact", people: { Alice: { semester: "Fall 2026", classes: [{ day: "Monday", start: "09:00", end: "10:00", course: "Physics" }] } } };
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const wait = async predicate => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  throw Error("loading flow did not finish");
};

function shell(url) {
  const window = new Window({ url, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(html);
  window.eval(bootstrap);
  window.setInterval = () => 0;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  Object.assign(window, { TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  const el = id => window.document.getElementById(id);
  const run = (decode, storage = null) => {
    if (storage) Object.defineProperty(window, "indexedDB", { configurable: true, value: { open: () => storage } });
    for (const file of ["schedule-availability.js", "schedule-share-code.js"]) window.eval(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"));
    if (decode) window.WhosFreeShareCode.decode = decode;
    window.eval(fs.readFileSync(new URL("../app.js", import.meta.url), "utf8"));
  };
  return { window, el, run };
}

test("initial shared-link loading popup appears before any deferred app scripts run", () => {
  const a = shell(base + "#import=WFL5Rpending");
  const normal = shell(base);
  try {
    assert.equal(typeof a.window.WhosFreeShareCode, "undefined");
    assert.equal(a.el("importProgressOverlay").hidden, false);
    assert.equal(a.el("importProgressOverlay").getAttribute("aria-busy"), "true");
    assert.equal(a.el("importProgressTitle").textContent, "Opening shared schedules");
    assert.match(a.el("importProgressMessage").textContent, /Loading the app/);
    assert.equal(a.el("importProgressOverlay").querySelector(".import-progress-spinner").hidden, false);
    assert.ok(html.indexOf('id="sharedLinkBootstrap"') < html.indexOf('src="https://cdn.jsdelivr.net'));
    assert.equal(normal.el("importProgressOverlay").hidden, true);
  } finally { a.window.happyDOM.abort(); normal.window.happyDOM.abort(); }
});

test("spinner covers slow local storage and decoding, then saves automatically", async () => {
  const a = shell(base + "#import=WFL5Rpending"), storage = {};
  let resolveDecode, called = false;
  const pending = new Promise(resolve => { resolveDecode = resolve; });
  try {
    a.run(() => { called = true; return pending; }, storage);
    assert.equal(a.el("importProgressOverlay").hidden, false);
    assert.match(a.el("importProgressMessage").textContent, /Loading your saved schedules/);
    assert.equal(called, false);
    assert.equal(a.window.document.documentElement.classList.contains("shared-link-starting"), false);
    let resolveRead;
    storage.result = { close() {}, transaction() { return { objectStore() { return { get() {
      const request = {}; resolveRead = () => { request.result = undefined; request.onsuccess(); }; return request;
    } }; } }; } };
    storage.onsuccess();
    await wait(() => Boolean(resolveRead));
    resolveRead();
    delete a.window.indexedDB;
    await wait(() => called);
    assert.equal(a.el("importProgressOverlay").hidden, false);
    assert.match(a.el("importProgressMessage").textContent, /Adding the shared schedules/);
    assert.equal(a.el("sharedImportPreview").hidden, true);
    assert.equal(a.el("decodeCodeButton").disabled, true);
    assert.equal(a.window.localStorage.getItem("whos-free-local-schedules"), null);
    resolveDecode(shared);
    await wait(() => a.el("scheduleModal").hidden && a.el("importProgressOverlay").hidden);
    assert.match(a.el("toast").textContent, /Added 1 person · Skipped 0/);
    assert.equal(a.el("sharedImportPreview").hidden, true);
    assert.equal(a.el("importProgressOverlay").hasAttribute("aria-busy"), false);
    assert.equal(a.el("scheduleModal").hasAttribute("inert"), false);
    assert.ok(JSON.parse(a.window.localStorage.getItem("whos-free-local-schedules")).data.people.Alice);
    assert.equal(a.window.document.body.style.overflow, "");
  } finally { a.window.happyDOM.abort(); }
});

test("failed decoding dismisses the spinner and shows an actionable import error", async () => {
  const a = shell(base + "#import=WFL5Rbroken");
  let rejectDecode;
  try {
    a.run(() => new Promise((_, reject) => { rejectDecode = reject; }));
    await wait(() => Boolean(rejectDecode));
    assert.equal(a.el("importProgressOverlay").hidden, false);
    rejectDecode(new Error("The shared link is incomplete or changed."));
    await wait(() => a.el("importProgressOverlay").hidden);
    assert.match(a.el("importCodeStatus").textContent, /incomplete or changed/);
    assert.equal(a.el("importCodeStatus").dataset.tone, "error");
    assert.equal(a.el("decodeCodeButton").disabled, false);
    assert.equal(a.el("scheduleModal").hasAttribute("inert"), false);
    assert.equal(a.window.localStorage.getItem("whos-free-local-schedules"), null);
  } finally { a.window.happyDOM.abort(); }
});

test("pasted links show the same spinner and ordinary page loads do not open it", async () => {
  const a = shell(base);
  let resolveDecode;
  try {
    a.run(() => new Promise(resolve => { resolveDecode = resolve; }));
    await tick();
    assert.equal(a.el("importProgressOverlay").hidden, true);
    a.el("importCodeButton").click();
    a.el("importCodeInput").value = base + "#import=WFL5Rpending";
    a.el("decodeCodeButton").click();
    assert.equal(a.el("importProgressOverlay").hidden, false);
    await wait(() => Boolean(resolveDecode));
    resolveDecode(shared);
    await wait(() => a.el("importProgressOverlay").hidden);
    assert.equal(a.el("sharedImportPreview").hidden, false);
  } finally { a.window.happyDOM.abort(); }
});


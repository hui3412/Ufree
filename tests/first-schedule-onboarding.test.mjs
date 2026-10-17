import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

const DATABASE = "whos-free-local-schedules";
const HISTORY = "ufree-has-had-schedules-v1";
const COPY_LABEL = "Copy My Link to Invite Them";
const person = { semester: "Fall 2026", classes: [{ day: "Monday", start: "09:00", end: "10:00", course: "Math", room: "A-104" }] };
const plain = value => JSON.parse(JSON.stringify(value));
const timetable = classes => plain(classes).map(item => Object.fromEntries(Object.keys(person.classes[0]).map(key => [key, item[key]])));

async function app({ url = "https://youfree.ca/", storage = {}, people, beforeReady } = {}) {
  const window = new Window({ url, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  const intervals = [];
  window.setInterval = callback => { intervals.push(callback); return 0; };
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.confirm = () => true;
  window.URL.createObjectURL = () => "blob:test";
  window.URL.revokeObjectURL = () => {};
  Object.assign(window, { TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
  if (people) window.localStorage.setItem(DATABASE, JSON.stringify({ data: { people }, meta: {} }));
  window.WhosFreeImageParser = { parseScheduleImage: async () => ({ name: "Alice", person: structuredClone(person) }) };
  let copied;
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async text => { copied = text; } }, configurable: true });
  for (const file of ["schedule-availability.js", "schedule-share-code.js", "app.js"]) window.eval(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
  const el = id => window.document.getElementById(id);
  beforeReady?.(window, el);
  const wait = async condition => {
    for (let i = 0; i < 250; i++) {
      if (condition()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw Error("Onboarding operation did not finish");
  };
  await new Promise(resolve => setTimeout(resolve, 50));
  const snapshot = () => Object.fromEntries(Array.from({ length: window.localStorage.length }, (_, i) => {
    const key = window.localStorage.key(i);
    return [key, window.localStorage.getItem(key)];
  }));
  const stored = () => JSON.parse(window.localStorage.getItem(DATABASE));
  const manual = (name = "Alice") => {
    el("scheduleDataButton").click(); el("manualScheduleButton").click();
    el("imageReviewName").value = name;
  };
  const upload = async () => {
    Object.defineProperty(el("scheduleImageInput"), "files", { value: [{ name: "schedule.png" }], configurable: true });
    el("scheduleImageInput").dispatchEvent(new window.Event("change"));
    await wait(() => !el("imageReview").hidden && el("importProgressOverlay").hidden);
  };
  const save = async () => {
    el("saveImageScheduleButton").click();
    await wait(() => el("imageReview").hidden && !el("saveImageScheduleButton").disabled);
  };
  return { window, el, wait, snapshot, stored, manual, upload, save, intervals, copied: () => copied };
}

test("first manual save opens the exact welcome, traps focus, copies a valid link and closes safely", async () => {
  const a = await app();
  try {
    assert.equal(a.el("firstScheduleWelcome").hidden, true, "empty startup does not trigger onboarding");
    a.manual();
    assert.equal(a.el("firstScheduleWelcome").hidden, true, "opening review does not count as creation");
    await a.save();
    await a.wait(() => !a.el("copyFirstScheduleLink").disabled);
    assert.equal(a.el("firstScheduleWelcome").hidden, false);
    assert.equal(a.el("scheduleModal").hidden, true);
    assert.equal(a.el("firstScheduleWelcomeTitle").textContent, "Now, add your friends!");
    assert.equal(a.el("firstScheduleWelcomeBody").textContent, "UFree runs entirely on your device, so it doesn't automatically sync with others. To see your group's availability, have your friends send you their timetable via a link, QR code, or text code.");
    assert.equal(a.el("copyFirstScheduleLink").textContent, COPY_LABEL);
    assert.equal(a.el("closeFirstScheduleWelcome").textContent, "Got it / Close");
    assert.equal(a.window.document.activeElement, a.el("copyFirstScheduleLink"));
    a.el("mobileMenuButton").focus();
    assert.equal(a.window.document.activeElement, a.el("copyFirstScheduleLink"), "focus cannot escape to the page behind the welcome");
    a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(a.window.document.activeElement, a.el("closeFirstScheduleWelcome"));
    a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    assert.equal(a.window.document.activeElement, a.el("copyFirstScheduleLink"));
    const before = a.snapshot();
    a.el("copyFirstScheduleLink").click();
    await a.wait(() => a.el("copyFirstScheduleLink").textContent === "Copied!");
    assert.equal(a.el("firstScheduleWelcomeStatus").textContent, "Copied!");
    const link = new URL(a.copied());
    assert.equal(link.origin, "https://youfree.ca");
    assert.deepEqual(Object.keys((await a.window.WhosFreeShareCode.decode(link.href)).people), ["Alice"]);
    assert.deepEqual(a.snapshot(), before, "sharing never changes stored schedules or preferences");
    await a.wait(() => a.el("copyFirstScheduleLink").textContent === COPY_LABEL);
    a.el("closeFirstScheduleWelcome").click();
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
    assert.equal(a.window.document.body.style.overflow, "");
    assert.equal(a.window.document.activeElement.id, "mobileMenuButton");
  } finally { await a.window.happyDOM.abort(); }
});

for (const url of ["https://hui3412.github.io/Ufree/?source=test#old", "https://youfree.ca/index.html?source=test#old"]) {
  test(`first OCR save copies only that schedule on the current deployment: ${url}`, async () => {
    const a = await app({ url });
    try {
      if (url.includes("index.html")) {
        a.el("mobileMenuButton").click(); a.el("homeImportButton").click();
        assert.equal(a.el("scheduleModalTitle").textContent, "Import");
      }
      await a.upload();
      assert.equal(a.el("firstScheduleWelcome").hidden, true);
      assert.equal(a.stored(), null);
      await a.save();
      await a.wait(() => !a.el("copyFirstScheduleLink").disabled);
      assert.equal(a.el("scheduleModal").hidden, true, "both image entry points give way to the welcome after saving");
      a.el("copyFirstScheduleLink").click();
      await a.wait(() => a.copied());
      const link = new URL(a.copied()), origin = new URL(url);
      assert.equal(link.origin, origin.origin); assert.equal(link.pathname, origin.pathname); assert.equal(link.search, "");
      const decoded = await a.window.WhosFreeShareCode.decode(link.href);
      assert.deepEqual(Object.keys(decoded.people), ["Alice"]);
      assert.deepEqual(timetable(decoded.people.Alice.classes), person.classes);
      assert.deepEqual(timetable(a.stored().data.people.Alice.classes), person.classes);
      a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Escape" }));
      assert.equal(a.el("firstScheduleWelcome").hidden, true);
    } finally { await a.window.happyDOM.abort(); }
  });
}

test("reload shows the single-schedule reminder while edits, Undo and deleting/re-adding never repeat first-save onboarding", async () => {
  const a = await app();
  let reloaded;
  try {
    a.manual(); await a.save();
    a.el("firstScheduleWelcome").click();
    assert.equal(a.el("firstScheduleWelcome").hidden, true, "backdrop closes");
    const saved = a.snapshot();
    reloaded = await app({ storage: saved });
    assert.equal(reloaded.el("firstScheduleWelcome").hidden, false);
    assert.equal(reloaded.el("firstScheduleWelcome").dataset.reason, "single-schedule");
    reloaded.el("closeFirstScheduleWelcome").click();
    a.manual("Bob"); await a.save();
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
    a.el("undoChangesButton").click();
    await a.wait(() => Object.keys(a.stored().data.people).length === 1);
    a.el("undoChangesButton").click();
    await a.wait(() => a.stored() === null);
    a.manual("Alice again"); await a.save();
    assert.equal(a.el("firstScheduleWelcome").hidden, true, "Undo to zero does not reset first-time history");
    reloaded.el("scheduleDataButton").click(); reloaded.el("removeSchedulesButton").click();
    await reloaded.wait(() => reloaded.stored() === null);
    const emptyReload = await app({ storage: reloaded.snapshot() });
    try {
      emptyReload.manual("Carol"); await emptyReload.save();
      assert.equal(emptyReload.el("firstScheduleWelcome").hidden, true, "history survives removing all schedules and reloading");
    } finally { await emptyReload.window.happyDOM.abort(); }
  } finally { await a.window.happyDOM.abort(); if (reloaded) await reloaded.window.happyDOM.abort(); }
});

test("existing users get the launch reminder but never repeat first-save onboarding after replacing or deleting schedules", async () => {
  const a = await app({ people: { Alice: person } });
  try {
    assert.equal(a.el("firstScheduleWelcome").hidden, false);
    assert.equal(a.el("firstScheduleWelcome").dataset.reason, "single-schedule");
    a.el("closeFirstScheduleWelcome").click();
    assert.equal(a.window.localStorage.getItem(HISTORY), "1");
    a.manual("Alice"); await a.save();
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
    a.el("removeSchedulesButton").click(); await a.wait(() => a.stored() === null);
    a.manual("Bob"); await a.save();
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
  } finally { await a.window.happyDOM.abort(); }
});

test("cancelled reviews, invalid names, OCR failures and failed persistence do not show onboarding", async () => {
  const a = await app();
  try {
    a.manual(""); a.el("saveImageScheduleButton").click();
    assert.match(a.el("imageReviewError").textContent, /name/);
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
    a.el("cancelImageScheduleButton").click();
    assert.equal(a.window.localStorage.getItem(HISTORY), null);
    a.window.WhosFreeImageParser.parseScheduleImage = async () => { throw Error("Unreadable image"); };
    Object.defineProperty(a.el("scheduleImageInput"), "files", { value: [{ name: "broken.png" }], configurable: true });
    a.el("scheduleImageInput").dispatchEvent(new a.window.Event("change"));
    await a.wait(() => a.el("importProgressOverlay").hidden);
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
    a.manual();
    const storage = a.window.localStorage;
    Object.defineProperty(a.window, "localStorage", { value: {
      getItem: key => storage.getItem(key),
      setItem() { throw Error("Storage full"); },
    }, configurable: true });
    await a.save();
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
    assert.equal(a.stored(), null);
  } finally { await a.window.happyDOM.abort(); }
});

test("clipboard denial offers a selectable valid link and allows retry without a false Copied state", async () => {
  const a = await app();
  try {
    a.manual(); await a.save(); await a.wait(() => !a.el("copyFirstScheduleLink").disabled);
    a.window.navigator.clipboard.writeText = async () => { throw Error("Permission denied"); };
    a.el("copyFirstScheduleLink").click();
    await a.wait(() => !a.el("firstScheduleLinkFallback").hidden);
    assert.equal(a.el("copyFirstScheduleLink").textContent, COPY_LABEL);
    assert.equal(a.window.document.activeElement, a.el("firstScheduleLinkFallback"));
    const fallback = a.el("firstScheduleLinkFallback").value;
    assert.deepEqual(Object.keys((await a.window.WhosFreeShareCode.decode(fallback)).people), ["Alice"]);
    let retried;
    a.window.navigator.clipboard.writeText = async value => { retried = value; };
    a.el("copyFirstScheduleLink").click();
    await a.wait(() => a.el("copyFirstScheduleLink").textContent === "Copied!");
    assert.equal(retried, fallback); assert.equal(a.el("firstScheduleLinkFallback").hidden, true);
  } finally { await a.window.happyDOM.abort(); }
});

test("closing before link generation finishes prevents late focus changes or reopening", async () => {
  const a = await app();
  try {
    const encode = a.window.WhosFreeShareCode.encode;
    let resolveLink;
    a.window.WhosFreeShareCode.encode = (...args) => new Promise(resolve => { resolveLink = async () => resolve(await encode(...args)); });
    a.manual(); await a.save();
    assert.equal(a.el("firstScheduleWelcome").hidden, false);
    a.el("closeFirstScheduleWelcome").click();
    await resolveLink();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
    assert.equal(a.window.document.activeElement.id, "mobileMenuButton");
    assert.equal(a.window.document.body.style.overflow, "");
  } finally { await a.window.happyDOM.abort(); }
});

test("every new launch with exactly one saved schedule reminds users, even with previous onboarding history", async () => {
  let storage = { [DATABASE]: JSON.stringify({ data: { people: { Alice: person } }, meta: {} }), [HISTORY]: "1" };
  for (let launch = 0; launch < 3; launch++) {
    const a = await app({ storage });
    try {
      assert.equal(a.el("firstScheduleWelcome").hidden, false);
      assert.equal(a.el("firstScheduleWelcome").dataset.reason, "single-schedule");
      assert.match(a.el("firstScheduleWelcomeBody").textContent, /one schedule saved/);
      for (const method of ["screenshots", "QR codes", "text codes", "URLs"]) assert.ok(a.el("firstScheduleWelcomeBody").textContent.includes(method));
      assert.equal(a.el("copyFirstScheduleLink").hidden, true);
      assert.equal(a.el("firstScheduleWelcomeStatus").hidden, true);
      assert.equal(a.el("importFriendsSchedules").hidden, false);
      assert.equal(a.window.document.activeElement, a.el("importFriendsSchedules"));
      a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Tab" }));
      assert.equal(a.window.document.activeElement, a.el("closeFirstScheduleWelcome"));
      a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Tab" }));
      assert.equal(a.window.document.activeElement, a.el("importFriendsSchedules"));
      a.el("mobileMenuButton").focus();
      assert.equal(a.window.document.activeElement, a.el("importFriendsSchedules"));
      const before = a.stored();
      a.el("closeFirstScheduleWelcome").click();
      for (const callback of a.intervals) callback();
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(a.el("firstScheduleWelcome").hidden, true, "live refresh does not reopen a dismissed launch reminder");
      assert.deepEqual(a.stored(), before);
      assert.equal(a.window.document.body.style.overflow, "");
      storage = a.snapshot();
    } finally { await a.window.happyDOM.abort(); }
  }
});

for (const people of [null, {}, { Alice: person, Bob: person }, { Alice: person, Bob: person, Carol: person }]) {
  test(`no launch reminder for ${people ? Object.keys(people).length : "no"} saved schedules`, async () => {
    const a = await app({ people });
    try { assert.equal(a.el("firstScheduleWelcome").hidden, true); }
    finally { await a.window.happyDOM.abort(); }
  });
}

test("the reminder's Import action opens the shared image/code importer and saving a friend does not repeat it", async () => {
  const a = await app({ people: { Alice: person } });
  try {
    const before = a.stored();
    a.el("importFriendsSchedules").click();
    await a.wait(() => a.window.document.activeElement === a.el("importScheduleImageButton"));
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
    assert.equal(a.el("scheduleModal").hidden, false);
    assert.equal(a.el("scheduleModalTitle").textContent, "Import");
    assert.equal(a.el("importCodeField").closest("[hidden]"), null);
    assert.equal(a.el("importScheduleImageButton").closest("[hidden]"), null);
    assert.deepEqual(a.stored(), before);
    a.window.WhosFreeImageParser.parseScheduleImage = async () => ({ name: "Bob", person: structuredClone(person) });
    await a.upload(); await a.save();
    assert.deepEqual(Object.keys(a.stored().data.people), ["Alice", "Bob"]);
    a.el("closeScheduleModal").click();
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
  } finally { await a.window.happyDOM.abort(); }
});

test("shared-link startup finishes before checking the count; incoming friends prevent the reminder", async () => {
  const sender = await app();
  let receiver;
  try {
    const code = await sender.window.WhosFreeShareCode.encode({ people: { Bob: person } });
    const url = sender.window.WhosFreeShareCode.createLink(code, "https://youfree.ca/");
    receiver = await app({ url, people: { Alice: person } });
    await receiver.wait(() => receiver.stored()?.data.people.Bob && receiver.el("importProgressOverlay").hidden);
    assert.equal(receiver.el("firstScheduleWelcome").hidden, true);
    assert.deepEqual(Object.keys(receiver.stored().data.people), ["Alice", "Bob"]);
  } finally { await sender.window.happyDOM.abort(); if (receiver) await receiver.window.happyDOM.abort(); }
});

test("a QR/link opened while the reminder is visible dismisses it and imports normally", async () => {
  const a = await app({ people: { Alice: person } });
  try {
    const code = await a.window.WhosFreeShareCode.encode({ people: { Bob: person } });
    a.window.location.href = a.window.WhosFreeShareCode.createLink(code, "https://youfree.ca/");
    a.window.dispatchEvent(new a.window.Event("hashchange"));
    await a.wait(() => a.stored()?.data.people.Bob && a.el("importProgressOverlay").hidden);
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
    assert.equal(a.window.document.body.style.overflow, "");
  } finally { await a.window.happyDOM.abort(); }
});

test("unreadable storage does not claim there is only one saved schedule", async () => {
  const a = await app({ storage: { [DATABASE]: "corrupt data" } });
  try { assert.equal(a.el("firstScheduleWelcome").hidden, true); }
  finally { await a.window.happyDOM.abort(); }
});

test("startup waits for an already-open main menu to close before showing the reminder", async () => {
  const a = await app({ people: { Alice: person }, beforeReady: (_window, el) => el("mobileMenuButton").click() });
  try {
    assert.equal(a.el("firstScheduleWelcome").hidden, true);
    assert.equal(a.el("mobileMenuButton").getAttribute("aria-expanded"), "true");
    a.el("closeMobileMenuButton").click();
    await a.wait(() => !a.el("firstScheduleWelcome").hidden);
    assert.equal(a.window.document.activeElement, a.el("importFriendsSchedules"));
    assert.equal(a.el("firstScheduleWelcome").hasAttribute("inert"), false);
  } finally { await a.window.happyDOM.abort(); }
});

test("a duplicate shared link still reminds the user when only one schedule remains", async () => {
  const sender = await app();
  let receiver;
  try {
    const code = await sender.window.WhosFreeShareCode.encode({ people: { Alice: person } });
    const url = sender.window.WhosFreeShareCode.createLink(code, "https://youfree.ca/");
    receiver = await app({ url, people: { Alice: person } });
    await receiver.wait(() => !receiver.el("firstScheduleWelcome").hidden);
    assert.equal(receiver.el("firstScheduleWelcome").dataset.reason, "single-schedule");
    assert.deepEqual(Object.keys(receiver.stored().data.people), ["Alice"]);
    assert.equal(receiver.el("importProgressOverlay").hidden, true);
  } finally { await sender.window.happyDOM.abort(); if (receiver) await receiver.window.happyDOM.abort(); }
});

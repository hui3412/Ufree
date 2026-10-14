import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

const base = "https://hui3412.github.io/Ufree/";
const data = { people: {
  Alice: { semester: "Fall 2026", classes: [
    { day: "Monday", start: "08:00", end: "09:00", course: "Calculus", room: "A-123", instructor: "Anna de la Cruz", course_code: "201-NYA", section: "01" },
    { day: "Monday", start: "09:05", end: "10:00", course: "Physics", room: "B-123" },
  ] },
  Bob: { semester: "Fall 2026", classes: [{ day: "Tuesday", start: "09:00", end: "10:00", course: "English", room: "C-123" }] },
} };
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

async function app(initial = data, groups = [{ id: "team", name: "Team", members: ["Bob"], hidden: false }]) {
  const window = new Window({ url: base, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  const stylesheet = window.document.createElement("style");
  stylesheet.textContent = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  window.document.head.append(stylesheet);
  window.setInterval = () => 0;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  Object.assign(window, { TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  let copied, confirmMessage;
  window.confirm = message => { confirmMessage = message; return true; };
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async value => { copied = value; } }, configurable: true });
  window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: initial, meta: {} }));
  window.localStorage.setItem("whos-free-view-mode-v1", "all");
  window.localStorage.setItem("whos-free-groups-v1", JSON.stringify({ groups, showGroups: false, hideUngrouped: false }));
  window.localStorage.setItem("whos-free-people-preferences-v1", JSON.stringify({ nicknames: { Alice: "Ali" }, pinnedPeople: ["Alice"] }));
  window.localStorage.setItem("whos-free-notification-settings-v1", JSON.stringify({ enabled: false, mutedPeople: ["Alice"] }));
  const scrolls = [];
  window.HTMLElement.prototype.scrollIntoView = function() { scrolls.push(this.id); };
  for (const filename of ["schedule-availability.js", "schedule-groups.js", "schedule-share-code.js", "assets/qr/qrcodegen.js", "app.js"]) {
    window.eval(fs.readFileSync(new URL("../" + filename, import.meta.url), "utf8"));
  }
  const el = id => window.document.getElementById(id);
  const wait = async predicate => {
    for (let i = 0; i < 150; i++) { if (predicate()) return; await tick(); }
    throw Error("UI operation did not finish");
  };
  const card = name => [...el("peopleList").querySelectorAll(".person-card")].find(item => item.dataset.person === name);
  await wait(() => card("Alice"));
  return { window, el, wait, card, scrolls, copied: () => copied, confirmMessage: () => confirmMessage, stored: () => window.localStorage.getItem("whos-free-local-schedules") };
}

test("card sharing is a separate accessible action and all three methods export only that person", async () => {
  const a = await app();
  try {
    const before = a.stored();
    assert.equal(a.window.document.querySelectorAll("button button").length, 0);
    a.card("Alice").querySelector(".person-card-share").click();
    assert.equal(a.el("personQuickShareModal").hidden, false);
    assert.equal(a.el("personQuickShareTitle").textContent, "Share Ali");
    assert.equal(a.el("detailPanel").querySelector(".detail-name-row"), null, "sharing does not select a card");
    for (const id of ["personQuickUrlButton", "personQuickQrButton", "personQuickCodeButton"]) assert.ok(a.el(id).querySelector("svg"));
    a.el("personQuickCodeButton").click();
    await a.wait(() => !a.el("personQuickCodeButton").disabled);
    const code = a.el("personQuickCode").value;
    assert.deepEqual(Object.keys((await a.window.WhosFreeShareCode.decode(code)).people), ["Alice"]);
    assert.equal(a.el("personQuickCodeField").hidden, false);
    a.el("copyPersonQuickCode").click(); await tick(); assert.equal(a.copied(), code);
    a.el("personQuickUrlButton").click(); await a.wait(() => !a.el("personQuickUrlButton").disabled);
    const url = a.el("personQuickSharePanel").querySelector("textarea").value;
    assert.equal(a.copied(), url);
    assert.deepEqual(Object.keys((await a.window.WhosFreeShareCode.decode(url)).people), ["Alice"]);
    a.el("personQuickQrButton").click(); await a.wait(() => !a.el("personQuickQrButton").disabled);
    assert.ok(a.el("personQuickQr").querySelector("svg"));
    assert.equal(a.window.getComputedStyle(a.el("personQuickSharePanel").querySelector(".share-link-field")).display, "none", "QR mode hides the URL field even when field-group sets display:flex");
    assert.equal(a.el("personQuickQrButton").getAttribute("aria-expanded"), "true");
    assert.equal(a.el("personQuickCodeField").hidden, true);
    assert.ok(a.el("personQuickQrButton").querySelector("svg"), "QR state does not replace the sharing symbol");
    assert.equal(a.stored(), before);
  } finally { await a.window.happyDOM.abort(); }
});

test("single-person field selection and clipboard fallback preserve the full canonical schedule", async () => {
  const a = await app();
  try {
    a.card("Alice").querySelector(".person-card-share").click();
    a.el("personQuickExportFields").querySelector(".export-include-all").click();
    a.window.navigator.clipboard.writeText = async () => { throw Error("Denied"); };
    a.el("personQuickUrlButton").click(); await a.wait(() => !a.el("personQuickUrlButton").disabled);
    const output = a.el("personQuickSharePanel").querySelector("textarea");
    assert.equal(a.window.document.activeElement, output);
    assert.equal(output.selectionEnd, output.value.length);
    const decoded = await a.window.WhosFreeShareCode.decode(output.value);
    assert.deepEqual(Object.keys(decoded.people), ["Alice"]);
    assert.equal(decoded.people.Alice.classes[0].instructor, "Anna de la Cruz");
    assert.equal(decoded.people.Alice.classes[0].course_code, "201-NYA");
    assert.equal(decoded.people.Alice.semester, "Fall 2026");
  } finally { await a.window.happyDOM.abort(); }
});

test("closing during export cancels stale results, restores focus, and does not leak into another person's share", async () => {
  const a = await app();
  try {
    const encode = a.window.WhosFreeShareCode.encode;
    const code = await encode({ people: { Alice: data.people.Alice } });
    let finish;
    a.window.WhosFreeShareCode.encode = () => new Promise(resolve => { finish = resolve; });
    const share = a.card("Alice").querySelector(".person-card-share");
    share.click(); a.el("personQuickCodeButton").click();
    a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(a.el("personQuickShareModal").hidden, true);
    assert.equal(a.window.document.activeElement, share);
    a.card("Bob").querySelector(".person-card-share").click();
    finish(code); await tick();
    assert.equal(a.el("personQuickShareTitle").textContent, "Share Bob");
    assert.equal(a.el("personQuickCode").value, "");
    assert.equal(a.el("personQuickCodeField").hidden, true);
    assert.equal(a.el("personQuickCodeButton").disabled, false);
    a.window.WhosFreeShareCode.encode = async () => { throw Error("Compression unavailable"); };
    a.el("personQuickCodeButton").click(); await a.wait(() => !a.el("personQuickCodeButton").disabled);
    assert.equal(a.el("personQuickShareStatus").dataset.tone, "error");
    a.window.WhosFreeShareCode.encode = encode;
    a.el("personQuickCodeButton").click(); await a.wait(() => !a.el("personQuickCodeButton").disabled);
    assert.deepEqual(Object.keys((await a.window.WhosFreeShareCode.decode(a.el("personQuickCode").value)).people), ["Bob"]);
  } finally { await a.window.happyDOM.abort(); }
});

test("the expanded detail plus adds only the selected person to an existing group", async () => {
  const a = await app();
  try {
    const before = a.stored();
    assert.equal(a.el("addPersonGroupButton"), null);
    a.card("Alice").querySelector(".person-select-button").click(); await tick();
    assert.ok(a.scrolls.includes("detailPanel"));
    assert.ok(a.el("fullScheduleButton")); assert.ok(a.el("deletePersonScheduleButton").querySelector("svg"));
    a.el("addPersonGroupButton").click();
    assert.equal(a.el("personGroupModal").hidden, false);
    a.el("personGroupSelect").value = "team";
    a.el("personGroupForm").dispatchEvent(new a.window.Event("submit", { bubbles: true, cancelable: true }));
    const groups = JSON.parse(a.window.localStorage.getItem("whos-free-groups-v1")).groups;
    assert.deepEqual(groups[0].members, ["Bob", "Alice"]);
    assert.equal(a.el("personGroupModal").hidden, true);
    assert.equal(a.window.document.activeElement, a.el("addPersonGroupButton"));
    assert.equal(a.stored(), before);
    a.el("addPersonGroupButton").click();
    assert.equal(a.el("savePersonGroup").disabled, true);
    assert.match(a.el("personGroupEmpty").textContent, /already belongs/);
  } finally { await a.window.happyDOM.abort(); }
});

test("an empty group picker explains the requirement and traps focus without changing schedules", async () => {
  const a = await app(data, []);
  try {
    a.card("Alice").click(); a.el("addPersonGroupButton").click();
    assert.equal(a.el("savePersonGroup").disabled, true);
    assert.match(a.el("personGroupEmpty").textContent, /Create a group/);
    assert.equal(a.window.getComputedStyle(a.el("personGroupField")).display, "none", "the empty group's select is actually hidden");
    a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(a.window.document.activeElement, a.el("personGroupManage"));
    a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(a.el("personGroupModal").hidden, true);
    assert.equal(a.window.document.body.style.overflow, "");
  } finally { await a.window.happyDOM.abort(); }
});

test("detail deletion respects cancellation and removes only the selected person's local data; Undo restores it", async () => {
  const a = await app(data, [{ id: "team", name: "Team", members: ["Alice", "Bob"], hidden: false }]);
  try {
    const before = a.stored();
    a.card("Alice").click();
    a.window.confirm = () => false;
    a.el("deletePersonScheduleButton").click(); await tick(); assert.equal(a.stored(), before);
    a.window.confirm = () => true;
    a.el("deletePersonScheduleButton").click();
    await a.wait(() => !a.card("Alice"));
    assert.deepEqual(Object.keys(JSON.parse(a.stored()).data.people), ["Bob"]);
    assert.equal(a.el("deletePersonScheduleButton"), null);
    assert.deepEqual(JSON.parse(a.window.localStorage.getItem("whos-free-groups-v1")).groups[0].members, ["Bob"]);
    assert.equal(JSON.parse(a.window.localStorage.getItem("whos-free-people-preferences-v1")).nicknames.Alice, undefined);
    a.el("undoChangesButton").click(); await a.wait(() => a.card("Alice"));
    assert.deepEqual(plain(JSON.parse(a.stored()).data), data);
    assert.deepEqual(JSON.parse(a.window.localStorage.getItem("whos-free-groups-v1")).groups[0].members, ["Alice", "Bob"]);
    assert.equal(a.card("Alice").querySelector(".person-name").textContent.trim(), "Ali 📌");
  } finally { await a.window.happyDOM.abort(); }
});

test("deleting the final person clears local schedules and remains undoable", async () => {
  const a = await app({ people: { Alice: data.people.Alice } }, []);
  try {
    a.card("Alice").click(); a.el("deletePersonScheduleButton").click();
    await a.wait(() => a.stored() === null);
    assert.equal(a.el("deletePersonScheduleButton"), null);
    assert.ok(a.el("peopleList").querySelector(".data-setup"));
    a.el("undoChangesButton").click(); await a.wait(() => a.card("Alice"));
    assert.equal(JSON.parse(a.stored()).data.people.Alice.classes.length, 2);
  } finally { await a.window.happyDOM.abort(); }
});

test("name-button keyboard reordering still preserves pins and supports Undo after adding separate share controls", async () => {
  const a = await app({ people: { ...data.people, Charlie: { semester: "Fall 2026", classes: [] } } });
  try {
    a.card("Bob").querySelector(".person-select-button").dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
    const names = () => [...a.el("peopleList").querySelectorAll(".person-card")].map(card => card.dataset.person);
    assert.deepEqual(names(), ["Alice", "Charlie", "Bob"]);
    assert.equal(a.window.document.activeElement, a.card("Bob"));
    a.el("undoChangesButton").click(); await a.wait(() => names()[1] === "Bob");
    assert.deepEqual(names(), ["Alice", "Bob", "Charlie"]);
    a.card("Bob").querySelector(".person-card-share").dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
    assert.deepEqual(names(), ["Alice", "Bob", "Charlie"]);
  } finally { await a.window.happyDOM.abort(); }
});

test("Class Soon, collapsed people, removed summary/forecast, UFree identity, and exact bottom credits", async () => {
  const a = await app();
  try {
    assert.equal(a.window.document.title, "UFree");
    assert.equal(a.window.document.querySelector("h1").textContent, "UFree");
    assert.equal(JSON.parse(fs.readFileSync(new URL("../manifest.webmanifest", import.meta.url))).name, "UFree");
    assert.equal(a.el("statusLine"), null); assert.equal(a.el("freeCount"), null);
    a.el("scheduleDataButton").click(); assert.equal(a.el("storedPeopleSection").open, false);
    a.el("storedPeopleSection").open = true; a.el("closeScheduleModal").click();
    a.el("scheduleDataButton").click(); assert.equal(a.el("storedPeopleSection").open, false); a.el("closeScheduleModal").click();
    a.el("showGroupsToggle").click(); assert.equal(a.el("peopleList").querySelector(".people-group-header p"), null);
    a.el("showGroupsToggle").click();
    a.el("daySelect").value = "Monday"; a.el("daySelect").dispatchEvent(new a.window.Event("change", { bubbles: true }));
    a.el("timeInput").value = "09:02"; a.el("timeInput").dispatchEvent(new a.window.Event("change", { bubbles: true }));
    assert.equal(a.card("Alice").querySelector(".status-badge").textContent, "Class Soon");
    a.card("Alice").click(); assert.equal(a.el("detailPanel").querySelector(".status-badge").textContent, "Class Soon");
    for (const id of ["settingsModal", "helpModal"]) {
      const dialog = a.el(id).querySelector('[role="dialog"]');
      assert.equal(dialog.lastElementChild.tagName, "FOOTER");
      assert.equal(dialog.lastElementChild.textContent.replace(/\s+/g, " ").trim(), "App by David Dajbog and Hui En Quan. Inspiration from Xander Vatch.");
    }
  } finally { await a.window.happyDOM.abort(); }
});

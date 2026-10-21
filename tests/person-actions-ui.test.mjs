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

async function app(initial = data, groups = [{ id: "team", name: "Team", members: ["Bob"], hidden: false }], mobile = false, options = {}) {
  const window = new Window({ url: base, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.happyDOM.setWindowSize({ width: mobile ? 390 : 1440, height: 900 });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  if (options.missingControl) window.document.getElementById(options.missingControl)?.remove();
  if (Object.hasOwn(options, "idbRecord")) Object.defineProperty(window, "indexedDB", { value: {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = { close() {}, transaction() { return { objectStore() { return { get() {
          const read = { result: options.idbRecord };
          queueMicrotask(() => read.onsuccess());
          return read;
        } }; } }; } };
        request.onsuccess();
      });
      return request;
    }
  }, configurable: true });
  const stylesheet = window.document.createElement("style");
  stylesheet.textContent = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  window.document.head.append(stylesheet);
  window.setInterval = () => 0;
  const mobileListeners = [];
  const mobileQuery = { matches: mobile, addEventListener(type, callback) { if (type === "change") mobileListeners.push(callback); } };
  window.matchMedia = query => query.replace(/\s/g, "") === "(max-width:900px)" ? mobileQuery : { matches: query.includes("prefers-reduced-motion") || (mobile && query.includes("max-width")), addEventListener() {} };
  const setMobile = value => {
    mobileQuery.matches = value;
    window.happyDOM.setWindowSize({ width: value ? 390 : 1440, height: 900 });
    mobileListeners.forEach(callback => callback({ matches: value }));
    window.dispatchEvent(new window.Event("resize"));
  };
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
  for (const filename of ["schedule-availability.js", "schedule-groups.js", "schedule-share-code.js", "assets/qr/qrcodegen.js", "schedule-qr-batches.js", "app.js"]) {
    window.eval(fs.readFileSync(new URL("../" + filename, import.meta.url), "utf8"));
  }
  const el = id => window.document.getElementById(id);
  const wait = async predicate => {
    for (let i = 0; i < 150; i++) { if (predicate()) return; await tick(); }
    throw Error("UI operation did not finish");
  };
  const card = name => [...el("peopleList").querySelectorAll(".person-card")].find(item => item.dataset.person === name);
  const share = name => {
    card(name).querySelector(".person-select-button").click();
    const button = el("sharePersonScheduleButton");
    button.click();
    return button;
  };
  await wait(() => card("Alice"));
  return { window, el, wait, card, share, scrolls, setMobile, copied: () => copied, confirmMessage: () => confirmMessage, stored: () => window.localStorage.getItem("whos-free-local-schedules") };
}

test("sharing appears only in the expanded four-button row and all three methods export only that person", async () => {
  const a = await app();
  try {
    const before = a.stored();
    assert.equal(a.window.document.querySelectorAll("button button").length, 0);
    assert.equal(a.el("sharePersonScheduleButton"), null);
    assert.equal(a.card("Alice").querySelector(".person-card-share"), null);
    a.share("Alice");
    assert.deepEqual([...a.el("sharePersonScheduleButton").parentElement.children].map(button => button.id), ["fullScheduleButton", "addPersonGroupButton", "deletePersonScheduleButton", "sharePersonScheduleButton"]);
    assert.equal(a.el("personQuickShareModal").hidden, false);
    assert.equal(a.el("personQuickShareTitle").textContent, "Share Ali");
    assert.equal(a.card("Alice").querySelector(".person-select-button").getAttribute("aria-pressed"), "true", "sharing preserves the selected person");
    for (const id of ["personQuickUrlButton", "personQuickQrButton", "personQuickCodeButton"]) assert.ok(a.el(id).querySelector("svg"));
    a.el("personQuickCodeButton").click();
    await a.wait(() => !a.el("personQuickCodeButton").disabled);
    const code = a.el("personQuickCode").value;
    assert.deepEqual(Object.keys((await a.window.WhosFreeShareCode.decode(code)).people), ["Alice"]);
    assert.equal(a.el("personQuickCodeField").hidden, false);
    assert.equal(a.copied(), code);
    assert.match(a.el("personQuickShareStatus").textContent, /Code copied/);
    assert.equal(a.el("copyPersonQuickCode"), null);
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
    a.share("Alice");
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
    a.el("personQuickCodeButton").click(); await a.wait(() => !a.el("personQuickCodeButton").disabled);
    const code = a.el("personQuickCode");
    assert.equal(a.el("personQuickCodeField").hidden, false);
    assert.equal(a.window.document.activeElement, code);
    assert.equal(code.selectionEnd, code.value.length);
    assert.match(a.el("personQuickShareStatus").textContent, /Select and copy/);
    const codeData = await a.window.WhosFreeShareCode.decode(code.value);
    assert.equal(codeData.people.Alice.classes[0].instructor, "Anna de la Cruz");
  } finally { await a.window.happyDOM.abort(); }
});

test("a delayed clipboard failure does not steal focus or leak status into a different person's share", async () => {
  const a = await app();
  try {
    let failCopy;
    a.window.navigator.clipboard.writeText = () => new Promise((_, reject) => { failCopy = reject; });
    a.share("Alice"); a.el("personQuickCodeButton").click();
    await a.wait(() => Boolean(failCopy));
    a.el("closePersonQuickShare").click(); a.share("Bob");
    failCopy(Error("Denied")); await tick();
    assert.equal(a.el("personQuickShareTitle").textContent, "Share Bob");
    assert.equal(a.el("personQuickCode").value, "");
    assert.equal(a.el("personQuickShareStatus").textContent, "");
    assert.equal(a.window.document.activeElement, a.el("closePersonQuickShare"));
    assert.equal(a.el("personQuickCodeButton").disabled, false);
  } finally { await a.window.happyDOM.abort(); }
});

test("closing during export cancels stale results, restores focus, and does not leak into another person's share", async () => {
  const a = await app();
  try {
    const encode = a.window.WhosFreeShareCode.encode;
    const code = await encode({ people: { Alice: data.people.Alice } });
    let finish;
    a.window.WhosFreeShareCode.encode = () => new Promise(resolve => { finish = resolve; });
    const share = a.share("Alice");
    a.el("personQuickCodeButton").click();
    a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(a.el("personQuickShareModal").hidden, true);
    assert.equal(a.window.document.activeElement, share);
    a.share("Bob");
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
    a.el("liveToggle").dispatchEvent(new a.window.Event("change", { bubbles: true }));
    const refreshedShare = a.el("sharePersonScheduleButton");
    assert.equal(refreshedShare?.getAttribute("aria-label"), "Share Bob's schedule");
    a.el("closePersonQuickShare").click();
    assert.equal(a.window.document.activeElement === refreshedShare, true, `focus returns to the current expanded share button after a refresh (focused ${a.window.document.activeElement?.tagName}.${a.window.document.activeElement?.className})`);
  } finally { await a.window.happyDOM.abort(); }
});

test("the expanded detail plus adds only the selected person to an existing group", async () => {
  const a = await app(data, [{ id: "team", name: "Team", members: ["Bob"], hidden: false }], true);
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
    a.card("Bob").querySelector(".person-select-button").click();
    a.el("sharePersonScheduleButton").dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
    assert.deepEqual(names(), ["Alice", "Bob", "Charlie"]);
  } finally { await a.window.happyDOM.abort(); }
});

test("Class Soon, collapsed people, removed summary/forecast, UFree identity, and exact bottom credits", async () => {
  const a = await app();
  try {
    assert.equal(a.window.document.title, "UFree");
    assert.equal(a.window.document.querySelector("h1").textContent, "UFree?");
    assert.equal(a.window.document.querySelector("h1 img").alt, "");
    assert.match(a.window.document.querySelector("h1 img").getAttribute("src"), /UFreeLogo_SVG\.svg/);
    assert.equal(JSON.parse(fs.readFileSync(new URL("../manifest.webmanifest", import.meta.url))).name, "UFree");
    assert.equal(a.el("statusLine"), null); assert.equal(a.el("freeCount"), null);
    a.el("scheduleDataButton").click();
    const toggle = a.el("storedPeopleToggle"), list = a.el("peopleManagerList");
    assert.equal(list.hidden, true); assert.equal(toggle.textContent, "Show");
    toggle.click(); assert.equal(list.hidden, false); assert.equal(toggle.textContent, "Hide");
    assert.equal(toggle.getAttribute("aria-expanded"), "true"); assert.equal(toggle.getAttribute("aria-label"), "Hide stored people");
    toggle.click(); assert.equal(list.hidden, true); assert.equal(toggle.textContent, "Show");
    toggle.click(); a.el("closeScheduleModal").click();
    a.el("scheduleDataButton").click(); assert.equal(list.hidden, true); assert.equal(toggle.getAttribute("aria-expanded"), "false"); a.el("closeScheduleModal").click();
    a.el("showGroupsToggle").click(); assert.equal(a.el("peopleList").querySelector(".people-group-header p"), null);
    a.el("showGroupsToggle").click();
    a.el("daySelect").value = "Monday"; a.el("daySelect").dispatchEvent(new a.window.Event("change", { bubbles: true }));
    a.el("timeInput").value = "09:02"; a.el("timeInput").dispatchEvent(new a.window.Event("change", { bubbles: true }));
    assert.equal(a.card("Alice").querySelector(".status-badge").textContent, "Class Soon");
    a.card("Alice").click(); assert.equal(a.el("detailPanel").querySelector(".status-badge").textContent, "Class Soon");
    for (const id of ["settingsModal", "helpModal"]) {
      const dialog = a.el(id).querySelector('[role="dialog"]');
      const credits = dialog.querySelector(".site-legal-links");
      assert.equal(dialog.lastElementChild, credits);
      assert.equal(dialog.querySelector(".creator-credit"), null);
      assert.deepEqual([...credits.querySelectorAll("small")].map(node => node.textContent), ["© 2026 David Dajbog and Hui En Qian. All rights reserved.", "Inspiration from Xander Vatch."]);
      assert.ok(credits.querySelector('a[href="legal.html#privacy"]'));
      assert.ok(credits.querySelector('a[href="legal.html#terms"]'));
    }
  } finally { await a.window.happyDOM.abort(); }
});

test("Help opens without the removed iOS guide, restores focus and allows page scrolling after close", async () => {
  const a = await app();
  try {
    a.el("helpButton").click();
    assert.equal(a.el("helpModal").hidden, false);
    assert.equal(a.el("helpTitle").textContent, "Help & Tips");
    assert.equal(a.el("iosShortcutGuide"), null);
    assert.equal(a.window.document.body.style.overflow, "hidden");
    a.el("closeHelpModal").click();
    assert.equal(a.window.document.activeElement.id, "mobileMenuButton");
    assert.equal(a.window.document.body.style.overflow, "");
    a.el("helpButton").click();
    assert.equal(a.el("helpModal").hidden, false);
    a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(a.el("helpModal").hidden, true);
    const before = a.stored();
    let wheelReachedPage = false;
    a.window.document.addEventListener("wheel", event => { wheelReachedPage = !event.defaultPrevented; }, { once: true });
    a.card("Alice").dispatchEvent(new a.window.WheelEvent("wheel", { deltaY: 400, bubbles: true, cancelable: true }));
    assert.equal(wheelReachedPage, true);
    for (const selector of [".people-panel", ".people-list", ".detail-panel"]) {
      assert.equal(a.window.getComputedStyle(a.window.document.querySelector(selector)).overflow, "visible");
    }
    assert.equal(a.stored(), before);
  } finally { await a.window.happyDOM.abort(); }
});

test("search opens below the controls, matches canonical names and nicknames, and clears without changing data", async () => {
  const a = await app();
  try {
    const before = a.stored();
    const input = a.el("peopleSearchInput"), button = a.el("peopleSearchButton");
    assert.equal(a.el("showGroupsToggle").nextElementSibling, button);
    assert.equal(a.el("peopleSearchPanel").hidden, true);
    button.click();
    assert.equal(button.getAttribute("aria-expanded"), "true"); assert.equal(a.window.document.activeElement, input);
    input.value = "  ALI  "; input.dispatchEvent(new a.window.Event("input", { bubbles: true }));
    assert.ok(a.card("Alice")); assert.equal(a.card("Bob"), undefined);
    assert.match(a.el("peopleSearchStatus").textContent, /^1 matching person/);
    input.value = "Alice"; input.dispatchEvent(new a.window.Event("input", { bubbles: true })); assert.ok(a.card("Alice"));
    input.value = "<nothing>"; input.dispatchEvent(new a.window.Event("input", { bubbles: true }));
    assert.match(a.el("peopleList").textContent, /No matching people/);
    a.el("clearPeopleSearchButton").click(); assert.ok(a.card("Alice")); assert.ok(a.card("Bob"));
    input.value = "Bob"; input.dispatchEvent(new a.window.Event("input", { bubbles: true }));
    input.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(a.el("peopleSearchPanel").hidden, true); assert.equal(input.value, "");
    assert.equal(a.window.document.activeElement, button); assert.ok(a.card("Alice"));
    assert.equal(a.stored(), before);
  } finally { await a.window.happyDOM.abort(); }
});

test("search respects free filters, group membership and accented multiword names without removing stored people", async () => {
  const initial = plain(data); initial.people["Éloïse Chen"] = { classes: [] };
  const a = await app(initial, [{id:"team",name:"Team",members:["Alice","Bob","Éloïse Chen"],hidden:false}]);
  try {
    const input = a.el("peopleSearchInput"); a.el("peopleSearchButton").click();
    const query = value => { input.value = value; input.dispatchEvent(new a.window.Event("input", { bubbles: true })); };
    query("chen eloise"); assert.ok(a.card("Éloïse Chen")); assert.equal(a.el("peopleList").querySelectorAll(".person-card").length, 1);
    a.el("showGroupsToggle").click(); assert.ok(a.card("Éloïse Chen"));
    assert.equal(a.el("peopleList").querySelectorAll(".people-group").length, 1);
    query("nonexistent"); assert.match(a.el("peopleList").textContent, /No matching people/);
    query("Alice"); a.el("liveToggle").checked = false; a.el("liveToggle").dispatchEvent(new a.window.Event("change", { bubbles: true }));
    a.el("daySelect").value = "Monday"; a.el("daySelect").dispatchEvent(new a.window.Event("change", { bubbles: true }));
    a.el("timeInput").value = "08:30"; a.el("timeInput").dispatchEvent(new a.window.Event("change", { bubbles: true }));
    a.el("viewToggleButton").click(); assert.equal(a.card("Alice"), undefined);
    a.el("viewToggleButton").click(); assert.ok(a.card("Alice"));
    assert.deepEqual(JSON.parse(a.window.localStorage.getItem("whos-free-groups-v1")).groups[0].members, ["Alice","Bob","Éloïse Chen"]);
  } finally { await a.window.happyDOM.abort(); }
});

test("icon-only group management edits groups; their options menu contains no duplicate edit action", async () => {
  const groups = [{ id:"team",name:"Team",members:["Alice","Bob"],hidden:false },{ id:"other",name:"Other",members:["Bob"],hidden:false }];
  const a = await app(data, groups);
  try {
    const before = a.stored(); a.el("showGroupsToggle").click();
    const section = a.el("peopleList").querySelector('[data-group-id="team"]');
    section.querySelector("details").open = true;
    assert.deepEqual([...section.querySelectorAll(".group-options-panel button")].map(button => button.textContent), ["Send group to top", "Weekly availability", "Share Group"]);
    assert.equal(a.el("manageGroupsButton").textContent.trim(), ""); assert.ok(a.el("manageGroupsButton").querySelector("svg"));
    assert.equal(a.el("manageGroupsButton").getAttribute("aria-label"), "Manage groups");
    a.el("manageGroupsButton").click(); a.el("groupsManagerList").querySelector('[aria-label="Edit group Team"]').click();
    assert.equal(a.el("groupsModal").hidden, false); assert.equal(a.el("groupNameInput").value, "Team");
    assert.equal(a.el("groupMembersList").querySelectorAll(".group-member-row").length, 2);
    const remove = a.el("groupMembersList").querySelector('[data-person="Bob"] button');
    assert.equal(remove.textContent.trim(), ""); assert.ok(remove.querySelector("svg")); assert.ok(remove.classList.contains("person-delete-button"));
    remove.click();
    assert.equal(a.el("groupMembersList").querySelectorAll(".group-member-row").length, 1);
    assert.deepEqual(JSON.parse(a.window.localStorage.getItem("whos-free-groups-v1")).groups[0].members, ["Alice","Bob"]);
    a.el("groupNameInput").value = "Study team";
    a.el("groupForm").dispatchEvent(new a.window.Event("submit", { bubbles: true, cancelable: true }));
    const saved = JSON.parse(a.window.localStorage.getItem("whos-free-groups-v1")).groups;
    assert.deepEqual(saved[0],{ id:"team",name:"Study team",members:["Alice"],hidden:false });
    assert.deepEqual(saved[1],groups[1]); assert.equal(a.stored(), before);
    a.el("closeGroupsModal").click();
    assert.equal(a.window.document.activeElement.id, "manageGroupsButton");
    const restored = await app(data, saved);
    try { restored.el("showGroupsToggle").click(); const row=restored.el("peopleList").querySelector('[data-group-id="team"]'); assert.equal(row.querySelectorAll(".person-card").length,1); }
    finally { await restored.window.happyDOM.abort(); }
  } finally { await a.window.happyDOM.abort(); }
});

test("cancel and close discard group drafts, duplicate names are rejected, and empty groups can add people again", async () => {
  const groups = [{id:"team",name:"Team",members:["Alice"],hidden:false},{id:"other",name:"Other",members:["Bob"],hidden:false}];
  const a=await app(data,groups);
  try {
    a.el("showGroupsToggle").click();
    const edit=()=>{a.el("manageGroupsButton").click(); a.el("groupsManagerList").querySelector('[aria-label="Edit group Team"]').click();};
    edit(); a.el("groupMembersList").querySelector(".group-remove-member").click(); a.el("groupNameInput").value="Other";
    a.el("groupForm").dispatchEvent(new a.window.Event("submit",{bubbles:true,cancelable:true})); assert.match(a.el("groupFormError").textContent,/already uses/);
    a.el("cancelGroupButton").click(); a.el("closeGroupsModal").click(); edit(); assert.equal(a.el("groupMembersList").querySelectorAll(".group-member-row").length,1);
    a.el("groupMembersList").querySelector(".group-remove-member").click(); a.el("closeGroupsModal").click(); edit(); assert.equal(a.el("groupMembersList").querySelectorAll(".group-member-row").length,1);
    a.el("groupMembersList").querySelector(".group-remove-member").click(); a.el("groupForm").dispatchEvent(new a.window.Event("submit",{bubbles:true,cancelable:true}));
    assert.deepEqual(JSON.parse(a.window.localStorage.getItem("whos-free-groups-v1")).groups[0].members,[]);
    a.el("closeGroupsModal").click(); edit();
    const additions=a.el("groupMembersList").querySelector("details"); additions.open=true;
    const add=additions.querySelector('input[data-person="Bob"]'); add.checked=true; add.dispatchEvent(new a.window.Event("change",{bubbles:true}));
    a.el("groupForm").dispatchEvent(new a.window.Event("submit",{bubbles:true,cancelable:true}));
    assert.deepEqual(JSON.parse(a.window.localStorage.getItem("whos-free-groups-v1")).groups[0].members,["Bob"]);
    a.el("newGroupButton").click(); a.el("groupNameInput").value="New"; const select=a.el("groupMembersList").querySelector('input[data-person="Alice"]'); select.checked=true;
    a.el("groupForm").dispatchEvent(new a.window.Event("submit",{bubbles:true,cancelable:true}));
    assert.deepEqual(JSON.parse(a.window.localStorage.getItem("whos-free-groups-v1")).groups.find(group=>group.name==="New").members,["Alice"]);
  } finally { await a.window.happyDOM.abort(); }
});

test("leaving search closes and clears it, while using its clear button keeps it open", async () => {
  const a = await app();
  try {
    const input = a.el("peopleSearchInput"), panel = a.el("peopleSearchPanel");
    const query = text => { input.value = text; input.dispatchEvent(new a.window.Event("input", { bubbles: true })); };
    a.el("peopleSearchButton").click(); query("Alice");
    a.el("clearPeopleSearchButton").focus(); await tick();
    assert.equal(panel.hidden, false);
    a.el("clearPeopleSearchButton").click(); await tick();
    assert.equal(panel.hidden, false); assert.equal(a.window.document.activeElement, input);
    query("Bob"); a.el("mobileMenuButton").focus(); await a.wait(() => panel.hidden);
    assert.equal(input.value, ""); assert.equal(a.el("peopleSearchButton").getAttribute("aria-expanded"), "false");
    assert.equal(a.window.document.activeElement, a.el("mobileMenuButton")); assert.ok(a.card("Alice")); assert.ok(a.card("Bob"));
    a.el("peopleSearchButton").click(); assert.equal(panel.hidden, false); assert.equal(a.window.document.activeElement, input);
    a.el("peopleSearchButton").focus(); await a.wait(() => panel.hidden);
    a.el("peopleSearchButton").click(); assert.equal(panel.hidden, false);
    query("Alice"); a.card("Alice").querySelector(".person-select-button").focus(); await a.wait(() => panel.hidden);
    assert.equal(a.window.document.activeElement.closest(".person-card").dataset.person, "Alice"); assert.ok(a.card("Bob"));
  } finally { await a.window.happyDOM.abort(); }
});

test("outside pointer clicks finish selecting people before search closes, and blank-area clicks also dismiss it", async () => {
  const a = await app();
  try {
    const input = a.el("peopleSearchInput"), panel = a.el("peopleSearchPanel"), before = a.stored();
    a.el("peopleSearchButton").click(); input.value = "Alice"; input.dispatchEvent(new a.window.Event("input", { bubbles: true }));
    const person = a.card("Alice").querySelector(".person-select-button");
    person.dispatchEvent(new a.window.Event("pointerdown", { bubbles: true })); person.focus(); await tick();
    assert.equal(panel.hidden, false, "the pressed card must stay in place until the click finishes");
    person.dispatchEvent(new a.window.Event("pointerup", { bubbles: true })); person.click(); await a.wait(() => panel.hidden);
    assert.ok(a.card("Alice").classList.contains("selected")); assert.ok(a.card("Bob")); assert.equal(input.value, "");
    a.el("peopleSearchButton").click(); input.value = "Bob"; input.dispatchEvent(new a.window.Event("input", { bubbles: true }));
    a.window.document.querySelector("h1").click(); await a.wait(() => panel.hidden);
    assert.equal(input.value, ""); assert.equal(a.stored(), before);
  } finally { await a.window.happyDOM.abort(); }
});



for (const mobile of [false, true]) test(`${mobile ? "mobile" : "desktop"} menu isolates the background, traps focus and restores page scrolling on Escape and outside tap`, async () => {
  const a = await app(data, [], mobile);
  try {
    const before = a.stored(), menu = a.el("homeNavigation"), toggle = a.el("mobileMenuButton");
    assert.equal(menu.hasAttribute("inert"), true);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    a.window.document.body.style.overflow = "auto";
    toggle.click();
    assert.equal(menu.getAttribute("role"), "dialog");
    assert.equal(menu.getAttribute("aria-modal"), "true");
    assert.equal(menu.hasAttribute("inert"), false);
    assert.equal(a.window.document.querySelector(".main-grid").hasAttribute("inert"), true);
    assert.equal(a.window.document.body.style.overflow, "hidden");
    assert.equal(a.el("scheduleFileInput").hasAttribute("inert"), true);
    assert.equal(a.window.document.activeElement.id, "closeMobileMenuButton");
    const sendKey = (key, shiftKey = false) => a.window.document.activeElement.dispatchEvent(new a.window.KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
    sendKey("Tab", true);
    assert.equal(a.window.document.activeElement.id, "languageToggleButton", "the last enabled sidebar action includes the language control");
    sendKey("Tab");
    assert.equal(a.window.document.activeElement.id, "closeMobileMenuButton");
    sendKey("Escape");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(a.window.document.activeElement.id, "mobileMenuButton");
    assert.equal(a.window.document.body.style.overflow, "auto");
    assert.equal(a.window.document.querySelector(".main-grid").hasAttribute("inert"), false);
    assert.equal(a.el("scheduleFileInput").hasAttribute("inert"), false);
    toggle.click(); a.el("mobileNavBackdrop").click();
    assert.equal(menu.hasAttribute("inert"), true);
    assert.equal(a.window.document.body.style.overflow, "auto");
    assert.equal(a.stored(), before);
  } finally { await a.window.happyDOM.abort(); }
});

for (const mobile of [false, true]) test(`${mobile ? "mobile" : "desktop"} navigation reuses exactly six existing actions, closes before opening their dialogs and returns focus to the toggle`, async () => {
  const a = await app(data, [], mobile);
  try {
    const ids = ["scheduleDataButton", "helpButton", "settingsButton", "homeExportButton", "homeImportButton", "undoChangesButton"];
    assert.deepEqual([...a.el("homeNavigation").querySelector("nav").children].map(e => e.id), ids);
    for (const id of ids) {
      assert.equal(a.window.document.querySelectorAll(`#${id}`).length, 1);
      assert.ok(a.el(id).querySelector("svg"));
      assert.ok(a.el(id).querySelector("span").textContent.trim());
    }
    for (const [action, dialog, close] of [["scheduleDataButton","scheduleModal","closeScheduleModal"],["helpButton","helpModal","closeHelpModal"],["settingsButton","settingsModal","closeSettingsModal"],["homeExportButton","scheduleModal","closeScheduleModal"],["homeImportButton","scheduleModal","closeScheduleModal"]]) {
      a.el("mobileMenuButton").click(); a.el(action).click();
      await a.wait(() => !a.el(dialog).hidden);
      assert.equal(a.el("mobileMenuButton").getAttribute("aria-expanded"), "false");
      assert.equal(a.el("mobileNavBackdrop").hidden, true);
      assert.equal(a.window.document.body.style.overflow, "hidden");
      a.el(close).click();
      assert.equal(a.el(dialog).hidden, true);
      assert.equal(a.window.document.body.style.overflow, "");
      assert.equal(a.window.document.activeElement.id, "mobileMenuButton");
    }
  } finally { await a.window.happyDOM.abort(); }
});

test("resizing between phone and desktop preserves the shared drawer and restores the background only when closed", async () => {
  const a = await app(data, [], true);
  try {
    const before = a.stored();
    a.el("mobileMenuButton").click();
    for (const mobile of [false, true, false]) {
      a.setMobile(mobile);
      assert.equal(a.el("mobileMenuButton").getAttribute("aria-expanded"), "true");
      assert.equal(a.el("homeNavigation").hasAttribute("inert"), false);
      assert.equal(a.el("homeNavigation").getAttribute("aria-modal"), "true");
      assert.equal(a.el("mobileNavBackdrop").hidden, false);
      assert.equal(a.window.document.body.style.overflow, "hidden");
      assert.equal(a.window.document.querySelector(".main-grid").hasAttribute("inert"), true);
    }
    a.el("closeMobileMenuButton").click();
    assert.equal(a.window.document.activeElement.id, "mobileMenuButton");
    assert.equal(a.el("homeNavigation").hasAttribute("inert"), true);
    assert.equal(a.el("homeNavigation").getAttribute("aria-hidden"), "true");
    assert.equal(a.el("mobileNavBackdrop").hidden, true);
    assert.equal(a.window.document.body.style.overflow, "");
    assert.equal(a.window.document.querySelector(".main-grid").hasAttribute("inert"), false);
    a.setMobile(true);
    assert.equal(a.el("homeNavigation").hasAttribute("inert"), true);
    assert.equal(a.stored(), before);
  } finally { await a.window.happyDOM.abort(); }
});

for (const mobile of [false, true]) test(`${mobile ? "mobile" : "desktop"} drawer slides from the right and keeps a bounded width`, async () => {
  const a = await app(data, [], mobile);
  try {
    const menu = a.el("homeNavigation"), style = () => a.window.getComputedStyle(menu);
    assert.equal(a.window.getComputedStyle(a.el("mobileMenuButton")).display, "inline-flex");
    assert.equal(a.window.getComputedStyle(a.el("mobileMenuButton").parentElement).justifyContent, "space-between");
    assert.equal(style().position, "fixed");
    assert.equal(style().getPropertyValue("inset"), "0 0 0 auto");
    assert.equal(style().transform, "translateX(100%)");
    if (mobile) assert.equal(style().maxWidth, `calc(${a.window.innerWidth}px - 32px)`, "phone drawer leaves some page visible");
    else {
      const cap = parseFloat(style().maxWidth);
      assert.ok(Number.isFinite(cap) && cap <= a.window.innerWidth / 2, "desktop drawer cannot exceed half the viewport");
    }
    assert.equal(style().visibility, "hidden");
    a.el("mobileMenuButton").click();
    assert.equal(style().transform, "translateX(0)");
    assert.equal(style().visibility, "visible");
    assert.equal(style().overflowY, "auto", "menu contents can scroll independently");
    assert.equal(style().touchAction, "pan-y");
    a.el("closeMobileMenuButton").click();
    assert.equal(style().visibility, "hidden");
  } finally { await a.window.happyDOM.abort(); }
});

test("a future action added to the single menu is available in both layouts and closes the drawer before running", async () => {
  const a = await app(data, [], false);
  try {
    let calls = 0;
    const button = a.window.document.createElement("button");
    button.textContent = "New action";
    button.addEventListener("click", () => { calls++; assert.equal(a.el("mobileNavBackdrop").hidden, true); });
    a.el("homeNavigation").querySelector("nav").append(button);
    for (const mobile of [false, true]) {
      a.setMobile(mobile); a.el("mobileMenuButton").click(); button.click();
      assert.equal(a.el("mobileMenuButton").getAttribute("aria-expanded"), "false");
      assert.equal(a.window.document.body.style.overflow, "");
      assert.equal(a.window.document.activeElement.id, "mobileMenuButton");
    }
    assert.equal(calls, 2);
  } finally { await a.window.happyDOM.abort(); }
});


for (const mobile of [false, true]) test(`enabled Undo works from the ${mobile ? "mobile" : "desktop"} drawer and releases the page`, async () => {
  const a = await app(data, [], mobile);
  try {
    a.card("Alice").querySelector(".person-select-button").click();
    a.el("deletePersonScheduleButton").click();
    await a.wait(() => !a.el("undoChangesButton").disabled);
    assert.equal(a.el("undoChangesButton").disabled, false);
    assert.equal(a.card("Alice"), undefined);
    a.el("mobileMenuButton").click(); a.el("undoChangesButton").click();
    await a.wait(() => a.card("Alice"));
    assert.ok(a.card("Alice"));
    assert.equal(a.el("mobileMenuButton").getAttribute("aria-expanded"), "false");
    assert.equal(a.window.document.body.style.overflow, "");
    assert.equal(a.window.document.querySelector(".main-grid").hasAttribute("inert"), false);
  } finally { await a.window.happyDOM.abort(); }
});

for (const mobile of [false, true]) test(`saved schedules still load with an incomplete ${mobile ? 'mobile' : 'desktop'} navigation shell`, async () => {
  const a = await app(data, undefined, mobile, { missingControl: 'mobileMenuButton' });
  try {
    assert.ok(a.card('Alice'));
    assert.ok(a.card('Bob'));
    assert.equal(a.window.document.documentElement.classList.contains('navigation-fallback'), true);
    assert.equal(a.el('homeNavigation').hasAttribute('inert'), false);
    a.el('scheduleDataButton').click();
    assert.equal(a.el('scheduleModal').hidden, false);
    a.el('closeScheduleModal').click();
    assert.equal(a.el('scheduleModal').hidden, true);
    assert.deepEqual(JSON.parse(a.stored()).data, data, 'loading never clears old schedules');
  } finally { await a.window.happyDOM.abort(); }
});

test('an empty IndexedDB still loads the existing localStorage schedules and preferences', async () => {
  const a = await app(data, undefined, false, { idbRecord: undefined });
  try {
    assert.ok(a.card('Alice'));
    assert.ok(a.card('Bob'));
    assert.deepEqual(JSON.parse(a.stored()).data, data);
    assert.equal(a.card('Alice').querySelector('.person-select-button').textContent.includes('Ali'), true);
    assert.deepEqual(JSON.parse(a.window.localStorage.getItem('whos-free-groups-v1')).groups[0].members, ['Bob']);
  } finally { await a.window.happyDOM.abort(); }
});

test('an existing IndexedDB record takes priority over an older fallback without merging stale people', async () => {
  const current = { people: { Alice: data.people.Alice } };
  const a = await app(data, [], false, { idbRecord: { data: current, meta: {} } });
  try {
    assert.ok(a.card('Alice'));
    assert.equal(a.card('Bob'), undefined);
    assert.deepEqual(JSON.parse(a.stored()).data, data, 'reading does not overwrite either stored copy');
  } finally { await a.window.happyDOM.abort(); }
});

test('published shell keeps the header siblings and release asset versions consistent', async () => {
  const a = await app();
  try {
    const doc = a.window.document;
    assert.equal(a.el('homeNavigation').parentElement.className, 'app-header');
    assert.equal(doc.querySelector('.brand-copy > p').parentElement.className, 'brand-copy');
    assert.equal(a.el('mobileMenuButton').closest('.brand-top-row').querySelectorAll('.brand-row').length, 1);
    assert.equal(doc.querySelectorAll('#mobileMenuButton').length, 1);
    assert.equal(doc.querySelectorAll('.header-actions > button').length, 6);
    const worker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
    const cached = new Set([...worker.matchAll(/"\.\/([^"]+)"/g)].map(match => match[1]));
    const version = new URL(doc.querySelector('script[src^="app.js"]').getAttribute('src'), base).searchParams.get('v');
    assert.ok(worker.includes(`const CACHE_NAME = "whos-free-main-shell-v${version}"`));
    assert.ok(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8').includes(`service-worker.js?v=${version}`));
    for (const element of doc.querySelectorAll('script[src], link[href], .brand-logo')) {
      const url = element.getAttribute('src') || element.getAttribute('href');
      if (!url || url.startsWith('https:')) continue;
      assert.ok(cached.has(url), `${url} must match its offline cache entry`);
    }
  } finally { await a.window.happyDOM.abort(); }
});


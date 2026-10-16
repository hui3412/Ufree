import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

async function app(data) {
  const window = new Window({ url: "https://example.test/Whos-Free/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  window.setInterval = () => 0;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.confirm = () => true;
  Object.assign(window, { TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  let copied;
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async text => { copied = text; } }, configurable: true });
  if (data) window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data, meta: {} }));
  for (const name of ["schedule-availability.js", "schedule-share-code.js", "app.js"]) window.eval(fs.readFileSync(new URL("../" + name, import.meta.url), "utf8"));
  const wait = async () => { for (let i = 0; i < 50; i++) { await new Promise(resolve => setTimeout(resolve, 20)); if (!window.document.getElementById("decodeCodeButton").disabled) return; } throw Error("operation did not finish"); };
  await wait();
  const el = id => window.document.getElementById(id);
  const prompt = async () => {
    for (let i = 0; i < 50; i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      if (!el("codeConflictPrompt").hidden) return;
    }
    throw Error("conflict prompt did not open");
  };
  const choose = action => el("codeConflictPrompt").querySelector(`[data-code-conflict-action="${action}"]`).click();
  return { window, el, wait, prompt, choose, copied: () => copied, stored: () => JSON.parse(window.localStorage.getItem("whos-free-local-schedules") || "null") };
}

test("Export includes only chosen people; Import adds new people and leaves duplicates and errors untouched", async () => {
  const person = label => ({ classes: [{ day: "Monday", start: "09:00", end: "10:00", course: label }] });
  const sender = await app({ schema_version: 1, people: { Alice: person("Keep existing Alice"), Bob: person("Bob course"), Unselected: person("Must not send") } });
  const receiver = await app({ schema_version: 1, people: { Alice: person("Keep existing Alice") } });
  try {
    sender.el("exportSchedulesButton").click();
    sender.el("generateCodeButton").click();
    assert.match(sender.el("exportCodeStatus").textContent, /Select at least one/);
    for (const name of ["Alice", "Bob"]) {
      const input = [...sender.el("exportPeopleList").querySelectorAll("input")].find(item => item.dataset.person === name);
      input.checked = true;
      input.dispatchEvent(new sender.window.Event("change"));
    }
    sender.el("generateCodeButton").click();
    await sender.wait();
    const code = sender.el("exportCodeOutput").value;
    assert.ok(code.length);
    assert.deepEqual(Object.keys((await sender.window.WhosFreeShareCode.decode(code)).people), ["Alice", "Bob"]);
    assert.equal(sender.copied(), code);
    assert.equal(sender.el("toast").textContent, "Copied");
    assert.equal(sender.el("toast").hidden, false);
    assert.match(sender.el("exportCodeStatus").textContent, /Code copied/);
    assert.equal(sender.el("copyCodeButton"), null);
    receiver.el("importCodeButton").click();
    receiver.el("importCodeInput").value = code;
    receiver.el("decodeCodeButton").click();
    await receiver.wait();
    assert.match(receiver.el("importCodeStatus").textContent, /Imported 1 schedule. Skipped 1/);
    assert.equal(receiver.stored().data.people.Alice.classes[0].course, "Keep existing Alice");
    assert.equal(receiver.stored().data.people.Bob.classes[0].course, "Bob course");
    assert.equal(receiver.stored().data.people.Unselected, undefined);
    const before = JSON.stringify(receiver.stored());
    receiver.el("decodeCodeButton").click();
    await receiver.wait();
    assert.match(receiver.el("importCodeStatus").textContent, /Imported 0 schedules. Skipped 2/);
    assert.equal(JSON.stringify(receiver.stored()), before, "duplicates must not even rewrite storage");
    receiver.el("importCodeInput").value = "broken code";
    receiver.el("decodeCodeButton").click();
    await receiver.wait();
    assert.equal(receiver.el("importCodeStatus").dataset.tone, "error");
    assert.equal(JSON.stringify(receiver.stored()), before);
    receiver.el("closeImportButton").click();
    assert.equal(receiver.el("importCodeButton").disabled, false);
    // Changing the selection clears a previously generated code.
    sender.el("selectAllSchedules").checked = true;
    sender.el("selectAllSchedules").dispatchEvent(new sender.window.Event("change"));
    assert.equal(sender.el("exportCodeOutput").value, "");
    assert.equal(sender.el("exportCodeField").hidden, true);
    sender.el("closeScheduleModal").click();
    sender.el("scheduleDataButton").click();
    assert.equal(sender.el("codeExportPanel").hidden, true);
    assert.equal(sender.el("importCodeButton").disabled, false);
  } finally { await sender.window.happyDOM.abort(); await receiver.window.happyDOM.abort(); }
});

test("a device with no schedules can import a code", async () => {
  const receiver = await app(null);
  try {
    assert.equal(receiver.el("exportSchedulesButton").disabled, true);
    assert.equal(receiver.el("importCodeButton").disabled, false);
    const code = await receiver.window.WhosFreeShareCode.encode({ people: { Friend: { classes: [] } } });
    receiver.el("importCodeButton").click();
    receiver.el("importCodeInput").value = code;
    receiver.el("decodeCodeButton").click();
    await receiver.wait();
    assert.equal(receiver.stored().data.people.Friend.classes.length, 0);
    assert.match(receiver.el("importCodeStatus").textContent, /Imported 1 schedule/);
  } finally { await receiver.window.happyDOM.abort(); }
});

test("compact export preserves local details and reimport skips without a conflict or storage write", async () => {
  const original = { people: { Student: { semester: "Fall 2026", classes: [{ day: "Monday", start: "09:07", end: "10:13", course: "Differential Calculus", course_code: "201-SN2-RE", section: "00001", room: "A-104", instructor: "Jane de la Cruz" }] } } };
  const sender = await app(original);
  try {
    const before = JSON.stringify(sender.stored());
    sender.el("exportSchedulesButton").click();
    sender.el("selectAllSchedules").checked = true;
    sender.el("selectAllSchedules").dispatchEvent(new sender.window.Event("change"));
    sender.el("generateCodeButton").click(); await sender.wait();
    const code = sender.el("exportCodeOutput").value;
    const item = (await sender.window.WhosFreeShareCode.decode(code)).people.Student.classes[0];
    assert.equal(item.course_code, null); assert.equal(item.section, null);
    assert.equal(item.instructor, null); assert.equal(item.course, "Differential Calculus");
    assert.match(sender.el("exportCodeStatus").textContent, /Fits a 1,000-character message/);
    assert.equal(JSON.stringify(sender.stored()), before);
    sender.el("closeScheduleModal").click(); sender.el("scheduleDataButton").click(); sender.el("importCodeButton").click();
    sender.el("importCodeInput").value = code; sender.el("decodeCodeButton").click(); await sender.wait();
    assert.match(sender.el("importCodeStatus").textContent, /Skipped 1 identical/);
    assert.equal(sender.el("codeConflictPrompt").hidden, true);
    assert.equal(JSON.stringify(sender.stored()), before);
  } finally { await sender.window.happyDOM.abort(); }
});

test("message-size advice covers exactly 1000 and larger codes without truncating exports", async () => {
  const sender = await app({ people: { Student: { classes: [] } } });
  try {
    sender.el("exportSchedulesButton").click();
    sender.el("selectAllSchedules").checked = true;
    sender.el("selectAllSchedules").dispatchEvent(new sender.window.Event("change"));
    for (const length of [1000, 1001]) {
      // Isolate the UI threshold; actual encoding is exercised in codec tests.
      sender.window.WhosFreeShareCode.encode = async () => "WF4B" + "中".repeat(length - 4);
      sender.el("generateCodeButton").click(); await sender.wait();
      assert.equal(sender.el("exportCodeOutput").value.length, length);
      assert.match(sender.el("exportCodeStatus").textContent, length === 1000 ? /Fits a 1,000-character message/ : /Over 1,000 characters. Select fewer schedules/);
      assert.equal(sender.copied(), sender.el("exportCodeOutput").value);
    }
  } finally { await sender.window.happyDOM.abort(); }
});

for (const clipboard of ["denied", "unavailable"]) test(`Code keeps a selectable export when the clipboard is ${clipboard}`, async () => {
  const sender = await app({ people: { Friend: { classes: [] } } });
  try {
    const before = JSON.stringify(sender.stored());
    if (clipboard === "unavailable") Object.defineProperty(sender.window.navigator, "clipboard", { value: undefined, configurable: true });
    else sender.window.navigator.clipboard.writeText = async () => { throw Error("Denied"); };
    sender.el("exportSchedulesButton").click(); sender.el("selectAllSchedules").click();
    sender.el("generateCodeButton").click(); await sender.wait();
    const output = sender.el("exportCodeOutput");
    assert.equal(sender.el("exportCodeField").hidden, false);
    assert.ok(output.value);
    assert.equal(sender.window.document.activeElement, output);
    assert.equal(output.selectionEnd, output.value.length);
    assert.match(sender.el("exportCodeStatus").textContent, /Select and copy/);
    assert.notEqual(sender.el("toast").textContent, "Copied");
    assert.equal(sender.el("generateCodeButton").disabled, false);
    assert.equal(JSON.stringify(sender.stored()), before);
  } finally { await sender.window.happyDOM.abort(); }
});

for (const choice of ["both", "replace", "old"]) test(`same-name code import offers ${choice}, saves atomically and can be undone`, async () => {
  const person = (day, course = "Course") => ({ classes: [{ day, start: "09:00", end: "10:00", course }] });
  const receiver = await app({ people: { David: person("Monday") } });
  try {
    const before = receiver.stored();
    const code = await receiver.window.WhosFreeShareCode.encode({ people: { New: person("Friday"), David: person("Monday", "Changed course") } });
    receiver.el("importCodeButton").click(); receiver.el("importCodeInput").value = code;
    receiver.el("decodeCodeButton").click(); await receiver.prompt();
    assert.equal(receiver.el("closeImportButton").disabled, true);
    assert.equal(receiver.el("undoChangesButton").disabled, true);
    assert.deepEqual(receiver.stored(), before, "nothing is persisted before all choices finish");
    assert.match(receiver.el("codeConflictMessage").textContent, /David 2/);
    assert.deepEqual([...receiver.el("codeConflictPrompt").querySelectorAll("button")].map(b => b.textContent), ["Keep both", "Replace", "Keep old one"]);
    receiver.choose(choice); await receiver.wait();
    const people = receiver.stored().data.people;
    assert.ok(people.New);
    assert.equal(people.David.classes[0].course, choice === "replace" ? "Changed course" : "Course");
    assert.equal(Boolean(people["David 2"]), choice === "both");
    assert.equal(receiver.el("codeConflictPrompt").hidden, true);
    receiver.el("closeImportButton").click();
    receiver.el("undoChangesButton").click(); await receiver.wait();
    assert.deepEqual(receiver.stored().data.people, before.data.people);
  } finally { await receiver.window.happyDOM.abort(); }
});

test("a replacement-only import saves under the canonical name and Undo restores it", async () => {
  const person = course => ({ classes: [{ day: "Monday", start: "09:00", end: "10:00", course }] });
  const receiver = await app({ people: { David: person("Old") } });
  try {
    receiver.el("settingsButton").click();
    receiver.window.document.querySelector('[aria-label="Pin David to the top"]').click();
    receiver.el("closeSettingsModal").click();
    const before = receiver.stored();
    const preferences = receiver.window.localStorage.getItem("whos-free-people-preferences-v1");
    receiver.el("importCodeButton").click();
    receiver.el("importCodeInput").value = await receiver.window.WhosFreeShareCode.encode({ people: { " DAVID ": person("New") } });
    receiver.el("decodeCodeButton").click(); await receiver.prompt(); receiver.choose("replace"); await receiver.wait();
    assert.deepEqual(Object.keys(receiver.stored().data.people), ["David"]);
    assert.equal(receiver.stored().data.people.David.classes[0].course, "New");
    assert.equal(receiver.window.localStorage.getItem("whos-free-people-preferences-v1"), preferences);
    assert.match(receiver.el("importCodeStatus").textContent, /Imported 0 schedules.*Replaced 1/);
    receiver.el("closeImportButton").click(); receiver.el("undoChangesButton").click(); await receiver.wait();
    assert.deepEqual(receiver.stored().data.people, before.data.people);
  } finally { await receiver.window.happyDOM.abort(); }
});

test("multiple conflicts ask separately and keeping only old schedules does not write or create Undo", async () => {
  const person = course => ({ classes: [{ day: "Monday", start: "09:00", end: "10:00", course }] });
  const receiver = await app({ people: { David: person("Old D"), Bob: person("Old B") } });
  try {
    const before = receiver.stored();
    receiver.el("importCodeButton").click();
    receiver.el("importCodeInput").value = await receiver.window.WhosFreeShareCode.encode({ people: { David: person("New D"), Bob: person("New B") } });
    receiver.el("decodeCodeButton").click(); await receiver.prompt();
    receiver.choose("old"); await receiver.prompt();
    assert.match(receiver.el("codeConflictMessage").textContent, /Bob/);
    receiver.window.document.dispatchEvent(new receiver.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await receiver.wait();
    assert.deepEqual(receiver.stored(), before);
    receiver.el("closeImportButton").click();
    assert.equal(receiver.el("undoChangesButton").disabled, true);
  } finally { await receiver.window.happyDOM.abort(); }
});

test("reimporting a kept-both schedule still prompts for the original name but its exact numbered name skips", async () => {
  const person = day => ({ classes: [{ day, start: "09:00", end: "10:00" }] });
  const receiver = await app({ people: { David: person("Monday") } });
  try {
    const code = await receiver.window.WhosFreeShareCode.encode({ people: { David: person("Tuesday") } });
    receiver.el("importCodeButton").click(); receiver.el("importCodeInput").value = code;
    receiver.el("decodeCodeButton").click(); await receiver.prompt(); receiver.choose("both"); await receiver.wait();
    receiver.el("decodeCodeButton").click(); await receiver.prompt();
    assert.match(receiver.el("codeConflictMessage").textContent, /David 3/);
    receiver.choose("old"); await receiver.wait();
    receiver.el("importCodeInput").value = await receiver.window.WhosFreeShareCode.encode({ people: { "David 2": receiver.stored().data.people["David 2"] } });
    receiver.el("decodeCodeButton").click(); await receiver.wait();
    assert.match(receiver.el("importCodeStatus").textContent, /Skipped 1 identical/);
  } finally { await receiver.window.happyDOM.abort(); }
});

test("PDF and JSON tools are closed behind a bottom menu without moving the earlier sections", async () => {
  const receiver = await app(null);
  try {
    const titles = [...receiver.el("scheduleModal").querySelectorAll(':scope > section > .schedule-action-section')].map(e => e.getAttribute("aria-labelledby"));
    assert.deepEqual(titles, ["addPictureTitle", "imageReviewTitle", "shareCodeTitle", "peopleManagerTitle"]);
    const menu = receiver.el("advancedScheduleOptions");
    assert.equal(menu.open, false);
    assert.equal(menu.parentElement.lastElementChild, menu);
    assert.equal(menu.querySelector("summary").getAttribute("aria-label"), "Advanced schedule options");
    for (const id of ["addSchedulePdfButton", "importSchedulesButton", "shareSchedulesButton", "removeSchedulesButton"]) assert.ok(menu.contains(receiver.el(id)));
    assert.equal(receiver.window.document.querySelector(".add-pdf, .choose-schedules"), null, "the empty state must not bypass the advanced menu");
    receiver.el("scheduleDataButton").click();
    menu.open = true;
    menu.dispatchEvent(new receiver.window.Event("toggle"));
    await receiver.wait();
    receiver.window.document.dispatchEvent(new receiver.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    assert.equal(menu.open, false);
    assert.equal(receiver.el("scheduleModal").hidden, false, "Escape closes the menu before the dialog");
    menu.open = true;
    receiver.el("closeScheduleModal").click();
    receiver.el("scheduleDataButton").click();
    assert.equal(menu.open, false, "advanced tools start hidden on each new visit");
  } finally { await receiver.window.happyDOM.abort(); }
});





test("copied confirmation uses the existing automatic toast dismissal", async () => {
  const a = await app({ people: { Friend: { classes: [] } } });
  try {
    let dismiss;
    const setTimeout = a.window.setTimeout.bind(a.window);
    a.window.setTimeout = (callback, delay, ...args) => {
      if (delay === 2600) { dismiss = callback; return 999999; }
      return setTimeout(callback, delay, ...args);
    };
    a.el("homeExportButton").click(); a.el("generateCodeButton").click(); await a.wait();
    assert.equal(a.el("toast").textContent, "Copied");
    assert.equal(a.el("toast").hidden, false);
    assert.equal(typeof dismiss, "function");
    dismiss();
    assert.equal(a.el("toast").hidden, true);
  } finally { await a.window.happyDOM.abort(); }
});

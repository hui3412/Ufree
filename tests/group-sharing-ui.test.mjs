import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

const base = "https://hui3412.github.io/Ufree/";
const person = course => ({ semester: "Fall 2026", classes: [{ day: "Monday", start: "09:00", end: "10:00", course, room: "A-123", instructor: "Full Teacher Name" }] });
const data = { people: { Alice: person("Math"), Bob: person("Physics"), Outsider: person("History") } };
const team = { id: "source-team", name: "Study team", members: ["Alice", "Bob"], hidden: false };
const plain = x => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

async function app(initial = null, groups = [], url = base) {
  const window = new Window({ url, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  const style = window.document.createElement("style"); style.textContent = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8"); window.document.head.append(style);
  let liveTick;
  window.setInterval = callback => { liveTick = callback; return 0; };
  Object.defineProperty(window.document, "hidden", { configurable: true, value: false });
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  Object.assign(window, { TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  let copied;
  Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: async value => { copied = value; } } });
  if (initial) window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: initial, meta: {} }));
  window.localStorage.setItem("whos-free-view-mode-v1", "all");
  window.localStorage.setItem("whos-free-groups-v1", JSON.stringify({ groups, showGroups: true, hideUngrouped: false }));
  for (const file of ["schedule-availability.js", "schedule-groups.js", "schedule-share-code.js", "assets/qr/qrcodegen.js", "schedule-qr-batches.js", "app.js"]) window.eval(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"));
  const el = id => window.document.getElementById(id);
  const wait = async predicate => { for (let i = 0; i < 400; i++) { if (predicate()) return; await tick(); } throw Error("Group operation did not finish"); };
  await tick(); await wait(() => el("importProgressOverlay").hidden);
  const stored = () => window.localStorage.getItem("whos-free-local-schedules");
  const prefs = () => JSON.parse(window.localStorage.getItem("whos-free-groups-v1"));
  const share = () => {
    const button = window.document.querySelector(`[aria-label="Share group ${groups[0].name}"]`);
    button.closest("details").open = true; button.click();
  };
  const openLink = async link => {
    window.location.hash = new URL(link).hash;
    window.dispatchEvent(new window.HashChangeEvent("hashchange"));
    await wait(() => !el("sharedGroupImport").hidden && el("importProgressOverlay").hidden);
  };
  return { window, el, wait, stored, prefs, share, openLink, runClock: () => liveTick(), copied: () => copied };
}

for (const sharing of ["group", "collection", "person"]) test(`Share Group remains available after closing ${sharing} QR sharing across live clock refreshes`, async () => {
  const empty = { id: "empty", name: "Empty", members: [], hidden: false };
  const other = { id: "other", name: "Other", members: ["Alice"], hidden: false };
  const a = await app(data, [team, other, empty]);
  const groupButton = name => a.window.document.querySelector(`[aria-label="Share group ${name}"]`);
  try {
    const before = a.stored(), prefs = plain(a.prefs());
    if (sharing === "group") a.share();
    else if (sharing === "collection") a.el("homeExportButton").click();
    else {
      a.el("peopleList").querySelector('[data-person="Alice"] .person-select-button').click();
      a.el("sharePersonScheduleButton").click();
    }
    const qr = a.el(sharing === "person" ? "personQuickQrButton" : "exportQrButton");
    qr.click(); await a.wait(() => !qr.disabled);
    const previous = groupButton(team.name);
    a.runClock();
    assert.notEqual(groupButton(team.name), previous, "the real live timer rerendered the group controls");
    a.el(sharing === "person" ? "closePersonQuickShare" : "closeScheduleModal").click();
    assert.equal(groupButton(team.name).disabled, false);
    assert.equal(groupButton(other.name).disabled, false);
    assert.equal(groupButton(empty.name).disabled, true, "empty groups remain unavailable");
    for (let i = 0; i < 2; i++) {
      a.share();
      assert.equal(a.el("scheduleModal").hidden, false);
      a.el("exportQrButton").click(); await a.wait(() => !a.el("exportQrButton").disabled);
      a.runClock();
      a.el("closeScheduleModal").click();
      assert.equal(groupButton(team.name).disabled, false);
    }
    assert.equal(a.stored(), before); assert.deepEqual(a.prefs(), prefs);
  } finally { await a.window.happyDOM.abort(); }
});

for (const domain of [base, "https://youfree.ca/"]) test(`Share Group is the third action and all methods export exactly its members on ${domain}`, async () => {
  const a = await app(data, [team], domain);
  try {
    const before = a.stored(), prefs = a.window.localStorage.getItem("whos-free-groups-v1");
    const menu = a.window.document.querySelector(".group-options-panel");
    assert.deepEqual([...menu.children].map(b => b.textContent), ["Send group to top", "Weekly availability", "Share Group"]);
    a.el("peopleSearchButton").click(); a.el("peopleSearchInput").value = "Alice";
    a.el("peopleSearchInput").dispatchEvent(new a.window.Event("input", { bubbles: true }));
    a.share();
    assert.equal(a.el("scheduleModalTitle").textContent, "Share group: Study team");
    assert.equal(a.el("exportSelection").hidden, true);
    for (const action of ["generateCodeButton", "exportQrButton", "copyExportLinkButton"]) {
      a.el(action).click(); await a.wait(() => !a.el("generateCodeButton").disabled);
      const code = a.el("exportCodeOutput").value;
      assert.match(code, /^WF7/);
      const incoming = await a.window.WhosFreeShareCode.decode(code);
      assert.deepEqual(Object.keys(incoming.people), ["Alice", "Bob"]);
      assert.deepEqual(plain(incoming.shared_group), { id: team.id, name: team.name });
      if (action === "generateCodeButton") assert.equal(a.copied(), code);
      else {
        const link = a.el("exportSharePanel").querySelector("textarea").value;
        assert.ok(link.startsWith(domain + "#import=WFL7"));
        if (action === "exportQrButton") assert.ok(a.el("exportSharePanel").querySelector("svg"));
        else assert.equal(a.copied(), link);
      }
    }
    assert.equal(a.stored(), before); assert.equal(a.window.localStorage.getItem("whos-free-groups-v1"), prefs);
    a.el("closeScheduleModal").click();
    assert.match(a.window.document.activeElement.getAttribute("aria-label"), /Options for group Study team/);
    a.el("homeExportButton").click(); a.el("generateCodeButton").click();
    await a.wait(() => !a.el("generateCodeButton").disabled);
    assert.match(a.el("exportCodeOutput").value, /^WF6/);
    assert.equal(a.el("exportSelection").hidden, false);
    assert.equal((await a.window.WhosFreeShareCode.decode(a.el("exportCodeOutput").value)).shared_group, undefined);
  } finally { await a.window.happyDOM.abort(); }
});

test("opened group links wait for a choice, accept a new name, save a group, and Undo restores schedules and groups", async () => {
  const sender = await app(data, [team]);
  const code = await sender.window.WhosFreeShareCode.encode({ shared_group: { id: team.id, name: team.name }, people: { Alice: data.people.Alice, Bob: data.people.Bob } }, { fields: [] });
  const receiver = await app(null, [], sender.window.WhosFreeShareCode.createLink(code, base));
  try {
    assert.equal(receiver.stored(), null);
    assert.equal(receiver.prefs().groups.length, 0);
    assert.equal(receiver.el("sharedGroupImport").hidden, false);
    assert.equal(receiver.el("sharedGroupName").value, team.name);
    assert.equal(receiver.el("decodeCodeButton").hidden, true);
    assert.equal(receiver.el("importScheduleImageButton").hidden, true);
    receiver.el("sharedGroupName").value = "Our study group";
    receiver.el("sharedGroupName").dispatchEvent(new receiver.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await receiver.wait(() => receiver.el("scheduleModal").hidden);
    assert.deepEqual(Object.keys(JSON.parse(receiver.stored()).data.people), ["Alice", "Bob"]);
    assert.equal(receiver.prefs().groups[0].name, "Our study group");
    assert.deepEqual(receiver.prefs().groups[0].members, ["Alice", "Bob"]);
    assert.match(receiver.el("toast").textContent, /Added 2 people · Skipped 0 · Group: Our study group/);
    receiver.el("undoChangesButton").click();
    await receiver.wait(() => receiver.stored() === null);
    assert.deepEqual(receiver.prefs().groups, []);
  } finally { await sender.window.happyDOM.abort(); await receiver.window.happyDOM.abort(); }
});

test("cancel and invalid group names save nothing; adding individuals creates no group", async () => {
  const a = await app(data, [{ ...team, id: "unrelated" }]);
  try {
    const code = await a.window.WhosFreeShareCode.encode({ shared_group: { id: "new-source", name: team.name }, people: { New: person("New course") } }, { fields: [] });
    const link = a.window.WhosFreeShareCode.createLink(code, base), before = a.stored(), groups = plain(a.prefs());
    await a.openLink(link);
    assert.equal(a.el("sharedGroupName").value, "Study team 2");
    a.el("sharedGroupName").value = ""; a.el("addSharedGroupButton").click();
    await a.wait(() => a.el("importProgressOverlay").hidden);
    assert.match(a.el("sharedGroupError").textContent, /Enter a group name/);
    a.el("sharedGroupName").value = team.name; a.el("addSharedGroupButton").click();
    await a.wait(() => a.el("importProgressOverlay").hidden);
    assert.match(a.el("sharedGroupError").textContent, /already uses this name/);
    assert.equal(a.stored(), before); assert.deepEqual(a.prefs(), groups);
    a.window.document.dispatchEvent(new a.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(a.el("scheduleModal").hidden, true);
    assert.equal(a.stored(), before);
    await a.openLink(link); a.el("addSharedPeopleButton").click();
    await a.wait(() => a.el("scheduleModal").hidden);
    assert.ok(JSON.parse(a.stored()).data.people.New);
    assert.deepEqual(a.prefs(), groups);
  } finally { await a.window.happyDOM.abort(); }
});

test("automatic group imports use canonical duplicate and kept names, and group-only imports can be undone", async () => {
  const initial = { people: { ALICE: person("Math"), Bob: person("Local physics") } };
  const a = await app(initial);
  try {
    const code = await a.window.WhosFreeShareCode.encode({ shared_group: { id: team.id, name: team.name }, people: { Alice: data.people.Alice, Bob: data.people.Bob } }, { fields: [] });
    await a.openLink(a.window.WhosFreeShareCode.createLink(code, base));
    const before = a.stored(); a.el("addSharedGroupButton").click(); await a.wait(() => a.el("scheduleModal").hidden);
    assert.equal(a.stored(), before, "duplicates and kept local schedules need no schedule write");
    assert.deepEqual(a.prefs().groups[0].members, ["ALICE", "Bob"]);
    assert.match(a.el("toast").textContent, /Added 0 people · Skipped 2/);
    assert.equal(a.el("codeConflictPrompt").hidden, true);
    a.el("undoChangesButton").click(); await a.wait(() => a.prefs().groups.length === 0);
    assert.deepEqual(JSON.parse(a.stored()).data, initial);
  } finally { await a.window.happyDOM.abort(); }
});

test("pasted group codes preserve manual conflict choices and map Keep both members correctly", async () => {
  const a = await app({ people: { Bob: person("Local course") } });
  try {
    const code = await a.window.WhosFreeShareCode.encode({ shared_group: { id: team.id, name: team.name }, people: { Bob: data.people.Bob } }, { fields: [] });
    a.el("homeImportButton").click(); a.el("importCodeInput").value = code; a.el("decodeCodeButton").click();
    await a.wait(() => !a.el("sharedGroupImport").hidden && a.el("importProgressOverlay").hidden);
    a.el("addSharedGroupButton").click(); await a.wait(() => !a.el("codeConflictPrompt").hidden);
    a.el("codeConflictPrompt").querySelector('[data-code-conflict-action="both"]').click();
    await a.wait(() => a.el("scheduleModal").hidden);
    assert.deepEqual(a.prefs().groups[0].members, ["Bob 2"]);
    assert.equal(JSON.parse(a.stored()).data.people.Bob.classes[0].course, "Local course");
    assert.equal(JSON.parse(a.stored()).data.people["Bob 2"].classes[0].course, "Physics");
  } finally { await a.window.happyDOM.abort(); }
});

test("group capacity errors leave schedules untouched and the individual option stays available", async () => {
  const groups = Array.from({ length: 100 }, (_, i) => ({ id: `g${i}`, name: `Group ${i}`, members: [], hidden: false }));
  const a = await app(data, groups);
  try {
    const before = a.stored(), code = await a.window.WhosFreeShareCode.encode({ shared_group: { id: team.id, name: team.name }, people: { New: person("New") } }, { fields: [] });
    await a.openLink(a.window.WhosFreeShareCode.createLink(code, base));
    a.el("addSharedGroupButton").click(); await a.wait(() => a.el("importProgressOverlay").hidden);
    assert.match(a.el("sharedGroupError").textContent, /up to 100 groups/);
    assert.equal(a.stored(), before);
    a.el("addSharedPeopleButton").click(); await a.wait(() => a.el("scheduleModal").hidden);
    assert.equal(a.prefs().groups.length, 100); assert.ok(JSON.parse(a.stored()).data.people.New);
  } finally { await a.window.happyDOM.abort(); }
});

test("unreadable saved schedules block group imports without writing data or preferences", async () => {
  const a = await app({ people: { Broken: { classes: "invalid" } } });
  try {
    const before = a.stored(), prefs = plain(a.prefs());
    const code = await a.window.WhosFreeShareCode.encode({ shared_group: { id: team.id, name: team.name }, people: { New: person("New") } }, { fields: [] });
    a.window.location.hash = new URL(a.window.WhosFreeShareCode.createLink(code, base)).hash;
    a.window.dispatchEvent(new a.window.HashChangeEvent("hashchange"));
    await a.wait(() => a.el("importProgressOverlay").hidden);
    assert.equal(a.el("sharedGroupImport").hidden, true);
    assert.match(a.el("importCodeStatus").textContent, /saved schedules could not be loaded/);
    assert.equal(a.stored(), before); assert.deepEqual(a.prefs(), prefs);
  } finally { await a.window.happyDOM.abort(); }
});

test("group storage failures are reported as session-only without discarding imported people", async () => {
  const a = await app();
  try {
    const code = await a.window.WhosFreeShareCode.encode({ shared_group: { id: team.id, name: team.name }, people: { New: person("New") } }, { fields: [] });
    await a.openLink(a.window.WhosFreeShareCode.createLink(code, base));
    const storage = a.window.localStorage;
    Object.defineProperty(a.window, "localStorage", { configurable: true, value: {
      getItem: key => storage.getItem(key), removeItem: key => storage.removeItem(key),
      setItem: (key, value) => { if (key === "whos-free-groups-v1") throw Error("Storage full"); storage.setItem(key, value); }
    } });
    a.el("addSharedGroupButton").click(); await a.wait(() => a.el("scheduleModal").hidden);
    assert.ok(JSON.parse(a.stored()).data.people.New);
    assert.equal(a.prefs().groups.length, 0);
    assert.match(a.el("toast").textContent, /this session only; the browser could not save it/);
    assert.ok(a.window.document.querySelector('.people-group[data-group-id]'));
  } finally { await a.window.happyDOM.abort(); }
});

test("later group batches extend an existing group and Undo removes only that batch", async () => {
  const local = { id: "recipient", name: "Chosen name", members: ["Alice"], hidden: false, sharedId: team.id };
  const a = await app({ people: { Alice: data.people.Alice } }, [local]);
  try {
    const code = await a.window.WhosFreeShareCode.encode({ shared_group: { id: team.id, name: team.name }, people: { Bob: data.people.Bob } }, { fields: [] });
    await a.openLink(a.window.WhosFreeShareCode.createLink(code, base));
    assert.equal(a.el("sharedGroupName").value, "Chosen name");
    a.el("addSharedGroupButton").click(); await a.wait(() => a.el("scheduleModal").hidden);
    assert.equal(a.prefs().groups.length, 1);
    assert.deepEqual(a.prefs().groups[0].members, ["Alice", "Bob"]);
    a.el("undoChangesButton").click(); await a.wait(() => !JSON.parse(a.stored()).data.people.Bob);
    assert.deepEqual(a.prefs().groups, [local]);
  } finally { await a.window.happyDOM.abort(); }
});

test("independent group QR batches scanned in reverse collect into one renamed group across reloads", async () => {
  let seed = 123;
  const random = n => Array.from({ length: n }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[seed % 62]; }).join("");
  const large = { people: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`Student ${i}`, { classes: ["Monday", "Tuesday", "Sunday"].map(day => ({ day, start: "09:00", end: "10:00", course: random(180) })) }])) };
  const group = { ...team, members: Object.keys(large.people) };
  const sender = await app(large, [group], "https://youfree.ca/");
  let receiver = await app(null, [], "https://youfree.ca/");
  try {
    const links = [], generator = sender.window.qrcodegen.QrCode, encode = generator.encodeText;
    generator.encodeText = (link, level) => { links.push(link); return encode.call(generator, link, level); };
    sender.share(); sender.el("exportFieldOptions").querySelector(".export-include-all").click(); sender.el("exportQrButton").click();
    await sender.wait(() => !sender.el("generateCodeButton").disabled);
    assert.equal(sender.el("multipleQrButton"), null);
    assert.ok(links.length > 1);
    for (const link of [...links].reverse()) {
      assert.ok(link.startsWith("https://youfree.ca/#import=WFL7"));
      await receiver.openLink(link);
      assert.ok([team.name, "Chosen group"].includes(receiver.el("sharedGroupName").value));
      receiver.el("sharedGroupName").value = "Chosen group"; receiver.el("addSharedGroupButton").click();
      await receiver.wait(() => receiver.el("scheduleModal").hidden);
      const saved = JSON.parse(receiver.stored()).data, groups = receiver.prefs().groups;
      await receiver.window.happyDOM.abort(); receiver = await app(saved, groups, "https://youfree.ca/");
    }
    assert.deepEqual(Object.keys(JSON.parse(receiver.stored()).data.people).sort(), Object.keys(large.people).sort());
    assert.equal(receiver.prefs().groups.length, 1);
    assert.deepEqual(receiver.prefs().groups[0].members.sort(), Object.keys(large.people).sort());
    assert.equal(receiver.prefs().groups[0].name, "Chosen group");
    const before = receiver.stored(), prefs = plain(receiver.prefs());
    await receiver.openLink(links[0]); receiver.el("addSharedGroupButton").click(); await receiver.wait(() => receiver.el("scheduleModal").hidden);
    assert.equal(receiver.stored(), before); assert.deepEqual(receiver.prefs(), prefs);
    assert.match(receiver.el("toast").textContent, /Added 0 people/);
  } finally { await sender.window.happyDOM.abort(); await receiver.window.happyDOM.abort(); }
});


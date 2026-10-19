import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

const item = (start, end, day = "Monday") => ({ day, start, end, course: "Unfamiliar course" });
const data = { schema_version: 1, people: {
  Alice: { classes: [item("08:15", "09:35"), item("09:45", "11:05"), item("12:45", "14:05"), item("11:00", "12:00", "Saturday")] },
  Bob: { classes: [item("09:00", "10:05"), item("10:15", "12:05"), item("15:15", "16:05")] },
  Cara: { classes: [] },
} };
async function app(groups = null, schedules = data) {
  const window = new Window({ url: "https://example.test/Whos-Free/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  window.setInterval = () => 0; window.matchMedia = () => ({ matches: false, addEventListener() {} }); window.confirm = () => true;
  window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: schedules, meta: {} }));
  window.localStorage.setItem("whos-free-people-preferences-v1", JSON.stringify({ pinnedPeople: ["Bob"] }));
  if (groups) window.localStorage.setItem("whos-free-groups-v1", JSON.stringify(groups));
  for (const file of ["schedule-availability.js", "schedule-groups.js", "app.js"]) window.eval(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"));
  const tick = () => new Promise(resolve => setTimeout(resolve, 40));
  await tick();
  const el = id => window.document.getElementById(id);
  el("liveToggle").checked = false; el("liveToggle").dispatchEvent(new window.Event("change"));
  el("daySelect").value = "Monday"; el("daySelect").dispatchEvent(new window.Event("change"));
  el("timeInput").value = "09:40"; el("timeInput").dispatchEvent(new window.Event("change"));
  el("viewToggleButton").click();
  const create = (name, members) => {
    el("newGroupButton").click(); el("groupNameInput").value = name;
    for (const input of el("groupMembersList").querySelectorAll("input")) input.checked = members.includes(input.dataset.person);
    el("groupForm").dispatchEvent(new window.Event("submit", { cancelable: true }));
  };
  const prefs = () => JSON.parse(window.localStorage.getItem("whos-free-groups-v1"));
  const cards = () => [...el("peopleList").querySelectorAll(".person-name")].map(item => item.textContent.replace(" 📌", ""));
  const manage = () => {
    if (el("manageGroupsButton").hidden) el("showGroupsToggle").click();
    el("manageGroupsButton").focus();
    el("manageGroupsButton").click();
    assert.equal(el("scheduleModal").hidden, true);
    assert.equal(el("groupsModal").hidden, false);
  };
  const finish = () => {
    el("closeGroupsModal").click();
    assert.equal(el("scheduleModal").hidden, true, "group manager returns to the main page");
    assert.equal(window.document.activeElement, el("manageGroupsButton"));
  };
  return { window, el, tick, create, prefs, cards, manage, finish };
}

test("multiple groups keep pins, individual visibility and a flat-list toggle without losing memberships", async () => {
  const a = await app(); const { window, el, create, cards, prefs, manage, finish } = a;
  try {
    assert.deepEqual(cards(), ["Bob", "Cara", "Alice"]);
    manage(); create("Lunch", ["Alice", "Bob"]); create("Club", ["Bob", "Cara"]);
    finish();
    assert.equal(el("showGroupsToggle").getAttribute("aria-label"), "Hide groups");
    assert.deepEqual(cards(), ["Bob", "Alice", "Bob", "Cara"]);
    assert.equal(new Set(cards()).size, 3, "overlapping memberships retain the same three people");
    assert.equal(el("freeCount"), null, "the retired summary stays removed");
    assert.match(el("peopleList").querySelector('[data-group-id] h3').textContent, /Lunch/);
    window.document.querySelector('[aria-label="Hide group Lunch"]').click();
    assert.deepEqual(cards(), ["Bob", "Cara"]);
    assert.equal(new Set(cards()).size, 2);
    assert.match(el("peopleList").querySelector('[data-person="Bob"] .status-badge').textContent, /IN CLASS/);
    el("showGroupsToggle").click();
    assert.equal(el("showGroupsToggle").getAttribute("aria-label"), "Show groups");
    assert.deepEqual(cards(), ["Bob", "Cara", "Alice"]);
    assert.equal(el("peopleList").querySelectorAll(".people-group").length, 0);
    assert.deepEqual(prefs().groups[0].members, ["Bob", "Alice"]);
    el("showGroupsToggle").click();
    assert.deepEqual(cards(), ["Bob", "Cara"]);
    window.document.querySelector('[aria-label="Show group Lunch"]').click();
    assert.deepEqual(cards(), ["Bob", "Alice", "Bob", "Cara"]);
    el("viewToggleButton").click();
    assert.deepEqual(cards(), ["Cara"]);
    assert.equal(el("peopleList").querySelectorAll(".people-group").length, 2, "busy groups still show their next shared break");
  } finally { await window.happyDOM.abort(); }
});

test("weekly group grid shows exact people, school hours, weekend entries and darker all-free blocks", async () => {
  const { window, el, create, manage, finish } = await app();
  try {
    manage(); create("Lunch", ["Alice", "Bob"]); finish();
    window.document.querySelector('[aria-label="View weekly availability for Lunch"]').click();
    assert.equal(el("groupWeekModal").hidden, false);
    assert.match(el("groupWeekSummary").textContent, /8:15 AM–8:05 PM/);
    assert.match(el("groupWeekGrid").textContent, /Saturday/); assert.doesNotMatch(el("groupWeekGrid").textContent, /Sunday|05:00/);
    const blocks = [...el("groupWeekGrid").querySelectorAll(".group-time-block")];
    const except = blocks.find(block => block.dataset.day === "Monday" && block.dataset.start === "11:05");
    assert.equal(except.dataset.available, "1"); assert.match(except.textContent, /All except 1/);
    except.click();
    assert.match(el("groupSlotDetails").textContent, /Free: Alice/); assert.match(el("groupSlotDetails").textContent, /Busy: Bob/);
    const all = blocks.find(block => block.dataset.available === "2"), none = blocks.find(block => block.dataset.available === "0");
    const brightness = block => block.style.backgroundColor.match(/\d+/g).map(Number).reduce((a, b) => a + b);
    assert.ok(brightness(all) < brightness(except)); assert.ok(brightness(except) < brightness(none));
    all.click(); assert.equal(all.getAttribute("aria-pressed"), "true");
    assert.match(el("groupSlotDetails").textContent, /Busy: Nobody/);
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(el("groupWeekModal").hidden, true);
    assert.equal(window.document.activeElement.getAttribute("aria-label"), "Options for group Lunch");
  } finally { await window.happyDOM.abort(); }
});

test("group edits, saved visibility, empty groups and deleted people do not erase schedules", async () => {
  const saved = { showGroups: true, hideUngrouped: true, groups: [{ id: "one", name: "Lunch", members: ["Alice", "Bob", "Gone"], hidden: false }, { id: "two", name: "Club", members: ["Bob"], hidden: true }] };
  const a = await app(saved); const { window, el, prefs, tick, manage, finish } = a;
  try {
    assert.equal(el("manageGroupsButton").hidden, false, "saved group view restores Manage");
    assert.deepEqual(prefs().groups[0].members, ["Alice", "Bob"]);
    assert.ok(window.document.querySelector('[aria-label="Show group Club"]'));
    assert.ok(window.document.querySelector('[aria-label="Show group Ungrouped people"]'));
    window.document.querySelector('[aria-label="View weekly availability for Lunch"]').click();
    el("closeGroupWeekModal").click(); manage();
    window.document.querySelector('[aria-label="Edit group Lunch"]').click(); el("groupNameInput").value = "New lunch";
    el("groupMembersList").querySelector('[aria-label="Remove Alice from group"]').click();
    el("groupForm").dispatchEvent(new window.Event("submit", { cancelable: true }));
    assert.equal(prefs().groups[0].name, "New lunch"); assert.deepEqual(prefs().groups[0].members, ["Bob"]);
    finish(); el("scheduleDataButton").click();
    window.document.querySelector('[aria-label="Remove Bob"]').click(); await tick();
    assert.deepEqual(prefs().groups[0].members, []); assert.deepEqual(prefs().groups[1].members, []);
    const stored = JSON.parse(window.localStorage.getItem("whos-free-local-schedules")).data.people;
    assert.deepEqual(Object.keys(stored).sort(), ["Alice", "Cara"]);
    el("closeScheduleModal").click();
    assert.match(el("peopleList").textContent, /No people in this group. Edit it to add members./);
    manage(); window.document.querySelector('[aria-label="Delete group New lunch"]').click();
    assert.equal(prefs().groups.length, 1);
    assert.deepEqual(Object.keys(JSON.parse(window.localStorage.getItem("whos-free-local-schedules")).data.people).sort(), ["Alice", "Cara"]);
  } finally { await window.happyDOM.abort(); }
});

test("group dialog validates duplicate names, saves safely and traps keyboard focus", async () => {
  const { window, el, create, prefs, manage, finish } = await app();
  try {
    manage(); create("Study <friends>", ["Alice"]); create("STUDY <FRIENDS>", ["Bob"]);
    assert.match(el("groupFormError").textContent, /already uses this name/); assert.equal(prefs().groups.length, 1);
    el("cancelGroupButton").focus();
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", cancelable: true }));
    assert.equal(window.document.activeElement, el("closeGroupsModal"));
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true }));
    assert.equal(window.document.activeElement, el("cancelGroupButton"));
    assert.equal(el("groupsManagerList").querySelector("friends"), null);
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(el("groupsModal").hidden, true);
  } finally { await window.happyDOM.abort(); }
});

test("Manage sits beside the main group toggle and appears only in group view", async () => {
  const { window, el, manage, finish, create } = await app();
  try {
    assert.equal(el("showGroupsToggle").closest(".people-actions"), el("viewToggleButton").parentElement);
    for (const id of ["showGroupsToggle", "viewToggleButton"]) {
      assert.ok(el(id).querySelector('svg[aria-hidden="true"]'));
      assert.ok(el(id).getAttribute("aria-label"));
    }
    assert.equal(el("scheduleModal").contains(el("manageGroupsButton")), false);
    assert.equal(el("showGroupsToggle").nextElementSibling.id, "peopleSearchButton");
    assert.equal(el("peopleSearchButton").nextElementSibling.id, "manageGroupsButton");
    assert.equal(el("manageGroupsButton").getAttribute("aria-label"), "Manage groups");
    assert.ok(el("manageGroupsButton").querySelector("svg"));
    assert.equal(el("manageGroupsButton").hidden, true);
    assert.equal(el("groupVisibility"), null);
    assert.equal(el("viewToggleButton").nextElementSibling, el("showGroupsToggle").parentElement);
    assert.equal(el("viewToggleButton").querySelector("[data-mode-label]").textContent, "Free");
    manage(); create("Lunch", ["Alice", "Bob"]); finish();
    assert.equal(el("manageGroupsButton").hidden, false);
    assert.ok(el("peopleList").querySelector(".people-group"));
    el("showGroupsToggle").click();
    assert.equal(el("manageGroupsButton").hidden, true);
    assert.equal(el("peopleList").querySelector(".people-group"), null);
    assert.equal(el("groupWeekModal").querySelector("#editGroupFromWeekButton"), null);
    el("showGroupsToggle").click(); assert.equal(el("showGroupsToggle").title, "Hide groups");
    assert.equal(el("manageGroupsButton").hidden, false);
    assert.ok(el("showGroupsToggle").querySelector("svg"), "toggling must keep the icon");
    el("viewToggleButton").click(); assert.equal(el("viewToggleButton").title, "Show everyone");
    assert.equal(el("viewToggleButton").querySelector("[data-mode-label]").textContent, "All");
    manage(); finish();
  } finally { await window.happyDOM.abort(); }
});

test("collapsed headers keep counts and options; send-to-top persists and Undo changes only group order", async () => {
  const saved = { showGroups: true, groups: [
    { id: "one", name: "Lunch", members: ["Alice", "Bob"] },
    { id: "two", name: "Club", members: ["Bob", "Cara"] },
    { id: "three", name: "Study", members: ["Alice", "Cara"] }
  ] };
  const a = await app(saved); let b;
  const headers = owner => [...owner.el("peopleList").querySelectorAll(".people-group h3")].map(item => item.textContent);
  try {
    assert.equal(a.el("groupVisibility"), null);
    const schedules = a.window.localStorage.getItem("whos-free-local-schedules");
    a.window.document.querySelector('[aria-label="Hide group Club"]').click();
    const club = () => a.el("peopleList").querySelector('[data-group-id="two"]');
    assert.deepEqual(headers(a), ["Lunch", "Club", "Study"]);
    assert.equal(club().querySelector(".person-card"), null);
    assert.equal(club().querySelector("small").textContent, "1 of 2 free");
    assert.equal(club().querySelector(".group-hide").textContent, "Show");
    assert.equal(club().querySelector(".group-hide").getAttribute("aria-expanded"), "false");
    assert.ok(club().querySelector(".group-more"));
    assert.notEqual(club().getAttribute("draggable"), "true");
    a.window.document.querySelector('[aria-label="Send group Club to top"]').click();
    assert.deepEqual(headers(a), ["Club", "Lunch", "Study"]);
    assert.equal(club().querySelector(".person-card"), null);
    assert.deepEqual(a.prefs().groups.map(group => group.id), ["two", "one", "three"]);
    a.window.document.querySelector('[aria-label="View weekly availability for Club"]').click();
    assert.equal(a.el("groupWeekModal").hidden, false);
    a.el("closeGroupWeekModal").click();
    a.el("undoChangesButton").click(); await a.tick();
    assert.deepEqual(headers(a), ["Lunch", "Club", "Study"]);
    assert.equal(club().querySelector(".person-card"), null, "Undo must preserve collapse state");
    assert.equal(a.window.localStorage.getItem("whos-free-local-schedules"), schedules);
    a.window.document.querySelector('[aria-label="Send group Club to top"]').click();
    b = await app(a.prefs());
    assert.deepEqual(headers(b), ["Club", "Lunch", "Study"]);
    assert.ok(b.window.document.querySelector('[aria-label="Show group Club"]'));
    b.window.document.querySelector('[aria-label="Show group Club"]').click();
    assert.equal(b.el("peopleList").querySelector('[data-group-id="two"]').querySelectorAll(".person-card").length, 2);
    assert.equal(b.window.document.querySelector('[aria-label="Send group Club to top"]').disabled, true);
  } finally { await a.window.happyDOM.abort(); await b?.window.happyDOM.abort(); }
});

test("open menus reserve header space even when every group is collapsed", async () => {
  const a = await app({ showGroups: true, groups: [
    { id: "one", name: "Lunch", members: ["Alice", "Bob"], hidden: true },
    { id: "two", name: "Club", members: ["Bob", "Cara"], hidden: true }
  ] });
  try {
    assert.equal(a.el("peopleList").querySelectorAll(".person-card").length, 0);
    const menu = a.el("peopleList").querySelector('[data-group-id="two"] .group-options');
    menu.open = true;
    assert.equal(menu.querySelectorAll("button").length, 3);
    assert.ok(menu.closest(".people-group-header"));
    const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    assert.match(css, /\.people-group:has\(\.group-options\[open\]\) \.people-group-header\s*\{\s*padding-bottom:\s*146px;/,
      "the absolutely positioned menu needs a footprint inside its overflow-clipped ancestors");
    menu.open = false;
    assert.equal(a.el("peopleList").querySelector(".group-options[open]"), null);
  } finally { await a.window.happyDOM.abort(); }
});

test("a merged ten-minute overlap is filled by the five-free neighbor, with exact details preserved", async () => {
  const names = ["A", "B", "C", "D", "E", "F", "G"];
  const schedules = { schema_version: 1, people: Object.fromEntries(names.map((name, i) => [name, { classes: i < 2 ? [item("08:15","09:35")] : i < 5 ? [item("09:45","11:05")] : [] }])) };
  const { window, el, manage, finish, create } = await app(null, schedules);
  try {
    manage(); create("Seven", names); finish();
    window.document.querySelector('[aria-label="View weekly availability for Seven"]').click();
    const blocks = [...el("groupWeekGrid").querySelectorAll('.group-time-block[data-day="Monday"]')];
    assert.ok(blocks.every(block => {
      const minute = t => Number(t.slice(0,2))*60 + Number(t.slice(3));
      return minute(block.dataset.end) - minute(block.dataset.start) > 10;
    }));
    assert.equal(blocks.find(block => block.dataset.start === "11:05").dataset.available, "7");
    const filled = blocks.find(block => block.dataset.start === "08:15");
    assert.equal(filled.dataset.end, "09:45"); assert.equal(filled.dataset.available, "5");
    assert.equal(blocks.find(block => block.dataset.start === "09:45").dataset.available, "4");
    filled.click();
    assert.match(el("groupSlotDetails").textContent, /9:35 AM–9:45 AM · Everyone free/);
    assert.equal(el("groupSlotDetails").querySelectorAll(".group-exact-period").length, 2);
  } finally { await window.happyDOM.abort(); }
});

test("renaming a saved person updates every group and keeps the pin", async () => {
  const { window, el, manage, finish, create, prefs, tick } = await app();
  try {
    manage(); create("Lunch", ["Bob", "Alice"]); create("Club", ["Bob", "Cara"]); finish();
    el("scheduleDataButton").click();
    window.document.querySelector('[aria-label="Edit Bob"]').click();
    el("imageReviewName").value = "Robert"; el("saveImageScheduleButton").click(); await tick();
    const stored = JSON.parse(window.localStorage.getItem("whos-free-local-schedules")).data.people;
    assert.ok(stored.Robert); assert.equal(stored.Bob, undefined);
    for (const group of prefs().groups) {
      assert.ok(group.members.includes("Robert")); assert.ok(!group.members.includes("Bob"));
    }
    assert.deepEqual(JSON.parse(window.localStorage.getItem("whos-free-people-preferences-v1")).pinnedPeople, ["Robert"]);
  } finally { await window.happyDOM.abort(); }
});


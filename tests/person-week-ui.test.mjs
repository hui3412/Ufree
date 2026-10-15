import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

const data = { people: {
  Alice: { semester: "Fall 2026", classes: [
    { day: "Monday", start: "07:07", end: "08:13", course: "Differential Calculus", course_code: "201-SN2-RE", section: "00001", room: "A-104", instructor: "Jane de la Cruz" },
    { day: "Saturday", start: "21:15", end: "22:05", course: "Music" },
    { day: "Sunday", start: "10:15", end: "10:35", kind: "busy_block", course: "Club" },
  ] },
  Bob: { classes: [{ day: "Tuesday", start: "09:00", end: "10:00", course: "Chemistry" }] },
  Empty: { classes: [] },
} };

async function app() {
  const window = new Window({ url: "https://example.test/Whos-Free/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  window.setInterval = () => 0;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  Object.assign(window, { TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream });
  let copied;
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async text => { copied = text; } }, configurable: true });
  window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data, meta: {} }));
  window.localStorage.setItem("whos-free-people-preferences-v1", JSON.stringify({ nicknames: { Alice: "Ali" } }));
  for (const file of ["schedule-availability.js", "schedule-share-code.js", "app.js"]) window.eval(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"));
  const tick = () => new Promise(resolve => setTimeout(resolve, 35));
  const el = id => window.document.getElementById(id);
  const wait = async predicate => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
    throw Error("UI operation did not finish");
  };
  await wait(() => Boolean(el("peopleList").querySelector(".person-card")));
  el("viewToggleButton").click();
  const open = name => {
    el("peopleList").querySelector(`[data-person="${name}"]`).click();
    el("fullScheduleButton").click();
  };
  return { window, el, tick, wait, open, copied: () => copied };
}

test("full week includes exact times and weekends without redundant export controls", async () => {
  const a = await app(); const { window, el, wait, open, tick } = a;
  try {
    const before = window.localStorage.getItem("whos-free-local-schedules");
    open("Alice");
    assert.equal(el("personWeekModal").hidden, false);
    assert.equal(el("personWeekTitle").textContent, "Ali");
    assert.match(el("personWeekSemester").textContent, /Fall 2026/);
    assert.equal(el("fullScheduleButton").closest(".detail-name-row").querySelector("h2").textContent, "Ali");
    assert.equal(el("personWeekGrid").querySelectorAll(".review-day").length, 7);
    const blocks = [...el("personWeekGrid").querySelectorAll(".person-week-block")];
    assert.deepEqual(blocks.map(block => [block.dataset.day, block.dataset.start, block.dataset.end]), data.people.Alice.classes.map(item => [item.day, item.start, item.end]));
    assert.equal(blocks[0].style.top, "7px");
    assert.equal(blocks[0].style.height, "66px");
    assert.match(el("personWeekGrid").textContent, /23:00/);
    assert.equal(el("personWeekGrid").querySelectorAll("button, input").length, 0, "viewing is read-only");
    assert.equal(el("exportPersonScheduleButton"), null);
    assert.equal(el("personExportFieldOptions"), null);
    assert.equal(window.localStorage.getItem("whos-free-local-schedules"), before);
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(el("personWeekModal").hidden, true);
    assert.equal(window.document.body.style.overflow, "");
    assert.equal(window.document.activeElement, el("fullScheduleButton"));
    open("Bob");
    assert.equal(el("personWeekGrid").querySelectorAll(".person-week-block").length, 1);
  } finally { await window.happyDOM.abort(); }
});

test("empty schedules remain viewable, focus stays in the dialog, and backdrop closes it", async () => {
  const { window, el, open, wait } = await app();
  try {
    open("Empty");
    assert.equal(el("personWeekEmpty").hidden, false);
    assert.equal(window.document.activeElement, el("closePersonWeekModal"));
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(window.document.activeElement, el("closePersonWeekModal"));
    el("personWeekModal").click();
    assert.equal(el("personWeekModal").hidden, true);
  } finally { await window.happyDOM.abort(); }
});


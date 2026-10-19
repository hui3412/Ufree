import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

test("existing schedules, main cards and review grid distinguish passing time from real breaks", async () => {
  const window = new Window({ url: "http://localhost/Whos-Free/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  window.setInterval = () => 0;
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.confirm = () => true;
  const classes = [
    { day: "Monday", start: "08:15", end: "09:35", course: "First" },
    { day: "Monday", start: "09:45", end: "11:05", course: "Second" },
    { day: "Monday", start: "11:15", end: "12:05", course: "Third" },
    { day: "Monday", start: "12:45", end: "14:05", course: "Final" }
  ];
  window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: { schema_version: 1, people: { Student: { classes } } }, meta: {} }));
  const el = id => window.document.getElementById(id);
  const tick = () => new Promise(resolve => setTimeout(resolve, 30));
  const at = time => { el("timeInput").value = time; el("timeInput").dispatchEvent(new window.Event("change")); };
  try {
    window.eval(fs.readFileSync(new URL("../schedule-availability.js", import.meta.url), "utf8"));
    window.eval(fs.readFileSync(new URL("../app.js", import.meta.url), "utf8"));
    await tick();
    el("liveToggle").checked = false;
    el("liveToggle").dispatchEvent(new window.Event("change"));
    el("daySelect").value = "Monday";
    el("daySelect").dispatchEvent(new window.Event("change"));
    at("08:30");
    if (!window.document.querySelector(".person-card")) el("viewToggleButton").click();
    const card = () => window.document.querySelector(".person-card");
    assert.match(card().textContent, /This class ends at 9:35 AM/);
    assert.match(card().textContent, /Next break starts at 12:05 PM/);
    card().click();
    assert.match(el("detailPanel").textContent, /This class ends at 9:35 AM/);
    assert.match(el("detailPanel").textContent, /Next break starts at 12:05 PM/);
    at("09:40");
    assert.equal(card().querySelector(".status-badge").textContent, "Class Soon");
    assert.match(card().textContent, /Class Soon/);
    assert.doesNotMatch(card().textContent, /This class ends/);
    assert.match(card().textContent, /Next break starts at 12:05 PM/);
    card().click();
    assert.match(el("detailPanel").textContent, /Class Soon/);
    at("12:05");
    assert.equal(card().querySelector(".status-badge").textContent, "FREE");
    at("13:00");
    assert.match(card().textContent, /This class ends at 2:05 PM/);
    assert.match(card().textContent, /Free after classes at 2:05 PM/);
    at("14:05");
    assert.equal(card().querySelector(".status-badge").textContent, "FREE");
    el("scheduleDataButton").click();
    window.document.querySelector('[aria-label="Edit Student"]').click();
    assert.equal(el("reviewGrid").querySelectorAll(".review-break").length, 1);
    assert.equal(el("reviewGrid").querySelectorAll(".review-passing").length, 2);
    assert.equal(el("reviewGrid").querySelector(".review-break").textContent, "Break 40 min");
    assert.equal(window.document.querySelector('[data-field="end"]').value, "09:35", "passing time must not change actual class end times");
  } finally { await window.happyDOM.abort(); }
});

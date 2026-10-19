import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

test("compact day/time controls preview edits immediately and restore live time", async () => {
  const window = new Window({ url: "http://localhost/Whos-Free/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  let liveTick;
  window.setInterval = callback => { liveTick = callback; return 0; };
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: { schema_version: 1, people: { Student: { classes: [{ day: "Monday", start: "08:00", end: "09:00", course: "Class" }] } } }, meta: {} }));
  const el = id => window.document.getElementById(id);
  const change = id => el(id).dispatchEvent(new window.Event("change"));
  try {
    window.eval(fs.readFileSync(new URL("../schedule-availability.js", import.meta.url), "utf8"));
    window.eval(fs.readFileSync(new URL("../app.js", import.meta.url), "utf8"));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(el("liveToggle").checked, true);
    assert.equal(el("daySelect").disabled, false);
    assert.equal(el("timeInput").disabled, false);
    assert.equal(el("daySelect").parentElement, el("timeInput").parentElement);
    assert.equal(el("daySelect").parentElement.className, "time-selection-row");
    assert.equal(el("daySelect").getAttribute("aria-label"), "Day");
    assert.equal(el("timeInput").getAttribute("aria-label"), "Time");
    assert.equal(el("refreshButton"), null);
    assert.equal(el("liveToggle").closest("label").nextElementSibling, el("viewToggleButton"));
    assert.equal(el("viewToggleButton").nextElementSibling, el("showGroupsToggle").parentElement);
    const originalDay = el("daySelect").value;
    el("timeInput").value = "08:30";
    el("timeInput").dispatchEvent(new window.Event("input"));
    assert.equal(el("liveToggle").checked, false);
    assert.equal(el("daySelect").value, originalDay);
    el("daySelect").value = "Monday";
    change("daySelect");
    assert.equal(el("peopleList").querySelectorAll(".person-card").length, 0, "a busy student is excluded from Free");
    liveTick();
    assert.equal(el("timeInput").value, "08:30", "manual selection survives live ticks");
    el("liveToggle").checked = true;
    change("liveToggle");
    const now = new Date();
    assert.equal(el("daySelect").value, now.toLocaleDateString("en-CA", { weekday: "long" }));
    assert.equal(el("timeInput").value, `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    assert.equal(el("timeInput").disabled, false);
    el("daySelect").value = "Sunday";
    change("daySelect");
    assert.equal(el("liveToggle").checked, false, "weekday edits also leave live mode");
    assert.equal(el("peopleList").querySelectorAll(".person-card").length, 1);
    assert.equal(el("peopleList").querySelector(".status-badge").textContent, "FREE");
    el("timeInput").value = "10:00";
    change("timeInput");
    assert.equal(el("timeInput").value, "10:00", "native change events remain supported");
  } finally { await window.happyDOM.abort(); }
});


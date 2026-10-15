import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

async function groupSchedule() {
  const window = new Window({ url: "https://example.test/Ufree/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  window.setInterval = () => 0;
  window.matchMedia = query => ({ matches: query.includes("prefers-reduced-motion"), addEventListener() {} });
  const person = start => ({ semester: "Fall 2026", classes: [{ day: "Monday", start, end: "11:00", course: "Example class" }] });
  window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: { people: { Alice: person("09:00"), Bob: person("10:00") } }, meta: {} }));
  window.localStorage.setItem("whos-free-groups-v1", JSON.stringify({ groups: [{ id: "study", name: "Study", members: ["Alice", "Bob"] }], showGroups: true }));
  for (const file of ["schedule-availability.js", "schedule-groups.js", "app.js"]) window.eval(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"));
  await new Promise(resolve => setTimeout(resolve, 40));
  const el = id => window.document.getElementById(id);
  window.document.querySelector('[aria-label="View weekly availability for Study"]').click();
  assert.equal(el("groupWeekModal").hidden, false);
  assert.match(el("groupWeekSummary").textContent, /2 people/);
  const grid = el("groupWeekGrid").parentElement;
  const dialog = grid.closest(".schedule-modal");
  Object.defineProperties(grid, { scrollHeight: { value: 700 }, clientHeight: { value: 300, configurable: true }, scrollWidth: { value: 1300 }, clientWidth: { value: 300 } });
  Object.defineProperties(dialog, { scrollHeight: { value: 2000 }, clientHeight: { value: 600 } });
  grid.scrollTop = 0; dialog.scrollTop = 100;
  let clock = 0, nextFrame = 1;
  const frames = new Map();
  Object.defineProperty(window, "performance", { value: { now: () => clock }, configurable: true });
  window.requestAnimationFrame = callback => { const id = nextFrame++; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const advance = ms => { clock += ms; };
  const frame = () => { advance(16); const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(clock)); };
  const touch = (x, y, identifier = 1) => ({ identifier, clientX: x, clientY: y });
  const dispatch = (type, touches, target = grid) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: touches });
    target.dispatchEvent(event); return event;
  };
  return { window, el, grid, dialog, touch, dispatch, advance, frame, frames };
}

test("multi-person group grid hands vertical swipes to its dialog at both edges and on reversal", async () => {
  const a = await groupSchedule();
  try {
    a.grid.scrollTop = 390;
    const block = a.el("groupWeekGrid").querySelector(".group-time-block");
    a.dispatch("touchstart", [a.touch(100, 300)], block);
    assert.equal(a.dispatch("touchmove", [a.touch(101, 270)], block).defaultPrevented, true);
    assert.equal(a.grid.scrollTop, 400); assert.equal(a.dialog.scrollTop, 120);
    a.dispatch("touchmove", [a.touch(101, 230)], block);
    assert.equal(a.dialog.scrollTop, 160);
    a.grid.scrollTop = 10; a.dialog.scrollTop = 100;
    a.dispatch("touchstart", [a.touch(100, 200)]);
    a.dispatch("touchmove", [a.touch(100, 230)]);
    assert.equal(a.grid.scrollTop, 0); assert.equal(a.dialog.scrollTop, 80);
    a.dispatch("touchmove", [a.touch(100, 190)]);
    assert.equal(a.grid.scrollTop, 40); assert.equal(a.dialog.scrollTop, 80);
    block.click(); assert.match(a.el("groupSlotDetails").textContent, /Free:/);
  } finally { await a.window.happyDOM.abort(); }
});

test("unbounded group grids scroll the dialog with independent horizontal motion and native pinch", async () => {
  const a = await groupSchedule();
  try {
    Object.defineProperty(a.grid, "clientHeight", { value: 700 });
    a.dispatch("touchstart", [a.touch(100, 300)]);
    a.dispatch("touchmove", [a.touch(100, 250)]);
    assert.equal(a.grid.scrollTop, 0); assert.equal(a.dialog.scrollTop, 150);
    a.dispatch("touchstart", [a.touch(100, 300)]);
    assert.equal(a.dispatch("touchmove", [a.touch(50, 298)]).defaultPrevented, true);
    assert.equal(a.dialog.scrollTop, 152); assert.equal(a.grid.scrollLeft, 50);
    a.dispatch("touchstart", [a.touch(100, 300), a.touch(200, 300, 2)]);
    assert.equal(a.dispatch("touchmove", [a.touch(90, 270), a.touch(210, 270, 2)]).defaultPrevented, false);
    assert.equal(a.dialog.scrollTop, 152);
  } finally { await a.window.happyDOM.abort(); }
});

test("group swipes coast smoothly and stop when interrupted or the group dialog closes", async () => {
  const a = await groupSchedule();
  try {
    a.dispatch("touchstart", [a.touch(100, 300)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 270)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 230)]);
    a.dispatch("touchend", []);
    assert.equal(a.frames.size, 1);
    const before = a.grid.scrollTop; a.frame(); assert.ok(a.grid.scrollTop > before);
    a.window.document.dispatchEvent(new a.window.Event("wheel"));
    assert.equal(a.frames.size, 0);
    a.dispatch("touchstart", [a.touch(100, 300)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 260)]);
    a.dispatch("touchend", []);
    a.el("closeGroupWeekModal").click();
    const closedAt = a.grid.scrollTop; a.frame();
    assert.equal(a.grid.scrollTop, closedAt); assert.equal(a.frames.size, 0);
  } finally { await a.window.happyDOM.abort(); }
});

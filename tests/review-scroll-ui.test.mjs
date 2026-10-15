import { test as nodeTest } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

async function timetable(view) {
  const window = new Window({ url: "https://example.test/Whos-Free/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  window.setInterval = () => 0;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.URL.createObjectURL = () => "blob:test";
  window.URL.revokeObjectURL = () => {};
  if (view !== "picture review") window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: { people: { "Test student": { classes: [{ day: "Monday", start: "08:15", end: "09:35" }] } } }, meta: {} }));
  if (view === "group schedule") {
    const record = JSON.parse(window.localStorage.getItem("whos-free-local-schedules"));
    record.data.people["Second student"] = { classes: [{ day: "Tuesday", start: "10:00", end: "11:30" }] };
    window.localStorage.setItem("whos-free-local-schedules", JSON.stringify(record));
    window.localStorage.setItem("whos-free-groups-v1", JSON.stringify({ groups: [{ id: "team", name: "Team", members: ["Test student", "Second student"] }], showGroups: true }));
  }
  window.WhosFreeImageParser = { parseScheduleImage: async () => ({ name: "Test student", person: { classes: [{ day: "Monday", start: "08:15", end: "09:35" }] } }) };
  window.eval(fs.readFileSync(new URL("../schedule-availability.js", import.meta.url), "utf8"));
  window.eval(fs.readFileSync(new URL("../schedule-groups.js", import.meta.url), "utf8"));
  window.eval(fs.readFileSync(new URL("../app.js", import.meta.url), "utf8"));
  const tick = () => new Promise(resolve => setTimeout(resolve, 30));
  await tick();
  if (view === "picture review") {
    const input = window.document.getElementById("scheduleImageInput");
    Object.defineProperty(input, "files", { value: [{ name: "timetable.png" }] });
    input.dispatchEvent(new window.Event("change"));
    await tick();
    window.document.getElementById("importPictureNameForm").dispatchEvent(new window.Event("submit", { cancelable: true }));
  } else if (view === "group schedule") {
    window.document.querySelector('[aria-label="View weekly availability for Team"]').click();
  } else {
    window.document.getElementById("viewToggleButton").click();
    window.document.querySelector('.person-card[data-person="Test student"]').click();
    window.document.getElementById("fullScheduleButton").click();
  }
  await tick();
  const grid = window.document.getElementById(view === "picture review" ? "reviewGrid" : view === "group schedule" ? "groupWeekGrid" : "personWeekGrid").parentElement;
  const container = window.document.getElementById(view === "picture review" ? "imageReview" : view === "group schedule" ? "groupWeekModal" : "personWeekModal");
  const actionButton = window.document.getElementById(view === "picture review" ? "saveImageScheduleButton" : view === "group schedule" ? "closeGroupWeekModal" : "exportPersonScheduleButton");
  const dialog = grid.closest(".schedule-modal");
  Object.defineProperties(grid, { scrollHeight: { value: 700 }, clientHeight: { value: 300, configurable: true }, scrollWidth: { value: 1300 }, clientWidth: { value: 300 } });
  Object.defineProperties(dialog, { scrollHeight: { value: 2000 }, clientHeight: { value: 600 } });
  grid.scrollTop = 0;
  dialog.scrollTop = 100;
  let clock = 0, nextFrame = 1;
  const frames = new Map();
  Object.defineProperty(window, "performance", { value: { now: () => clock }, configurable: true });
  window.requestAnimationFrame = callback => { const id = nextFrame++; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const advance = milliseconds => { clock += milliseconds; };
  const frame = (milliseconds = 16) => {
    advance(milliseconds);
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(clock));
  };
  const touch = (x, y, identifier = 1) => ({ identifier, clientX: x, clientY: y });
  const dispatch = (type, touches, cancelable = true) => {
    const event = new window.Event(type, { bubbles: true, cancelable });
    Object.defineProperty(event, "touches", { value: touches });
    grid.dispatchEvent(event);
    return event;
  };
  return { window, grid, dialog, container, actionButton, touch, dispatch, advance, frame, frames };
}

for (const view of ["picture review", "full schedule", "group schedule"]) {
const review = () => timetable(view);
const test = (name, run) => nodeTest(`${view}: ${name}`, run);

test("a vertical swipe immediately interrupts horizontal momentum", async () => {
  const a = await review();
  try {
    a.dispatch("touchstart", [a.touch(200, 300)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(160, 300)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(120, 300)]);
    a.dispatch("touchend", []);
    const beforeCoast = a.grid.scrollLeft; a.frame();
    assert.ok(a.grid.scrollLeft > beforeCoast);
    const stoppedX = a.grid.scrollLeft;
    a.dispatch("touchstart", [a.touch(100, 300)]);
    assert.equal(a.frames.size, 0);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 260)]);
    assert.equal(a.grid.scrollLeft, stoppedX);
    assert.equal(a.grid.scrollTop, 40);
    a.dispatch("touchend", []); a.frame();
    assert.equal(a.grid.scrollLeft, stoppedX);
    assert.ok(a.grid.scrollTop > 40);
  } finally { await a.window.happyDOM.abort(); }
});

test("diagonal swipes move both axes and momentum continues when only one hits an edge", async () => {
  const a = await review();
  try {
    a.grid.scrollLeft = 990; a.grid.scrollTop = 390;
    a.dispatch("touchstart", [a.touch(200, 300)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(170, 260)]);
    assert.equal(a.grid.scrollLeft, 1000);
    assert.equal(a.grid.scrollTop, 400);
    assert.equal(a.dialog.scrollTop, 130);
    a.dispatch("touchend", []); a.frame();
    assert.equal(a.grid.scrollLeft, 1000); assert.ok(a.dialog.scrollTop > 130);
    assert.equal(a.frames.size, 1, "horizontal edge does not end vertical coasting");
    a.dispatch("touchstart", [a.touch(200, 300)]);
    a.grid.scrollLeft = 100; a.dialog.scrollTop = 1400;
    a.advance(20); a.dispatch("touchmove", [a.touch(170, 260)]);
    a.dispatch("touchend", []); a.frame();
    assert.ok(a.grid.scrollLeft > 130); assert.equal(a.dialog.scrollTop, 1400);
    assert.equal(a.frames.size, 1, "vertical edge does not end horizontal coasting");
  } finally { await a.window.happyDOM.abort(); }
});

test("trackpad diagonals, vertical movement after horizontal movement and browser zoom stay usable", async () => {
  const a = await review();
  try {
    const wheel = options => {
      const event = new a.window.WheelEvent("wheel", { bubbles: true, cancelable: true, ...options });
      // happy-dom's WheelEvent omits modifier properties present in browsers.
      Object.defineProperties(event, { ctrlKey: { value: Boolean(options.ctrlKey) }, shiftKey: { value: Boolean(options.shiftKey) } });
      a.grid.dispatchEvent(event); return event;
    };
    assert.equal(wheel({ deltaX: 60, deltaY: 40 }).defaultPrevented, true);
    assert.equal(a.grid.scrollLeft, 60); assert.equal(a.grid.scrollTop, 40);
    a.grid.scrollLeft = 1000; a.grid.scrollTop = 400;
    wheel({ deltaX: 30, deltaY: 50 });
    assert.equal(a.grid.scrollLeft, 1000); assert.equal(a.dialog.scrollTop, 150);
    wheel({ deltaY: 30 }); assert.equal(a.dialog.scrollTop, 180);
    assert.equal(wheel({ deltaY: 50, ctrlKey: true }).defaultPrevented, false);
    assert.equal(a.dialog.scrollTop, 180);
    a.grid.scrollLeft = 100; wheel({ deltaY: 20, shiftKey: true });
    assert.equal(a.grid.scrollLeft, 120); assert.equal(a.dialog.scrollTop, 180);
  } finally { await a.window.happyDOM.abort(); }
});

test("picture review continues the same upward swipe into the dialog at the grid bottom", async () => {
  const a = await review();
  try {
    a.grid.scrollTop = 390;
    a.dispatch("touchstart", [a.touch(100, 300)]);
    assert.ok(a.dispatch("touchmove", [a.touch(101, 270)]).defaultPrevented);
    assert.equal(a.grid.scrollTop, 400);
    assert.equal(a.dialog.scrollTop, 120, "only the motion left after reaching the bottom transfers");
    a.dispatch("touchmove", [a.touch(101, 230)]);
    assert.equal(a.grid.scrollTop, 400);
    assert.equal(a.dialog.scrollTop, 160, "the same gesture must keep moving toward Save schedule");
    assert.equal(a.actionButton.disabled, false);
  } finally { a.window.happyDOM.abort(); }
});

test("downward swipes hand off at the top and reversing direction scrolls the grid again", async () => {
  const a = await review();
  try {
    a.grid.scrollTop = 10;
    a.dispatch("touchstart", [a.touch(100, 200)]);
    a.dispatch("touchmove", [a.touch(100, 230)]);
    assert.equal(a.grid.scrollTop, 0);
    assert.equal(a.dialog.scrollTop, 80);
    a.dispatch("touchmove", [a.touch(100, 260)]);
    assert.equal(a.dialog.scrollTop, 50);
    a.dispatch("touchmove", [a.touch(100, 220)]);
    assert.equal(a.grid.scrollTop, 40);
    assert.equal(a.dialog.scrollTop, 50);
  } finally { a.window.happyDOM.abort(); }
});

test("an unbounded horizontal timetable sends vertical swipes directly to the dialog", async () => {
  const a = await review();
  try {
    Object.defineProperty(a.grid, "clientHeight", { value: 700 });
    a.dispatch("touchstart", [a.touch(100, 300)]);
    a.dispatch("touchmove", [a.touch(100, 250)]);
    assert.equal(a.grid.scrollTop, 0);
    assert.equal(a.dialog.scrollTop, 150);
    a.dialog.scrollTop = 1390;
    a.dispatch("touchmove", [a.touch(100, 200)]);
    assert.equal(a.dialog.scrollTop, 1400, "scrolling stops at the dialog boundary");
    assert.equal(a.window.document.body.style.overflow, "hidden", "the page behind the dialog stays locked");
  } finally { a.window.happyDOM.abort(); }
});

test("taps remain native and horizontal movement can turn into a diagonal swipe", async () => {
  const a = await review();
  try {
    a.dispatch("touchstart", [a.touch(100, 300)]);
    assert.equal(a.dispatch("touchmove", [a.touch(102, 298)]).defaultPrevented, false);
    a.dispatch("touchend", []);
    a.dispatch("touchstart", [a.touch(100, 300)]);
    assert.equal(a.dispatch("touchmove", [a.touch(60, 298)]).defaultPrevented, true);
    assert.equal(a.dispatch("touchmove", [a.touch(40, 240)]).defaultPrevented, true);
    assert.equal(a.dialog.scrollTop, 100);
    assert.equal(a.grid.scrollTop, 60);
    assert.equal(a.grid.scrollLeft, 60);
  } finally { a.window.happyDOM.abort(); }
});

test("pinch gestures, canceled gestures and a changed touch cannot move the dialog", async () => {
  const a = await review();
  try {
    a.dispatch("touchstart", [a.touch(100, 300)]);
    assert.equal(a.dispatch("touchmove", [a.touch(100, 270), a.touch(200, 270, 2)]).defaultPrevented, false);
    a.dispatch("touchmove", [a.touch(100, 250)]);
    assert.equal(a.dialog.scrollTop, 100);
    a.dispatch("touchstart", [a.touch(100, 300)]);
    a.dispatch("touchcancel", []);
    a.dispatch("touchmove", [a.touch(100, 200)]);
    assert.equal(a.grid.scrollTop, 0);
    a.dispatch("touchstart", [a.touch(100, 300)]);
    a.dispatch("touchmove", [a.touch(100, 200, 2)]);
    assert.equal(a.grid.scrollTop, 0);
  } finally { a.window.happyDOM.abort(); }
});

test("a vertical flick continues after release, slows smoothly and settles", async () => {
  const a = await review();
  try {
    a.grid.scrollTop = 390;
    a.dispatch("touchstart", [a.touch(100, 300)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 270)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 230)]);
    a.advance(10); a.dispatch("touchend", []);
    assert.equal(a.frames.size, 1);
    const changes = [];
    for (let i = 0; i < 3; i++) {
      const before = a.dialog.scrollTop;
      a.frame(); changes.push(a.dialog.scrollTop - before);
    }
    assert.ok(changes.every(change => change > 0));
    assert.ok(changes[0] > changes[1] && changes[1] > changes[2], "the coast decelerates rather than moving at a fixed speed");
    assert.equal(a.grid.scrollTop, 400);
    for (let i = 0; i < 200 && a.frames.size; i++) a.frame();
    assert.equal(a.frames.size, 0, "the coast ends without a permanent animation loop");
    const stopped = a.dialog.scrollTop;
    a.frame(); assert.equal(a.dialog.scrollTop, stopped);
  } finally { await a.window.happyDOM.abort(); }
});

test("momentum transfers from the grid into its dialog in either direction", async () => {
  const a = await review();
  try {
    a.grid.scrollTop = 300;
    a.dispatch("touchstart", [a.touch(100, 300)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 250)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 210)]);
    assert.equal(a.grid.scrollTop, 390);
    assert.equal(a.dialog.scrollTop, 100);
    a.dispatch("touchend", []); a.frame();
    assert.equal(a.grid.scrollTop, 400);
    assert.ok(a.dialog.scrollTop > 100, "unused coast distance crosses the grid bottom without stopping");
    a.dispatch("touchstart", [a.touch(100, 200)]);
    a.grid.scrollTop = 100; a.dialog.scrollTop = 500;
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 250)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 290)]);
    assert.equal(a.grid.scrollTop, 10);
    a.dispatch("touchend", []); a.frame();
    assert.equal(a.grid.scrollTop, 0);
    assert.ok(a.dialog.scrollTop < 500, "coast distance also crosses the grid top");
  } finally { await a.window.happyDOM.abort(); }
});

test("a new touch anywhere or another input immediately stops momentum", async () => {
  const a = await review();
  try {
    for (const type of ["touchstart", "pointerdown", "wheel", "keydown", "click", "visibilitychange"]) {
      a.grid.scrollTop = 400; a.dialog.scrollTop = 100;
      a.dispatch("touchstart", [a.touch(100, 300)]);
      a.advance(20); a.dispatch("touchmove", [a.touch(100, 260)]);
      a.advance(20); a.dispatch("touchmove", [a.touch(100, 220)]);
      a.dispatch("touchend", []); a.frame();
      assert.equal(a.frames.size, 1);
      const stopped = a.dialog.scrollTop;
      if (type === "visibilitychange") Object.defineProperty(a.window.document, "hidden", { value: true, configurable: true });
      a.window.document.dispatchEvent(new a.window.Event(type, { bubbles: true }));
      assert.equal(a.frames.size, 0, `${type} cancels the pending coast frame`);
      a.frame(); assert.equal(a.dialog.scrollTop, stopped);
      if (type === "visibilitychange") Object.defineProperty(a.window.document, "hidden", { value: false, configurable: true });
    }
  } finally { await a.window.happyDOM.abort(); }
});

test("a pause, cancellation, pinch or replaced touch cannot start momentum", async () => {
  const a = await review();
  try {
    for (const interruption of ["pause", "cancel", "pinch", "replacement", "native"]) {
      a.dispatch("touchstart", [a.touch(100, 300)]);
      a.advance(20);
      a.dispatch("touchmove", [a.touch(100, 270)]);
      a.advance(20); a.dispatch("touchmove", [a.touch(100, 230)]);
      if (interruption === "pause") a.advance(120);
      if (interruption === "cancel") a.dispatch("touchcancel", []);
      if (interruption === "pinch") a.dispatch("touchmove", [a.touch(100, 220), a.touch(200, 220, 2)]);
      if (interruption === "replacement") a.dispatch("touchmove", [a.touch(100, 220, 2)]);
      if (interruption === "native") a.dispatch("touchmove", [a.touch(100, 220)], false);
      a.dispatch("touchend", []);
      assert.equal(a.frames.size, 0, `${interruption} must not create a custom coast`);
    }
  } finally { await a.window.happyDOM.abort(); }
});

test("reversing the finger uses the last direction, and coasting stops at dialog boundaries or hidden review", async () => {
  const a = await review();
  try {
    a.grid.scrollTop = 200;
    a.dispatch("touchstart", [a.touch(100, 300)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 200)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 230)]);
    const before = a.grid.scrollTop;
    a.dispatch("touchend", []); a.frame();
    assert.ok(a.grid.scrollTop < before, "the coast follows the reversal rather than the initial swipe");
    a.grid.scrollTop = 400; a.dialog.scrollTop = 1390;
    a.dispatch("touchstart", [a.touch(100, 300)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 250)]);
    a.dispatch("touchend", []); a.frame();
    assert.equal(a.dialog.scrollTop, 1400);
    assert.equal(a.frames.size, 0);
    assert.equal(a.window.document.body.style.overflow, "hidden");
    a.grid.scrollTop = 400; a.dialog.scrollTop = 100;
    a.dispatch("touchstart", [a.touch(100, 300)]);
    a.advance(20); a.dispatch("touchmove", [a.touch(100, 250)]);
    a.dispatch("touchend", []);
    const stopped = a.dialog.scrollTop;
    a.container.hidden = true;
    a.frame();
    assert.equal(a.dialog.scrollTop, stopped);
    assert.equal(a.frames.size, 0);
  } finally { await a.window.happyDOM.abort(); }
});

test("faster flicks travel farther and coast distance is consistent at 60Hz and 120Hz", async () => {
  const a = await review();
  try {
    const distance = (moveTime, frameTime, count) => {
      a.grid.scrollTop = 400; a.dialog.scrollTop = 100;
      a.dispatch("touchstart", [a.touch(100, 300)]);
      a.advance(moveTime); a.dispatch("touchmove", [a.touch(100, 270)]);
      a.advance(moveTime); a.dispatch("touchmove", [a.touch(100, 240)]);
      const before = a.dialog.scrollTop;
      a.dispatch("touchend", []);
      for (let i = 0; i < count; i++) a.frame(frameTime);
      return a.dialog.scrollTop - before;
    };
    const sixty = distance(20, 1000 / 60, 24);
    const oneTwenty = distance(20, 1000 / 120, 48);
    assert.ok(sixty > 0);
    assert.ok(Math.abs(sixty - oneTwenty) < .01, "equal elapsed time produces equal coast distance across refresh rates");
    const slow = distance(80, 1000 / 60, 24);
    assert.ok(sixty > slow * 2, "momentum responds to flick speed");
  } finally { await a.window.happyDOM.abort(); }
});
}


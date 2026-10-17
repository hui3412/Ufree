import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

const key = "whos-free-person-order-v1";
const fixture = { schema_version: 1, people: {
  "Person 1": { classes: [] }, "Person 2": { classes: [] },
  "Person 3": { classes: [{ day: "Monday", start: "08:00", end: "09:00", course: "Busy" }] },
  "Person 4": { classes: [] }
} };
const groups = { groups: ["a", "b"].map(id => ({ id, name: id.toUpperCase(), members: Object.keys(fixture.people) })) };
async function app(orders = null, data = fixture, pins = [], { reducedMotion = false } = {}) {
  const window = new Window({ url: "http://localhost/Whos-Free/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  window.setInterval = () => 0;
  window.matchMedia = query => ({ matches: reducedMotion && query.includes("prefers-reduced-motion"), addEventListener() {} });
  window.confirm = () => true;
  window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data, meta: {} }));
  window.localStorage.setItem("whos-free-groups-v1", JSON.stringify(groups));
  window.localStorage.setItem("whos-free-people-preferences-v1", JSON.stringify({ pinnedPeople: pins }));
  if (orders !== null) window.localStorage.setItem(key, JSON.stringify(orders));
  for (const file of ["schedule-availability.js", "schedule-groups.js", "app.js"]) window.eval(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"));
  const tick = () => new Promise(resolve => setTimeout(resolve, 35));
  await tick();
  const el = id => window.document.getElementById(id);
  el("daySelect").value = "Monday";
  el("daySelect").dispatchEvent(new window.Event("change"));
  el("timeInput").value = "08:30";
  el("timeInput").dispatchEvent(new window.Event("input"));
  const cards = (scope = "main") => [...el("peopleList").querySelectorAll(".person-card")].filter(card => card.dataset.orderScope === scope);
  const names = scope => cards(scope).map(card => card.dataset.person);
  const card = (name, scope = "main") => cards(scope).find(card => card.dataset.person === name);
  const move = (name, direction, scope = "main") => card(name, scope).dispatchEvent(new window.KeyboardEvent("keydown", { key: direction === "up" ? "ArrowUp" : "ArrowDown", altKey: true, bubbles: true }));
  const event = (target, type, props = {}) => {
    const e = new window.Event(type, { bubbles: true, cancelable: true });
    for (const [name, value] of Object.entries(props)) Object.defineProperty(e, name, { value });
    target.dispatchEvent(e);
    return e;
  };
  const holdTimers = new Map();
  const originalTimeout = window.setTimeout.bind(window), originalClear = window.clearTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) => {
    if (delay !== 450) return originalTimeout(callback, delay, ...args);
    const id = `hold-${holdTimers.size}`; holdTimers.set(id, callback); return id;
  };
  window.clearTimeout = id => { if (holdTimers.has(id)) holdTimers.delete(id); else originalClear(id); };
  const hold = () => { for (const [id, callback] of holdTimers) { holdTimers.delete(id); callback(); } };
  const read = () => JSON.parse(window.localStorage.getItem(key));
  return { window, el, cards, names, card, move, event, read, tick, hold };
}

// A real layout model lets the gesture tests check moving insertion slots,
// unequal row heights and animation coordinates rather than zero DOM bounds.
function motionLayout(a) {
  const originalRect = a.window.Element.prototype.getBoundingClientRect;
  const originalAnimate = a.window.HTMLElement.prototype.animate;
  const heights = { "Person 1": 80, "Person 2": 104, "Person 4": 96 };
  const rectangle = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top });
  a.window.Element.prototype.getBoundingClientRect = function () {
    if (this.classList.contains("person-drag-ghost")) {
      const delta = /translate3d\(([-.\d]+)px, ([-.\d]+)px/.exec(this.style.transform);
      return rectangle(parseFloat(this.style.left) + +(delta?.[1] || 0), parseFloat(this.style.top) + +(delta?.[2] || 0), parseFloat(this.style.width), parseFloat(this.style.height));
    }
    if (this.classList.contains("person-card")) {
      let top = 100 - a.el("peopleList").scrollTop;
      for (const card of this.parentElement.querySelectorAll(".person-card")) {
        if (card === this) break;
        top += (heights[card.dataset.person] || 80) + 10;
      }
      const offset = /translate3d\(0, ([-.\d]+)px/.exec(this.style.transform);
      return rectangle(20, top + +(offset?.[1] || 0), 360, heights[this.dataset.person] || 80);
    }
    return this.id === "peopleList" ? rectangle(20, 80, 360, 700) : rectangle(0, 0, 0, 0);
  };
  const animations = [], frames = new Map(); let frameId = 0;
  a.window.HTMLElement.prototype.animate = function (keyframes, options) { animations.push({ person: this.dataset.person, keyframes, options }); return { cancel() {} }; };
  a.window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  a.window.cancelAnimationFrame = id => frames.delete(id);
  a.window.document.elementFromPoint = (x, y) => a.cards().find(card => {
    const rect = card.getBoundingClientRect(); return y >= rect.top && y <= rect.bottom;
  }) || a.el("peopleList");
  const touch = (x, y, identifier = 7) => ({ identifier, clientX: x, clientY: y });
  const start = name => { const source = a.card(name), rect = source.getBoundingClientRect(); a.event(source, "touchstart", { touches: [touch(50, rect.top + 36)] }); a.hold(); return source; };
  const move = (source, y) => a.event(source, "touchmove", { touches: [touch(50, y)] });
  const frame = time => { const tasks = [...frames.values()]; frames.clear(); tasks.forEach(task => task(time)); };
  const restore = () => {
    a.window.Element.prototype.getBoundingClientRect = originalRect;
    if (originalAnimate) a.window.HTMLElement.prototype.animate = originalAnimate;
    else delete a.window.HTMLElement.prototype.animate;
  };
  return { animations, frames, start, move, frame, touch, restore };
}

test("held cards follow the finger while unequal-height neighbours preview their positions without saving", async () => {
  const a = await app(); let m;
  try {
    m = motionLayout(a); const source = m.start("Person 4");
    assert.equal(source.isConnected, true, "the active touch target stays in place in the DOM");
    const ghost = a.window.document.querySelector(".person-drag-ghost");
    assert.equal(ghost.getAttribute("aria-hidden"), "true"); assert.equal(ghost.hasAttribute("inert"), true);
    const event = m.move(source, 125);
    assert.equal(event.defaultPrevented, true);
    assert.match(ghost.style.transform, /translate3d/);
    assert.equal(a.card("Person 1").style.transform, "translate3d(0, 106px, 0)");
    assert.equal(a.card("Person 2").style.transform, "translate3d(0, 106px, 0)");
    assert.deepEqual(a.names(), ["Person 1", "Person 2", "Person 4"]);
    assert.equal(a.read(), null); assert.equal(a.el("undoChangesButton").disabled, true);
    a.event(source, "touchend", { touches: [] });
    assert.deepEqual(a.names(), ["Person 4", "Person 1", "Person 2"]);
    assert.deepEqual(a.read().main, ["Person 4", "Person 1", "Person 2", "Person 3"]);
    assert.equal(a.window.document.querySelector(".person-drag-ghost"), null); assert.equal(m.frames.size, 0);
    assert.ok(m.animations.some(animation => animation.person === "Person 4" && animation.options.duration === 220), "the released card settles from its finger position");
    assert.match(a.el("detailPanel").textContent, /Select someone/);
    a.el("undoChangesButton").click(); await a.tick();
    assert.deepEqual(a.names(), ["Person 1", "Person 2", "Person 4"]);
  } finally { m?.restore(); await a.window.happyDOM.abort(); }
});

test("Escape, interruption and a second finger restore the preview and remove its floating card", async () => {
  for (const interruption of ["Escape", "blur", "resize", "second-touch", "touchcancel"]) {
    const a = await app(); let m;
    try {
      m = motionLayout(a); const source = m.start("Person 4"); m.move(source, 125);
      if (interruption === "Escape") a.event(source, "keydown", { key: "Escape" });
      else if (interruption === "second-touch") a.event(source, "touchstart", { touches: [m.touch(50, 125), m.touch(100, 150, 8)] });
      else if (interruption === "touchcancel") a.event(source, "touchcancel", { touches: [] });
      else {
        if (interruption === "resize") a.window.happyDOM.setWindowSize({ width: 1100, height: 900 });
        a.window.dispatchEvent(new a.window.Event(interruption));
      }
      assert.equal(a.window.document.querySelector(".person-drag-ghost"), null, interruption);
      assert.equal(m.frames.size, 0, interruption);
      assert.equal(a.read(), null, interruption);
      assert.deepEqual(a.names(), ["Person 1", "Person 2", "Person 4"]);
      assert.ok(a.cards().every(card => !card.style.transform && !card.classList.contains("person-reorder-preview")));
    } finally { m?.restore(); await a.window.happyDOM.abort(); }
  }
});

test("edge scrolling continues with a stationary finger and stops immediately on cancellation", async () => {
  const a = await app(); let m;
  try {
    a.window.happyDOM.setWindowSize({ width: 390, height: 500 });
    m = motionLayout(a); const source = m.start("Person 1");
    Object.defineProperty(a.el("peopleList"), "scrollHeight", { value: 1200 });
    Object.defineProperty(a.el("peopleList"), "clientHeight", { value: 350 });
    m.move(source, 485); m.frame(16); m.frame(32); m.frame(48);
    assert.ok(a.el("peopleList").scrollTop > 0);
    assert.equal(a.read(), null);
    a.event(source, "touchcancel", { touches: [] });
    const scroll = a.el("peopleList").scrollTop;
    m.frame(64); assert.equal(a.el("peopleList").scrollTop, scroll); assert.equal(m.frames.size, 0);
  } finally { m?.restore(); await a.window.happyDOM.abort(); }
});

test("native drops in gaps animate the final order and reduced motion skips settling", async () => {
  for (const reducedMotion of [false, true]) {
    const a = await app(null, fixture, [], { reducedMotion }); let m;
    try {
      m = motionLayout(a); const source = a.card("Person 4");
      a.event(source, "dragstart", { clientX: 50, clientY: 340 });
      a.event(a.el("peopleList"), "dragover", { clientX: 50, clientY: 185 });
      a.event(a.el("peopleList"), "drop", { clientX: 50, clientY: 185 });
      assert.deepEqual(a.names(), ["Person 1", "Person 4", "Person 2"]);
      assert.equal(a.window.document.querySelector(".person-drag-ghost"), null);
      assert.equal(m.animations.length, 0, "settled neighbours already occupy their preview slots");
      a.move("Person 4", "down");
      assert.equal(m.animations.length > 0, !reducedMotion);
    } finally { m?.restore(); await a.window.happyDOM.abort(); }
  }
});

test("animated previews preserve the pin boundary and height-only viewport changes keep the gesture active", async () => {
  const a = await app(null, fixture, ["Person 1"]); let m;
  try {
    m = motionLayout(a); const source = m.start("Person 4");
    m.move(source, 125);
    assert.ok(a.cards().every(card => !card.style.transform), "invalid placement cannot visually move someone above a pin");
    a.window.happyDOM.setWindowSize({ width: a.window.innerWidth, height: 650 });
    a.window.dispatchEvent(new a.window.Event("resize"));
    assert.ok(a.window.document.querySelector(".person-drag-ghost"), "browser chrome may resize the viewport height during scrolling");
    a.event(source, "touchend", { touches: [] });
    assert.equal(a.read(), null);
    assert.match(a.el("toast").textContent, /Cannot move someone above a pinned person/);
    assert.equal(a.window.document.querySelector(".person-drag-ghost"), null);
    assert.equal(m.frames.size, 0);
  } finally { m?.restore(); await a.window.happyDOM.abort(); }
});

test("filtered moves preserve hidden people, All/Free order and reloaded positions", async () => {
  const a = await app(); let reloaded;
  try {
    assert.deepEqual(a.names(), ["Person 1", "Person 2", "Person 4"]);
    a.move("Person 4", "up");
    assert.deepEqual(a.names(), ["Person 1", "Person 4", "Person 2"]);
    assert.deepEqual(a.read().main, ["Person 1", "Person 4", "Person 2", "Person 3"]);
    a.el("viewToggleButton").click();
    assert.deepEqual(a.names(), ["Person 1", "Person 4", "Person 2", "Person 3"]);
    a.el("viewToggleButton").click();
    assert.deepEqual(a.names(), ["Person 1", "Person 4", "Person 2"]);
    reloaded = await app(a.read());
    assert.deepEqual(reloaded.names(), a.names());
    reloaded.el("timeInput").value = "10:00";
    reloaded.event(reloaded.el("timeInput"), "input");
    assert.deepEqual(reloaded.names(), ["Person 1", "Person 4", "Person 2", "Person 3"]);
  } finally { await a.window.happyDOM.abort(); await reloaded?.window.happyDOM.abort(); }
});

test("pins override saved order and blocked moves do not save or add Undo entries", async () => {
  const a = await app({ main: ["Person 4", "Person 2", "Person 1", "Person 3"] }, fixture, ["Person 1", "Person 2"]);
  let reloaded;
  try {
    assert.deepEqual(a.names(), ["Person 2", "Person 1", "Person 4"]);
    const before = a.read();
    a.move("Person 4", "up");
    assert.deepEqual(a.names(), ["Person 2", "Person 1", "Person 4"]);
    assert.deepEqual(a.read(), before);
    assert.match(a.el("toast").textContent, /Cannot move someone above a pinned person/);
    assert.equal(a.el("undoChangesButton").disabled, true);
    a.move("Person 1", "down");
    assert.deepEqual(a.read(), before);
    assert.match(a.el("toast").textContent, /Pinned people must stay above unpinned people/);
    a.move("Person 1", "up");
    assert.deepEqual(a.names(), ["Person 1", "Person 2", "Person 4"]);
    reloaded = await app(a.read(), fixture, ["Person 1", "Person 2"]);
    assert.deepEqual(reloaded.names(), a.names());
    a.el("undoChangesButton").click(); await a.tick();
    assert.deepEqual(a.names(), ["Person 2", "Person 1", "Person 4"]);
    a.el("viewToggleButton").click();
    assert.deepEqual(a.names(), ["Person 2", "Person 1", "Person 4", "Person 3"]);
    a.el("showGroupsToggle").click();
    a.move("Person 4", "up", "group:a");
    assert.deepEqual(a.names("group:a"), ["Person 1", "Person 2", "Person 4", "Person 3"]);
    a.move("Person 2", "up", "group:a");
    assert.deepEqual(a.names("group:a"), ["Person 2", "Person 1", "Person 4", "Person 3"]);
    assert.deepEqual(a.names("group:b"), ["Person 1", "Person 2", "Person 4", "Person 3"]);
  } finally { await a.window.happyDOM.abort(); await reloaded?.window.happyDOM.abort(); }
});

test("new pins immediately rise above manual orders, including busy filtered pins and drag boundaries", async () => {
  const a = await app({ main: ["Person 4", "Person 2", "Person 1", "Person 3"] });
  try {
    a.el("settingsButton").click();
    a.window.document.querySelector('[aria-label="Pin Person 2 to the top"]').click();
    a.window.document.querySelector('[aria-label="Pin Person 3 to the top"]').click();
    a.el("closeSettingsModal").click();
    assert.deepEqual(a.names(), ["Person 2", "Person 4", "Person 1"]);
    const before = a.read();
    a.event(a.card("Person 4"), "dragstart");
    a.event(a.card("Person 2"), "drop", { clientY: -1 });
    assert.deepEqual(a.read(), before);
    assert.match(a.el("toast").textContent, /Cannot move someone above a pinned person/);
    a.move("Person 1", "up");
    assert.deepEqual(a.names(), ["Person 2", "Person 1", "Person 4"]);
    a.el("viewToggleButton").click();
    assert.deepEqual(a.names(), ["Person 2", "Person 3", "Person 1", "Person 4"]);
  } finally { await a.window.happyDOM.abort(); }
});

test("main and overlapping groups have independent persisted orders", async () => {
  const a = await app(); let reloaded;
  try {
    a.move("Person 4", "up");
    a.el("showGroupsToggle").click();
    assert.deepEqual(a.names("group:a"), ["Person 1", "Person 2", "Person 4"]);
    assert.deepEqual(a.names("group:b"), ["Person 1", "Person 2", "Person 4"]);
    a.move("Person 2", "up", "group:a");
    assert.deepEqual(a.names("group:a"), ["Person 2", "Person 1", "Person 4"]);
    assert.deepEqual(a.names("group:b"), ["Person 1", "Person 2", "Person 4"]);
    a.el("viewToggleButton").click();
    assert.deepEqual(a.names("group:a"), ["Person 2", "Person 1", "Person 4", "Person 3"]);
    a.el("showGroupsToggle").click();
    assert.deepEqual(a.names(), ["Person 1", "Person 4", "Person 2", "Person 3"]);
    reloaded = await app(a.read());
    reloaded.el("showGroupsToggle").click();
    assert.deepEqual(reloaded.names("group:a"), ["Person 2", "Person 1", "Person 4"]);
    assert.deepEqual(reloaded.names("group:b"), ["Person 1", "Person 2", "Person 4"]);
  } finally { await a.window.happyDOM.abort(); await reloaded?.window.happyDOM.abort(); }
});

test("native drag supports before/after placement and rejects cross-group drops", async () => {
  const a = await app();
  try {
    let source = a.card("Person 4"), target = a.card("Person 2");
    a.event(source, "dragstart");
    a.event(target, "drop", { clientY: -1 });
    assert.deepEqual(a.names(), ["Person 1", "Person 4", "Person 2"]);
    source = a.card("Person 1"); target = a.card("Person 2");
    a.event(source, "dragstart"); a.event(target, "drop", { clientY: 1 });
    assert.deepEqual(a.names(), ["Person 4", "Person 2", "Person 1"]);
    a.el("showGroupsToggle").click();
    const before = a.read(); source = a.card("Person 4", "group:a");
    a.event(source, "dragstart"); a.event(a.card("Person 1", "group:b"), "drop", { clientY: -1 });
    a.event(source, "dragend");
    assert.deepEqual(a.read(), before);
  } finally { await a.window.happyDOM.abort(); }
});

test("touch hold reorders without grips or opening details; cancellation and keyboard boundaries are safe", async () => {
  const a = await app();
  try {
    let source = a.card("Person 4");
    assert.equal(a.el("peopleList").querySelector(".person-drag-grip"), null);
    a.window.document.elementFromPoint = () => a.card("Person 2");
    a.event(source, "touchstart", { touches: [{ identifier: 7, clientX: 10, clientY: 20 }] });
    assert.equal(source.classList.contains("person-dragging"), false);
    a.hold();
    assert.equal(source.classList.contains("person-dragging"), true);
    a.event(source, "touchmove", { touches: [{ identifier: 7, clientX: 10, clientY: -1 }] });
    a.event(source, "touchend", { touches: [] });
    assert.deepEqual(a.names(), ["Person 1", "Person 4", "Person 2"]);
    assert.match(a.el("detailPanel").textContent, /Select someone/);
    source = a.card("Person 2");
    const before = a.read();
    a.event(source, "touchstart", { touches: [{ identifier: 8, clientX: 10, clientY: 20 }] });
    a.hold();
    a.event(source, "touchcancel", { touches: [] });
    assert.deepEqual(a.read(), before);
    a.move("Person 1", "up");
    assert.deepEqual(a.read(), before);
  } finally { await a.window.happyDOM.abort(); }
});

test("scrolling or a short tap cancels the hold without intercepting movement or creating Undo", async () => {
  const a = await app();
  try {
    const source = a.card("Person 4");
    a.event(source, "touchstart", { touches: [{ identifier: 1, clientX: 20, clientY: 20 }] });
    const move = a.event(source, "touchmove", { touches: [{ identifier: 1, clientX: 20, clientY: 50 }] });
    a.hold();
    assert.equal(move.defaultPrevented, false);
    assert.equal(source.classList.contains("person-dragging"), false);
    assert.equal(a.read(), null);
    assert.equal(a.el("undoChangesButton").disabled, true);
    a.event(source, "touchend", { touches: [] });
    a.event(source, "touchstart", { touches: [{ identifier: 2, clientX: 20, clientY: 20 }] });
    a.event(source, "touchend", { touches: [] });
    a.hold();
    assert.equal(source.classList.contains("person-dragging"), false);
    source.click();
    assert.match(a.el("detailPanel").textContent, /Person 4/);
  } finally { await a.window.happyDOM.abort(); }
});

test("Undo reverses person moves in each scope without changing schedules or another list", async () => {
  const a = await app();
  try {
    const schedules = a.window.localStorage.getItem("whos-free-local-schedules");
    a.move("Person 4", "up");
    const main = a.read().main;
    assert.equal(a.el("undoChangesButton").disabled, false);
    a.el("showGroupsToggle").click();
    a.move("Person 2", "up", "group:a");
    assert.deepEqual(a.names("group:a"), ["Person 2", "Person 1", "Person 4"]);
    a.el("undoChangesButton").click(); await a.tick();
    assert.deepEqual(a.names("group:a"), ["Person 1", "Person 2", "Person 4"]);
    assert.deepEqual(a.read().main, main);
    assert.equal(a.window.localStorage.getItem("whos-free-local-schedules"), schedules);
    a.el("undoChangesButton").click(); await a.tick();
    a.el("showGroupsToggle").click();
    assert.deepEqual(a.names(), ["Person 1", "Person 2", "Person 4"]);
    assert.equal(a.read().main, undefined);
    assert.equal(a.el("undoChangesButton").disabled, true);
  } finally { await a.window.happyDOM.abort(); }
});

test("new people append, invalid saved data is ignored, and unavailable storage warns", async () => {
  const extra = { schema_version: 1, people: { ...fixture.people, "Person 0": { classes: [] } } };
  const a = await app({ main: ["Person 4", "Person 1", "Person 4", 42, "Deleted", "Person 2", "Person 3"] }, extra);
  const b = await app("not an order object");
  try {
    assert.deepEqual(a.names(), ["Person 4", "Person 1", "Person 2", "Person 0"]);
    assert.deepEqual(b.names(), ["Person 1", "Person 2", "Person 4"]);
    Object.defineProperty(b.window.localStorage, "setItem", { value: () => { throw new Error("Storage blocked"); } });
    b.move("Person 4", "up");
    assert.deepEqual(b.names(), ["Person 1", "Person 4", "Person 2"]);
    // Keyboard move feedback must not hide the persistence warning.
    assert.match(b.el("toast").textContent, /could not be saved/);
  } finally { await a.window.happyDOM.abort(); await b.window.happyDOM.abort(); }
});

test("renaming retains saved positions and Undo restores the old names", async () => {
  const saved = { main: ["Person 4", "Person 1", "Person 2", "Person 3"], "group:a": ["Person 2", "Person 4", "Person 1", "Person 3"] };
  const a = await app(saved);
  try {
    a.window.document.querySelector('[aria-label="Edit Person 4"]').click();
    a.el("imageReviewName").value = "Renamed";
    a.el("saveImageScheduleButton").click(); await a.tick();
    assert.deepEqual(a.read().main, ["Renamed", "Person 1", "Person 2", "Person 3"]);
    assert.deepEqual(a.read()["group:a"], ["Person 2", "Renamed", "Person 1", "Person 3"]);
    a.el("undoChangesButton").click(); await a.tick();
    assert.deepEqual(a.read(), saved);
  } finally { await a.window.happyDOM.abort(); }
});

test("deleting and undoing a person preserves their saved place", async () => {
  const saved = { main: ["Person 4", "Person 1", "Person 2", "Person 3"] };
  const a = await app(saved);
  try {
    a.window.document.querySelector('[aria-label="Remove Person 4"]').click(); await a.tick();
    assert.deepEqual(a.names(), ["Person 1", "Person 2"]);
    a.el("undoChangesButton").click(); await a.tick();
    assert.deepEqual(a.names(), ["Person 4", "Person 1", "Person 2"]);
    assert.deepEqual(a.read(), saved);
  } finally { await a.window.happyDOM.abort(); }
});

test("schedule and person-order changes share chronological Undo; no-op drops add no history", async () => {
  const a = await app();
  try {
    const source = a.card("Person 4");
    a.event(source, "dragstart"); a.event(a.card("Person 2"), "drop", { clientY: 1 });
    assert.equal(a.el("undoChangesButton").disabled, true);
    assert.equal(a.read(), null);
    a.window.document.querySelector('[aria-label="Edit Person 4"]').click();
    a.el("imageReviewName").value = "Renamed";
    a.el("saveImageScheduleButton").click(); await a.tick();
    a.move("Renamed", "up");
    assert.match(a.el("undoChangesStatus").textContent, /2 changes available/);
    a.el("undoChangesButton").click(); await a.tick();
    assert.deepEqual(a.names(), ["Person 1", "Person 2", "Renamed"]);
    assert.ok(JSON.parse(a.window.localStorage.getItem("whos-free-local-schedules")).data.people.Renamed);
    a.el("undoChangesButton").click(); await a.tick();
    assert.deepEqual(a.names(), ["Person 1", "Person 2", "Person 4"]);
    assert.equal(a.el("undoChangesButton").disabled, true);
  } finally { await a.window.happyDOM.abort(); }
});


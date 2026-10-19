import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { Window } from "happy-dom";

const readSource = file => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
const clean = value => JSON.parse(JSON.stringify(value));
const slot = { day: "Monday", start: "09:00", end: "10:00", course: "Math" };

async function app(people = {}, date = "2026-10-05T12:00:00") {
  const window = new Window({ url: "http://localhost/Whos-Free/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(readSource("index.html"));
  window.setInterval = () => 0;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.confirm = () => true;
  window.URL.createObjectURL = () => "blob:test";
  window.URL.revokeObjectURL = () => {};
  // Stable calendar term for tests without inventing dates in product code.
  const RealDate = window.Date;
  window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [date])); } };
  window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: { schema_version: 1, people }, meta: {} }));
  for (const file of ["schedule-availability.js", "schedule-groups.js", "schedule-share-code.js", "app.js"]) window.eval(readSource(file));
  const tick = () => new Promise(resolve => setTimeout(resolve, 40));
  await tick();
  const el = id => window.document.getElementById(id);
  const stored = () => JSON.parse(window.localStorage.getItem("whos-free-local-schedules") || "null");
  return { window, el, tick, stored };
}

test("semester labels distinguish earlier terms and unlabeled legacy schedules without changing availability", async () => {
  const { window, el } = await app({ Old: { semester: "Winter 2026", classes: [slot] }, Current: { semester: "Fall 2026", classes: [slot] }, Future: { semester: "Winter 2027", classes: [slot] }, Legacy: { classes: [slot] } });
  try {
    const rows = [...el("peopleManagerList").children];
    assert.match(rows.find(row => row.textContent.includes("Old")).textContent, /Winter 2026 · Previous semester/);
    assert.doesNotMatch(rows.find(row => row.textContent.includes("Current")).textContent, /Previous semester/);
    assert.doesNotMatch(rows.find(row => row.textContent.includes("Future")).textContent, /Previous semester/);
    assert.match(rows.find(row => row.textContent.includes("Legacy")).textContent, /Fall 2026/);
    el("liveToggle").checked = false; el("liveToggle").dispatchEvent(new window.Event("change"));
    el("daySelect").value = "Monday"; el("daySelect").dispatchEvent(new window.Event("change"));
    el("timeInput").value = "09:30"; el("timeInput").dispatchEvent(new window.Event("change"));
    assert.equal(el("peopleList").querySelectorAll(".person-card").length, 0, "all four terms retain their busy classes");
    window.document.querySelector('[aria-label="Edit Legacy"]').click();
    assert.equal(el("imageReviewSemester").value, "Fall");
    assert.equal(el("imageReviewYear").disabled, false);
  } finally { await window.happyDOM.abort(); }
});

test("semester assignment validates, survives saving and reopening, and can be undone or cleared", async () => {
  const { window, el, tick, stored } = await app({ Legacy: { classes: [] } });
  try {
    window.document.querySelector('[aria-label="Edit Legacy"]').click();
    el("imageReviewSemester").value = "Fall"; el("imageReviewSemester").dispatchEvent(new window.Event("change"));
    assert.equal(el("imageReviewYear").disabled, false);
    el("imageReviewYear").value = "1999"; el("saveImageScheduleButton").click();
    assert.match(el("imageReviewError").textContent, /2000 to 2099/);
    assert.equal(stored().data.people.Legacy.semester, "Fall 2026");
    el("imageReviewYear").value = "2026"; el("saveImageScheduleButton").click(); await tick();
    assert.equal(stored().data.people.Legacy.semester, "Fall 2026");
    window.document.querySelector('[aria-label="Edit Legacy"]').click();
    assert.equal(el("imageReviewSemester").value, "Fall");
    assert.equal(el("imageReviewYear").value, "2026");
    el("cancelImageScheduleButton").click();
    el("undoChangesButton").click(); await tick();
    assert.equal(stored().data.people.Legacy.semester, "Fall 2026");
    el("manualScheduleButton").click();
    assert.equal(el("imageReviewSemester").value, "Fall");
    el("imageReviewName").value = "New";
    el("imageReviewSemester").value = ""; el("imageReviewSemester").dispatchEvent(new window.Event("change"));
    el("saveImageScheduleButton").click(); await tick();
    assert.equal(stored().data.people.New.semester, null);
  } finally { await window.happyDOM.abort(); }
});

test("uncertainty uses only inline warning icons and a count directly above Save, with no jump or check controls", async () => {
  const { window, el, tick, stored } = await app();
  const warning = "Text recognition is uncertain.";
  try {
    window.WhosFreeImageParser = { parseScheduleImage: async () => ({ name: "Student", person: { source_file: "picture.png", classes: [{ ...slot, review_warning: warning, recognition_confidence: 53 }, { ...slot, start: "12:00", end: "13:00", review_warning: "Multiple courses were detected." }] } }) };
    Object.defineProperty(el("scheduleImageInput"), "files", { value: [{ name: "picture.png" }], configurable: true });
    el("scheduleImageInput").dispatchEvent(new window.Event("change")); await tick();
    assert.match(el("recognitionReviewSummary").textContent, /2 uncertain detections/);
    assert.equal(el("nextUncertainBlockButton"), null);
    assert.equal(window.document.querySelector(".recognition-check"), null);
    const blocks = [...el("reviewGrid").querySelectorAll(".review-grid-block")];
    assert.ok(blocks.every(block => block.textContent.includes("⚠ Math")));
    assert.ok(blocks.every(block => block.getAttribute("aria-label").includes("Uncertain detection")));
    assert.equal(el("recognitionReviewNotice").nextElementSibling.className, "modal-actions review-actions");
    assert.equal(el("reviewGrid").querySelector(".review-break").textContent, "Break 120 min");
    el("saveImageScheduleButton").click(); await tick();
    assert.equal(stored().data.people.Student.semester, "Fall 2026");
    assert.equal(stored().data.people.Student.classes[0].review_warning, warning);
    window.document.querySelector('[aria-label="Edit Student"]').click();
    assert.match(el("recognitionReviewSummary").textContent, /2 uncertain detections/);
    el("reviewGrid").querySelector(".review-grid-block").click();
    window.document.querySelector(".review-class:not([hidden]) .mini-danger-button").click();
    assert.match(el("recognitionReviewSummary").textContent, /1 uncertain detection\./);
    el("reviewGrid").querySelector(".review-grid-block").click();
    window.document.querySelector(".review-class:not([hidden]) .mini-danger-button").click();
    assert.equal(el("recognitionReviewNotice").hidden, true);
  } finally { await window.happyDOM.abort(); }
});

test("JSON import and export retain semester labels and reject malformed labels without changing data", async () => {
  const { window, el, tick, stored } = await app({ Old: { classes: [] } });
  try {
    const input = async people => {
      Object.defineProperty(el("scheduleFileInput"), "files", { value: [{ name: "semester.json", text: async () => JSON.stringify({ people }) }], configurable: true });
      el("scheduleFileInput").dispatchEvent(new window.Event("change")); await tick();
    };
    await input({ New: { semester: "Winter 2027", classes: [] } });
    assert.equal(stored().data.people.New.semester, "Winter 2027");
    const before = clean(stored().data);
    await input({ Bad: { semester: "Fall someday", classes: [] } });
    assert.deepEqual(stored().data, before);
    let exported;
    window.URL.createObjectURL = blob => { exported = blob; return "blob:export"; };
    el("shareSchedulesButton").click();
    // happy-dom Blob exposes its bytes through arrayBuffer.
    const raw = new TextDecoder().decode(await exported.arrayBuffer());
    assert.equal(JSON.parse(raw).people.New.semester, "Winter 2027");
  } finally { await window.happyDOM.abort(); }
});

test("share codes preserve optional semester labels, read legacy codes, and reject invalid semester metadata", async () => {
  const context = vm.createContext({ TextEncoder, TextDecoder, Blob, CompressionStream, DecompressionStream, Uint8Array });
  vm.runInContext(readSource("schedule-share-code.js"), context);
  const api = context.WhosFreeShareCode;
  const decoded = await api.decode(await api.encode({ people: { New: { semester: "Fall 2026", classes: [slot] }, Legacy: { classes: [] } } }));
  assert.equal(decoded.people.New.semester, "Fall 2026");
  assert.equal(decoded.people.Legacy.semester, undefined);
  const legacy = api.__test.wrap(new TextEncoder().encode(JSON.stringify([["Old code", []]])), "J");
  assert.equal((await api.decode(legacy)).people["Old code"].semester, undefined);
  await assert.rejects(() => api.encode({ people: { Bad: { semester: "Invalid", classes: [] } } }), /semester/);
  const bad = api.__test.wrap(new TextEncoder().encode(JSON.stringify([["Bad", [], 2026]])), "J");
  await assert.rejects(() => api.decode(bad), /semester/);
});

test("recognition flags weak and missing confidence without changing occupied times or treating a high average as a guarantee", () => {
  const context = vm.createContext({});
  vm.runInContext(readSource("schedule-parser.js"), context);
  vm.runInContext(readSource("schedule-image-parser.js"), context);
  const parse = words => context.WhosFreeImageParser.__test.classesFromCells([{ rect: { day: "Monday", y0: 100, y1: 180, height: 80 }, lines: ["Math", "203-SN1-RE"], words }], [{ time: "09:00", y0: 104, y1: 112, center: 108 }, { time: "09:30", y0: 144, y1: 152, center: 148 }], [{ time: "09:20", y0: 128, y1: 136, center: 132 }, { time: "09:50", y0: 168, y1: 176, center: 172 }], 40)[0];
  const low = parse([{ text: "Math", confidence: 60 }]);
  assert.match(low.review_warning, /uncertain/);
  assert.equal(low.recognition_confidence, 60);
  const high = parse([{ text: "Math", confidence: 95 }]);
  assert.equal(high.review_warning, undefined);
  assert.equal(high.start, low.start); assert.equal(high.end, low.end);
  const oneWeak = parse([{ text: "Confident long course name", confidence: 99 }, { text: "203-SN1-RE", confidence: 20 }]);
  assert.match(oneWeak.review_warning, /uncertain/);
  assert.match(parse([{ text: "Math" }]).review_warning, /unavailable/);
});

for (const [date, label] of [["2026-10-05", "Fall 2026"], ["2026-12-22", "Fall 2026"], ["2026-12-23", "Winter 2027"], ["2027-01-18", "Winter 2027"], ["2027-05-31", "Winter 2027"], ["2027-06-01", "Fall 2027"]]) {
  test(`automatic school term at ${date} is ${label}`, async () => {
    const { window, el, tick, stored } = await app({ Old: { semester: "Fall 2025", classes: [] } }, date + "T12:00:00");
    try {
      el("manualScheduleButton").click();
      assert.equal(el("imageReviewSemester").value + " " + el("imageReviewYear").value, label);
      assert.equal(el("imageReviewSemester").querySelectorAll("option").length, 3);
      el("cancelImageScheduleButton").click();
      Object.defineProperty(el("scheduleFileInput"), "files", { value: [{ name: "new.json", text: async () => JSON.stringify({ people: { New: { classes: [] }, Unlabeled: { semester: null, classes: [] } } }) }], configurable: true });
      el("scheduleFileInput").dispatchEvent(new window.Event("change")); await tick();
      assert.equal(stored().data.people.New.semester, label);
      assert.equal(stored().data.people.Unlabeled.semester, null);
      el("viewToggleButton").click();
      const old = [...el("peopleList").querySelectorAll(".person-card")].find(card => card.textContent.includes("Old"));
      assert.ok(old.classList.contains("semester-expired"));
    } finally { await window.happyDOM.abort(); }
  });
}


test("legacy local schedules receive a persisted term once and keep it after a rollover", async () => {
  const first = await app({ Legacy: { classes: [slot] }, Winter: { semester: "Winter 2027", classes: [] }, Cleared: { semester: null, classes: [] } });
  let people;
  try {
    people = first.stored().data.people;
    assert.equal(people.Legacy.semester, "Fall 2026");
    assert.equal(people.Winter.semester, "Winter 2027");
    assert.equal(people.Cleared.semester, null);
    assert.equal(first.el("undoChangesButton").disabled, true);
  } finally { await first.window.happyDOM.abort(); }
  const later = await app(people, "2027-01-20T12:00:00");
  try {
    assert.equal(later.stored().data.people.Legacy.semester, "Fall 2026");
    const row = [...later.el("peopleList").children].find(row => row.textContent.includes("Legacy"));
    assert.ok(row.classList.contains("semester-expired"));
  } finally { await later.window.happyDOM.abort(); }
});

test("JSON and share-code imports retain Winter, default missing labels, and export the resulting labels", async () => {
  const a = await app({}, "2027-01-20T12:00:00");
  const { window, el, tick, stored } = a;
  try {
    const data = { people: { JsonWinter: { semester: "Winter 2026", classes: [slot] }, JsonLegacy: { classes: [] } } };
    Object.defineProperty(el("scheduleFileInput"), "files", { value: [{ name: "legacy.json", text: async () => JSON.stringify(data) }], configurable: true });
    el("scheduleFileInput").dispatchEvent(new window.Event("change")); await tick();
    assert.equal(stored().data.people.JsonWinter.semester, "Winter 2026");
    assert.equal(stored().data.people.JsonLegacy.semester, "Winter 2027");
    const code = await window.WhosFreeShareCode.encode({ people: { CodeWinter: { semester: "Winter 2026", classes: [slot] }, CodeLegacy: { classes: [] }, CodeCleared: { semester: null, classes: [] } } });
    el("importCodeButton").click(); el("importCodeInput").value = code; el("decodeCodeButton").click(); await tick();
    assert.equal(stored().data.people.CodeWinter.semester, "Winter 2026");
    assert.equal(stored().data.people.CodeLegacy.semester, "Winter 2027");
    assert.equal(stored().data.people.CodeCleared.semester, null);
    const roundtrip = await window.WhosFreeShareCode.decode(await window.WhosFreeShareCode.encode(stored().data));
    for (const name of Object.keys(stored().data.people)) assert.equal(roundtrip.people[name].semester, stored().data.people[name].semester);
    el("closeImportButton").click();
    let exported;
    window.URL.createObjectURL = file => { exported = file; return "blob:export"; };
    el("shareSchedulesButton").click();
    const json = JSON.parse(new TextDecoder().decode(await exported.arrayBuffer()));
    for (const name of Object.keys(stored().data.people)) assert.equal(json.people[name].semester, stored().data.people[name].semester);
  } finally { await window.happyDOM.abort(); }
});


test("main cards show only older semesters and the current-term shortcut retains every class", async () => {
  const { window, el, tick, stored } = await app({ Old: { semester: "Winter 2026", classes: [slot] }, Current: { semester: "Fall 2026", classes: [slot] }, Future: { semester: "Winter 2027", classes: [] } });
  try {
    const card = name => [...el("peopleList").children].find(row => row.querySelector(".person-name")?.textContent.includes(name));
    assert.match(card("Old").querySelector(".schedule-semester").textContent, /Winter 2026/);
    assert.ok(card("Old").classList.contains("semester-expired"));
    assert.equal(card("Current").querySelector(".schedule-semester"), null);
    assert.equal(card("Future").querySelector(".schedule-semester"), null);
    card("Current").click();
    assert.match(el("detailPanel").textContent, /Fall 2026/);
    window.document.querySelector('[aria-label="Edit Old"]').click();
    assert.equal(el("useCurrentSemesterButton").hidden, false);
    el("useCurrentSemesterButton").click();
    assert.equal(el("imageReviewSemester").value, "Fall");
    assert.equal(el("imageReviewYear").value, "2026");
    assert.equal(stored().data.people.Old.semester, "Winter 2026", "changes wait for the editor save");
    el("saveImageScheduleButton").click(); await tick();
    assert.equal(stored().data.people.Old.semester, "Fall 2026");
    assert.deepEqual(stored().data.people.Old.classes.map(({ day, start, end, course }) => ({ day, start, end, course })), [slot]);
    assert.equal(card("Old").classList.contains("semester-expired"), false);
    assert.equal(card("Old").querySelector(".schedule-semester"), null);
    el("undoChangesButton").click(); await tick();
    assert.equal(stored().data.people.Old.semester, "Winter 2026");
    window.document.querySelector('[aria-label="Edit Current"]').click();
    assert.equal(el("useCurrentSemesterButton").hidden, true);
  } finally { await window.happyDOM.abort(); }
});


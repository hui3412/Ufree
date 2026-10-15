import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";

for (const reducedMotion of [true, false]) {
  test(`new schedule panels scroll inside the dialog and retain focus (${reducedMotion ? "reduced" : "normal"} motion)`, async () => {
    const window = new Window({ url: "https://example.test/Whos-Free/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
    window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
    window.setInterval = () => 0;
    window.matchMedia = () => ({ matches: reducedMotion, addEventListener() {} });
    window.confirm = () => true;
    window.URL.createObjectURL = () => "blob:test";
    window.URL.revokeObjectURL = () => {};
    window.localStorage.setItem("whos-free-local-schedules", JSON.stringify({ data: { people: { Alice: { classes: [] } } }, meta: {} }));
    window.WhosFreeImageParser = { parseScheduleImage: async () => ({ name: "Alice", person: { classes: [] } }) };
    window.WhosFreeShareCode = { encode: async () => "sample" };
    const tick = () => new Promise(resolve => setTimeout(resolve, 45));
    const el = id => window.document.getElementById(id);
    const calls = [];
    for (const dialog of window.document.querySelectorAll(".schedule-modal")) {
      dialog.getBoundingClientRect = () => ({ top: 20 });
      dialog.scrollTo = options => { calls.push({ dialog, ...options }); dialog.scrollTop = options.top; };
    }
    for (const id of ["imageReview", "codeExportPanel", "codeImportPanel", "groupForm"]) el(id).getBoundingClientRect = () => ({ top: 900 });
    try {
      for (const file of ["schedule-availability.js", "schedule-groups.js", "app.js"]) window.eval(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"));
      await tick();
      el("scheduleDataButton").click();
      el("manualScheduleButton").click();
      await tick();
      assert.equal(window.document.activeElement, el("imageReviewName"), "dialog opening must not steal the editor focus");
      assert.ok(calls.at(-1).top > 800, "the below-fold review must scroll into view");
      assert.equal(calls.at(-1).behavior, reducedMotion ? "auto" : "smooth");
      assert.equal(calls.at(-1).dialog, el("imageReview").closest(".schedule-modal"));
      el("cancelImageScheduleButton").click();
      Object.defineProperty(el("scheduleImageInput"), "files", { value: [{ name: "schedule.png" }], configurable: true });
      el("scheduleImageInput").dispatchEvent(new window.Event("change"));
      await tick();
      assert.equal(window.document.activeElement, el("imageReviewTitle"), "recognition must land on its review");
      el("cancelImageScheduleButton").click();
      el("exportSchedulesButton").click();
      await tick();
      assert.equal(window.document.activeElement, el("selectAllSchedules"));
      el("selectAllSchedules").checked = true;
      el("selectAllSchedules").dispatchEvent(new window.Event("change"));
      el("generateCodeButton").click();
      await tick();
      assert.equal(el("exportCodeOutput").value, "sample");
      el("closeScheduleModal").click();
      el("scheduleDataButton").click();
      el("importCodeButton").click();
      await tick();
      assert.equal(window.document.activeElement, el("importCodeInput"));
      el("closeImportButton").click();
      el("closeScheduleModal").click();
      el("showGroupsToggle").click();
      el("manageGroupsButton").click();
      el("newGroupButton").click();
      await tick();
      assert.equal(window.document.activeElement, el("groupNameInput"));
      assert.equal(calls.at(-1).dialog, el("groupForm").closest(".schedule-modal"));
    } finally { await window.happyDOM.abort(); }
  });
}

test("closing a newly revealed editor before the next frame cancels its pending scroll", async () => {
  const window = new Window({ url: "https://example.test/Whos-Free/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(fs.readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  window.setInterval = () => 0;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  let calls = 0;
  window.document.querySelector(".schedule-modal").scrollTo = () => calls++;
  try {
    window.eval(fs.readFileSync(new URL("../schedule-availability.js", import.meta.url), "utf8"));
    window.eval(fs.readFileSync(new URL("../app.js", import.meta.url), "utf8"));
    await new Promise(resolve => setTimeout(resolve, 40));
    window.document.getElementById("manualScheduleButton").click();
    window.document.getElementById("cancelImageScheduleButton").click();
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(calls, 0);
    assert.notEqual(window.document.activeElement.id, "imageReviewName");
  } finally { await window.happyDOM.abort(); }
});



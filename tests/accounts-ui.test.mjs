import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";
const read = (name) =>
  fs.readFileSync(new URL("../" + name, import.meta.url), "utf8");
const record = {
  data: { people: { Original: { semester: "Fall 2026", classes: [] } } },
  meta: { filename: "original" },
};
const user = {
  id: "test-user",
  username: "fictional_user",
  school: "Fictional",
  personalSchedule: "Account person",
};
async function app({ account = false, session = false, cloud = false } = {}) {
  const w = new Window({
    url:
      "https://hui3412.github.io/Ufree/" +
      (cloud ? "#cloud=" + "a".repeat(64) : ""),
    settings: {
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
    },
  });
  w.document.write(read("index.html"));
  w.setInterval = () => 0;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  Object.assign(w, {
    TextEncoder,
    TextDecoder,
    Blob,
    CompressionStream,
    DecompressionStream,
  });
  const original = JSON.stringify(record);
  w.localStorage.setItem("whos-free-local-schedules", original);
  if (session || account)
    w.localStorage.setItem(
      "ufree-test-session-v1",
      JSON.stringify({ user, token: "b".repeat(64) }),
    );
  if (account) {
    w.localStorage.setItem("ufree-test-view-v1", "account");
    w.localStorage.setItem(
      "ufree-test-account-v1:test-user",
      JSON.stringify({
        revision: 1,
        base: { "p:Account person": { semester: "Fall 2026", classes: [] } },
        records: { "p:Account person": { semester: "Fall 2026", classes: [] } },
        initialized: true,
        conflicts: [],
      }),
    );
  }
  let calls = [];
  w.fetch = async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    return {
      ok: true,
      json: async () =>
        path === "/revision"
          ? { revision: account ? 1 : 0 }
          : path === "/deliveries"
            ? { deliveries: [] }
            : {
                people: { Received: { semester: "Fall 2026", classes: [] } },
                expiresAt: Date.now() + 10000,
              },
    };
  };
  for (const f of [
    "i18n-fr.js",
    "i18n.js",
    "schedule-availability.js",
    "schedule-groups.js",
    "schedule-share-code.js",
    "account-sync.js",
    "accounts.js",
    "app.js",
  ])
    w.eval(read(f));
  for (
    let i = 0;
    i < 100 && !w.document.getElementById("accountMenuButton");
    i++
  )
    await new Promise((r) => setTimeout(r, 10));
  const el = (id) => w.document.getElementById(id);
  return { w, el, original, calls, close: () => w.happyDOM.abort() };
}
test("signed-out introduction adds only an account entry and preserves saved Local schedules byte-for-byte", async () => {
  const a = await app();
  try {
    assert.ok(a.el("peopleList").textContent.includes("Original"));
    assert.equal(
      a.w.localStorage.getItem("whos-free-local-schedules"),
      a.original,
    );
    assert.equal(a.calls.length, 0);
    assert.equal(a.w.document.querySelector(".account-collection-label"), null);
    a.el("mobileMenuButton").click();
    a.el("accountMenuButton").click();
    assert.equal(a.w.document.querySelector(".account-dialog").hasAttribute("inert"), false);
    assert.equal(a.el("mobileMenuButton").getAttribute("aria-expanded"), "false");
    assert.match(
      a.w.document.querySelector(".account-dialog").textContent,
      /Sign in/,
    );
    a.w.UFreeI18n.setLanguage("fr");
    assert.match(a.el("accountMenuButton").textContent, /Connexion/);
  } finally {
    await a.close();
  }
});
test("Account view reads its independent copy and removal never changes the legacy Local record", async () => {
  const a = await app({ account: true });
  try {
    assert.match(a.el("peopleList").textContent, /Account person/);
    assert.doesNotMatch(a.el("peopleList").textContent, /Original/);
    await a.w.UFreeAccounts.save({
      data: { people: { Changed: { semester: "Fall 2026", classes: [] } } },
      meta: {},
    });
    assert.equal(
      a.w.localStorage.getItem("whos-free-local-schedules"),
      a.original,
    );
    await a.w.UFreeAccounts.save({
      data: {
        people: { "@preferences": { semester: "Fall 2026", classes: [] } },
      },
      meta: {},
    });
    assert.equal(
      a.w.UFreeAccounts.read().data.people["@preferences"].classes.length,
      0,
    );
    a.w.UFreeAccounts.clear();
    assert.equal(
      a.w.localStorage.getItem("whos-free-local-schedules"),
      a.original,
    );
    assert.equal(a.w.UFreeAccounts.read().data.people.Changed, undefined);
  } finally {
    await a.close();
  }
});
test("a guest cloud snapshot waits for the dismissible account prompt, then imports without signup", async () => {
  const a = await app({ cloud: true });
  try {
    const prompt = [...a.w.document.querySelectorAll("dialog")].find((x) =>
      x.textContent.includes("You can receive"),
    );
    assert.ok(prompt);
    assert.equal(a.calls.length, 0);
    [...prompt.querySelectorAll("button")]
      .find((x) => x.textContent === "Continue")
      .click();
    for (
      let i = 0;
      i < 100 && !a.el("peopleList").textContent.includes("Received");
      i++
    )
      await new Promise((r) => setTimeout(r, 10));
    assert.match(a.el("peopleList").textContent, /Received/);
    assert.match(a.el("peopleList").textContent, /Original/);
    assert.equal(a.w.localStorage.getItem("ufree-test-session-v1"), null);
    assert.equal(a.calls.length, 1);
  } finally {
    await a.close();
  }
});

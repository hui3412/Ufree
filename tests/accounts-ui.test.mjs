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
async function app({
  account = false,
  session = false,
  cloud = false,
  extraRecords = {},
  handler,
} = {}) {
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
        base: {
          "p:Account person": { semester: "Fall 2026", classes: [] },
          ...extraRecords,
        },
        records: {
          "p:Account person": { semester: "Fall 2026", classes: [] },
          ...extraRecords,
        },
        initialized: true,
        conflicts: [],
      }),
    );
  }
  let calls = [];
  w.fetch = async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    const custom = handler?.(path, options);
    if (custom !== undefined) { const resolved = await custom; return resolved instanceof Response ? resolved : new Response(JSON.stringify(resolved)); }
    return new Response(JSON.stringify(
        path === "/revision"
          ? { revision: account ? 1 : 0 }
          : path === "/deliveries"
            ? { deliveries: [] }
            : {
                people: { Received: { semester: "Fall 2026", classes: [] } },
                expiresAt: Date.now() + 10000,
              }
    ));
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
    assert.equal(
      a.w.document.querySelector(".account-dialog").hasAttribute("inert"),
      false,
    );
    assert.equal(
      a.el("mobileMenuButton").getAttribute("aria-expanded"),
      "false",
    );
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

const settle = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.ok(predicate(), "expected UI update");
};
const buttonWith = (w, label) =>
  [...w.document.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
test("account search caps results and sends no follow request before explicit consent", async () => {
  const a = await app({
    account: true,
    handler: (path) =>
      path === "/users/search"
        ? {
            users: Array.from({ length: 15 }, (_, i) => ({
              username: "fictional_" + i,
            })),
          }
        : path === "/connections/request"
          ? { ok: true }
          : path === "/sync"
            ? { revision: 1 }
            : undefined,
  });
  try {
    a.el("mobileMenuButton").click();
    a.el("accountMenuButton").click();
    buttonWith(a.w, "Find accounts").click();
    a.w.document.querySelector(".account-dialog input").value = "fictional";
    buttonWith(a.w, "Search accounts").click();
    await settle(
      () => a.w.document.querySelectorAll(".follow-result").length === 10,
    );
    buttonWith(a.w, "Follow").click();
    assert.equal(
      a.calls.filter((c) => c.url.endsWith("/connections/request")).length,
      0,
    );
    assert.match(
      a.w.document.querySelector("dialog[open]:last-of-type").textContent,
      /only see their personal schedule after they agree/,
    );
    buttonWith(a.w, "Confirm").click();
    await settle(() =>
      a.calls.some((c) => c.url.endsWith("/connections/request")),
    );
    const request = a.calls.find((c) => c.url.endsWith("/connections/request"));
    assert.equal(JSON.parse(request.options.body).sharePersonal, true);
    assert.equal(
      a.w.localStorage.getItem("whos-free-local-schedules"),
      a.original,
    );
    a.w.UFreeI18n.setLanguage("fr");
    assert.ok(buttonWith(a.w, "Rechercher des comptes"));
  } finally {
    await a.close();
  }
});
test("cached followed schedules remain read-only and separate from own records and Local data", async () => {
  const payload = {
    username: "fictional_friend",
    person: { semester: "Fall 2026", classes: [] },
  };
  const a = await app({ account: true, extraRecords: { "f:peer": payload } });
  try {
    assert.equal(a.w.UFreeAccounts.isLive("@fictional_friend"), true);
    const saved = a.w.UFreeAccounts.save({
      data: {
        people: {
          "@fictional_friend": { semester: "tampered", classes: [] },
          Own: { semester: "Fall 2026", classes: [] },
        },
      },
      meta: {},
    });
    assert.equal(saved.data.people["@fictional_friend"].semester, "Fall 2026");
    const state = JSON.parse(
      a.w.localStorage.getItem("ufree-test-account-v1:test-user"),
    );
    assert.equal(state.records["p:@fictional_friend"], undefined);
    assert.equal(state.records["f:peer"].person.semester, "Fall 2026");
    a.w.UFreeAccounts.clear();
    assert.equal(a.w.UFreeAccounts.read().data.people.Own, undefined);
    assert.ok(a.w.UFreeAccounts.read().data.people["@fictional_friend"]);
    assert.equal(
      a.w.localStorage.getItem("whos-free-local-schedules"),
      a.original,
    );
  } finally {
    await a.close();
  }
});
test("follow inbox acceptance requires a second consent confirmation and preserves Local schedules", async () => {
  const a = await app({
    account: true,
    handler: (path) =>
      path === "/deliveries"
        ? {
            deliveries: [],
            followRequests: [{ id: "request-id", sender: "fictional_friend" }],
          }
        : path === "/connections/respond"
          ? { ok: true }
          : path === "/sync"
            ? { revision: 1 }
            : undefined,
  });
  try {
    a.el("mobileMenuButton").click();
    a.el("accountMenuButton").click();
    buttonWith(a.w, "Inbox").click();
    await settle(() => buttonWith(a.w, "Follow back and share"));
    buttonWith(a.w, "Follow back and share").click();
    assert.equal(
      a.calls.filter((c) => c.url.endsWith("/connections/respond")).length,
      0,
    );
    buttonWith(a.w, "Confirm").click();
    await settle(() =>
      a.calls.some((c) => c.url.endsWith("/connections/respond")),
    );
    const payload = JSON.parse(
      a.calls.find((c) => c.url.endsWith("/connections/respond")).options.body,
    );
    assert.equal(payload.id, "request-id");
    assert.equal(payload.decision, "accepted");
    assert.equal(payload.sharePersonal, true);
    assert.equal(
      a.w.localStorage.getItem("whos-free-local-schedules"),
      a.original,
    );
  } finally {
    await a.close();
  }
});
test("an empty unchanged inbox does not need its own automatic request; manual Inbox still works", async () => {
  const a = await app({
    account: true,
    handler: (path) =>
      path === "/revision" ? { revision: 1, inboxRevision: 0 } : undefined,
  });
  try {
    await settle(() => a.calls.some((c) => c.url.endsWith("/revision")));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(
      a.calls.filter((c) => c.url.endsWith("/deliveries")).length,
      0,
    );
    a.el("mobileMenuButton").click();
    a.el("accountMenuButton").click();
    buttonWith(a.w, "Inbox").click();
    await settle(() => a.calls.some((c) => c.url.endsWith("/deliveries")));
    assert.equal(
      a.calls.filter((c) => c.url.endsWith("/deliveries")).length,
      1,
    );
    assert.equal(
      a.w.localStorage.getItem("whos-free-local-schedules"),
      a.original,
    );
  } finally {
    await a.close();
  }
});
test("rapid Inbox clicks share one in-flight request", async () => {
  let release;
  const pending = new Promise((resolve) => (release = resolve));
  const a = await app({
    account: true,
    handler: (path) =>
      path === "/revision"
        ? { revision: 1, inboxRevision: 0 }
        : path === "/deliveries"
          ? pending
          : undefined,
  });
  try {
    a.el("mobileMenuButton").click();
    a.el("accountMenuButton").click();
    const inbox = buttonWith(a.w, "Inbox");
    inbox.click();
    inbox.click();
    inbox.click();
    await settle(() => a.calls.some((c) => c.url.endsWith("/deliveries")));
    assert.equal(
      a.calls.filter((c) => c.url.endsWith("/deliveries")).length,
      1,
    );
    release({ deliveries: [], inboxRevision: 0 });
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    release({ deliveries: [], inboxRevision: 0 });
    await a.close();
  }
});

test('structured and edge HTML daily quota errors pause cloud requests across reload metadata',async()=>{
 for (const html of [false,true]) {
  const a=await app({account:true,handler:(path)=>path==='/revision'?new Response(html?'<!DOCTYPE html><h1>Error 1027</h1><p>The owner has reached their plan limits</p>':JSON.stringify({code:'DAILY_QUOTA_EXHAUSTED',retryAt:Date.now()+3600000}),{status:html?503:429}):undefined});
  try {
   await settle(()=>a.w.localStorage.getItem('ufree-test-api-pause-v1'));
   const count=a.calls.length;
   a.el('mobileMenuButton').click();a.el('accountMenuButton').click();
   for(let i=0;i<10;i++){buttonWith(a.w, 'Inbox').click();await new Promise(r=>setTimeout(r,5));}
   assert.equal(a.calls.length,count,'paused cloud requests never reach fetch');
   assert.equal(a.w.localStorage.getItem('whos-free-local-schedules'),a.original);
   assert.ok(a.w.localStorage.getItem('ufree-test-account-v1:test-user'));
  } finally {await a.close();}
 }
});

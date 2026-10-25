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
  savedStorage,
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
  if (savedStorage) {
    w.localStorage.clear();
    for (const [key, value] of Object.entries(savedStorage)) w.localStorage.setItem(key, value);
  }
  let revision = account ? 1 : 0;
  const cloudRecords = account ? { "p:Account person": { semester: "Fall 2026", classes: [] }, ...extraRecords } : {};
  let calls = [];
  w.fetch = async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    const custom = handler?.(path, options);
    if (custom !== undefined) { const resolved = await custom; return resolved instanceof Response ? resolved : new Response(JSON.stringify(resolved)); }
    if (path === "/sync") {
      const body = JSON.parse(options?.body || "null");
      if (body) {
        for (const row of body.changes) {
          if (row.value === null) delete cloudRecords[row.name]; else cloudRecords[row.name] = row.value;
        }
        return new Response(JSON.stringify({ revision: ++revision }));
      }
      return new Response(JSON.stringify({ revision, changes: Object.entries(cloudRecords).map(([name, value]) => ({ name, value })) }));
    }
    return new Response(JSON.stringify(
        path === "/revision"
          ? { revision }
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
    "schools.js",
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
    assert.deepEqual(JSON.parse(a.w.localStorage.getItem("whos-free-local-schedules")).data.people.Original, record.data.people.Original);
    assert.equal(a.calls.length, 0);
    assert.equal(a.el("friendsMenuButton"), null);
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
test("signing in merges phone and cached account schedules into the same saved collection", async () => {
  const a = await app({ account: true });
  try {
    assert.match(a.el("peopleList").textContent, /Account person/);
    assert.match(a.el("peopleList").textContent, /Original/);
    await a.w.UFreeAccounts.save({data:{people:{Changed:{semester:"Fall 2026",classes:[]}}},meta:{}});
    assert.deepEqual(Object.keys(JSON.parse(a.w.localStorage.getItem("whos-free-local-schedules")).data.people), ["Changed"]);
    await a.w.UFreeAccounts.clear();
    assert.deepEqual(JSON.parse(a.w.localStorage.getItem("whos-free-local-schedules")).data.people, {});
    a.el("mobileMenuButton").click(); a.el("accountMenuButton").click();
    const text = a.w.document.querySelector(".account-dialog").textContent;
    assert.doesNotMatch(text, /Local view|Account view|Copy Local to Account/);
  } finally { await a.close(); }
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
test("sharing verifies mixed-case recipients, retains case-only edits and invalidates different accounts", async () => {
  const a = await app({ account: true, handler: path => path === "/users/lookup" ? {username:"David"} : path === "/deliveries" ? {ok:true} : undefined });
  try {
    a.el("mobileMenuButton").click(); a.el("accountMenuButton").click();
    assert.ok(buttonWith(a.w,"Friends"));
    a.w.UFreeAccounts.openSharing();
    const recipient = a.w.document.querySelector('.account-dialog input[type="text"]');
    recipient.value = "david";
    buttonWith(a.w,"Verify recipient").click();
    await settle(() => a.w.document.querySelector('.account-dialog').textContent.includes('Verified recipient: @David'));
    a.w.document.querySelector('.account-dialog input[type="checkbox"]').checked = true;
    recipient.value = "DAVID"; recipient.dispatchEvent(new a.w.Event("input"));
    buttonWith(a.w,"Send by username").click();
    await settle(() => buttonWith(a.w,"Confirm")); buttonWith(a.w,"Confirm").click();
    await settle(() => a.calls.some(c=>c.url.endsWith('/deliveries')));
    await settle(() => !buttonWith(a.w,"Send by username").disabled);
    const sent = a.calls.filter(c=>c.url.endsWith('/deliveries')).length;
    recipient.value = "someone_else"; recipient.dispatchEvent(new a.w.Event("input"));
    buttonWith(a.w,"Send by username").click();
    await settle(() => a.w.document.querySelector('.account-dialog').textContent.includes('Verify the recipient first.'));
    assert.equal(a.calls.filter(c=>c.url.endsWith('/deliveries')).length,sent);
  } finally { await a.close(); }
});
test("signed-in Export opens cloud sharing with Offline Sharing in its options", async () => {
 const a=await app({account:true});try{
 a.el('mobileMenuButton').click();a.el('homeExportButton').click();
 assert.equal(a.el('mobileMenuButton').getAttribute('aria-expanded'),'false');
 assert.equal(a.w.document.querySelector('.account-dialog').open,true);
 assert.ok(a.w.document.querySelector('.cloud-sharing-heading'));
 const menu=a.w.document.querySelector('.cloud-sharing-heading details');
 assert.equal(menu.open,false);menu.querySelector('summary').click();
 a.w.UFreeI18n.setLanguage('fr');buttonWith(a.w,'Partage hors ligne').click();
 assert.equal(a.w.document.querySelector('.account-dialog').open,false);
 assert.equal(a.el('scheduleModal').hidden,false);
 }finally{await a.close();}
 const guest=await app();try{
 guest.el('mobileMenuButton').click();guest.el('homeExportButton').click();
 assert.equal(guest.w.document.querySelector('.account-dialog').open,false);
 assert.equal(guest.el('scheduleModal').hidden,false);
 }finally{await guest.close();}
});
test("account search caps results and sends no friend request before explicit consent", async () => {
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
    buttonWith(a.w, "Add friend").click();
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
    assert.deepEqual(JSON.parse(a.w.localStorage.getItem("whos-free-local-schedules")).data.people.Original, record.data.people.Original);
    a.w.UFreeI18n.setLanguage("fr");
    assert.ok(buttonWith(a.w, "Rechercher des comptes"));
  } finally {
    await a.close();
  }
});
test("cached followed schedules remain read-only in the shared phone collection", async () => {
  const payload = {
    username: "fictional_friend",
    person: { semester: "Fall 2026", classes: [] },
  };
  const a = await app({ account: true, extraRecords: { "f:peer": payload } });
  try {
    assert.equal(a.w.UFreeAccounts.isLive("@fictional_friend"), true);
    const saved = await a.w.UFreeAccounts.save({
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
    await a.w.UFreeAccounts.clear();
    assert.equal(a.w.UFreeAccounts.read().data.people.Own, undefined);
    assert.ok(a.w.UFreeAccounts.read().data.people["@fictional_friend"]);
    assert.ok(JSON.parse(a.w.localStorage.getItem("whos-free-local-schedules")).data.people["@fictional_friend"]);
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
    await settle(() => buttonWith(a.w, "Accept friend request"));
    buttonWith(a.w, "Accept friend request").click();
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
    assert.deepEqual(JSON.parse(a.w.localStorage.getItem("whos-free-local-schedules")).data.people.Original, record.data.people.Original);
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
    await settle(() => !a.el("toast").hidden);
    assert.equal(a.el("toast").textContent,"Inbox is empty.");
    assert.equal(a.el("toast").getAttribute("popover"),"manual");
    assert.equal(a.el("toast").parentElement.matches("dialog[open]"),true);
    assert.equal(
      a.calls.filter((c) => c.url.endsWith("/deliveries")).length,
      1,
    );
    assert.deepEqual(JSON.parse(a.w.localStorage.getItem("whos-free-local-schedules")).data.people.Original, record.data.people.Original);
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
   assert.deepEqual(JSON.parse(a.w.localStorage.getItem('whos-free-local-schedules')).data.people.Original, record.data.people.Original);
   assert.ok(a.w.localStorage.getItem('ufree-test-account-v1:test-user'));
  } finally {await a.close();}
 }
});
test('cloud-sharing controls send all saved details without a filtering checkbox in English and French',async()=>{
 let copied;
 const full={semester:'Fall 2026',source_file:'original-photo.jpg',savedNote:'Exact',classes:[{day:'Monday',start:'09:00',end:'10:00',course:'Math',course_code:'201',section:'01',room:'A-1',instructor:'Full Teacher Name',custom:'Keep'}]};
 const a=await app({account:true,extraRecords:{'p:Complete':full},handler:(path)=>path==='/shares'?{code:'UFC1:'+'c'.repeat(64),expiresAt:Date.now()+86400000}:undefined});
 try{
 Object.defineProperty(a.w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}},configurable:true});
 a.el('mobileMenuButton').click();a.el('homeExportButton').click();
 assert.doesNotMatch(a.w.document.querySelector('.account-dialog').textContent,/Include course names, rooms and teachers/);
 const all=a.el('cloud-selectAllSchedules');all.checked=false;all.dispatchEvent(new a.w.Event('change'));
 const search=a.el('cloud-exportPeopleSearch');search.value='complete';search.dispatchEvent(new a.w.Event('input'));
 assert.equal(a.el('cloud-exportSelection').open,true);
 assert.equal([...a.el('cloud-exportPeopleList').children].filter(label=>!label.hidden).length,1);
 const label=[...a.w.document.querySelectorAll('.account-dialog label')].find(label=>label.textContent==='Complete');label.querySelector('input').checked=true;label.querySelector('input').dispatchEvent(new a.w.Event('change'));
 buttonWith(a.w,'Create 48-hour link / code').click();await new Promise(r=>setTimeout(r,30));
 const request=a.calls.find(call=>new URL(call.url).pathname==='/shares');assert.ok(request);assert.deepEqual(JSON.parse(request.options.body).people,{Complete:full});
 await settle(()=>copied==='UFC1:'+'c'.repeat(64));
 assert.equal(a.el('toast').textContent,'Code copied.');
 const output=a.w.document.querySelector('textarea[aria-label="Cloud link and code"]');
 assert.equal(output.parentElement.previousElementSibling.textContent,'Create 48-hour link / code');
 assert.equal(a.w.document.querySelector('.cloud-sharing-heading').nextElementSibling.textContent,'Close');
 a.w.UFreeI18n.setLanguage('fr');assert.match(a.w.document.querySelector('.account-dialog').textContent,/Comprend l’horaire complet/);
 a.el('cloud-exportGroupButton').click();assert.equal(a.el('cloud-exportGroupPicker').hidden,false);
 a.el('cloud-exportGroupPicker').querySelector('button').click();assert.equal(a.el('cloud-selectAllSchedules').checked,true);
 a.w.UFreeI18n.setLanguage('en');buttonWith(a.w,'Close').click();a.el('mobileMenuButton').click();a.el('accountMenuButton').click();assert.equal(buttonWith(a.w,'Cloud sharing'),undefined);
 }finally{await a.close();}
});

const snapshotStorage = w => Object.fromEntries(Array.from({length:w.localStorage.length}, (_,i) => {const key=w.localStorage.key(i);return [key,w.localStorage.getItem(key)];}));
test("live schedules leave the shared device on logout and never import into another account", async () => {
  const linked = {username:"friend",person:{semester:"Fall 2026",classes:[]}};
  let a = await app({account:true,extraRecords:{"f:peer":linked}}), saved;
  try {
    await settle(()=>a.el("peopleList").textContent.includes("@friend"));
    saved = snapshotStorage(a.w);
    a.el("mobileMenuButton").click(); a.el("accountMenuButton").click(); buttonWith(a.w,"Sign out").click();
    await settle(()=>!a.w.localStorage.getItem("ufree-test-session-v1"));
    const phone = JSON.parse(a.w.localStorage.getItem("whos-free-local-schedules"));
    assert.equal(phone.data.people["@friend"],undefined);
    assert.ok(phone.data.people.Original);
    const cache = JSON.parse(a.w.localStorage.getItem("ufree-test-account-v1:test-user"));
    assert.equal(cache.records["f:peer"],undefined);
    assert.equal(cache.base["f:peer"],undefined);
    assert.equal(cache.revision,0);
  } finally { await a.close(); }
  const guest = {...saved}; delete guest["ufree-test-session-v1"];
  a = await app({savedStorage:guest});
  try { assert.equal(a.el("peopleList").textContent.includes("@friend"),false); } finally { await a.close(); }
  const other = {...saved,"ufree-test-session-v1":JSON.stringify({user:{...user,id:"other-account",username:"other"},token:"c".repeat(64)})};
  a = await app({savedStorage:other,handler:()=>{throw Error("Offline");}});
  try {
    assert.equal(a.el("peopleList").textContent.includes("@friend"),false);
    const state = JSON.parse(a.w.localStorage.getItem("ufree-test-account-v1:other-account"));
    assert.equal(state.records["p:@friend"],undefined);
    assert.equal(state.records["f:peer"],undefined);
  } finally { await a.close(); }
  a = await app({savedStorage:saved,handler:()=>{throw Error("Offline");}});
  try { assert.ok(a.el("peopleList").textContent.includes("@friend")); } finally { await a.close(); }
});
test("Friends opens directly from the drawer; private notes persist, sync and never change shared schedules", async () => {
  const peer = {username:"David",person:{semester:"Fall 2026",classes:[]}};
  const connections = [{id:"pair",username:"David",status:"accepted",direction:"outgoing"}];
  let a = await app({account:true,extraRecords:{"f:peer":peer},handler:path=>path==="/connections"?{connections}:undefined});
  let saved;
  try {
    await settle(() => a.el("peopleList").textContent.includes("@David"));
    a.el("mobileMenuButton").click();
    assert.ok(a.el("homeNavigation").contains(a.el("friendsMenuButton")));
    a.el("friendsMenuButton").click();
    assert.equal(a.el("mobileMenuButton").getAttribute("aria-expanded"),"false");
    await settle(() => a.w.document.querySelector(".friend-row"));
    const row = a.w.document.querySelector(".friend-row"), menu = row.querySelector("details");
    assert.equal(menu.open,false);
    assert.equal(row.querySelectorAll(":scope > button").length,0);
    assert.ok(menu.contains(buttonWith(a.w,"Remove friend")));
    assert.ok(menu.contains(buttonWith(a.w,"Block")));
    menu.querySelector("summary").click();
    assert.equal(menu.open,true);
    buttonWith(a.w,"Add a note").click();
    const input = a.w.document.querySelector(".friend-note-dialog input");
    input.value = "Biology <class>";
    a.w.UFreeI18n.setLanguage("fr");
    assert.equal(input.isConnected,true);
    assert.equal(input.value,"Biology <class>");
    buttonWith(a.w,"Enregistrer la note").click();
    assert.equal(row.querySelector(".friend-note").textContent,"Biology <class>");
    assert.equal(a.el("peopleList").querySelector(".friend-note").textContent,"Biology <class>");
    assert.equal(a.el("peopleList").querySelector(".friend-note class"),null);
    a.w.UFreeI18n.setLanguage("en");
    assert.equal(a.el("peopleList").querySelector(".friend-note").textContent,"Biology <class>");
    buttonWith(a.w,"Back to account").click();
    assert.equal(a.w.document.querySelector(".account-actions").textContent.includes("Friends"),false);
    buttonWith(a.w,"Refresh sync").click();
    await settle(() => a.calls.some(c=>new URL(c.url).pathname==="/sync" && JSON.parse(c.options?.body||"null")?.changes.some(r=>r.name==="@preferences" && r.value["friend-note:david"]==="Biology <class>")));
    const value = JSON.parse(a.w.localStorage.getItem("ufree-test-account-v1:test-user")).records;
    assert.equal(value["@preferences"]["friend-note:david"],"Biology <class>");
    assert.deepEqual(value["f:peer"],peer);
    const phone = JSON.parse(a.w.localStorage.getItem("whos-free-local-schedules"));
    assert.deepEqual(phone.data.people["@David"],peer.person);
    assert.equal(JSON.stringify(phone).includes("Biology <class>"),false);
    saved = snapshotStorage(a.w);
  } finally { await a.close(); }
  a = await app({savedStorage:saved,handler:()=>{throw Error("Offline");}});
  try {
    assert.equal(a.el("peopleList").querySelector(".friend-note").textContent,"Biology <class>");
  } finally { await a.close(); }
  delete saved["ufree-test-session-v1"];
  a = await app({savedStorage:saved});
  try {
    assert.equal(a.el("friendsMenuButton"),null);
    assert.equal(a.el("peopleList").querySelector(".friend-note"),null);
    assert.equal(a.calls.length,0);
  } finally { await a.close(); }
});
test("friend notes can be cancelled or cleared and three-dot menus close with Escape", async () => {
  const a = await app({account:true,extraRecords:{"f:peer":{username:"David",person:{semester:"Fall 2026",classes:[]}},"@preferences":{"friend-note:david":"Biology"}},handler:path=>path==="/connections"?{connections:[{id:"pair",username:"David",status:"accepted",direction:"outgoing"}]}:undefined});
  try {
    a.el("mobileMenuButton").click(); a.el("friendsMenuButton").click();
    await settle(() => a.w.document.querySelector(".friend-menu"));
    const menu = a.w.document.querySelector(".friend-menu"), toggle = menu.querySelector("summary");
    toggle.click();
    toggle.dispatchEvent(new a.w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
    assert.equal(menu.open,false);
    assert.equal(a.w.document.querySelector(".account-dialog").open,true);
    toggle.click(); buttonWith(a.w,"Add a note").click();
    a.w.document.querySelector(".friend-note-dialog input").value = "Wrong note";
    buttonWith(a.w,"Cancel").click();
    assert.equal(a.w.UFreeAccounts.friendNote("@David"),"Biology");
    toggle.click(); buttonWith(a.w,"Add a note").click();
    a.w.document.querySelector(".friend-note-dialog input").value = "";
    buttonWith(a.w,"Save note").click();
    assert.equal(a.w.UFreeAccounts.friendNote("@David"),"");
    assert.equal(a.el("peopleList").querySelector(".friend-note"),null);
    assert.equal(a.w.document.querySelector(".friend-row .friend-note").textContent,"");
  } finally { await a.close(); }
});
test("signing out reads the same phone collection and signed-out edits merge on return", async () => {
  let a = await app({account:true});
  let storage;
  try {
    storage = snapshotStorage(a.w);
    delete storage["ufree-test-session-v1"];
  } finally { await a.close(); }
  a = await app({savedStorage:storage});
  try {
    assert.match(a.el("peopleList").textContent, /Original/);
    assert.match(a.el("peopleList").textContent, /Account person/);
    assert.equal(a.calls.length, 0);
    storage = snapshotStorage(a.w);
    const phone=JSON.parse(storage["whos-free-local-schedules"]);
    delete phone.data.people.Original;
    phone.data.people["Account person"].note="Edited while signed out";
    storage["whos-free-local-schedules"]=JSON.stringify(phone);
    storage["ufree-test-session-v1"]=JSON.stringify({user,token:"b".repeat(64)});
    // A simultaneous remote edit must coexist with the signed-out edit.
    const account=JSON.parse(storage["ufree-test-account-v1:test-user"]);
    account.records["p:Account person"].note="Edited on another device";
    storage["ufree-test-account-v1:test-user"]=JSON.stringify(account);
  } finally { await a.close(); }
  a = await app({savedStorage:storage,handler:()=>{throw Error("Offline");}});
  try {
    const people=JSON.parse(a.w.localStorage.getItem("whos-free-local-schedules")).data.people;
    assert.equal(people.Original,undefined);
    assert.deepEqual(Object.values(people).map(p=>p.note).sort(),["Edited on another device","Edited while signed out"]);
    assert.match(a.el("peopleList").textContent,/sync conflict/);
  } finally { await a.close(); }
});

test("cloud downloads and deletions are saved to the phone while device-only schedules upload", async () => {
  const a=await app({account:true,handler:(path,options)=>{
    if(path==='/revision')return {revision:2};
    if(path==='/sync'&&!options?.body)return {revision:2,changes:[{name:'p:Account person',value:null},{name:'p:Remote',value:{semester:'Fall 2026',classes:[],note:'Downloaded'}}]};
  }});
  try {
    await settle(()=>JSON.parse(a.w.localStorage.getItem('whos-free-local-schedules')).data.people.Remote);
    const phone=JSON.parse(a.w.localStorage.getItem('whos-free-local-schedules')).data.people;
    assert.equal(phone['Account person'],undefined);
    assert.equal(phone.Remote.note,'Downloaded');
    assert.ok(phone.Original);
    assert.ok(a.calls.some(c=>new URL(c.url).pathname==='/sync'&&c.options?.body&&JSON.parse(c.options.body).changes.some(row=>row.name==='p:Original')));
    const storage=snapshotStorage(a.w);delete storage['ufree-test-session-v1'];
    const guest=await app({savedStorage:storage});
    try { assert.match(guest.el('peopleList').textContent,/Remote/);assert.equal(guest.calls.length,0); }
    finally {await guest.close();}
  } finally {await a.close();}
});
test("signed-in offline changes persist on the phone and upload on reconnection", async () => {
  let offline=true;
  const a=await app({account:true,handler:()=>{if(offline)throw Error('Offline');}});
  try {
    await a.w.UFreeAccounts.save({data:{people:{Offline:{semester:'Fall 2026',classes:[],note:'Saved without network'}}}});
    assert.equal(JSON.parse(a.w.localStorage.getItem('whos-free-local-schedules')).data.people.Offline.note,'Saved without network');
    offline=false;
    a.el('mobileMenuButton').click();a.el('accountMenuButton').click();buttonWith(a.w,'Refresh sync').click();
    await settle(()=>a.calls.some(c=>new URL(c.url).pathname==='/sync'&&c.options?.body&&JSON.parse(c.options.body).changes.some(row=>row.name==='p:Offline')));
    const state=JSON.parse(a.w.localStorage.getItem('ufree-test-account-v1:test-user'));
    assert.equal(state.records['p:Offline'].note,'Saved without network');
  }finally{await a.close();}
});

test("sign-in form merges the phone schedules before uploading and retains downloaded schedules", async () => {
 const a=await app({handler:(path,options)=>{
  if(path==='/auth/login')return {user,token:'b'.repeat(64)};
  if(path==='/revision')return {revision:1};
  if(path==='/sync'&&!options?.body)return {revision:1,changes:[{name:'p:Remote',value:{semester:'Fall 2026',classes:[]}}]};
 }});
 try {
  a.el('mobileMenuButton').click();a.el('accountMenuButton').click();
  const fields=a.w.document.querySelectorAll('.account-dialog input');fields[0].value='fictional_user';fields[1].value='a long test password';
  buttonWith(a.w,'Sign in').click();
  await settle(()=>JSON.parse(a.w.localStorage.getItem('whos-free-local-schedules')).data.people.Remote);
  const phone=JSON.parse(a.w.localStorage.getItem('whos-free-local-schedules')).data.people;
  assert.ok(phone.Original);assert.ok(phone.Remote);
  assert.ok(a.w.localStorage.getItem('ufree-test-session-v1'));
  assert.ok(a.calls.some(c=>new URL(c.url).pathname==='/sync'&&c.options?.body&&JSON.parse(c.options.body).changes.some(row=>row.name==='p:Original')));
 }finally{await a.close();}
});

test('account deletion requires confirmation and removes only the deleted account cache, preserving device schedules',async()=>{
 const a=await app({account:true,handler:path=>path==='/auth/delete'?{ok:true}:undefined});
 try{
  a.w.localStorage.setItem('ufree-test-account-v1:another-account',JSON.stringify({records:{keep:true}}));
  a.w.localStorage.setItem('ufree-test-account-v1:test-user:personal-change',JSON.stringify({from:'Account person',to:'Account person'}));
  a.el('mobileMenuButton').click();a.el('accountMenuButton').click();buttonWith(a.w,'Delete account').click();
  const dialog=a.w.document.querySelector('.account-dialog');
  const [password,username]=dialog.querySelectorAll('input');
  password.value='fictional-password-123';username.value='wrong_user';buttonWith(a.w,'Permanently delete account').click();
  await new Promise(r=>setTimeout(r,10));assert.equal(a.calls.filter(c=>new URL(c.url).pathname==='/auth/delete').length,0);
  username.value=user.username;buttonWith(a.w,'Permanently delete account').click();await settle(()=>a.w.document.querySelectorAll('.account-dialog').length===2);
  const confirm=a.w.document.querySelectorAll('.account-dialog')[1];[...confirm.querySelectorAll('button')].find(b=>b.textContent==='Cancel').click();
  await new Promise(r=>setTimeout(r,10));assert.equal(a.calls.filter(c=>new URL(c.url).pathname==='/auth/delete').length,0);
  buttonWith(a.w,'Permanently delete account').click();await settle(()=>a.w.document.querySelectorAll('.account-dialog').length===2);
  const before=JSON.parse(a.w.localStorage.getItem('whos-free-local-schedules')).data;
  const finalConfirm=a.w.document.querySelectorAll('.account-dialog')[1];[...finalConfirm.querySelectorAll('button')].find(b=>b.textContent==='Confirm').click();
  await settle(()=>!a.w.localStorage.getItem('ufree-test-session-v1'));
  const call=a.calls.find(c=>new URL(c.url).pathname==='/auth/delete');assert.ok(call);
  assert.deepEqual(JSON.parse(call.options.body),{currentPassword:'fictional-password-123',confirmUsername:user.username});
  assert.equal(a.w.localStorage.getItem('ufree-test-account-v1:test-user'),null);
  assert.equal(a.w.localStorage.getItem('ufree-test-account-v1:test-user:personal-change'),null);
  assert.ok(a.w.localStorage.getItem('ufree-test-account-v1:another-account'));
  assert.deepEqual(JSON.parse(a.w.localStorage.getItem('whos-free-local-schedules')).data,before);
  const guest=await app({savedStorage:snapshotStorage(a.w)});
  try {assert.match(guest.el('peopleList').textContent,/Original/);assert.match(guest.el('peopleList').textContent,/Account person/);assert.equal(guest.calls.length,0);}
  finally{await guest.close();}
 }finally{await a.close();}
});
test('failed account deletion keeps identity and phone data, clears the password and shows translated controls',async()=>{
 const a=await app({account:true,handler:path=>path==='/auth/delete'?new Response(JSON.stringify({error:'Incorrect current password.'}),{status:401}):undefined});
 try{
  a.el('mobileMenuButton').click();a.el('accountMenuButton').click();buttonWith(a.w,'Delete account').click();
  a.w.UFreeI18n.setLanguage('fr');const dialog=a.w.document.querySelector('.account-dialog');
  assert.match(dialog.textContent,/Supprimer le compte/);assert.match(dialog.textContent,/copies indépendantes/);
  const [password,username]=dialog.querySelectorAll('input');password.value='wrong password';username.value=user.username;
  buttonWith(a.w,'Supprimer définitivement le compte').click();await settle(()=>a.w.document.querySelectorAll('.account-dialog').length===2);
  const confirmation=a.w.document.querySelectorAll('.account-dialog')[1];[...confirmation.querySelectorAll('button')].find(b=>b.textContent==='Confirmer').click();
  await settle(()=>password.value==='');assert.ok(a.w.localStorage.getItem('ufree-test-session-v1'));
  assert.ok(a.w.localStorage.getItem('ufree-test-account-v1:test-user'));
  assert.ok(JSON.parse(a.w.localStorage.getItem('whos-free-local-schedules')).data.people.Original);
  assert.match(dialog.textContent,/mot de passe/i);
 }finally{await a.close();}
});

const signupField=(w,label)=>[...w.document.querySelectorAll('.account-dialog label')].find(n=>w.UFreeI18n.sourceText(n.firstChild)===label)?.querySelector('input,select');
test('switching between sign-in and signup preserves entered credentials without persisting them',async()=>{
 const a=await app();try{
 a.el('mobileMenuButton').click();a.el('accountMenuButton').click();
 signupField(a.w,'Username').value='David';signupField(a.w,'Password').value='Private-test-password';
 buttonWith(a.w,'Create account').click();
 assert.equal(signupField(a.w,'Username').value,'David');assert.equal(signupField(a.w,'Password').value,'Private-test-password');
 assert.equal(signupField(a.w,'Password').autocomplete,'new-password');
 buttonWith(a.w,'Already have an account? Sign in').click();
 assert.equal(signupField(a.w,'Username').value,'David');assert.equal(signupField(a.w,'Password').value,'Private-test-password');
 assert.equal(signupField(a.w,'Password').autocomplete,'current-password');
 assert.equal(a.calls.length,0);
 assert.equal(JSON.stringify(snapshotStorage(a.w)).includes('Private-test-password'),false);
 buttonWith(a.w,'Close').click();a.el('mobileMenuButton').click();a.el('accountMenuButton').click();
 assert.equal(signupField(a.w,'Password').value,'');
 }finally{await a.close();}
});
async function signupPicker(){const a=await app();a.el('mobileMenuButton').click();a.el('accountMenuButton').click();buttonWith(a.w,'Create account').click();return a;}
test('expandable college chooser filters accents, selects Marianopolis and preserves signup fields in both languages',async()=>{
 const a=await signupPicker();try{
 const chooser=a.el('schoolChooser'),search=a.el('cegepSearch');
 assert.equal(chooser.open,false);assert.equal(a.el('selectedCegep').type,'hidden');
 signupField(a.w,'Username').value='preserve_me';chooser.open=true;
 search.value='EDOUARD';search.dispatchEvent(new a.w.Event('input'));assert.equal(a.el('cegepResults').querySelectorAll('button').length,1);
 search.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,10));assert.equal(a.calls.length,0);
 a.w.document.querySelector('[data-school-id="cegepmontpetit"]').click();assert.equal(chooser.open,false);assert.match(chooser.querySelector('summary').textContent,/Édouard-Montpetit/);
 chooser.open=true;search.value='Marinopolis';buttonWith(a.w,'Search').click();a.w.document.querySelector('[data-school-id="marianopolis"]').click();
 assert.equal(a.el('selectedCegep').value,'marianopolis');assert.equal(signupField(a.w,'Username').value,'preserve_me');
 a.w.UFreeI18n.setLanguage('fr');assert.match(chooser.textContent,/Rechercher un cégep/);assert.equal(a.el('selectedCegep').value,'marianopolis');assert.equal(signupField(a.w,'Username').value,'preserve_me');
 assert.equal(chooser.querySelector('summary [data-no-translate]').textContent,'Marianopolis College');
 chooser.open=true;search.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(chooser.open,false);
 }finally{await a.close();}
});
test('typing or forging a college cannot submit signup and an empty search shows helpful feedback',async()=>{
 const a=await signupPicker();try{
 signupField(a.w,'Username').value='new_owner';signupField(a.w,'Password').value='fictional-password-123';a.w.document.querySelector('.account-dialog input[type="checkbox"]').checked=true;
 a.el('cegepSearch').value='Ahuntsic';buttonWith(a.w,'Create account').click();await new Promise(r=>setTimeout(r,10));assert.equal(a.calls.length,0);assert.equal(a.el('schoolChooser').open,true);
 a.el('selectedCegep').value='forged-school';buttonWith(a.w,'Create account').click();await new Promise(r=>setTimeout(r,10));assert.equal(a.calls.length,0);
 a.el('cegepSearch').value='no such college 9876';buttonWith(a.w,'Search').click();assert.equal(a.el('cegepResults').children.length,0);
 assert.equal(a.w.document.querySelector('.school-picker-content > p:last-child').hidden,false);
 }finally{await a.close();}
});
test('signup sends the selected college ID after switching languages without losing personal selection or consent',async()=>{
 const a=await app({handler:path=>path==='/auth/signup'?{user:{...user,school:'Marianopolis College',personalSchedule:'Original'},token:'b'.repeat(64)}:undefined});
 try{
 a.el('mobileMenuButton').click();a.el('accountMenuButton').click();buttonWith(a.w,'Create account').click();
 signupField(a.w,'Username').value='new_owner';signupField(a.w,'Password').value='fictional-password-123';
 const personal=signupField(a.w,'Your personal schedule');personal.value='Original';
 const consent=a.w.document.querySelector('.account-dialog input[type="checkbox"]');consent.checked=true;
 a.w.document.querySelector('[data-school-id="marianopolis"]').click();a.w.UFreeI18n.setLanguage('fr');
 assert.ok(personal.isConnected);assert.ok(consent.isConnected);assert.equal(consent.checked,true);assert.equal(personal.value,'Original');
 buttonWith(a.w,'Créer un compte').click();
 await settle(()=>a.calls.some(c=>new URL(c.url).pathname==='/auth/signup'));
 const call=a.calls.find(c=>new URL(c.url).pathname==='/auth/signup');const body=JSON.parse(call.options.body);
 assert.equal(body.school,'marianopolis');assert.equal(body.personalSchedule,'Original');assert.equal(body.consent,true);
 await settle(()=>a.calls.some(c=>new URL(c.url).pathname==='/sync'&&c.options?.body));
 }finally{await a.close();}
});

test('accepting a friend request automatically puts @username in the main list without a separate sharing action',async()=>{
 let revision=1,mutual=false;
 const cloud={'p:Account person':{semester:'Fall 2026',classes:[]}};
 const friend={semester:'Fall 2026',classes:[{day:'Monday',start:'09:00',end:'10:00',course:'Friend current course'}]};
 const a=await app({account:true,handler:(path,options)=>{
  if(path==='/revision')return {revision};
  if(path==='/sync'){
   if(options?.body){for(const r of JSON.parse(options.body).changes){if(r.value===null)delete cloud[r.name];else cloud[r.name]=r.value;}return {revision:++revision};}
   return {revision,changes:Object.entries(cloud).map(([name,value])=>({name,value}))};
  }
  if(path==='/users/search')return {users:[{username:'test2',connection:{id:'pair',status:'pending',direction:'incoming'}}]};
  if(path==='/connections/request'){mutual=true;cloud['f:peer']={username:'test2',person:friend};revision++;return {ok:true,id:'pair',status:'accepted'};}
  if(path==='/connections')return {connections:mutual?[{id:'pair',username:'test2',status:'accepted',direction:'incoming'}]:[]};
 }});
 try{
 a.el('mobileMenuButton').click();a.el('accountMenuButton').click();buttonWith(a.w,'Find accounts').click();a.w.document.querySelector('.account-dialog input').value='test2';buttonWith(a.w,'Search accounts').click();
 await settle(()=>buttonWith(a.w,'Accept friend request'));buttonWith(a.w,'Accept friend request').click();buttonWith(a.w,'Confirm').click();
 await settle(()=>a.el('peopleList').textContent.includes('@test2'));
 assert.deepEqual(JSON.parse(JSON.stringify(a.w.UFreeAccounts.read().data.people['@test2'])),friend);
 assert.equal(buttonWith(a.w,'Share schedules'),undefined);
 assert.ok(JSON.parse(a.w.localStorage.getItem('whos-free-local-schedules')).data.people['@test2']);
 }finally{await a.close();}
});
test('reopening a signed-in account checks fresh cloud revisions even with a recently checked cache',async()=>{
 let a=await app({account:true,extraRecords:{'f:peer':{username:'test2',person:{semester:'Fall 2026',classes:[],note:'Old'}}}});let saved;
 try{
 saved=snapshotStorage(a.w);const key='ufree-test-account-v1:test-user',state=JSON.parse(saved[key]);state.checkedAt=Date.now();saved[key]=JSON.stringify(state);
 }finally{await a.close();}
 const latest={semester:'Fall 2026',classes:[],note:'Updated before login'};
 a=await app({savedStorage:saved,handler:(path,options)=>{
 if(path==='/revision')return {revision:99};
 if(path==='/sync'&&!options?.body)return {revision:99,changes:[{name:'f:peer',value:{username:'test2',person:latest}}]};
 }});
 try{await settle(()=>a.w.UFreeAccounts.read().data.people['@test2']?.note===latest.note);assert.match(a.el('peopleList').textContent,/@test2/);}
 finally{await a.close();}
});

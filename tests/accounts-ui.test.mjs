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
 const full={semester:'Fall 2026',source_file:'original-photo.jpg',savedNote:'Exact',classes:[{day:'Monday',start:'09:00',end:'10:00',course:'Math',course_code:'201',section:'01',room:'A-1',instructor:'Full Teacher Name',custom:'Keep'}]};
 const a=await app({account:true,extraRecords:{'p:Complete':full},handler:(path)=>path==='/shares'?{code:'UFC1:'+'c'.repeat(64),expiresAt:Date.now()+86400000}:undefined});
 try{
 a.el('mobileMenuButton').click();a.el('accountMenuButton').click();buttonWith(a.w,'Cloud sharing').click();
 assert.doesNotMatch(a.w.document.querySelector('.account-dialog').textContent,/Include course names, rooms and teachers/);
 const label=[...a.w.document.querySelectorAll('.account-dialog label')].find(label=>label.textContent==='Complete');label.querySelector('input').checked=true;
 buttonWith(a.w,'Create 48-hour link / code').click();await new Promise(r=>setTimeout(r,30));
 const request=a.calls.find(call=>new URL(call.url).pathname==='/shares');assert.ok(request);assert.deepEqual(JSON.parse(request.options.body).people,{Complete:full});
 a.w.UFreeI18n.setLanguage('fr');assert.match(a.w.document.querySelector('.account-dialog').textContent,/Comprend l’horaire complet/);
 }finally{await a.close();}
});

const snapshotStorage = w => Object.fromEntries(Array.from({length:w.localStorage.length}, (_,i) => {const key=w.localStorage.key(i);return [key,w.localStorage.getItem(key)];}));
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

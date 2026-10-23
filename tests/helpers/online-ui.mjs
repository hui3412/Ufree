import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Window } from "happy-dom";
const read = (name) =>
  fs.readFileSync(new URL("../../" + name, import.meta.url), "utf8");
const record = {
  data: { people: { Original: { semester: "Fall 2026", classes: [] } } },
  meta: { filename: "original" },
};
const user = {
  id: "test-user",
  username: "fictional_user",
  school: "Fictional",
  personalSchedule: "Personal",
  nickname:"Owner Nick",modelVersion:2,
};
export async function app({
  account = false,
  session = false,
  cloud = false,
  extraRecords = {},
  handler,
  localRecord=record,
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
  const original = JSON.stringify(localRecord);
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
          "p:Personal": { semester: "Fall 2026", classes: [] },
          ...extraRecords,
        },
        records: {
          "p:Personal": { semester: "Fall 2026", classes: [] },
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
          : path === "/connections/inbox"
            ? { followRequests: [] }
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

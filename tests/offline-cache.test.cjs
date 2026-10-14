const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

test("OCR assets are cached locally and missing assets never receive HTML", async () => {
  const listeners = {}, stores = new Map();
  let fetches = 0, offline = false, shell = [];
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return { match: async request => store.get(request.url), put: async (request, response) => store.set(request.url, response), addAll: async assets => { shell = [...assets]; } };
    },
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    async match(request) { for (const store of stores.values()) if (store.has(request.url)) return store.get(request.url); }
  };
  const context = vm.createContext({ URL, Response, caches, clients: { claim() {} }, self: { location: { origin: "https://example.test" }, addEventListener: (name, handler) => { listeners[name] = handler; }, skipWaiting() {} }, fetch: async () => { fetches++; if (offline) throw new Error("offline"); return new Response("local OCR asset"); } });
  vm.runInContext(fs.readFileSync(require("node:path").join(__dirname, "../service-worker.js"), "utf8"), context);
  let installation;
  listeners.install({ waitUntil: promise => { installation = promise; } });
  await installation;
  const version = require("../package.json").version.split(".")[0];
  assert.ok(shell.includes(`./schedule-share-code.js?v=${version}`), "share-code support must be cached for offline use");
  assert.ok(shell.includes(`./assets/qr/qrcodegen.js?v=${version}`), "QR generation must work offline");
  assert.ok(shell.includes(`./schedule-groups.js?v=${version}`), "group availability must work offline");
  for (const asset of ["assets/UFreeLogo_SVG.svg", "assets/UFreeLogo_PNG.png", "assets/favicon.svg", "favicon.ico", "assets/apple-touch-icon.png", "assets/icon-maskable-512.png"]) {
    assert.ok(shell.includes(`./${asset}?v=${version}`), `${asset} must be available offline`);
  }
  function request(url, mode = "cors") {
    let result;
    listeners.fetch({ request: { url, mode, method: "GET" }, respondWith: promise => { result = promise; } });
    return result;
  }
  const url = "https://example.test/Whos-Free/assets/ocr/worker.min.js";
  assert.equal(await (await request(url)).text(), "local OCR asset");
  offline = true;
  assert.equal(await (await request(url)).text(), "local OCR asset");
  assert.equal(fetches, 1, "cached OCR must not make another request");
  assert.equal((await request("https://example.test/Whos-Free/missing.js")).type, "error");
  assert.equal(request("https://other.test/worker.min.js"), undefined);
});



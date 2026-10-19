const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

for (const [file, scope, prefix, peer] of [
  ['service-worker.js', 'https://youfree.ca/', 'whos-free-main-shell-', 'whos-free-legacy-shell-v85'],
  ['whos-free-local-ocr/service-worker.js', 'https://youfree.ca/whos-free-local-ocr/', 'whos-free-legacy-shell-', 'whos-free-main-shell-v129'],
]) test(`${file} cleans up only its own shell and never serves another app's cached files`, async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const current = source.match(/const CACHE_NAME = "([^"]+)"/)[1];
  const old = prefix + 'old';
  const stores = new Map([old, peer, 'whos-free-shell-v128', 'whos-free-ocr-v1', 'ufree-user-sync-v1'].map(name => [name, new Map()]));
  const listeners = {};
  const key = request => new URL(request.url || request, scope).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return { async addAll(assets) { for (const asset of assets) store.set(key(asset), new Response('own shell')); },
        async match(request) { return store.get(key(request))?.clone(); },
        async put(request, response) { store.set(key(request), response); } };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match() { throw Error('Must never search other applications caches'); },
  };
  vm.runInNewContext(source, { URL, Response, caches,
    self: { location: { origin: 'https://youfree.ca' }, registration: { scope }, clients: { claim() {} }, skipWaiting() {}, addEventListener(name, listener) { listeners[name] = listener; } },
    async fetch() { throw Error('Offline'); },
  });
  let pending;
  listeners.install({ waitUntil(promise) { pending = promise; } }); await pending;
  listeners.activate({ waitUntil(promise) { pending = promise; } }); await pending;
  assert.equal(stores.has(old), false);
  for (const name of [peer, 'whos-free-shell-v128', 'whos-free-ocr-v1', 'ufree-user-sync-v1', current]) assert.equal(stores.has(name), true, name);
  stores.get(peer).set(new URL('peer-only.js', scope).href, new Response('wrong app'));
  stores.get('ufree-user-sync-v1').set('https://youfree.ca/', new Response('{"record":"user data"}'));
  const request = async (url, mode = 'cors') => {
    let response;
    listeners.fetch({ request: { method: 'GET', url: new URL(url, scope).href, mode }, respondWith(promise) { response = promise; } });
    return response;
  };
  assert.equal((await request('peer-only.js')).type, 'error');
  assert.equal(await (await request('missing-page', 'navigate')).text(), 'own shell');
});

const CACHE_NAME = "whos-free-shell-v127";
const OCR_CACHE_NAME = "whos-free-ocr-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./i18n-fr.js?v=127",
  "./i18n.js?v=127",
  "./assets/flag-fr.svg",
  "./assets/flag-uk.svg",
  "./styles.css?v=127",
  "./app.js?v=127",
  "./schedule-qr-batches.js?v=126",
  "./schedule-share-code.js?v=120",
  "./assets/qr/qrcodegen.js?v=90",
  "./schedule-availability.js?v=90",
  "./schedule-groups.js?v=90",
  "./schedule-parser.js?v=112",
  "./schedule-dated-image-parser.js?v=121",
  "./schedule-image-parser.js?v=110",
  "./manifest.webmanifest?v=90",
  "./assets/favicon.png?v=90",
  "./assets/apple-touch-icon.png?v=90",
  "./assets/icon-192.png?v=90",
  "./assets/icon-512.png?v=90",
  "./assets/icon-maskable-512.png?v=90",
  "./assets/UFreeLogo_SVG.svg?v=90",
  "./assets/UFreeLogo_PNG.png?v=90",
  "./assets/favicon.svg?v=90",
  "./favicon.ico?v=90",
  "./assets/icon-192.png",
  "./favicon.ico",
  "./assets/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("whos-free-") && key !== CACHE_NAME && key !== OCR_CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // OCR assets are pinned and hosted with the app. Fetch them only on first
  // use, then retain them across app-shell updates for offline recognition.
  if (url.pathname.includes("/assets/ocr/")) {
    event.respondWith(caches.open(OCR_CACHE_NAME).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }));
    return;
  }

  // Network-first prevents a newly deployed index.html from being paired with
  // stale JavaScript from an older service-worker cache. Cached files remain
  // available as an offline fallback.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return cache.match("./index.html");
        return Response.error();
      })
  );
});


self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    })
  );
});









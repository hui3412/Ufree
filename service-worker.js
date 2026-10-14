const CACHE_NAME = "whos-free-shell-v86";
const OCR_CACHE_NAME = "whos-free-ocr-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=86",
  "./app.js?v=86",
  "./schedule-share-code.js?v=86",
  "./assets/qr/qrcodegen.js?v=86",
  "./schedule-availability.js?v=86",
  "./schedule-groups.js?v=86",
  "./schedule-parser.js?v=86",
  "./schedule-image-parser.js?v=86",
  "./manifest.webmanifest?v=86",
  "./assets/favicon.png?v=86",
  "./assets/apple-touch-icon.png?v=86",
  "./assets/icon-192.png?v=86",
  "./assets/icon-512.png?v=86",
  "./assets/icon-maskable-512.png?v=86",
  "./assets/UFreeLogo_SVG.svg?v=86",
  "./assets/UFreeLogo_PNG.png?v=86",
  "./assets/favicon.svg?v=86",
  "./favicon.ico?v=86"
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
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("./index.html");
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




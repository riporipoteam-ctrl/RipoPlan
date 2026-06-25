// AskAI service worker — makes the installed iOS/Android PWA fast and resilient.
// Strategy:
//   • App shell & static assets: stale-while-revalidate (instant loads, fresh in bg).
//   • Navigations: network-first with cache fallback so the app opens offline.
//   • API/Supabase/worker calls: always network (never cached).
const VERSION = "askai-v1";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function isApiRequest(url) {
  return (
    /supabase\.co/.test(url) ||
    /workers\.dev/.test(url) ||
    /\/(v1|llm|browse|gmail|tasks|oauth|image)\b/.test(url) ||
    /api\./.test(url)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = req.url;
  if (url.startsWith("chrome-extension")) return;

  // Never cache live data / auth / model calls.
  if (isApiRequest(url)) return;

  // Navigations: network-first, fall back to cache, then to the app root.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const shell = await caches.match("./") || await caches.match("index.html");
          return shell || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })()
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});

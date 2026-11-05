/* 圖文庫 service worker — 快取 App 本體；接收分享進來的截圖存入 IndexedDB 收件匣 */
const CACHE = 'snapnote-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
function inboxPut(blob) {
  return new Promise((resolve) => {
    const req = indexedDB.open('snapnote', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction('inbox', 'readwrite');
        tx.objectStore('inbox').put({ id: 's' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), ts: Date.now(), blob });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) { resolve(); }
    };
    req.onerror = () => resolve();
  });
}
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const files = fd.getAll('images');
        for (const f of files) { if (f && f.size) await inboxPut(f); }
      } catch (err) { /* 存不進去也帶使用者回 App */ }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: false }).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html'))));
  } else {
    /* 跨網域（如 OCR 辨識引擎 CDN）也快取起來，之後離線可用 */
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    })));
  }
});

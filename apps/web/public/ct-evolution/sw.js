/**
 * ============================================
 * Service Worker - CT Evolution PACS Workstation
 * يتيح العمل بدون اتصال (Offline Mode)
 * ============================================
 */

const CACHE_NAME = 'ct-evolution-pacs-v3';
const urlsToCache = ['./', './index.html', './style.css', './script.js', './manifest.json'];

// --- تثبيت وتخزين الملفات ---
self.addEventListener('install', (event) => {
  console.log('[SW] جاري تثبيت Service Worker...');
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] تم فتح الذاكرة المخبأة');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => console.log('[SW] خطأ في التخزين:', err)),
  );
  self.skipWaiting();
});

// --- تفعيل وحذف الذواكر القديمة ---
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker مفعل');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
    }),
  );
  self.clients.claim();
});

// --- اعتراض الطلبات وخدمتها من الذاكرة ---
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    }),
  );
});

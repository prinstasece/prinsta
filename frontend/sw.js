/*
  Printsta Service Worker (sw.js)
  Handles PWA offline caching, mobile app lifecycle, and Web Push notifications.
*/

const CACHE_NAME = 'printsta-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/student.html',
  '/style.css',
  '/manifest.json',
  '/assets/logo.png',
  '/assets/sece-logo.png',
  '/assets/google_logo.png'
];

// Install Event - Pre-cache essential app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network first with cache fallback for dynamic resources
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and exclude API / upload calls
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/auth') || 
      url.pathname.startsWith('/orders') || 
      url.pathname.startsWith('/upload') ||
      url.pathname.startsWith('/admin') ||
      url.pathname.startsWith('/settings')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push Notification Event - Handle incoming push events from backend
self.addEventListener('push', function(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = {
      title: "Printsta Notification",
      body: event.data ? event.data.text() : "Your print order queue has been updated."
    };
  }

  const options = {
    body: data.body || "Your order status has been updated.",
    icon: '/assets/logo.png',
    badge: '/assets/logo.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'print-ready',
    data: data,
    actions: [
      { action: 'view', title: 'View Order' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Printsta Update", options)
  );
});

// Notification Click Event
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/student.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/student.html');
      }
    })
  );
});

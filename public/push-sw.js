// ✅ BUG FIX #18: Service Worker versioning
const SW_VERSION = '1.0.0';
const CACHE_NAME = `plani-push-sw-v${SW_VERSION}`;

console.log(`[Service Worker] Version ${SW_VERSION} initializing...`);

// Install event - cache versioning
self.addEventListener('install', function(event) {
  console.log(`[Service Worker] Installing version ${SW_VERSION}`);
  // Skip waiting to activate new version immediately
  self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener('activate', function(event) {
  console.log(`[Service Worker] Activating version ${SW_VERSION}`);
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME && cacheName.startsWith('plani-push-sw-')) {
            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Listen for push events
self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: data.icon || '/pwa-icon-192.png',
      badge: data.badge || '/pwa-icon-192.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: '2',
        url: data.url || '/'
      },
      actions: [
        {
          action: 'explore',
          title: 'Ver detalhes',
          icon: '/pwa-icon-192.png'
        },
        {
          action: 'close',
          title: 'Fechar',
          icon: '/pwa-icon-192.png'
        },
      ]
    };
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Listen for notification click events
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';

  if (event.action === 'explore' || !event.action) {
    // Open the app
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then(function(clientList) {
        // Try to find an existing window to focus
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          // Check if the client is part of our app (same origin)
          if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
            // If we have a specific URL to navigate to, navigate the client
            if (urlToOpen !== '/') {
              client.navigate(urlToOpen);
            }
            return client.focus();
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow)
          return clients.openWindow(urlToOpen);
      })
    );
  }
});

// moi/sw.js — Service worker de l'app salarié. Rôle unique : recevoir les notifications push web.
// (Pas de cache offline ici : le SW cache-only des kiosques est séparé, à la racine.)
// Bump SW_VERSION à chaque modif pour forcer la mise à jour du worker sur les téléphones.
const SW_VERSION = 'moi-push-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Notification poussée par l'edge function check-retards (payload générique { type, title, body, url }).
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Eatime360';
  const options = {
    body: d.body || '',
    icon: '../icons/icon-192.png',
    badge: '../icons/icon-192.png',
    tag: d.type || 'eatime',            // une notif du même type remplace la précédente (pas d'empilement)
    renotify: true,
    data: { url: d.url || '/raya-staging/moi/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Au clic : focaliser l'onglet /moi/ s'il est ouvert, sinon l'ouvrir.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/raya-staging/moi/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cl) => {
      for (const c of cl) { if (c.url.includes('/moi') && 'focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

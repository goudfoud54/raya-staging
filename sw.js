// Eatime360 Kiosk — service worker unique, scope borné au périmètre kiosque par kiosk-shared.js
// (register(..., {scope: '/raya-staging/'})). Le portail admin et les autres modules ne chargent
// JAMAIS ce fichier : ils restent une webapp classique, non installable.
//
// Stratégie volontairement simple (Slice 1 — app-shell only, zéro risque de données) :
//   - Cache-first pour les pages/scripts kiosque précachés à l'install (offline-first, chargement
//     instantané sur un SoC d'entrée de gamme).
//   - PASS-THROUGH total pour tout ce qui n'est pas dans le périmètre kiosque (chemin racine +
//     kiosk/badgeuse/stock-kiosk/haccp-kiosk) : on ne répond même pas à l'event, le navigateur
//     traite la requête normalement. Ça inclut TOUT le cross-origin (Supabase REST + Edge
//     Functions) — la queue de mutations offline (Slice 2) gèrera ce cas côté app, pas ici.
//   - L'auto-update est géré par kiosk-shared.js (registerSW) : une nouvelle version de ce fichier
//     passe en "waiting" et n'active jamais tant que la page ne l'a pas explicitement demandé
//     (message SKIP_WAITING), donc jamais de rechargement forcé pendant une saisie en cours.

const CACHE_VERSION = 'eatime-kiosk-v8';

const SCOPED_DIRS = ['kiosk/', 'badgeuse/', 'stock-kiosk/', 'haccp-kiosk/'];

// Racine du site déployé (ex. /raya-staging/), déduite du chemin de ce fichier lui-même —
// sw.js vit toujours à la racine, donc self.location.pathname = "<root>/sw.js".
const ROOT = self.location.pathname.replace(/sw\.js$/, '');

const PRECACHE_URLS = [
  // PAS ROOT seul : ROOT résout vers index.html, le portail admin — il ne doit JAMAIS être
  // précaché ni servi par ce SW (le portail doit rester une webapp classique, non installable,
  // jamais figée sur un login en cache par un appareil qui a par ailleurs ouvert le hub kiosque).
  ROOT + 'manifest.json',
  ROOT + 'kiosk-shared.js',
  ROOT + 'utils.js',
  ROOT + 'icons/icon-192.png',
  ROOT + 'icons/icon-512.png',
  ROOT + 'icons/icon-512-maskable.png',
  ROOT + 'kiosk/index.html',
  ROOT + 'kiosk/',
  ROOT + 'badgeuse/index.html',
  ROOT + 'badgeuse/',
  ROOT + 'stock-kiosk/index.html',
  ROOT + 'stock-kiosk/',
  ROOT + 'haccp-kiosk/index.html',
  ROOT + 'haccp-kiosk/',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Chaque URL individuellement (pas cache.addAll) : une 404 isolée ne doit pas faire échouer
    // tout l'install (ex. variante avec/sans slash final selon le serveur).
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try { const res = await fetch(url, { cache: 'no-cache' }); if (res.ok) await cache.put(url, res); } catch (e) {}
    }));
  })());
  // Ne PAS self.skipWaiting() ici : on attend un signal explicite de la page (bouton "Recharger"
  // de la bannière de mise à jour) pour ne jamais interrompre une saisie en cours.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('eatime-kiosk-') && n !== CACHE_VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') { self.skipWaiting(); return; }
  // GET_VERSION : round-trip utilisé par kiosk-shared.js pour confirmer qu'un worker "installed"
  // porte réellement un CACHE_VERSION différent avant d'afficher la bannière de mise à jour —
  // le cycle d'install peut se rejouer pour un script strictement identique (ex. absence d'ETag
  // fiable côté serveur), donc l'état "waiting" seul ne suffit pas à garantir une VRAIE nouveauté.
  if (event.data === 'GET_VERSION') { event.source && event.source.postMessage({ type: 'EATIME_SW_VERSION', version: CACHE_VERSION }); return; }
});

function inKioskScope(url) {
  if (url.origin !== self.location.origin) return false; // tout cross-origin (Supabase…) = pass-through
  if (!url.pathname.startsWith(ROOT)) return false;
  const rest = url.pathname.slice(ROOT.length);
  // rest === '' = racine du site = index.html (portail admin) : jamais dans le périmètre kiosque.
  if (rest === 'manifest.json' || rest === 'kiosk-shared.js' || rest === 'utils.js' || rest.startsWith('icons/')) return true;
  return SCOPED_DIRS.some(d => rest.startsWith(d));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return; // POST/PATCH (Supabase) toujours en pass-through
  const url = new URL(event.request.url);
  if (!inKioskScope(url)) return; // ne pas appeler respondWith() = laisser le navigateur gérer nativement

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(event.request);
    if (cached) {
      // Cache-first pour un chargement instantané ; on rafraîchit le cache en tâche de fond si le
      // réseau est dispo, pour que la prochaine visite ait déjà la version la plus fraîche.
      event.waitUntil((async () => {
        try { const res = await fetch(event.request); if (res.ok) await cache.put(event.request, res); } catch (e) {}
      })());
      return cached;
    }
    try {
      const res = await fetch(event.request);
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    } catch (e) {
      // Hors-ligne et rien en cache pour cette ressource précise : dernier recours, la page du
      // module lui-même (évite un écran d'erreur navigateur brut).
      const fallback = await cache.match(ROOT + 'kiosk/index.html');
      return fallback || Response.error();
    }
  })());
});

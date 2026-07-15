// Eatime360 Kiosk — module partagé par /kiosk/, /badgeuse/, /stock-kiosk/, /haccp-kiosk/.
// Chargé via <script src="../kiosk-shared.js?v=X"> AVANT le script inline de la page.
// Regroupe : config snack UNIFIÉE (un seul jeu de clés localStorage pour tous les modules,
// avec migration automatique des anciennes clés par-module), enregistrement du service worker
// (scope kiosque uniquement — jamais le portail admin), Wake Lock, indicateur online/offline,
// et le geste d'appui long (long-press) réutilisé par le hub pour la reconfig cachée.
(function (g) {
  'use strict';

  const KEY_ID = 'eatime_kiosk_snack_id';
  const KEY_NOM = 'eatime_kiosk_snack_nom';
  const KEY_ORG = 'eatime_kiosk_snack_org';

  // Anciennes clés par module (S11/S12, avant l'unification) : lues UNE FOIS en secours si les
  // clés unifiées sont absentes, puis migrées vers les clés unifiées — un appareil déjà configuré
  // n'a jamais besoin de repasser par un nouvel écran de configuration.
  const LEGACY_KEYS = {
    badgeuse: { id: 'badgeuse_snack_id', nom: 'badgeuse_snack_nom', org: 'badgeuse_snack_org' },
    stock: { id: 'stock_kiosk_snack', nom: null, org: null },
    haccp: { id: 'haccp_kiosk_snack', nom: null, org: null },
  };

  function getSnackConfig(legacyModule) {
    let id = null, nom = null, org = null;
    try {
      id = localStorage.getItem(KEY_ID);
      nom = localStorage.getItem(KEY_NOM);
      org = localStorage.getItem(KEY_ORG);
    } catch (e) {}
    if (!id && legacyModule && LEGACY_KEYS[legacyModule]) {
      const lk = LEGACY_KEYS[legacyModule];
      try {
        const legacyId = localStorage.getItem(lk.id);
        if (legacyId) {
          id = legacyId;
          nom = lk.nom ? localStorage.getItem(lk.nom) : null;
          org = lk.org ? localStorage.getItem(lk.org) : null;
          // Migration en écriture : la prochaine visite (quel que soit le module) trouvera
          // directement les clés unifiées, sans repasser par le legacy.
          setSnackConfig({ id, nom, organization_id: org });
        }
      } catch (e) {}
    }
    return { id, nom, organization_id: org };
  }

  function setSnackConfig({ id, nom, organization_id }) {
    try {
      if (id) localStorage.setItem(KEY_ID, id); else localStorage.removeItem(KEY_ID);
      if (nom) localStorage.setItem(KEY_NOM, nom); else localStorage.removeItem(KEY_NOM);
      if (organization_id) localStorage.setItem(KEY_ORG, organization_id); else localStorage.removeItem(KEY_ORG);
    } catch (e) {}
  }

  function clearSnackConfig() {
    try {
      localStorage.removeItem(KEY_ID);
      localStorage.removeItem(KEY_NOM);
      localStorage.removeItem(KEY_ORG);
    } catch (e) {}
  }

  // ── Service worker : un seul fichier (sw.js, à la racine du repo) enregistré avec un scope
  // borné au périmètre kiosque (jamais "/", sinon le portail admin deviendrait lui aussi
  // "capturé" par l'app installée). Le chemin de déploiement réel est /raya-staging/ (GitHub
  // Pages sans domaine custom) — calculé dynamiquement pour ne pas coder cette valeur en dur.
  function siteRoot() {
    // Ex. sur /raya-staging/badgeuse/ → on remonte jusqu'au dossier qui contient sw.js/manifest.json.
    // Convention : le kiosque vit toujours à un seul niveau de profondeur (../ depuis n'importe
    // quel module kiosque atteint la racine du site).
    const m = location.pathname.match(/^(.*?\/)(?:kiosk|badgeuse|stock-kiosk|haccp-kiosk)\/?/);
    return m ? m[1] : '/';
  }
  async function registerSW(onUpdateReady) {
    if (!('serviceWorker' in navigator)) return null;
    const root = siteRoot();
    try {
      const reg = await navigator.serviceWorker.register(root + 'sw.js', { scope: root });
      // Auto-update : une nouvelle version est déjà en "waiting" (visite précédente) → prévenir tout de suite.
      if (reg.waiting) onUpdateReady && onUpdateReady(reg);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // reg.waiting (pas juste navigator.serviceWorker.controller) : un serveur qui ne renvoie
          // pas d'ETag/Last-Modified fiables peut faire rejouer tout le cycle d'install pour un
          // script strictement identique — le navigateur l'annule alors sans jamais le mettre en
          // "waiting". Ne prévenir que si une vraie nouvelle version attend d'être activée.
          if (sw.state === 'installed' && reg.waiting) {
            onUpdateReady && onUpdateReady(reg); // nouvelle version prête, jamais forcée
          }
        });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return; reloaded = true;
        location.reload();
      });
      return reg;
    } catch (e) { return null; }
  }
  function applyUpdate(reg) {
    if (reg && reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
  }

  // ── Wake Lock : réacquis automatiquement au retour au premier plan (le verrou est libéré par
  // le système quand l'onglet passe en arrière-plan — normal, on le redemande à chaque visibilitychange).
  let _wakeLock = null;
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      _wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { _wakeLock = null; }
  }
  function initWakeLock() {
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
  }

  // ── Online/offline : callback immédiat + à chaque changement.
  function watchOnline(cb) {
    const fire = () => cb(navigator.onLine);
    window.addEventListener('online', fire);
    window.addEventListener('offline', fire);
    fire();
  }

  // ── Appui long (5s) générique : utilisé par le hub pour la reconfig cachée. Un tap normal ne
  // déclenche rien (aucun teasing visuel d'un mode caché).
  function setupLongPress(el, onFire, ms) {
    let t = null;
    const start = () => { clearTimeout(t); t = setTimeout(onFire, ms || 5000); };
    const cancel = () => clearTimeout(t);
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ── Retour auto au hub après X minutes d'inactivité (paramétrable par module). Tout tap/scroll
  // réarme le minuteur ; n'importe quelle saisie en cours (modale ouverte, formulaire) doit être
  // exclue par l'appelant via `isBusy()` (ex. ne pas renvoyer au hub pendant une saisie stock).
  function initIdleReturn(minutes, isBusy) {
    if (!minutes) return;
    const root = siteRoot();
    let t = null;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (isBusy && isBusy()) { reset(); return; }
        location.href = root + 'kiosk/';
      }, minutes * 60 * 1000);
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, reset, { passive: true }));
    reset();
  }

  g.EatimeKiosk = {
    getSnackConfig, setSnackConfig, clearSnackConfig,
    registerSW, applyUpdate,
    initWakeLock,
    watchOnline,
    setupLongPress,
    initIdleReturn,
    siteRoot,
  };
})(window);

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
  // Demande sa CACHE_VERSION à un worker précis (round-trip postMessage) — timeout court en filet
  // de sécurité si jamais le worker ne répond pas (ne doit jamais bloquer indéfiniment l'UI).
  function askVersion(worker) {
    return new Promise((resolve) => {
      if (!worker) { resolve(null); return; }
      let done = false;
      const onMsg = (e) => {
        if (e.data && e.data.type === 'EATIME_SW_VERSION') {
          done = true; navigator.serviceWorker.removeEventListener('message', onMsg); resolve(e.data.version);
        }
      };
      navigator.serviceWorker.addEventListener('message', onMsg);
      try { worker.postMessage('GET_VERSION'); } catch (e) {}
      setTimeout(() => { if (!done) { navigator.serviceWorker.removeEventListener('message', onMsg); resolve(null); } }, 2000);
    });
  }

  // Câble la bannière #updBar présente dans le HTML de la page (markup identique sur les 4 pages
  // kiosque) : bouton [data-upd-reload] et [data-upd-close]. Ne fait rien si l'élément est absent.
  function wireUpdateBanner(reg) {
    const bar = document.getElementById('updBar');
    if (!bar) return;
    const reloadBtn = bar.querySelector('[data-upd-reload]');
    const closeBtn = bar.querySelector('[data-upd-close]');
    const hide = () => { bar.classList.add('hidden'); document.body.classList.remove('upd-open'); };
    if (reloadBtn) reloadBtn.onclick = () => {
      if (reg && reg.waiting) {
        reg.waiting.postMessage('SKIP_WAITING');
        // Filet de sécurité : si controllerchange ne fire pas sous 3s (édge case de cycle SW
        // avorté), on recharge quand même — "Recharger" ne doit JAMAIS rester sans effet visible.
        setTimeout(() => location.reload(), 3000);
      } else {
        location.reload();
      }
    };
    if (closeBtn) closeBtn.onclick = hide;
    bar.classList.remove('hidden');
    document.body.classList.add('upd-open'); // réserve l'espace en bas — ne masque jamais les boutons d'action
  }

  // ── Mise à jour automatique quand rien n'est en cours ─────────────────────────────────────────
  let _swReg = null;          // registration courante (le heartbeat y lit un éventuel worker "waiting")
  let _autoArmed = false;     // n'arme le minuteur d'auto-update qu'une seule fois
  const AUTO_KEY = 'eatime_last_autoupdate';

  // Un champ de saisie contient du texte non enregistré → occupé (ne JAMAIS recharger par-dessus).
  function hasUnsavedInput() {
    const el = document.activeElement;
    return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && String(el.value || '').trim() !== '');
  }

  // Quand une VRAIE nouvelle version est en attente : recharge automatiquement dès que rien n'est en
  // cours (isBusy du module OU champ non vidé) ET après un délai d'inactivité, avec un garde-fou
  // anti-boucle (localStorage). L'invariant de décision est PUR et testé : EatimeUtils.shouldAutoUpdate.
  // La bannière manuelle reste toujours active en parallèle (l'utilisateur peut recharger tout de suite).
  function armAutoUpdate(reg, isBusy) {
    if (_autoArmed) return;
    _autoArmed = true;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, bump, { passive: true }));
    setInterval(() => {
      if (!reg.waiting) return;                 // plus rien en attente (déjà activé)
      const decide = g.EatimeUtils && g.EatimeUtils.shouldAutoUpdate;
      if (!decide) return;                      // utils absent → on laisse la bannière manuelle
      const busy = hasUnsavedInput() || !!(isBusy && isBusy());
      let lastAutoAt = null;
      try { const v = localStorage.getItem(AUTO_KEY); if (v) lastAutoAt = +v; } catch (e) {}
      if (!decide({ pending: true, isBusy: busy, lastInteractionMs: last, lastAutoAt: lastAutoAt }, Date.now())) return;
      try { localStorage.setItem(AUTO_KEY, String(Date.now())); } catch (e) {}
      try { reg.waiting.postMessage('SKIP_WAITING'); } catch (e) {}
      setTimeout(() => location.reload(), 4000); // filet : controllerchange recharge normalement avant
    }, 30000);
  }

  // ── Heartbeat : signale l'état de la tablette via l'edge kiosk-ping (service_role) — jamais d'écriture
  // anon directe. running_version = CACHE_VERSION du SW ACTIF (code exécuté) ; update_staged = version
  // d'un SW "waiting" (nouvelle version téléchargée, en attente). Démarrage + toutes les 5 min. Silencieux
  // en cas d'échec (ne bloque jamais le kiosque).
  const HEARTBEAT_MS = 5 * 60 * 1000;
  async function reportHeartbeat(cfg) {
    try {
      const controller = navigator.serviceWorker && navigator.serviceWorker.controller;
      const running = controller ? await askVersion(controller) : null;
      const staged = (_swReg && _swReg.waiting) ? await askVersion(_swReg.waiting) : null;
      await fetch(cfg.supaUrl + '/functions/v1/kiosk-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.anonKey, apikey: cfg.anonKey },
        body: JSON.stringify({
          organization_id: cfg.organization_id, restaurant_id: cfg.restaurant_id,
          kiosk_type: cfg.kioskType, running_version: running, update_staged: staged,
        }),
      });
    } catch (e) {}
  }
  function initHeartbeat(cfg) {
    if (!cfg || !cfg.supaUrl || !cfg.restaurant_id || !cfg.organization_id || !cfg.kioskType) return;
    reportHeartbeat(cfg);
    setInterval(() => reportHeartbeat(cfg), HEARTBEAT_MS);
  }

  async function registerSW(opts) {
    opts = opts || {};
    if (!('serviceWorker' in navigator)) return null;
    const root = siteRoot();
    try {
      const reg = await navigator.serviceWorker.register(root + 'sw.js', { scope: root });
      _swReg = reg;

      // Compare la VERSION RÉELLE (postMessage) du worker "waiting" contre celle actuellement
      // active avant d'afficher quoi que ce soit. `reg.waiting` seul ne suffit pas : un serveur
      // sans ETag/Last-Modified fiable peut faire rejouer tout le cycle d'install pour un script
      // strictement identique (observé en test) — sans ce contrôle, la bannière s'affiche pour
      // "rien", et "Recharger" n'a alors plus de worker waiting valide au moment du clic (elle
      // semble ne rien faire). C'est ce double symptôme qu'on élimine ici, à la source.
      async function checkRealUpdate() {
        // Snapshots pris de façon SYNCHRONE avant tout await : sur un tout premier install, le
        // worker "waiting" est celui-là même qui devient "active" quelques instants plus tard
        // (rien ne le bloque, il n'y a pas d'ancien worker à faire libérer). Si on relit reg.active
        // APRÈS les awaits, on peut le retrouver déjà rempli par ce même worker en cours
        // d'activation, et le comparer par erreur à sa propre version (toujours "différente" de
        // null) → fausse détection de mise à jour. D'où : figer les deux références AVANT d'attendre.
        const waitingWorker = reg.waiting;
        const activeWorkerAtStart = reg.active;
        if (!waitingWorker || !activeWorkerAtStart) return; // pas de worker actif préexistant = install initial, pas une mise à jour
        const [waitingV, activeV] = await Promise.all([askVersion(waitingWorker), askVersion(activeWorkerAtStart)]);
        if (!waitingV || !activeV || waitingV === activeV) return;
        wireUpdateBanner(reg);
        armAutoUpdate(reg, opts.isBusy); // + recharge auto quand rien n'est en cours
      }

      if (reg.waiting) checkRealUpdate();
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed') checkRealUpdate();
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
    registerSW,
    initHeartbeat,
    hasUnsavedInput,
    initWakeLock,
    watchOnline,
    setupLongPress,
    initIdleReturn,
    siteRoot,
  };
})(window);

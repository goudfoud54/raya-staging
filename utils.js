// Eatime360 — utilitaires partagés (C3, audit 2026-06-14).
// Chargé via <script src="../utils.js?v=…"> AVANT le script inline d'une page.
// ⚠️ Les pages avaient des implémentations DIVERGENTES de eur()/esc()/fmtDate() (formats différents).
// Pour ne RIEN changer au comportement, ce module ne factorise pour l'instant que `fmtD` (5 copies
// strictement identiques). Les variantes monétaires sont exposées sous des noms distincts (eur0/eur2)
// pour une adoption future explicite, sans écraser silencieusement un format existant.
(function (g) {
  'use strict';

  // Date courte FR — impl identique à facturation/finance/haccp/moi/stock (drop-in `fmtD`).
  function fmtD(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('fr-FR'); }

  // Jour « métier » (date d'exploitation) au fuseau de l'app, en 'YYYY-MM-DD'. Force Europe/Paris —
  // EXACTEMENT comme l'edge check-stock-alerts (toLocaleDateString('fr-CA',{timeZone:'Europe/Paris'})),
  // donc les écritures de `date_saisie` et l'alerte partagent le MÊME jour, par construction.
  // ⚠️ Ne PAS utiliser `new Date().toISOString().slice(0,10)` pour un jour métier : ça renvoie le jour
  // UTC, décalé la nuit (entre minuit et ~02h à Paris, il renvoie la VEILLE). Piège documenté dans
  // CLAUDE.md. Ici : logique pure, déterministe quel que soit le fuseau de l'appareil, et testée
  // (tests/datelocal_test.js). Si un jour l'app dépasse la France, remplacer APP_TZ par un réglage org.
  var APP_TZ = 'Europe/Paris';
  function ymdLocal(d) { return new Date(d == null ? Date.now() : d).toLocaleDateString('fr-CA', { timeZone: APP_TZ }); }
  function todayYMD() { return ymdLocal(Date.now()); }

  // ── Jour d'EXPLOITATION (journée de travail) ──────────────────────────────────────────────────
  // COPIE volontairement identique de supabase/functions/check-stock-alerts/exploitation.mjs (que le
  // navigateur ne peut pas importer). tests/datelocal_test.js prouve que les deux donnent le MÊME
  // résultat sur tous les cas → une seule définition du jour, écriture et lecture alignées.
  // Un snack ne change pas de journée à minuit : une saisie AVANT l'heure de bascule (cutoff, défaut
  // 05:00, réglable par organisation) appartient à la journée de la VEILLE. Ancre midi UTC = anti-DST.
  function cutoffToMinutes(v) {
    if (v == null || v === '') return 300;
    if (typeof v === 'number' && isFinite(v)) return v;
    var m = String(v).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return 300;
    return (+m[1]) * 60 + (+m[2]);
  }
  function _parisParts(instant) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(instant == null ? Date.now() : instant));
    var g = function (t) { return parts.find(function (p) { return p.type === t; }).value; };
    var hh = g('hour'); if (hh === '24') hh = '00';
    return { y: +g('year'), mo: +g('month'), d: +g('day'), hh: +hh, mm: +g('minute') };
  }
  function exploitationDay(instant, cutoff) {
    var cut = cutoffToMinutes(cutoff);
    var p = _parisParts(instant);
    var tod = p.hh * 60 + p.mm;
    var anchor = Date.UTC(p.y, p.mo - 1, p.d, 12, 0, 0);
    if (tod < cut) anchor -= 86400000;
    var dt = new Date(anchor);
    var mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(dt.getUTCDate()).padStart(2, '0');
    return dt.getUTCFullYear() + '-' + mm + '-' + dd;
  }
  function exploitationToday(cutoff) { return exploitationDay(Date.now(), cutoff); }

  // Échappement HTML robuste (canonique). NB : ne remplace pas les esc()/escH() locaux divergents.
  function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/[<>&"']/g, c =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Montants — DEUX variantes correspondant aux usages existants (à choisir explicitement) :
  function eur0(n) { if (n == null || isNaN(n)) return '—'; return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'; }       // style finance
  function eur2(n) { if (n == null || isNaN(n)) return '0,00 €'; return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; } // style facturation

  // Helpers horaires (planning) : "HH:MM" → minutes, et durée entre deux "HH:MM" (gère le passage minuit).
  function toMin(hhmm) { if (!hhmm) return 0; const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number); return h * 60 + (m || 0); }
  function dur(deb, fin) { let a = toMin(deb), b = toMin(fin); if (b <= a) b += 24 * 60; return b - a; }

  // ── Kiosques (S11) : identifiant de tablette persistant + vérification de PIN côté serveur.
  function kioskId() {
    let k = null;
    try { k = localStorage.getItem('eatime_kiosk_id'); } catch (e) {}
    if (!k) {
      k = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('k-' + Date.now() + '-' + Math.random().toString(16).slice(2));
      try { localStorage.setItem('eatime_kiosk_id', k); } catch (e) {}
    }
    return k;
  }
  // Timeout réseau côté client : sur une tablette associée au WiFi mais sans route réelle (portail
  // captif, passerelle morte), un fetch peut PENDRE longtemps sans jamais rejeter — le kiosque
  // gèlerait alors sans aucun feedback. AbortController borne l'attente et fait retomber l'erreur
  // dans le même catch que l'offline franc ("Réseau indisponible"), déjà géré par tous les appelants.
  const NET_TIMEOUT_MS = 12000;
  async function fetchWithTimeout(url, opts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
    try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal })); }
    finally { clearTimeout(t); }
  }

  // Appelle l'edge function verify-pin. Renvoie {status, ok, salarie, error, retry}.
  async function verifyPin(supaUrl, anonKey, organization_id, restaurant_id, pin) {
    let r, j = {};
    try {
      r = await fetchWithTimeout(supaUrl + '/functions/v1/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + anonKey, apikey: anonKey },
        body: JSON.stringify({ organization_id, restaurant_id, kiosk_id: kioskId(), pin }),
      });
    } catch (e) { return { status: 0, ok: false, salarie: null, error: 'Réseau indisponible', retry: null }; }
    try { j = await r.json(); } catch (e) {}
    return { status: r.status, ok: r.ok && j.ok === true, salarie: j.salarie || null, error: j.error || null, retry: j.retry_after_s || null };
  }

  // Appelle l'edge function create-pointage (S11 suite) : insertion serveur avec re-vérif PIN,
  // cohérence org/resto, séquence d'état et anti double-tap. Renvoie {status, ok, pointage, error, retry}.
  async function createPointage(supaUrl, anonKey, organization_id, restaurant_id, salarie_id, type, pin) {
    let r, j = {};
    try {
      r = await fetchWithTimeout(supaUrl + '/functions/v1/create-pointage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + anonKey, apikey: anonKey },
        body: JSON.stringify({ organization_id, restaurant_id, salarie_id, type, pin, kiosk_id: kioskId() }),
      });
    } catch (e) { return { status: 0, ok: false, pointage: null, error: 'Réseau indisponible', retry: null }; }
    try { j = await r.json(); } catch (e) {}
    return { status: r.status, ok: r.ok && j.ok === true, pointage: j.pointage || null, error: j.error || null, retry: j.retry_after_s || null };
  }

  const api = { fmtD, ymdLocal, todayYMD, cutoffToMinutes, exploitationDay, exploitationToday, escapeHtml, eur0, eur2, toMin, dur, kioskId, verifyPin, createPointage };
  g.EatimeUtils = api;
  // Drop-in globaux :
  if (typeof g.fmtD === 'undefined') g.fmtD = fmtD;
  if (typeof g.ymdLocal === 'undefined') g.ymdLocal = ymdLocal;
  if (typeof g.todayYMD === 'undefined') g.todayYMD = todayYMD;
  if (typeof g.cutoffToMinutes === 'undefined') g.cutoffToMinutes = cutoffToMinutes;
  if (typeof g.exploitationDay === 'undefined') g.exploitationDay = exploitationDay;
  if (typeof g.exploitationToday === 'undefined') g.exploitationToday = exploitationToday;
  g.kioskId = kioskId; g.verifyPin = verifyPin; g.createPointage = createPointage;
})(window);

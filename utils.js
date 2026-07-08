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
  // Appelle l'edge function verify-pin. Renvoie {status, ok, salarie, error, retry}.
  async function verifyPin(supaUrl, anonKey, organization_id, restaurant_id, pin) {
    let r, j = {};
    try {
      r = await fetch(supaUrl + '/functions/v1/verify-pin', {
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
      r = await fetch(supaUrl + '/functions/v1/create-pointage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + anonKey, apikey: anonKey },
        body: JSON.stringify({ organization_id, restaurant_id, salarie_id, type, pin, kiosk_id: kioskId() }),
      });
    } catch (e) { return { status: 0, ok: false, pointage: null, error: 'Réseau indisponible', retry: null }; }
    try { j = await r.json(); } catch (e) {}
    return { status: r.status, ok: r.ok && j.ok === true, pointage: j.pointage || null, error: j.error || null, retry: j.retry_after_s || null };
  }

  const api = { fmtD, escapeHtml, eur0, eur2, toMin, dur, kioskId, verifyPin, createPointage };
  g.EatimeUtils = api;
  // Drop-in globaux :
  if (typeof g.fmtD === 'undefined') g.fmtD = fmtD;
  g.kioskId = kioskId; g.verifyPin = verifyPin; g.createPointage = createPointage;
})(window);

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

  // 'AAAA-MM-JJ' + n jours → 'AAAA-MM-JJ'. Arithmétique en jours CALENDAIRES (ancre midi UTC) : jamais
  // de « + n×86 400 000 » sur une heure locale, faux la semaine du changement d'heure.
  function addDaysYMD(ymd, n) {
    var p = String(ymd).split('-').map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n, 12, 0, 0));
    return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
  }
  // Écart de Paris sur UTC (minutes) à l'instant `ms` : +60 l'hiver, +120 l'été.
  function _parisOffsetMin(ms) {
    var p = _parisParts(ms);
    return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.hh, p.mm) - Math.floor(ms / 60000) * 60000) / 60000);
  }
  // Heure MURALE de Paris (jour 'AAAA-MM-JJ' + `minutes` depuis minuit) → instant UTC en ms. Deux passes
  // pour retomber sur le bon côté d'un changement d'heure. Une heure qui n'existe pas (02:30 le jour du
  // passage à l'heure d'été) est décalée d'une heure — sans effet pour une bascule à 05:00 ou à minuit.
  function parisWallToUtcMs(ymd, minutes) {
    var p = String(ymd).split('-').map(Number);
    var wall = Date.UTC(p[0], p[1] - 1, p[2], 0, 0) + (minutes || 0) * 60000;
    var t = wall - _parisOffsetMin(wall) * 60000;
    return wall - _parisOffsetMin(t) * 60000;
  }
  // Bornes [début, fin[ en instants UTC (ISO) couvrant les journées d'exploitation `from`..`to` incluses.
  // C'est la MÊME définition du jour qu'exploitationDay : un instant t appartient à la période si et
  // seulement si exploitationDay(t) ∈ [from, to] (prouvé par tests/alternance_export_test.js).
  // Remplace les « from+'T00:00:00' » concaténés : sans décalage horaire, PostgREST les lit en UTC, ce
  // qui retirait 1 à 2 h en début de période et en ajoutait autant après la fin.
  function exploitationBounds(from, to, cutoff) {
    var cut = cutoffToMinutes(cutoff);
    var s = parisWallToUtcMs(from, cut), e = parisWallToUtcMs(addDaysYMD(to, 1), cut);
    return { start: new Date(s).toISOString(), end: new Date(e).toISOString(), startMs: s, endMs: e };
  }

  // ── Lecture COMPLÈTE d'une requête, quel que soit le plafond du serveur ───────────────────────
  // Supabase plafonne chaque réponse (max_rows, 1 000 sur ce projet — constaté dans les journaux de
  // l'API : réponses « 0-999 »). Une requête qui demande plus reçoit 1 000 lignes SANS AUCUNE ERREUR.
  // mk(colonnes, optionsSelect) doit renvoyer un builder NEUF, filtré et TRIÉ de façon déterministe
  // (terminer le tri par 'id') : un builder PostgREST ne se rejoue pas, et un tri ambigu fait glisser
  // les pages. Le compte attendu vient d'une requête count:'exact' sur les mêmes filtres.
  //   ⚠ On avance du nombre de lignes RÉELLEMENT reçues et on ne s'arrête que sur une page VIDE ou le
  //   compte atteint — jamais sur « page plus courte que demandée » : avec un plafond serveur, TOUTES
  //   les pages sont plus courtes que demandé, et on s'arrêterait après la première.
  // Renvoie {rows, attendu, recu, doublons, complet, error}. `complet` faux = NE PAS livrer en silence.
  async function fetchAllRows(mk, opts) {
    opts = opts || {};
    var page = opts.page || 1000, maxRows = opts.maxRows || 500000;
    var c;
    try { c = await mk('id', { count: 'exact', head: true }); } catch (e) { return { error: e, rows: [], attendu: null, recu: 0, doublons: 0, complet: false }; }
    if (c && c.error) return { error: c.error, rows: [], attendu: null, recu: 0, doublons: 0, complet: false };
    var attendu = (c && typeof c.count === 'number') ? c.count : null;
    var rows = [], vus = new Set(), doublons = 0, off = 0;
    while (off < maxRows && (attendu == null || rows.length < attendu)) {
      var r;
      try { r = await mk(opts.cols || '*').range(off, off + page - 1); } catch (e) { return { error: e, rows: rows, attendu: attendu, recu: rows.length, doublons: doublons, complet: false }; }
      if (r.error) return { error: r.error, rows: rows, attendu: attendu, recu: rows.length, doublons: doublons, complet: false };
      var data = r.data || [];
      if (!data.length) break;
      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        if (row && row.id != null) { if (vus.has(row.id)) { doublons++; continue; } vus.add(row.id); }
        rows.push(row);
      }
      off += data.length;
      if (opts.onProgress) opts.onProgress(rows.length, attendu);
    }
    return { rows: rows, attendu: attendu, recu: rows.length, doublons: doublons,
             complet: attendu != null && rows.length === attendu && doublons === 0, error: null };
  }
  // Variante « tout ou rien » pour les écrans qui CALCULENT sur les lignes (totaux, soldes, registres) :
  // renvoie les lignes si la lecture est complète, LÈVE une erreur nommée sinon. L'écran affiche l'erreur
  // au lieu d'un chiffre partiel. `nom` = ce qui est lu, en français (« dépenses », « relevés de température »).
  async function fetchAllOrThrow(nom, mk, opts) {
    var r = await fetchAllRows(mk, opts);
    if (r.error || !r.complet) throw new Error('lecture incomplète — ' + nom + ' (' + (r.error ? (r.error.message || r.error)
      : (r.recu + ' ligne(s) reçue(s) sur ' + (r.attendu == null ? '?' : r.attendu) + (r.doublons ? ', ' + r.doublons + ' doublon(s)' : ''))) + ')');
    return r.rows;
  }

  // ── Kiosques : état d'une tablette + décision de mise à jour auto (logique PURE, testée) ──────
  // Classe un heartbeat en trois états DISTINCTS (confondre les deux derniers rendrait l'écran
  // inutilisable comme feu vert au lot 2) :
  //   'a_jour'    : vue récemment ET exécute la version courante ;
  //   'ancienne'  : vue récemment MAIS exécute une version dépassée ;
  //   'muette'    : plus de signe depuis > muteMs (éteinte / hors ligne / en panne) — prime sur tout ;
  //   'inconnue'  : version courante ou exécutée indéterminée.
  // row = { running_version, seen_at } ; current = CACHE_VERSION courante ; nowMs, muteMs en ms.
  function kioskStatus(row, current, nowMs, muteMs) {
    if (muteMs == null) muteMs = 15 * 60 * 1000;
    var seen = row && row.seen_at ? Date.parse(row.seen_at) : NaN;
    var ageMs = isFinite(seen) ? Math.max(0, nowMs - seen) : Infinity;
    if (ageMs > muteMs) return { state: 'muette', ageMs: ageMs };           // le temps prime
    var rv = (row && row.running_version) || null;
    if (!rv || !current) return { state: 'inconnue', ageMs: ageMs };
    return { state: rv === current ? 'a_jour' : 'ancienne', ageMs: ageMs };
  }

  // Décision de recharger automatiquement une tablette. C'est l'INVARIANT DE SÉCURITÉ : jamais pendant
  // qu'un travail est en cours (session/saisie/champ non vidé → isBusy), jamais tant qu'il y a eu une
  // interaction récente, et pas deux fois coup sur coup (garde-fou anti-boucle sur un mauvais déploiement).
  // s = { pending, isBusy, lastInteractionMs, lastAutoAt } ; opts = { idleMs, cooldownMs }.
  function shouldAutoUpdate(s, nowMs, opts) {
    opts = opts || {};
    var idleMs = opts.idleMs == null ? 5 * 60 * 1000 : opts.idleMs;
    var cooldownMs = opts.cooldownMs == null ? 10 * 60 * 1000 : opts.cooldownMs;
    if (!s || !s.pending) return false;                                     // pas de nouvelle version en attente
    if (s.isBusy) return false;                                             // travail en cours → jamais
    if (nowMs - s.lastInteractionMs < idleMs) return false;                 // interaction récente
    if (s.lastAutoAt && (nowMs - s.lastAutoAt) < cooldownMs) return false;  // anti-boucle
    return true;
  }

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

  // ── INDISPONIBILITÉS : affichage en français clair (v1.9) ─────────────────────────────────────
  // SOURCE UNIQUE du format des indisponibilités pour Salariés (fiche + demandes), Planning
  // (demandes), Dispos et « Moi ». Tout est de l'AFFICHAGE : rien ici ne lit ni n'écrit la base, et
  // le planning continue de lire les lignes brutes (indisposOf / checkPlacement) sans les connaître.
  //
  // ⚠ DATES : « AAAA-MM-JJ » est découpé en composantes, jamais passé à new Date('2026-10-24') :
  // cette forme est lue en UTC MINUIT, et un navigateur à l'ouest de Greenwich (Antilles, Guyane,
  // Amériques) l'affiche à la VEILLE. Le jour de la semaine se calcule sur une ancre midi UTC, et les
  // noms de jours et de mois sont écrits ici, sans toLocaleDateString : même texte dans tous les
  // fuseaux et tous les navigateurs (prouvé par tests/indispo_affichage_test.js sous plusieurs TZ).
  var JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var JOURS_LUNDI0 = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']; // jour_semaine : 0 = lundi
  var MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function _ymdParts(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y: y, mo: mo, d: d, dow: new Date(Date.UTC(y, mo - 1, d, 12)).getUTCDay() };
  }
  function _maj(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function _anneeCourante(nowMs) { return +ymdLocal(nowMs == null ? Date.now() : nowMs).slice(0, 4); }
  // « samedi 24 octobre » (+ « 2026 » si ce n'est pas l'année en cours, ou si opts.annee === true).
  // opts : { nowMs, annee: true|false|'auto' (défaut), majuscule: true (défaut) }
  function ymdLong(ymd, opts) {
    opts = opts || {};
    var p = _ymdParts(ymd);
    if (!p) return ymd ? String(ymd) : '—';
    var avecAnnee = opts.annee === true || (opts.annee !== false && p.y !== _anneeCourante(opts.nowMs));
    var s = JOURS_FR[p.dow] + ' ' + (p.d === 1 ? '1er' : p.d) + ' ' + MOIS_FR[p.mo - 1] + (avecAnnee ? ' ' + p.y : '');
    return opts.majuscule === false ? s : _maj(s);
  }
  // « Du mardi 21 au vendredi 24 juillet » · « Du jeudi 30 juillet au lundi 3 août » ·
  // « Du lundi 29 décembre 2025 au vendredi 2 janvier 2026 ». Année : comme ymdLong.
  function ymdRange(a, b, opts) {
    opts = opts || {};
    var pa = _ymdParts(a), pb = _ymdParts(b);
    if (!pa || !pb) return 'Du ' + (a || '?') + ' au ' + (b || '?');
    var cur = _anneeCourante(opts.nowMs);
    var j = function (p) { return JOURS_FR[p.dow] + ' ' + (p.d === 1 ? '1er' : p.d); };
    var s;
    if (pa.y !== pb.y) s = 'du ' + j(pa) + ' ' + MOIS_FR[pa.mo - 1] + ' ' + pa.y + ' au ' + j(pb) + ' ' + MOIS_FR[pb.mo - 1] + ' ' + pb.y;
    else {
      var an = pb.y !== cur ? ' ' + pb.y : '';
      s = pa.mo === pb.mo
        ? 'du ' + j(pa) + ' au ' + j(pb) + ' ' + MOIS_FR[pb.mo - 1] + an
        : 'du ' + j(pa) + ' ' + MOIS_FR[pa.mo - 1] + ' au ' + j(pb) + ' ' + MOIS_FR[pb.mo - 1] + an;
    }
    return opts.majuscule === false ? s : _maj(s);
  }
  function _hm(v) { return v == null || v === '' ? null : String(v).slice(0, 5); }
  // Plage horaire d'une indisponibilité, en mots. Une fin ≤ début signifie le LENDEMAIN (comme le
  // planning) : 00:00 s'écrit « minuit », toute autre fin après minuit est dite « le lendemain ».
  function indispoPlage(d) {
    var hd = _hm(d && d.heure_debut), hf = _hm(d && d.heure_fin);
    if (!hd && !hf) return 'journée entière';
    if (hd && !hf) return 'à partir de ' + hd;
    if (!hd && hf) return 'jusqu’à ' + (hf === '00:00' ? 'minuit' : hf);
    if (hf === '00:00') return hd + ' → minuit';
    return hd + ' → ' + hf + (toMin(hf) <= toMin(hd) ? ' le lendemain' : '');
  }
  function indispoStatut(d) {
    var s = d && d.statut;
    return s === 'indispo' ? 'Indisponible' : s === 'dispo_limitee' ? 'Disponibilité limitée' : s === 'dispo' ? 'Disponible' : (s ? String(s) : 'Statut inconnu');
  }
  // Étiquette de la DEMANDE (vide pour une indisponibilité validée — le cas courant).
  function indispoDemande(d) {
    var s = (d && d.statut_demande) || 'validee';
    return s === 'en_attente' ? 'En attente de validation' : s === 'refusee' ? 'Refusée — ignorée par le planning' : '';
  }
  function _jourOk(d) { return d && typeof d.jour_semaine === 'number' && d.jour_semaine >= 0 && d.jour_semaine <= 6; }
  // « Tous les jeudis » · « Samedi 24 octobre » · repli lisible pour une ligne incomplète.
  function indispoQuand(d, opts) {
    if (!d) return '—';
    if (d.type === 'recurrente') return _jourOk(d) ? 'Tous les ' + JOURS_LUNDI0[d.jour_semaine] + 's' : 'Récurrente — jour non renseigné';
    if (d.date_specifique) return ymdLong(d.date_specifique, opts);
    return 'Date non renseignée';
  }
  // Tri d'affichage : récurrentes d'abord (lundi → dimanche), puis ponctuelles par date croissante ;
  // à égalité, par heure de début puis par id (ordre stable d'un affichage à l'autre).
  function indispoTri(a, b) {
    var ra = a.type === 'recurrente' ? 0 : 1, rb = b.type === 'recurrente' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    var ka = ra === 0 ? String(_jourOk(a) ? a.jour_semaine : 9) : (a.date_specifique || '9999');
    var kb = rb === 0 ? String(_jourOk(b) ? b.jour_semaine : 9) : (b.date_specifique || '9999');
    if (ka !== kb) return ka < kb ? -1 : 1;
    var ha = _hm(a.heure_debut) || '', hb = _hm(b.heure_debut) || '';
    if (ha !== hb) return ha < hb ? -1 : 1;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }
  // Une ponctuelle est PASSÉE quand sa journée d'exploitation est terminée (bascule de l'organisation,
  // 05:00 par défaut), pas à minuit : « ce soir 18:00 → minuit » reste visible jusqu'à la fin du
  // service. Une fin au lendemain APRÈS la bascule (18:00 → 06:00) prolonge jusqu'à cette heure.
  function indispoPassee(d, nowMs, cutoff) {
    if (!d || d.type === 'recurrente' || !_ymdParts(d.date_specifique)) return false;
    var auj = exploitationDay(nowMs, cutoff), date = d.date_specifique.slice(0, 10);
    if (date >= auj) return false;
    var hd = _hm(d.heure_debut), hf = _hm(d.heure_fin);
    if (hd && hf && hf !== '00:00' && toMin(hf) <= toMin(hd) && toMin(hf) > cutoffToMinutes(cutoff))
      return nowMs >= parisWallToUtcMs(addDaysYMD(date, 1), toMin(hf));
    return true;
  }
  // Liste d'affichage d'un salarié. ARCHIVAGE PUREMENT VISUEL : chaque ligne reçue se retrouve dans
  // exactement une entrée (récurrentes, à venir, à compléter ou historique) — aucune n'est retirée,
  // fusionnée ni modifiée ; les objets reçus ne sont pas touchés. Les jours CONSÉCUTIFS au contenu
  // identique (statut, motif, plage, état de la demande) forment une PÉRIODE « Du … au … » dépliable ;
  // deux saisies du même jour restent deux lignes de la même période. Le passé et l'à-venir sont
  // séparés AVANT le regroupement : un arrêt en cours apparaît « à venir » à partir d'aujourd'hui et
  // ses premiers jours dans l'historique. L'historique est rangé par mois de DÉBUT de période, le
  // mois le plus récent en premier.
  // Renvoie { recurrentes, aVenir, aCompleter, historique:[{ym,label,entrees,n}], comptes }.
  function listeIndispos(rows, opts) {
    opts = opts || {};
    var nowMs = opts.nowMs == null ? Date.now() : opts.nowMs, cutoff = opts.cutoff;
    var fmt = { nowMs: nowMs };
    var all = (rows || []).slice();
    var rec = [], fut = [], past = [], inval = [];
    all.forEach(function (d) {
      if (d.type === 'recurrente') rec.push(d);
      else if (!_ymdParts(d.date_specifique)) inval.push(d);
      else if (indispoPassee(d, nowMs, cutoff)) past.push(d);
      else fut.push(d);
    });
    var cle = function (d) { return [d.statut || '', d.motif || '', _hm(d.heure_debut) || '', _hm(d.heure_fin) || '', d.statut_demande || 'validee'].join('\u0001'); };
    var entree = function (lignes) {
      lignes = lignes.slice().sort(indispoTri);
      var d0 = lignes[0], debut = d0.date_specifique ? d0.date_specifique.slice(0, 10) : null;
      var fin = lignes[lignes.length - 1].date_specifique ? lignes[lignes.length - 1].date_specifique.slice(0, 10) : null;
      var jours = {}; lignes.forEach(function (x) { if (x.date_specifique) jours[x.date_specifique.slice(0, 10)] = 1; });
      var nbJours = Object.keys(jours).length;
      var periode = d0.type !== 'recurrente' && debut && fin && debut !== fin;
      return {
        cle: String(d0.id), lignes: lignes, debut: debut, fin: fin, nbJours: nbJours, periode: !!periode,
        quand: periode ? ymdRange(debut, fin, fmt) : indispoQuand(d0, fmt),
        plage: indispoPlage(d0), statut: indispoStatut(d0), demande: indispoDemande(d0), motif: d0.motif || ''
      };
    };
    var periodes = function (liste) {
      var parCle = {};
      liste.forEach(function (d) { (parCle[cle(d)] = parCle[cle(d)] || []).push(d); });
      var out = [];
      Object.keys(parCle).forEach(function (k) {
        var l = parCle[k].slice().sort(indispoTri), run = [];
        l.forEach(function (d) {
          var der = run.length ? run[run.length - 1].date_specifique.slice(0, 10) : null, cur = d.date_specifique.slice(0, 10);
          if (der && cur !== der && cur !== addDaysYMD(der, 1)) { out.push(entree(run)); run = []; }
          run.push(d);
        });
        if (run.length) out.push(entree(run));
      });
      return out.sort(function (a, b) { return a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : indispoTri(a.lignes[0], b.lignes[0]); });
    };
    var recurrentes = rec.slice().sort(indispoTri).map(function (d) { return entree([d]); });
    var aVenir = periodes(fut);
    var aCompleter = inval.map(function (d) { return entree([d]); });
    var parMois = {};
    periodes(past).forEach(function (e) { var ym = e.debut.slice(0, 7); (parMois[ym] = parMois[ym] || []).push(e); });
    var historique = Object.keys(parMois).sort().reverse().map(function (ym) {
      var p = ym.split('-').map(Number);
      return { ym: ym, label: _maj(MOIS_FR[p[1] - 1]) + ' ' + p[0], entrees: parMois[ym],
        n: parMois[ym].reduce(function (s, e) { return s + e.lignes.length; }, 0) };
    });
    var nH = past.length;
    return { recurrentes: recurrentes, aVenir: aVenir, aCompleter: aCompleter, historique: historique,
      comptes: { total: all.length, recurrentes: rec.length, aVenir: fut.length, aCompleter: inval.length, historique: nH, visibles: all.length - nH } };
  }

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

  const api = { fmtD, ymdLocal, todayYMD, cutoffToMinutes, exploitationDay, exploitationToday, addDaysYMD, parisWallToUtcMs, exploitationBounds, fetchAllRows, fetchAllOrThrow, kioskStatus, shouldAutoUpdate, escapeHtml, eur0, eur2, toMin, dur, ymdLong, ymdRange, indispoPlage, indispoStatut, indispoDemande, indispoQuand, indispoTri, indispoPassee, listeIndispos, kioskId, verifyPin, createPointage };
  g.EatimeUtils = api;
  // Drop-in globaux :
  if (typeof g.fmtD === 'undefined') g.fmtD = fmtD;
  if (typeof g.ymdLocal === 'undefined') g.ymdLocal = ymdLocal;
  if (typeof g.todayYMD === 'undefined') g.todayYMD = todayYMD;
  if (typeof g.cutoffToMinutes === 'undefined') g.cutoffToMinutes = cutoffToMinutes;
  if (typeof g.exploitationDay === 'undefined') g.exploitationDay = exploitationDay;
  if (typeof g.exploitationToday === 'undefined') g.exploitationToday = exploitationToday;
  if (typeof g.addDaysYMD === 'undefined') g.addDaysYMD = addDaysYMD;
  if (typeof g.exploitationBounds === 'undefined') g.exploitationBounds = exploitationBounds;
  if (typeof g.fetchAllRows === 'undefined') g.fetchAllRows = fetchAllRows;
  if (typeof g.fetchAllOrThrow === 'undefined') g.fetchAllOrThrow = fetchAllOrThrow;
  if (typeof g.kioskStatus === 'undefined') g.kioskStatus = kioskStatus;
  if (typeof g.shouldAutoUpdate === 'undefined') g.shouldAutoUpdate = shouldAutoUpdate;
  ['ymdLong', 'ymdRange', 'indispoPlage', 'indispoStatut', 'indispoDemande', 'indispoQuand', 'indispoTri', 'indispoPassee', 'listeIndispos']
    .forEach(function (k) { if (typeof g[k] === 'undefined') g[k] = api[k]; });
  g.kioskId = kioskId; g.verifyPin = verifyPin; g.createPointage = createPointage;
})(window);

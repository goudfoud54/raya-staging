// Jour métier / jour d'EXPLOITATION — logique PURE, testée sur des instants UTC fixes (déterministe,
// quel que soit le fuseau machine : les helpers forcent Europe/Paris).
//
// DEUX implémentations sont vérifiées AVEC LES MÊMES CAS :
//   • le FRONT   : utils.js (copie navigateur, chargée via eval du vrai fichier livré) ;
//   • le BACKEND : supabase/functions/check-stock-alerts/exploitation.mjs (importé par l'edge Deno).
// Si les deux divergeaient d'un seul cas, ce harnais tomberait rouge — c'est la garantie « une seule
// définition du jour » : le bug d'origine venait précisément d'une écriture et d'une lecture qui ne
// partageaient pas la même définition (toISOString UTC ≠ jour Paris).
const fs = require('fs'), path = require('path');

(async () => {
  // FRONT : eval de utils.js (IIFE (function(g){…})(window)) avec un faux window.
  const src = fs.readFileSync(path.join(__dirname, '..', 'utils.js'), 'utf8');
  const sandbox = {};
  eval('var window=sandbox;' + src);
  const F = sandbox.EatimeUtils;
  // BACKEND : import du module réellement utilisé par l'edge (pas un jumeau).
  const B = await import(path.join(__dirname, '..', 'supabase', 'functions', 'check-stock-alerts', 'exploitation.mjs'));

  let ok = true;
  const t = (label, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label); ok = cond && ok; };

  // ── ymdLocal / todayYMD (jour civil Paris) ──────────────────────────────────────────────────
  t('ymdLocal format YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(F.ymdLocal('2026-03-05T10:00:00Z')));
  t('ymdLocal nuit CEST 01:30 → 15 (pas UTC 14)', F.ymdLocal('2026-07-14T23:30:00Z') === '2026-07-15');
  t('ymdLocal nuit CET 00:30 → 16 (pas UTC 15)', F.ymdLocal('2026-01-15T23:30:00Z') === '2026-01-16');
  t('contrôle : toISOString donnait bien la veille', new Date('2026-07-14T23:30:00Z').toISOString().slice(0, 10) === '2026-07-14');
  t('todayYMD == jour Paris (base de l\'edge)', F.todayYMD() === new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }));

  // ── exploitationDay : FRONT et BACKEND doivent donner LE MÊME résultat attendu, pour chaque cas ──
  // [label, instant UTC, cutoff, jour d'exploitation attendu]
  const CASES = [
    ['23:59 CEST (soir) → jour même', '2026-07-27T21:59:00Z', '05:00', '2026-07-27'],
    ['00:01 CEST (nuit) → veille', '2026-07-27T22:01:00Z', '05:00', '2026-07-27'],
    ['04:59 CEST → veille (juste avant la bascule)', '2026-07-28T02:59:00Z', '05:00', '2026-07-27'],
    ['05:01 CEST → jour même (juste après la bascule)', '2026-07-28T03:01:00Z', '05:00', '2026-07-28'],
    ['minuit pile → veille', '2026-07-27T22:00:00Z', '05:00', '2026-07-27'],
    ['midi → jour même', '2026-07-28T10:00:00Z', '05:00', '2026-07-28'],
    // DST : printemps (bascule 02:00→03:00 le 29/03/2026) — avant transition Paris = CET (UTC+1)
    ['DST printemps : 01:30 CET → veille', '2026-03-29T00:30:00Z', '05:00', '2026-03-28'],
    // DST : automne (bascule 03:00→02:00 le 25/10/2026)
    ['DST automne : 02:30 CEST (avant recul) → veille', '2026-10-25T00:30:00Z', '05:00', '2026-10-24'],
    ['DST automne : 05:30 CET (après recul) → jour même', '2026-10-25T04:30:00Z', '05:00', '2026-10-25'],
    // Cutoff personnalisé (snack qui ferme à 2h)
    ['cutoff 02:00 : 01:30 → veille', '2026-07-27T23:30:00Z', '02:00', '2026-07-27'],
    ['cutoff 02:00 : 02:30 → jour même', '2026-07-28T00:30:00Z', '02:00', '2026-07-28'],
    // Cutoff 00:00 = jour civil, sans cas particulier
    ['cutoff 00:00 : nuit 00:01 → jour civil (28)', '2026-07-27T22:01:00Z', '00:00', '2026-07-28'],
  ];
  for (const [label, iso, cut, exp] of CASES) {
    const f = F.exploitationDay(iso, cut), b = B.exploitationDay(iso, cut);
    t(`${label}  [front]`, f === exp);
    t(`${label}  [edge ]`, b === exp);
    t(`${label}  front≡edge`, f === b);
  }

  // ── cutoff 00:00 ≡ ymdLocal (jour civil), sur plusieurs instants ─────────────────────────────
  for (const iso of ['2026-07-14T23:30:00Z', '2026-01-15T23:30:00Z', '2026-07-28T10:00:00Z']) {
    t(`cutoff 0 ≡ jour civil (${iso})`, F.exploitationDay(iso, '00:00') === F.ymdLocal(iso) && B.exploitationDay(iso, 0) === F.ymdLocal(iso));
  }

  // ── LE CAS QUI COMPTE : cohérence écriture / lecture / alerte, une feuille à cheval sur minuit ──
  // Soirée du lundi 27/07 : début 23h54, fin 00h13 (mardi civil), alerte du même soir 22h30.
  // Les QUATRE surfaces doivent donner le MÊME jour d'exploitation D = 2026-07-27, sur front ET edge.
  const D = '2026-07-27', cut = '05:00';
  const wStart = '2026-07-27T21:54:00Z'; // écriture 23h54 (soir)
  const wEnd = '2026-07-27T22:13:00Z';   // écriture 00h13 (nuit) — même feuille
  const readNight = wEnd;                 // lecture « feuille en cours » à 00h13 (exploitationToday à cet instant)
  const alert = '2026-07-27T20:30:00Z';  // déclenchement alerte 22h30
  for (const [who, inst] of [['écriture 23h54', wStart], ['écriture 00h13', wEnd], ['lecture 00h13', readNight], ['alerte 22h30', alert]]) {
    t(`cohérence ${who} → ${D} [front]`, F.exploitationDay(inst, cut) === D);
    t(`cohérence ${who} → ${D} [edge ]`, B.exploitationDay(inst, cut) === D);
  }

  // ── Garde-fou passage de bascule (tablette ouverte 04:59 → 05:01) : jours DIFFÉRENTS → reload attendu ──
  t('garde-fou : 04:59 et 05:01 sont des jours différents', F.exploitationDay('2026-07-28T02:59:00Z', cut) !== F.exploitationDay('2026-07-28T03:01:00Z', cut));

  // ── cutoffToMinutes ──
  t('cutoffToMinutes 05:00 → 300', F.cutoffToMinutes('05:00') === 300 && B.cutoffToMinutes('05:00') === 300);
  t('cutoffToMinutes défaut (null) → 300', F.cutoffToMinutes(null) === 300 && B.cutoffToMinutes(null) === 300);
  t('cutoffToMinutes 02:30 → 150', F.cutoffToMinutes('02:30') === 150 && B.cutoffToMinutes('02:30:00') === 150);

  console.log(ok ? '\nALL PASSED' : '\nSOME FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FAIL harness:', e); process.exit(1); });

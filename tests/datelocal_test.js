// Jour métier local (utils.js : ymdLocal / todayYMD) — logique PURE, testée sur des instants UTC fixes.
// Piège récurrent du projet (documenté dans CLAUDE.md) : `new Date().toISOString().slice(0,10)` renvoie
// le jour UTC, décalé la nuit — entre minuit et ~02h à Paris il renvoie la VEILLE. ymdLocal force
// Europe/Paris → jour métier stable, MÊME base que l'edge check-stock-alerts et que date_saisie.
// Le helper hardcodant le fuseau, ces assertions sont déterministes quel que soit le fuseau machine :
// on emploie des instants UTC absolus (…Z), jamais de constructeur à composantes locales.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'utils.js'), 'utf8');
// utils.js est une IIFE (function(g){…})(window) : on lui donne un faux `window` et on récupère
// l'API réellement exposée — on teste le code livré, pas une copie.
const sandbox = {};
eval('var window=sandbox;' + src);
const { ymdLocal, todayYMD } = sandbox.EatimeUtils;

let ok = true;
const t = (label, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label); ok = cond && ok; };

// ── Format ──
t('format YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(ymdLocal('2026-03-05T10:00:00Z')));
t('zéro-pad mois et jour', ymdLocal('2026-01-05T12:00:00Z') === '2026-01-05');

// ── Le cœur du bug : instants juste après minuit à Paris ──
// 2026-07-14T23:30Z = 15/07 01:30 Paris (CEST) → jour métier = 15, et NON 14.
t('nuit CEST 01:30 → jour local 15 (pas UTC 14)', ymdLocal('2026-07-14T23:30:00Z') === '2026-07-15');
t('contrôle : toISOString donnait bien la veille (14)', new Date('2026-07-14T23:30:00Z').toISOString().slice(0, 10) === '2026-07-14');
t('nuit CEST 02:30 → 15', ymdLocal('2026-07-15T00:30:00Z') === '2026-07-15');
// Hiver (CET, UTC+1) : 2026-01-15T23:30Z = 16/01 00:30 Paris → 16.
t('nuit CET 00:30 → jour local 16 (pas UTC 15)', ymdLocal('2026-01-15T23:30:00Z') === '2026-01-16');
t('contrôle hiver : toISOString donnait 15', new Date('2026-01-15T23:30:00Z').toISOString().slice(0, 10) === '2026-01-15');

// ── Bornes de la journée métier ──
t('21:59Z = 23:59 Paris CEST → même jour', ymdLocal('2026-07-31T21:59:00Z') === '2026-07-31');
t('22:30Z = 00:30 Paris CEST → jour suivant', ymdLocal('2026-07-31T22:30:00Z') === '2026-08-01');

// ── Bornes de mois (bug snapshot) : minuit Paris du 1er et du dernier jour, exprimés en instants UTC.
// Paris 2026-07-01 00:00 CEST = 2026-06-30T22:00Z ; Paris 2026-07-31 00:00 = 2026-07-30T22:00Z.
t('snapshot monthStart : minuit Paris 1er juillet → 2026-07-01 (pas 06-30)', ymdLocal('2026-06-30T22:00:00Z') === '2026-07-01');
t('snapshot monthEnd : minuit Paris 31 juillet → 2026-07-31 (pas 07-30)', ymdLocal('2026-07-30T22:00:00Z') === '2026-07-31');

// ── Cohérence todayYMD ──
const edgeToday = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }); // formule de l'edge
t('todayYMD == jour Paris (même base que check-stock-alerts)', todayYMD() === edgeToday);
t('todayYMD == ymdLocal(now)', todayYMD() === ymdLocal(Date.now()));

console.log(ok ? '\nALL PASSED' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);

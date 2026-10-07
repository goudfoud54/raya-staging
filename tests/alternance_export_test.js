// salaries v0.23 — CALENDRIER D'ALTERNANCE ET EXPORT DES POINTAGES (+ garde du snapshot de stock).
//
//  1. Les week-ends ne sont plus mis en « repos » d'office (chargement, import CFA).
//  2. UN bouton qui enregistre tout, écrit sans rien effacer d'abord, relit la base, et une garde avant
//     de quitter avec des modifications non enregistrées.
//  3. Export des pointages complet malgré le plafond serveur (1 000 lignes par réponse), compte vérifié,
//     bornes en journées d'exploitation (heure de Paris).
//  4. Le snapshot mensuel du stock ne purge plus des saisies qu'il n'a pas lues.
//
// Vrai code extrait de salaries/index.html, stock/index.html et utils.js. Doublures : une base PostgREST
// en mémoire (plafond par réponse, contraintes CHECK/UNIQUE réelles de alternance_jours), un DOM minimal.
// Contre-preuves : l'ANCIEN code (git HEAD~ au moment du chantier, lu via `git show`) est rejoué sur les
// mêmes données quand git est disponible, pour montrer que le défaut corrigé existait bien.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const TZ_CHILD = process.argv[2] === '--tz-child';
if (!TZ_CHILD) process.env.TZ = 'Europe/Paris';
const SAL = fs.readFileSync(path.join(ROOT, 'salaries/index.html'), 'utf8');
const STK = fs.readFileSync(path.join(ROOT, 'stock/index.html'), 'utf8');
const UTILS = fs.readFileSync(path.join(ROOT, 'utils.js'), 'utf8');
const { extractFn } = require('./extract.js');

let ok = true;
const t = (l, c, extra) => { console.log((c ? 'PASS' : 'FAIL') + ' · ' + l + (c ? '' : '   ↳ ' + (extra == null ? '' : extra))); ok = c && ok; };
const inst = (src, n) => { try { eval('global.' + n + '=' + extractFn(src, n).replace(/^(async )?function/, '$1function') + ';'); } catch (e) { console.log('MISS', n, ('' + e).split('\n')[0]); } };

// ── utils.js réel (IIFE sur un faux window) ──────────────────────────────────────────────────────
global.window = global.window || {};
const _wl = {}; window.addEventListener = (ty, f) => { (_wl[ty] = _wl[ty] || []).push(f); };
eval(UTILS);
for (const k of ['fetchAllRows', 'exploitationBounds', 'exploitationDay', 'exploitationToday', 'addDaysYMD', 'cutoffToMinutes', 'ymdLocal'])
  global[k] = window.EatimeUtils[k];

// ── Mode enfant : bornes et colonnes du CSV sous un AUTRE fuseau d'appareil ──────────────────────
if (TZ_CHILD) {
  for (const n of ['_cutoff', '_ddmmyyyy', '_cutLbl', 'ptsJour', 'exportResume', 'buildPointagesCSV', 'hoursOfDay']) inst(SAL, n);
  eval('global._csvQ=' + SAL.match(/const _csvQ=([^\n]*);/)[1] + ';');
  eval('global.TYPL_PT=' + SAL.match(/const TYPL_PT=(\{[^\n]*\});/)[1] + ';');
  eval('global.fullName=' + SAL.match(/const fullName=([^\n]*);/)[1] + ';');
  eval('global.fmtH=' + extractFn(SAL, 'fmtH') + ';');
  global.ORG = { journee_exploitation_debut: '05:00' };
  global.S = { salaries: [{ id: 's1', prenom: 'Lina', nom: 'B.' }], restos: [{ id: 'r1', nom: 'Raya Carnot' }] };
  const b = exploitationBounds('2026-10-06', '2026-10-06', '05:00');
  const p = { id: 'p1', salarie_id: 's1', restaurant_id: 'r1', type: 'sortie', ts: '2026-10-06T21:30:00+00:00' };   // 23:30 à Paris
  const ms = Date.parse(p.ts);
  const csv = buildPointagesCSV([p], { sel: { from: '2026-10-06', to: '2026-10-06' }, complet: true, attendu: 1, recu: 1, doublons: 0, cutLbl: '05:00' });
  const ligne = csv.trim().split('\n').pop();
  console.log(JSON.stringify({ tz: process.env.TZ, start: b.start, end: b.end, inclus: ms >= b.startMs && ms < b.endMs, ligne }));
  process.exit(0);
}

const { makeDB } = require('./fakedb.js');   // base PostgREST en mémoire, plafond serveur compris
// Contraintes RÉELLES de alternance_jours (lues en production le 2026-10-07, pg_constraint).
const ALT_CHECKS = { alternance_jours: r => !['ocr', 'manuel'].includes(r.source) ? 'violates check constraint "alternance_jours_source_check"'
  : !['ecole', 'examen', 'entreprise', 'vacances', 'ferie', 'repos'].includes(r.type) ? 'violates check constraint "alternance_jours_type_check"' : null };
const ALT_UNIQ = { alternance_jours: ['salarie_id', 'date'], alternance_calendrier: ['salarie_id', 'annee_scolaire'] };

// ── DOM minimal ──────────────────────────────────────────────────────────────────────────────────
const DOM = {};
const el = id => (DOM[id] = DOM[id] || { id, innerHTML: '', value: '', style: {}, textContent: '', disabled: false, classList: { add() {}, remove() {}, toggle() {} }, focus() {} });
global.document = {
  getElementById: id => DOM[id] || null,
  querySelectorAll: sel => (DOM.__qsa && DOM.__qsa[sel]) || [],
  createElement: tag => ({ tag, click() { DL.push({ name: this.download, href: this.href }); } }),
};
const DL = []; const BLOBS = [];
global.Blob = class { constructor(parts) { this.text = parts.join(''); BLOBS.push(this.text); } };
global.URL = { createObjectURL: b => 'blob:' + (BLOBS.length - 1) };
const TOASTS = []; global.toast = m => TOASTS.push(m);
global.escH = s => (s || '').toString().replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
global.closeModal = () => { if (DOM.modalHost) DOM.modalHost.innerHTML = ''; };
const tick = () => new Promise(r => setTimeout(r, 0));

(async () => {
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('── 1. Week-ends : plus de « repos » d\'office ──────────────────────────────────────────');
for (const n of ['schoolYears', 'altPeriod', 'loadAltCal', 'altSnapshot', 'markAltDirty', 'altDiffCount', 'renderAltSaveStatus', 'renderAltCalendar', 'renderAltSummary', 'altMonthsRange',
  'processCfaMois', 'cfaMonthYear', 'cfaFinalize', 'cfaCluster', 'cfaRgb2lab', 'cfaVectorAnalyse', 'cfaNorm', 'cfaParseMonth', 'cfaControleTotal']) inst(SAL, n);
eval('global.ALT=' + SAL.match(/let ALT=(\{[^\n]*\});/)[1] + ';');
eval('global.ALT_TYPES=' + SAL.match(/const ALT_TYPES=(\[[\s\S]*?\]);/)[1] + ';'); global.ALT_TMAP = Object.fromEntries(ALT_TYPES.map(x => [x.k, x]));
eval('global.ALT_MONTHS=' + SAL.match(/const ALT_MONTHS=(\{[^\n]*\});/)[1] + ';');
eval('global.ALT_CAT_DEF=' + SAL.match(/const ALT_CAT_DEF=(\{[^;]*\});/)[1] + ';');
global.CFA_MONTH_VAR = eval(SAL.match(/const CFA_MONTH_VAR=(\[[^;]+\]);/)[1]);
global.CFA_DELTAE = 16; global.CFA_CONF_SEUIL = 0.6;
global.cfaDE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); global.cfaIsWhite = (r, g, b) => r > 238 && g > 238 && b > 238;
{
  let db = makeDB({ checks: ALT_CHECKS, uniques: ALT_UNIQ }); global.EatimeScope = db.api;
  ALT.annee = '2026-2027';
  await loadAltCal('salA');
  const we = Object.keys(ALT.jours).filter(d => ((new Date(d + 'T00:00:00').getDay() + 6) % 7) >= 5);
  t('calendrier VIERGE : aucun jour pré-rempli (aucun week-end en repos)', Object.keys(ALT.jours).length === 0 && we.length === 0, JSON.stringify(ALT.jours).slice(0, 120));
  t('… et rien de « non enregistré » à l\'ouverture', ALT.dirty === false);
  // Contre-preuve : l'ancien loadAltCal (version commitée avant le chantier) pré-remplissait ~104 week-ends.
  let ancien = null; try { ancien = cp.execSync('git show 90f178a:salaries/index.html', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
  if (ancien) {
    const save = global.loadAltCal;
    eval('global.prefillWeekends=' + extractFn(ancien, 'prefillWeekends') + ';'); eval('global.altMonthsRange=' + extractFn(ancien, 'altMonthsRange') + ';');
    eval('global.loadAltCal=' + extractFn(ancien, 'loadAltCal').replace(/^async function/, 'async function') + ';');
    ALT.period = null; await loadAltCal('salA');
    const n = Object.values(ALT.jours).filter(j => j.type === 'repos').length;
    t('CONTRÔLE : l\'ancien code mettait ' + n + ' week-ends en repos sur un calendrier vierge', n >= 100, n);
    global.loadAltCal = save; delete global.prefillWeekends;
  } else console.log('   ℹ git indisponible : contre-preuve sur l\'ancien code non rejouée');
  const code = SAL.replace(/\/\/[^\n]*/g, '');
  t('la fonction prefillWeekends et son bouton ont disparu', !/function prefillWeekends|prefillWeekends\(/.test(code));
  t('aucun code n\'écrit type:\'repos\' de lui-même', !/type:\s*'repos'/.test(code) && !/\?'repos'/.test(code));
}
{ // Import (chemin OCR) : un samedi de COURS reste « école », un samedi lu « entreprise » le reste.
  const m = [{ nom: 'octobre-26', jours: [{ d: 3, t: 'ecole' }, { d: 4, t: 'entreprise' }, { d: 5, t: 'ecole' }, { d: 10, t: 'weekend' }] }];
  const r = processCfaMois(m);
  t('import OCR : samedi 3/10 lu « école » → reste ÉCOLE (plus forcé en week-end)', r['2026-10-03'] === 'ecole', JSON.stringify(r));
  t('… dimanche 4/10 « entreprise » → reste entreprise', r['2026-10-04'] === 'entreprise');
  t('… un jour lu « weekend » par l\'OCR est IGNORÉ (non renseigné), jamais « repos »', r['2026-10-10'] === 'weekend' && ALT_CAT_DEF.weekend === 'ignore');
}
{ // Import (chemin vectoriel, PDF réel de référence) : plus de groupe « weekend », école = 93.
  const FIX = require('./fixtures/cfa_bts_mco_26-28.json');
  const pages = FIX.pages.map(p => ({ items: p.items.map(a => ({ str: a[0], x: a[1], y: a[2], w: a[3] })), rects: p.rects.map(a => ({ x0: a[0], y0: a[1], x1: a[2], y1: a[3], rgb: [a[4], a[5], a[6]] })) }));
  const a = cfaVectorAnalyse(pages, '2026-2027'); const s = a.samples.map(x => ({ ...x }));
  const r = cfaFinalize(s, cfaCluster(s), 'pdf'); r.annonce = a.annonce;
  const ecole = r.clusters.find(c => c.rgb.join(',') === '131,204,235');
  const ctl = cfaControleTotal(r, { [ecole.id]: 'ecole' });
  t('PDF de référence : aucun groupe « weekend » forcé', !r.clusters.some(c => c.id === 'weekend') && !Object.values(r.byDate).some(v => v.cluster === 'weekend'));
  t('… le compte d\'école reste 93 = total annoncé par le document', ctl && ctl.ok && ctl.trouve === 93, JSON.stringify(ctl));
  // Un samedi de cours (couleur école) est désormais COMPTÉ comme école.
  const s2 = [{ date: '2026-10-03', rgb: [131, 204, 235] }, { date: '2026-10-05', rgb: [131, 204, 235] }, { date: '2026-10-04', rgb: [166, 166, 166] }];
  const r2 = cfaFinalize(s2, cfaCluster(s2), 'pdf');
  t('un SAMEDI à la couleur école est dans le groupe école (avant : forcé « week-end »)', r2.byDate['2026-10-03'].cluster === r2.byDate['2026-10-05'].cluster);
  t('la fenêtre d\'association ne propose plus « repos » par défaut', !/c\.id==='weekend'\?'repos'/.test(SAL));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2. Un seul bouton, qui enregistre TOUT et le prouve ─────────────────────────────────');
for (const n of ['altSourceDb', 'altRowsToSave', 'altEcart', 'saveAltCal', 'altHasUnsaved', 'altLeaveGuard', '_altLeave', 'initAltTab', 'onAltYearChange', 'onAltCfaInput', 'openFiche', 'closeFiche']) inst(SAL, n);
eval('global._altSaving=false; global._altLeaveRes=null;');
global.ME = { id: 'me', organization_id: 'org1' };
global.S = { salaries: [{ id: 'salA', prenom: 'Assma', nom: 'E.' }, { id: 'salB', prenom: 'Louna', nom: 'T.' }], restos: [] };
global.val = id => (DOM[id] ? DOM[id].value : '');
{
  const tpl = SAL.slice(SAL.indexOf("else if(currentTab==='alternance'){"), SAL.indexOf("if(currentTab==='alternance' && s.id){ initAltTab(s.id); }"));
  t('l\'onglet n\'a plus qu\'UN bouton d\'enregistrement (saveAltCal)', (tpl.match(/onclick="saveAltCal\(\)"/g) || []).length === 1 && !/saveAltConfig|applyAltCal/.test(SAL), (tpl.match(/onclick="[^"]*"/g) || []).join(' '));
  t('… libellé explicite « 💾 Enregistrer le calendrier »', />💾 Enregistrer le calendrier</.test(tpl));
  t('… le nom du CFA marque l\'aperçu comme modifié (il part avec le même bouton)', /id="alt_cfa"[^>]*oninput="onAltCfaInput\(this\.value\)"/.test(tpl));
}
function etatBase(db) { return Object.fromEntries(db.T('alternance_jours').filter(r => r.salarie_id === 'salA').map(r => [r.date, r.type + '/' + r.source])); }
{ // Données de départ : comme Assma EL HAI en production — 86 week-ends en repos + quelques jours d'école.
  const db = makeDB({ checks: ALT_CHECKS, uniques: ALT_UNIQ }); global.EatimeScope = db.api;
  const we = [], ec = ['2026-09-08', '2026-09-09', '2026-09-15', '2026-09-16', '2026-09-22'];
  for (let d = new Date(2026, 8, 5); we.length < 86; d.setDate(d.getDate() + 1)) if (d.getDay() === 0 || d.getDay() === 6) we.push(ymdLocal(d.getTime()));
  we.forEach(d => db.T('alternance_jours').push({ id: db.nid(), salarie_id: 'salA', organization_id: 'org1', date: d, type: 'repos', source: 'manuel' }));
  ec.forEach(d => db.T('alternance_jours').push({ id: db.nid(), salarie_id: 'salA', organization_id: 'org1', date: d, type: 'ecole', source: 'manuel' }));
  global.currentFiche = { id: 'salA' }; ALT.annee = '2026-2027'; ALT.period = null;
  await loadAltCal('salA');
  t('chargement : 91 jours en base, aperçu identique', Object.keys(ALT.jours).length === 91 && !ALT.dirty);
  // Le patron peint : efface 2 week-ends, ajoute 3 jours d'école, dont 2 via l'import « emploi du temps »
  // (source 'pdf-texte' — refusée par la base réelle), et renomme le CFA.
  delete ALT.jours[we[0]]; delete ALT.jours[we[1]];
  ALT.jours['2026-10-06'] = { type: 'ecole', source: 'manuel' };
  ALT.jours['2026-10-13'] = { type: 'ecole', source: 'pdf-texte' };
  ALT.jours['2026-10-14'] = { type: 'examen', source: 'pdf-texte' };
  ALT.dirty = true; onAltCfaInput('CFA Nancy');
  DOM.altSaveStatus = el('altSaveStatus'); DOM.altDirty = el('altDirty'); DOM.alt_cfa = undefined;   // champ CFA ABSENT de l'écran
  const okSave = await saveAltCal();
  const base = etatBase(db);
  t('enregistré : la base contient EXACTEMENT l\'aperçu (92 jours)', okSave && Object.keys(base).length === 92 && !(we[0] in base) && base['2026-10-14'] === 'examen/ocr', JSON.stringify({ okSave, n: Object.keys(base).length }));
  t('… la source « pdf-texte » est écrite « ocr » (acceptée par la contrainte réelle)', base['2026-10-13'] === 'ecole/ocr');
  t('… le nom du CFA est enregistré même champ absent de l\'écran', (db.T('alternance_calendrier')[0] || {}).cfa_nom === 'CFA Nancy');
  t('… retour visible : « 92 jours enregistrés » + bloquants au planning', /✅ 92 jours enregistrés<\/span> à \d\d:\d\d — 8 jours d'école\/examen bloquants au planning · 1 examen au Calendrier RH/.test(DOM.altSaveStatus.innerHTML), DOM.altSaveStatus.innerHTML);
  t('… et l\'aperçu n\'est plus marqué « non enregistré »', ALT.dirty === false);
  t('… événements du Calendrier RH créés (1 examen + rentrée)', db.T('calendar_events').length === 2);
  // Contre-preuve : l'ANCIEN applyAltCal effaçait la période PUIS insérait — avec 'pdf-texte', l'insertion
  // est refusée et le calendrier reste VIDE.
  let ancien = null; try { ancien = cp.execSync('git show 90f178a:salaries/index.html', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
  if (ancien) {
    const db2 = makeDB({ checks: ALT_CHECKS, uniques: ALT_UNIQ }); global.EatimeScope = db2.api;
    ec.forEach(d => db2.T('alternance_jours').push({ id: db2.nid(), salarie_id: 'salA', organization_id: 'org1', date: d, type: 'ecole', source: 'manuel' }));
    const saveA = global.loadAltCal;
    eval('global.saveAltConfig=' + extractFn(ancien, 'saveAltConfig') + ';'); eval('global.applyAltCal=' + extractFn(ancien, 'applyAltCal') + ';');
    global.loadAltCal = async () => {}; DOM.alt_cfa = el('alt_cfa');
    ALT.jours = { '2026-09-08': { type: 'ecole', source: 'manuel' }, '2026-10-13': { type: 'ecole', source: 'pdf-texte' } };
    await applyAltCal();
    t('CONTRÔLE : l\'ancien enregistrement, avec un jour « pdf-texte », laissait le calendrier VIDE', db2.T('alternance_jours').length === 0, db2.T('alternance_jours').length);
    global.loadAltCal = saveA; delete global.applyAltCal; delete global.saveAltConfig; DOM.alt_cfa = undefined;
  }
  // Échec d'écriture : rien n'est perdu, l'aperçu reste, le message le dit.
  global.EatimeScope = db.api;
  const avant = JSON.stringify(etatBase(db));
  ALT.jours['2026-10-20'] = { type: 'ecole', source: 'manuel' }; ALT.dirty = true;
  db.hooks['alternance_jours:upsert'] = () => ({ data: null, error: { message: 'réseau coupé' } });
  const ko = await saveAltCal();
  t('écriture refusée → la base est INTACTE (rien effacé avant d\'écrire)', ko === false && JSON.stringify(etatBase(db)) === avant);
  t('… l\'aperçu reste à l\'écran, toujours « non enregistré »', ALT.dirty === true && ALT.jours['2026-10-20']);
  t('… et le message le dit', /Non enregistré<\/span> : écriture des jours \(réseau coupé\) — vos modifications sont toujours à l'écran/.test(DOM.altSaveStatus.innerHTML), DOM.altSaveStatus.innerHTML);
  // La base « avale » une ligne sans erreur : la relecture le voit.
  delete db.hooks['alternance_jours:upsert'];
  db.hooks['alternance_jours:upsert'] = q => { const l = (Array.isArray(q.payload) ? q.payload : [q.payload]).filter(r => r.date !== '2026-10-20'); q.payload = l; return null; };
  const ko2 = await saveAltCal();
  t('ligne perdue sans erreur → la RELECTURE la détecte, « 1 manquant », pas de faux « enregistré »', ko2 === false && /1 manquant/.test(DOM.altSaveStatus.innerHTML) && ALT.dirty === true, DOM.altSaveStatus.innerHTML);
  delete db.hooks['alternance_jours:upsert'];
  t('… puis un nouvel essai réussit', await saveAltCal() === true && etatBase(db)['2026-10-20'] === 'ecole/manuel');
  t('altEcart compte manquants / en trop / différents', JSON.stringify(altEcart([{ date: 'a', type: 'ecole' }, { date: 'b', type: 'ecole' }], [{ date: 'b', type: 'examen' }, { date: 'c', type: 'ecole' }])) === '{"manquants":1,"enTrop":1,"differents":1,"total":3}');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 3. Garde : modifications non enregistrées ───────────────────────────────────────────');
{
  const db = makeDB({ checks: ALT_CHECKS, uniques: ALT_UNIQ }); global.EatimeScope = db.api;
  el('modalHost'); el('listView'); el('ficheView'); el('alt_annee'); el('altSaveStatus'); el('altDirty'); el('altBrushBar'); el('altCalGrid');
  global.initSnackPri = () => {}; let rendus = 0; global.renderFiche = () => { rendus++; }; global.currentTab = 'alternance';
  global.currentFiche = { id: 'salA' }; ALT.annee = '2026-2027'; ALT.period = null;
  await loadAltCal('salA');
  ALT.jours['2026-10-06'] = { type: 'ecole', source: 'manuel' }; ALT.jours['2026-10-07'] = { type: 'ecole', source: 'manuel' }; ALT.dirty = true;
  // Changer d'ONGLET puis revenir : plus de rechargement depuis la base, rien de perdu.
  const lectures = db.reads; DOM.alt_annee.value = '';
  initAltTab('salA');
  t('changer d\'onglet et revenir : aperçu CONSERVÉ, aucune relecture de la base', db.reads === lectures && ALT.jours['2026-10-06'] && ALT.dirty, `${db.reads - lectures} lecture(s)`);
  // Ouvrir une AUTRE fiche : la garde s'interpose.
  let fini = false; const p1 = openFiche('salB').then(() => { fini = true; }); await tick();
  t('ouvrir une autre fiche → fenêtre d\'avertissement, la fiche ne change PAS encore', /Calendrier d'alternance non enregistré/.test(DOM.modalHost.innerHTML) && currentFiche.id === 'salA' && !fini);
  t('… elle nomme le salarié et le nombre de jours modifiés', /Assma E\./.test(DOM.modalHost.innerHTML) && /<b>2 jours<\/b> modifiés/.test(DOM.modalHost.innerHTML), DOM.modalHost.innerHTML.slice(0, 400));
  t('… trois issues : rester, abandonner, enregistrer puis continuer', /_altLeave\('stay'\)/.test(DOM.modalHost.innerHTML) && /_altLeave\('discard'\)/.test(DOM.modalHost.innerHTML) && /_altLeave\('save'\)/.test(DOM.modalHost.innerHTML));
  await _altLeave('stay'); await p1;
  t('« Rester » → même fiche, aperçu intact', currentFiche.id === 'salA' && ALT.dirty && ALT.jours['2026-10-07']);
  const p2 = openFiche('salB'); await tick(); await _altLeave('save'); await p2;
  t('« Enregistrer puis continuer » → enregistré EN BASE, puis fiche suivante ouverte', currentFiche.id === 'salB' && db.T('alternance_jours').length === 2 && !ALT.dirty);
  // Fermer la fiche / changer d'année / quitter la page.
  global.currentFiche = { id: 'salA' }; await loadAltCal('salA'); ALT.jours['2026-11-03'] = { type: 'ecole', source: 'manuel' }; ALT.dirty = true;
  const p3 = closeFiche(); await tick();
  t('fermer la fiche → avertissement aussi', /non enregistré/.test(DOM.modalHost.innerHTML));
  await _altLeave('discard'); await p3;
  t('« Abandonner » → fiche fermée, aperçu abandonné, base inchangée', currentFiche === null && !ALT.dirty && db.T('alternance_jours').length === 2);
  global.currentFiche = { id: 'salA' }; await loadAltCal('salA'); ALT.jours['2026-11-04'] = { type: 'ecole', source: 'manuel' }; ALT.dirty = true;
  DOM.alt_annee.value = '2027-2028'; const p4 = onAltYearChange(); await tick();
  t('changer d\'année scolaire → avertissement, l\'année affichée ne bouge pas', /non enregistré/.test(DOM.modalHost.innerHTML) && ALT.annee === '2026-2027' && DOM.alt_annee.value === '2026-2027');
  await _altLeave('stay'); await p4;
  t('… « Rester » → toujours 2026-2027, modifications intactes', ALT.annee === '2026-2027' && ALT.jours['2026-11-04'] && ALT.dirty);
  // Fermer l'onglet du navigateur : avertissement natif (beforeunload).
  const bu = SAL.match(/window\.addEventListener\('beforeunload',[^\n]*\);/)[0]; eval(bu);
  const ev = { returnValue: undefined, prevented: false, preventDefault() { this.prevented = true; } };
  _wl.beforeunload[_wl.beforeunload.length - 1](ev);
  t('quitter la page avec des modifications → avertissement du navigateur', ev.prevented && ev.returnValue === '');
  ALT.dirty = false; const ev2 = { prevented: false, preventDefault() { this.prevented = true; } }; _wl.beforeunload[_wl.beforeunload.length - 1](ev2);
  t('… sans modification → aucun avertissement', !ev2.prevented);
  // v0.24 — « Abandonner » au moment d'IMPORTER un autre calendrier, sur la MÊME fiche : l'aperçu importé
  // doit rester protégé (avant : rattachement perdu → ni garde ni avertissement, et l'onglet le rechargeait).
  ALT.dirty = true; global.currentFiche = { id: 'salA' }; await loadAltCal('salA');
  const enBase = Object.keys(ALT.jours).length;
  ALT.jours['2026-12-01'] = { type: 'ecole', source: 'manuel' }; ALT.dirty = true; markAltDirty();
  const pI = altLeaveGuard('importer un autre calendrier'); await tick(); await _altLeave('discard'); const okI = await pI;
  t('import → garde → « Abandonner » : retour à l\'état ENREGISTRÉ, même fiche', okI === true && !ALT.jours['2026-12-01'] && Object.keys(ALT.jours).length === enBase && ALT.salId === 'salA');
  ALT.jours = { '2026-12-08': { type: 'ecole', source: 'ocr' }, '2026-12-09': { type: 'ecole', source: 'ocr' } }; ALT.dirty = true; markAltDirty();   // = applyCfaClusters
  t('… l\'aperçu importé est rattaché au salarié et compte comme NON enregistré', altHasUnsaved() && ALT.salId === 'salA');
  const lect2 = db.reads; initAltTab('salA');
  t('… changer d\'onglet le CONSERVE (aucune relecture de la base)', db.reads === lect2 && ALT.jours['2026-12-08'] && Object.keys(ALT.jours).length === 2);
  const ev3 = { prevented: false, preventDefault() { this.prevented = true; } }; _wl.beforeunload[_wl.beforeunload.length - 1](ev3);
  t('… et quitter la page déclenche l\'avertissement', ev3.prevented);
  // Filet de sécurité : tout aperçu modifié sans rattachement (salId vide) est rattaché à la fiche affichée.
  ALT.salId = null; ALT.dirty = true; markAltDirty();
  t('aperçu modifié sans rattachement → rattaché à la fiche affichée par markAltDirty', ALT.salId === 'salA' && altHasUnsaved());
  ALT.dirty = false;
  const code = SAL.replace(/\/\/[^\n]*/g, '');
  t('import d\'un autre fichier CFA et déconnexion passent aussi par la garde', /async function onCfaFile\(ev\)\{[^]*?altLeaveGuard\(/.test(code.slice(code.indexOf('async function onCfaFile'), code.indexOf('async function onCfaFile') + 400)) && /async function logout\(\)\{if\(!await altLeaveGuard/.test(code));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 4. Lecture complète malgré le plafond serveur (fetchAllRows, utils.js) ─────────────');
function pointagesDB(n, cap, debut) {
  const db = makeDB({ cap });
  const t0 = Date.parse(debut || '2026-09-07T05:00:00Z');
  for (let i = 0; i < n; i++) db.T('pointages').push({ id: 'p' + String(i).padStart(6, '0'), salarie_id: 's' + (i % 7), restaurant_id: 'r' + (i % 3), type: ['arrivee', 'sortie'][i % 2], ts: new Date(t0 + i * 17 * 60000).toISOString() });
  return db;
}
const mkPts = db => (cols, o) => db.api.from('pointages').select(cols, o).order('ts').order('id');
for (const cap of [500, 1000]) {
  const db = pointagesDB(2345, cap);
  const r = await fetchAllRows(mkPts(db));
  t(`plafond serveur ${cap} : 2 345 lignes lues sur 2 345, compte vérifié, aucun doublon`, r.complet && r.recu === 2345 && r.attendu === 2345 && new Set(r.rows.map(x => x.id)).size === 2345, JSON.stringify({ recu: r.recu, attendu: r.attendu, complet: r.complet }));
}
{ // Contrôle : une requête unique (l'ancien export) et une boucle naïve « s'arrêter sur page courte ».
  const db = pointagesDB(2345, 500);
  const un = await db.api.from('pointages').select('*').order('ts');
  t('CONTRÔLE : une requête unique ne reçoit que 500 lignes, sans erreur', un.data.length === 500 && !un.error);
  let naive = [], off = 0; for (;;) { const r = await mkPts(db)('*').range(off, off + 999); naive = naive.concat(r.data); off += 1000; if (r.data.length < 1000) break; }
  t('CONTRÔLE : une pagination naïve (« page courte = fin ») s\'arrête à 500', naive.length === 500, naive.length);
}
{ // Des lignes disparaissent pendant la lecture → incomplet, pas livré.
  const db = pointagesDB(2345, 1000);
  let n = 0; db.hooks['pointages:select'] = q => { if (!(q.o.count && q.o.head) && ++n === 2) db.t.pointages.splice(0, 3); return null; };
  const r = await fetchAllRows(mkPts(db));
  t('lignes supprimées pendant la lecture → complet = FAUX (2 342 / 2 345)', !r.complet && r.recu === 2342 && r.attendu === 2345, JSON.stringify({ recu: r.recu, attendu: r.attendu }));
}
{ // Tri instable entre deux pages → doublons détectés.
  const db = pointagesDB(1500, 1000);
  let pg = 0; db.hooks['pointages:shuffle'] = (out, q) => { if (q.rg && q.rg[0] > 0) { const c = out.slice(); c.splice(q.rg[0], 0, c[0]); return c; } return out; };
  const r = await fetchAllRows(mkPts(db));
  t('pages qui se chevauchent → doublon détecté et écarté, complet = FAUX', r.doublons === 1 && !r.complet, JSON.stringify({ recu: r.recu, doublons: r.doublons }));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 5. Export de bout en bout : fichier, récapitulatif, blocage si incomplet ───────────');
for (const n of ['_cutoff', '_ddmmyyyy', '_cutLbl', 'ptsJour', 'readPointages', 'exportResume', 'buildPointagesCSV', 'downloadPointagesCSV', 'finishExport',
  'forceIncompleteExport', 'doExport', 'exportSalarieCSV', 'hoursOfDay', '_exStatus', '_recapKey', 'exportRecapPref', 'setExportRecapPref']) inst(SAL, n);
// localStorage en mémoire (préférence « récapitulatif en tête », v0.26).
global.localStorage = (() => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
eval('global._csvQ=' + SAL.match(/const _csvQ=([^\n]*);/)[1] + ';');
eval('global.TYPL_PT=' + SAL.match(/const TYPL_PT=(\{[^\n]*\});/)[1] + ';');
eval('global.fullName=' + SAL.match(/const fullName=([^\n]*);/)[1] + ';');
eval('global.fmtH=' + extractFn(SAL, 'fmtH') + ';');
eval('global._exportPending=null; global._exportAgain=null;');
global.ORG = { journee_exploitation_debut: '05:00' };
global.S = { salaries: [0, 1, 2, 3, 4, 5, 6].map(i => ({ id: 's' + i, prenom: 'P' + i, nom: 'N"' + i })), restos: [{ id: 'r0', nom: 'Raya Carnot' }, { id: 'r1', nom: 'Raya Grand Cœur' }, { id: 'r2', nom: 'Raya Lobau' }] };
function modaleExport(from, to, recap) {
  el('modalHost').innerHTML = 'export'; el('exStatus').innerHTML = ''; el('exGo'); el('ex_recap').checked = !!recap;
  el('ex_from').value = from; el('ex_to').value = to;
  DOM.__qsa = { '.ex_resto:checked': ['r0', 'r1', 'r2'].map(v => ({ value: v })) };
}
{
  const db = pointagesDB(2345, 1000, '2026-08-01T10:00:00Z'); global.EatimeScope = db.api;   // ~28 jours de pointages
  // v0.26 — PAR DÉFAUT : fichier « brut » (pas de récapitulatif en tête), importable tel quel en paie.
  modaleExport('2026-07-01', '2026-09-30'); DL.length = 0; BLOBS.length = 0;
  await doExport();
  const brut = BLOBS[BLOBS.length - 1] || '';
  t('par défaut : AUCUN récapitulatif — la 1ʳᵉ ligne est l\'en-tête des colonnes (import paie)', /^\ufeffDate,Heure,Salarie,Snack,Type,Heures_jour,Journee\n/.test(brut), JSON.stringify(brut.slice(0, 80)));
  t('… le nombre de pointages est dans le NOM du fichier', DL[0] && DL[0].name === 'pointages_2026-07-01_2026-09-30_2345pointages.csv', DL[0] && DL[0].name);
  t('… le contrôle reste à l\'écran (2345 attendus = 2345 exportés)', /✅ <b>2345 pointage\(s\) exporté\(s\)<\/b>/.test(DOM.exStatus.innerHTML) && /2345 attendu\(s\), 2345 exporté\(s\), complet/.test(DOM.exStatus.innerHTML));
  // Option cochée : récapitulatif en tête, comme en v0.23 — et le choix est retenu pour la fois suivante.
  modaleExport('2026-07-01', '2026-09-30', true); DL.length = 0; BLOBS.length = 0;
  const meta = await doExport();
  t('option cochée → préférence MÉMORISÉE pour l\'utilisateur', exportRecapPref() === true);
  const csv = BLOBS[BLOBS.length - 1] || '';
  const lignes = csv.split('\n').filter(l => /^\d\d\/\d\d\/\d{4},/.test(l));
  t('export de 2 345 pointages (plafond 1 000) → fichier de 2 345 lignes', DL.length === 1 && lignes.length === 2345, `${DL.length} fichier(s), ${lignes.length} ligne(s)`);
  t('… compte vérifié dans le fichier : « 2345 attendu(s), 2345 exporté(s), complet »', /2345 pointage\(s\) — contrôle : 2345 attendu\(s\), 2345 exporté\(s\), complet/.test(csv));
  t('… période écrite dans le fichier', /Journées du 01\/07\/2026 au 30\/09\/2026 \(de 05:00 à 05:00 le lendemain, heure de Paris\)/.test(csv), csv.slice(0, 300));
  t('… et à l\'écran', /✅ <b>2345 pointage\(s\) exporté\(s\)<\/b>/.test(DOM.exStatus.innerHTML) && /Journées du 01\/07\/2026 au 30\/09\/2026/.test(DOM.exStatus.innerHTML));
  t('… récapitulatif en un seul champ (ses virgules ne créent pas de colonnes)', csv.split('\n').slice(0, 3).every(l => /^\ufeff?".*"$/.test(l)));
  t('… en-tête inchangé, « Journee » ajoutée en dernière colonne', csv.includes('\nDate,Heure,Salarie,Snack,Type,Heures_jour,Journee\n'));
  t('… un nom contenant un guillemet ne casse pas la ligne', lignes.every(l => /,"P\d N""\d",/.test(l)));
  t('… nom de fichier sans mention INCOMPLET', DL[0] && DL[0].name === 'pointages_2026-07-01_2026-09-30_2345pointages.csv', DL[0] && DL[0].name);
  setExportRecapPref(false);
}
{ // Incomplet → BLOQUÉ ; téléchargement possible seulement sur demande, marqué INCOMPLET.
  const db = pointagesDB(2345, 1000, '2026-08-01T10:00:00Z'); global.EatimeScope = db.api;
  let n = 0; db.hooks['pointages:select'] = q => { if (!(q.o.count && q.o.head) && ++n === 2) db.t.pointages.splice(0, 3); return null; };
  modaleExport('2026-07-01', '2026-09-30'); DL.length = 0;   // récapitulatif DÉCOCHÉ
  await doExport();
  t('export incomplet → AUCUN fichier produit', DL.length === 0);
  t('… l\'écran dit pourquoi : « 2345 attendu(s), 2342 reçu(s) »', /Export incomplet — fichier NON produit/.test(DOM.exStatus.innerHTML) && /2345 pointage\(s\) attendu\(s\), 2342 reçu\(s\)/.test(DOM.exStatus.innerHTML), DOM.exStatus.innerHTML.slice(0, 300));
  forceIncompleteExport();
  const csv = BLOBS[BLOBS.length - 1];
  t('« Télécharger quand même » (récapitulatif décoché) → fichier _INCOMPLET, et la 1ʳᵉ ligne « INCOMPLET — » est QUAND MÊME écrite', DL.length === 1 && /_INCOMPLET\.csv$/.test(DL[0].name) && /^\ufeff"INCOMPLET — Export des pointages/.test(csv), DL[0] && DL[0].name);
}
{ // Export de la fiche salarié : même chemin, mois entier.
  const db = pointagesDB(2345, 1000, '2026-08-01T10:00:00Z'); global.EatimeScope = db.api;
  global.currentFiche = { id: 's3', prenom: 'P3', nom: 'N3' }; global.selectedMonth = '2026-08'; global.selectedSnack = null;
  DOM.exStatus = undefined; el('modalHost').innerHTML = ''; DL.length = 0;
  await exportSalarieCSV();
  const attendu = db.T('pointages').filter(p => p.salarie_id === 's3' && exploitationDay(p.ts, '05:00').startsWith('2026-08')).length;
  const csv = BLOBS[BLOBS.length - 1]; const lignes = csv.split('\n').filter(l => /^\d\d\/\d\d\/\d{4},/.test(l));
  t(`export d'une fiche (août, ${attendu} pointages) → toutes les lignes, compte dans le nom du fichier`, DL.length === 1 && lignes.length === attendu && DL[0].name === `pointages_P3_N3_2026-08_${attendu}pointages.csv`, `${lignes.length}/${attendu} ${DL[0] && DL[0].name}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 6. Les pointages de fin de soirée tombent au bon jour ───────────────────────────────');
{
  const P = (id, iso, type) => ({ id, salarie_id: 's1', restaurant_id: 'r0', type, ts: iso });
  const rows = [
    P('a', '2026-10-06T16:00:00+00:00', 'arrivee'),   // 18:00 Paris le 6
    P('b', '2026-10-06T21:30:00+00:00', 'sortie'),    // 23:30 Paris le 6
    P('c', '2026-10-06T22:30:00+00:00', 'arrivee'),   // 00:30 Paris le 7 (même service de nuit)
    P('d', '2026-10-06T23:30:00+00:00', 'sortie'),    // 01:30 Paris le 7
    P('e', '2026-10-06T02:30:00+00:00', 'sortie'),    // 04:30 Paris le 6 → journée du 5
    P('f', '2026-10-07T03:30:00+00:00', 'arrivee'),   // 05:30 Paris le 7 → journée du 7
  ];
  const db = makeDB({ cap: 1000 }); rows.forEach(r => db.T('pointages').push({ ...r })); global.EatimeScope = db.api;
  const lire = async (from, to) => (await readPointages({ from, to }, q => q)).rows.map(r => r.id).sort().join('');
  t('export du 06/10 : 23:30 (le 6) ET la sortie de 01:30 (le 7) sont dedans', await lire('2026-10-06', '2026-10-06') === 'abcd', await lire('2026-10-06', '2026-10-06'));
  t('… 04:30 le 6 appartient à la journée du 5, 05:30 le 7 à celle du 7', await lire('2026-10-05', '2026-10-05') === 'e' && await lire('2026-10-07', '2026-10-07') === 'f');
  t('CONTRÔLE : l\'ancienne borne « 2026-10-06T00:00:00 » (lue en UTC) prenait 04:30 du 6 et perdait la nuit', ['e'].every(id => rows.find(r => r.id === id).ts >= '2026-10-06T00:00:00') && rows.find(r => r.id === 'd').ts < '2026-10-06T23:59:59' && rows.find(r => r.id === 'f').ts > '2026-10-06T23:59:59');
  const csv = buildPointagesCSV(rows.slice(0, 4), { sel: { from: '2026-10-06', to: '2026-10-06' }, complet: true, attendu: 4, recu: 4, doublons: 0, cutLbl: '05:00' });
  const L = csv.trim().split('\n').slice(-4);
  t('CSV : 23:30 → « 06/10/2026,23:30:00 », journée 06/10/2026', /^06\/10\/2026,23:30:00,.*,06\/10\/2026$/.test(L[1]), L[1]);
  t('… 01:30 → date civile 07/10/2026 mais journée 06/10/2026', /^07\/10\/2026,01:30:00,.*,06\/10\/2026$/.test(L[3]), L[3]);
  // Date UTC ≠ journée : une sortie à 04:30 heure de Paris le 7 (02:30 UTC le 7) appartient à la journée du 6.
  const tard = P('g', '2026-10-07T02:30:00+00:00', 'sortie');
  const L2 = buildPointagesCSV([P('h', '2026-10-06T20:00:00+00:00', 'arrivee'), tard], { sel: { from: '2026-10-06', to: '2026-10-06' }, complet: true, attendu: 2, recu: 2, doublons: 0, cutLbl: '05:00' }).trim().split('\n').slice(-2);
  t('… sortie à 04:30 le 7 (UTC : le 7) → journée 06/10/2026, rattachée au même service (22:00 → 04:30 = 6h 30m)', /^07\/10\/2026,04:30:00,.*,06\/10\/2026$/.test(L2[1]) && /,6h 30m,06\/10\/2026$/.test(L2[0]), L2.join(' | '));
  t('… heures de la journée calculées sur le service ENTIER (18:00 → 01:30 = 7h 30m), une seule fois', /,7h 30m,06\/10\/2026$/.test(L[0]) && L.slice(1).every(l => /,,06\/10\/2026$/.test(l)), L.join(' | '));
  // Même calcul quel que soit le fuseau de l'APPAREIL (le patron peut exporter depuis un téléphone à l'étranger).
  for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
    const out = cp.execFileSync(process.execPath, [__filename, '--tz-child'], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).trim().split('\n').pop();
    const o = JSON.parse(out);
    t(`appareil en ${tz} : bornes identiques, 23:30 Paris inclus, ligne « 06/10/2026,23:30:00 … 06/10/2026 »`, o.start === '2026-10-06T03:00:00.000Z' && o.end === '2026-10-07T03:00:00.000Z' && o.inclus && /^06\/10\/2026,23:30:00,.*,06\/10\/2026$/.test(o.ligne), out);
  }
  // Passage à l'heure d'hiver le 25/10/2026 à 03:00 : avec une bascule à 05:00, c'est la journée du 24
  // (05:00 le 24 → 05:00 le 25) qui contient l'heure en plus ; avec une bascule à minuit, celle du 25.
  const H = b => (b.endMs - b.startMs) / 3.6e6;
  const h24 = H(exploitationBounds('2026-10-24', '2026-10-24', '05:00')), h25 = H(exploitationBounds('2026-10-25', '2026-10-25', '05:00')),
        c25 = H(exploitationBounds('2026-10-25', '2026-10-25', '00:00')), c29 = H(exploitationBounds('2026-03-29', '2026-03-29', '00:00')),
        e28 = H(exploitationBounds('2026-03-28', '2026-03-28', '05:00'));
  t('changement d\'heure : journées de 25 h / 23 h exactement là où l\'heure change', h24 === 25 && h25 === 24 && c25 === 25 && c29 === 23 && e28 === 23, JSON.stringify({ h24, h25, c25, c29, e28 }));
  // Propriété : un instant est dans les bornes SI ET SEULEMENT SI sa journée d'exploitation est dans la période.
  let viol = 0, essais = 0; let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const cut of [0, 300, 360, '05:30']) for (let k = 0; k < 400; k++) {
    const ms = Date.UTC(2026, 0, 1) + Math.floor(rnd() * 365 * 86400000);
    const from = addDaysYMD('2026-01-01', Math.floor(rnd() * 360)), to = addDaysYMD(from, Math.floor(rnd() * 5));
    const b = exploitationBounds(from, to, cut), j = exploitationDay(ms, cut);
    essais++; if ((ms >= b.startMs && ms < b.endMs) !== (j >= from && j <= to)) viol++;
  }
  t(`propriété sur ${essais} instants aléatoires (4 heures de bascule) : borne ⇔ journée d'exploitation`, viol === 0, viol + ' violation(s)');
  // Fin figée quand la période inclut maintenant.
  const r = await readPointages({ from: exploitationToday('05:00'), to: exploitationToday('05:00') }, q => q);
  t('période incluant aujourd\'hui → fin FIGÉE au lancement (indiquée dans le récapitulatif)', !!r.fige && /arrêté au /.test(exportResume({ sel: r.sel, fige: r.fige, complet: true, recu: 0, attendu: 0, cutLbl: '05:00' }).periode));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 7. Fiche salarié : pointages chargés en entier, mêmes journées que l\'export ────────');
{
  const code = SAL.replace(/\/\/[^\n]*/g, '');
  t('le chargement des 90 jours passe par fetchAllRows (plus de requête unique tronquée)', /fetchAllRows\(\(cols,o\)=>EatimeScope\.from\('pointages'\)/.test(code) && !/EatimeScope\.from\('pointages'\)\.select\('\*'\)\.gte\('ts',d90/.test(code));
  t('l\'onglet Badgeuse regroupe par journée d\'exploitation (ptsJour), comme le CSV', /const d=ptsJour\(p\);\(byDate\[d\]/.test(code) && !/const d=p\.ts\.slice\(0,10\)/.test(code));
  t('… et signale les mois hors des 90 jours chargés au lieu d\'afficher 0 h', /non chargé/.test(SAL) && /total incomplet pour ce mois/.test(SAL));
  t('plus aucune borne « +'+"'T00:00:00'"+' » dans les exports de pointages', !/from\('pointages'\)[^\n]*T00:00:00/.test(code.slice(code.indexOf('async function readPointages'), code.indexOf('function setMonth'))));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 8. Stock : le snapshot mensuel ne purge plus ce qu\'il n\'a pas lu ───────────────────');
{
  const N = 2500;
  const mkStock = cap => { const db = makeDB({ cap }); const now = new Date(); const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    for (let i = 0; i < N; i++) { const d = new Date(lm.getFullYear(), lm.getMonth(), 1 + (i % 28)); db.T('stock_saisies').push({ id: 'z' + String(i).padStart(5, '0'), organization_id: 'org1', restaurant_id: 'r' + (i % 3), produit_id: 'prod' + (i % 50), quantite: 1 + (i % 4), date_saisie: ymdLocal(d.getTime()) }); }
    return db; };
  const prep = db => { global.EatimeScope = db.api; global.ORG = { id: 'org1' }; global.S = { produits: [] }; global.confirm = () => true;
    global.ALERTS = []; global.alert = m => ALERTS.push(m); global.loadHistorique = () => {}; };
  inst(STK, 'genererSnapshotMensuel'); const snapNouveau = global.genererSnapshotMensuel;
  // Nouveau code : tout est lu, tout est agrégé, exactement les lignes lues sont purgées.
  let db = mkStock(1000); prep(db); await snapNouveau();
  const agr = db.T('stock_snapshots_mensuels').reduce((a, s) => a + (s.nb_saisies || 0), 0);
  const cles = db.T('stock_snapshots_mensuels').length;
  t(`snapshot : les ${N} saisies sont LUES malgré le plafond de 1 000, ${cles} lignes de synthèse, puis purgées`, db.T('stock_saisies').length === 0 && cles === 150 && ALERTS.length === 0, JSON.stringify({ restantes: db.T('stock_saisies').length, cles, agr, alerts: ALERTS }));
  // Lecture incomplète → RIEN n'est agrégé ni supprimé.
  db = mkStock(1000); prep(db); let n = 0; db.hooks['stock_saisies:select'] = q => { if (!(q.o.count && q.o.head) && ++n === 2) db.t.stock_saisies.splice(0, 5); return null; };
  await snapNouveau();
  t('lecture incomplète → snapshot ANNULÉ : aucune ligne de synthèse, aucune suppression', db.T('stock_snapshots_mensuels').length === 0 && db.T('stock_saisies').length === N - 5 && /Snapshot ANNULÉ/.test(ALERTS[0] || ''), (ALERTS[0] || '').slice(0, 120));
  // Écriture du snapshot refusée → aucune purge.
  db = mkStock(1000); prep(db); db.hooks['stock_snapshots_mensuels:upsert'] = () => ({ data: null, error: { message: 'refus' } });
  await snapNouveau();
  t('écriture du snapshot refusée → AUCUNE saisie supprimée', db.T('stock_saisies').length === N && /NON enregistré/.test(ALERTS[0] || ''));
  // Contre-preuve sur l'ANCIEN code : agrège 1 000 lignes, supprime les 2 500.
  let ancien = null; try { ancien = cp.execSync('git show 90f178a:stock/index.html', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
  if (ancien) {
    db = mkStock(1000); prep(db); global.toast = () => {};
    eval('global._oldSnap=' + extractFn(ancien, 'genererSnapshotMensuel') + ';'); await _oldSnap();
    const agrOld = db.T('stock_snapshots_mensuels').reduce((a, s) => a + (s.nb_saisies || 0), 0);
    t(`CONTRÔLE : l'ancien code agrégeait ${agrOld} saisies et en SUPPRIMAIT ${N - db.T('stock_saisies').length}`, agrOld <= 1000 && db.T('stock_saisies').length === 0, JSON.stringify({ agrOld, restantes: db.T('stock_saisies').length }));
    global.toast = m => TOASTS.push(m);
  }
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL · exception : ' + (e && e.stack || e)); console.log('\nSOME FAILED'); process.exit(1); });

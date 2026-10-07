// v0.71 (planning) / v0.25 (salariés) / stock / finance / HACCP — LE PLAFOND DES 1 000 LIGNES.
//
// Supabase rend au plus 1 000 lignes par réponse, SANS erreur (journaux de l'API, 2026-10-07 : « 0-999 »).
// Toute table qui grossit finit lue en partie, en silence. Ce harnais prouve, sur une base simulée qui
// coupe à 1 000 comme la vraie (tests/fakedb.js), que les lectures exposées voient TOUT — et, en
// section finale, VERROUILLE le dépôt : toute lecture d'une table à fort volume doit passer par
// fetchAllRows ou porter une annotation « borné » justifiée. Une lecture nue réintroduite = rouge.
//
// Vrai code extrait de planning/, stock/, salaries/, finance/, haccp/ et utils.js.
process.env.TZ = 'Europe/Paris';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PL = read('planning/index.html');
const { extractFn } = require('./extract.js');
const { makeDB } = require('./fakedb.js');

let ok = true;
const t = (l, c, extra) => { console.log((c ? 'PASS' : 'FAIL') + ' · ' + l + (c ? '' : '   ↳ ' + (extra == null ? '' : extra))); ok = c && ok; };
const instFrom = (src, n) => { try { eval('global.' + n + '=' + extractFn(src, n).replace(/^(async )?function/, '$1function') + ';'); } catch (e) { console.log('MISS', n, ('' + e).split('\n')[0]); } };

// utils.js réel
global.window = global.window || {}; eval(read('utils.js'));
for (const k of ['fetchAllRows', 'exploitationDay', 'exploitationToday', 'ymdLocal', 'addDaysYMD', 'cutoffToMinutes']) global[k] = window.EatimeUtils[k];

(async () => {
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('── 1. Indisponibilités : le planning les voit TOUTES, checkPlacement refuse la 1 200ᵉ ───');
global.ORG = { journee_exploitation_debut: '05:00' };
require('./plprims.js').installPlanningPrims(PL);
{ const _s = PL.indexOf('function _needAt'), _e = PL.indexOf('// ===== UNDO'); eval(PL.slice(_s, _e) + ';global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;'); }
for (const n of ['_toMin', 'overlaps', '_overlap', 'isMultiSnack', 'weekHoursOf', 'weekMinutesOf', '_indispoBlocking', 'checkPlacement', 'hasIndispo',
  'loadDisposPlanning', 'loadCreneauxSemaine', 'guardLecturesCompletes', 'renderLectureBar', 'fmtDate', 'dateOfDay', 'getMonday']) instFrom(PL, n);
eval('global._pdur=' + PL.match(/const _pdur\s*=([^\n]*)/)[1].replace(/;$/, '') + ';');
global._contrainteBlocking = () => null; global.contrOf = () => [];           // aucune contrainte individuelle dans ce scénario
global.onRoster = () => true; global.worksAt = () => true; global.rolesOf = () => ['cuisine']; global.isExp = () => true;
global.altDayType = () => null; global.plafondOf = s => Number(s.heures_max) || 48;
const RCTX = { num: (k, d) => ({ coupure_min: 3, repos_quotidien_h: 11, plafond_hebdo: 48, amplitude_max: 14, jour_off_min: 1 }[k] ?? d), raw: () => null, on: (_, d) => d };
global._ruleCtx = () => RCTX; global._endCapMin = () => null;               // neutralise les plafonds d'heure de fin : on isole l'indispo
global.SNACK = { id: 'r1' }; global.SAL = {}; global.salById = id => SAL[id] || { id, heures_max: 48 };
global.escP = s => String(s == null ? '' : s); const SS = []; global.setSS = (k, m) => SS.push([k, m]);
const BAR = { style: {}, innerHTML: '' }; global.document = { getElementById: id => id === 'lectureBar' ? BAR : null };
global.MONDAY = new Date(2026, 9, 12);                                      // semaine du 12 au 18 octobre 2026
const MER = '2026-10-14', DI_MER = 2;
const CIBLE = 'sal-cible';
// 1 500 indisponibilités. La 1 200ᵉ (ordre d'insertion = ordre des id) : journée entière, mercredi 14/10,
// pour le salarié CIBLE. Les autres : réparties sur 4 ans d'historique (scénario a) ou TOUTES dans la
// fenêtre de la semaine (scénario b, qui oblige la lecture filtrée elle-même à paginer).
function peupler(db, dansLaFenetre) {
  for (let i = 1; i <= 1500; i++) {
    const id = 'd' + String(i).padStart(5, '0');
    if (i === 1200) { db.T('salarie_dispos').push({ id, salarie_id: CIBLE, type: 'ponctuelle', date_specifique: MER, statut: 'indispo', statut_demande: 'validee', motif: 'Congé' }); continue; }
    const date = dansLaFenetre ? addDaysYMD('2026-10-05', i % 21) : addDaysYMD('2022-10-01', i % 1400);
    db.T('salarie_dispos').push({ id, salarie_id: 'autre' + (i % 40), type: i % 50 === 0 ? 'recurrente' : 'ponctuelle', jour_semaine: i % 7, date_specifique: i % 50 === 0 ? null : date, statut: 'indispo', statut_demande: 'validee' });
  }
}
const placer = () => checkPlacement(CIBLE, { deb: '11:00', fin: '15:00', role: 'cuisine' }, MER, 'midi', DI_MER, { manual: false });
// (c) = (b) avec un serveur réglé à 500 : une pagination naïve (« page plus courte que demandé = fin »)
// tomberait juste par hasard quand plafond = taille de page ; à 500, elle s'arrêterait à la première page.
for (const [nom, fen, cap] of [['(a) historique sur 4 ans, 1 200ᵉ dans la semaine', false, 1000], ['(b) les 1 500 DANS la fenêtre : la lecture filtrée doit paginer', true, 1000], ['(c) idem sous un plafond serveur de 500', true, 500]]) {
  const db = makeDB({ cap }); peupler(db, fen); global.EatimeScope = db.api;
  const d = await loadDisposPlanning(MONDAY);
  global.S = { creneaux: [], allCreneauxWeek: [], dispos: d.rows, restos: [{ id: 'r1', nom: 'Raya Lobau' }] };
  const r = placer();
  t(`${nom} : lecture complète (${d.recu} lignes)`, d.complet && d.rows.some(x => x.id === 'd01200'), JSON.stringify({ complet: d.complet, recu: d.recu, detail: d.detail }));
  t(`… le VRAI checkPlacement refuse le placement sur l'indispo n° 1 200`, r && r.cle === 'indispo', JSON.stringify(r));
}
{ // Lire moins : chiffré sur le scénario (a).
  const db = makeDB({ cap: 1000 }); peupler(db, false); global.EatimeScope = db.api;
  const d = await loadDisposPlanning(MONDAY);
  t(`lire moins : ${d.recu} lignes chargées au lieu de 1 500 (récurrentes + ponctuelles de la fenêtre + en attente)`, d.recu < 200 && d.detail.recurrentes === 29, JSON.stringify(d.detail));
}
{ // CONTRE-PREUVE : l'ancienne lecture (toute la table, une requête) → la 1 200ᵉ manque, placement ACCEPTÉ.
  const db = makeDB({ cap: 1000 }); peupler(db, false); global.EatimeScope = db.api;
  const { data } = await db.api.from('salarie_dispos').select('*');
  global.S = { creneaux: [], allCreneauxWeek: [], dispos: data, restos: [] };
  t('CONTRÔLE : l\'ancienne lecture unique reçoit 1 000 lignes sans erreur, et le placement est ACCEPTÉ', data.length === 1000 && placer() === null, data.length);
}
{ // Lecture devenue incomplète (lignes supprimées pendant la lecture) → bandeau + auto-fill bloqué.
  const db = makeDB({ cap: 1000 }); peupler(db, true); global.EatimeScope = db.api;
  let n = 0; db.hooks['salarie_dispos:select'] = q => { if (!(q.o.count && q.o.head) && ++n === 2) db.t.salarie_dispos.splice(0, 3); return null; };
  const d = await loadDisposPlanning(MONDAY);
  global.S = { lectures: { 'indisponibilités': d } };
  const g = guardLecturesCompletes();
  t('lecture incomplète → complet = FAUX, l\'écart est nommé', !d.complet && /reçue\(s\) sur/.test(d.ecart), JSON.stringify({ complet: d.complet, ecart: d.ecart }));
  t('… l\'auto-fill est BLOQUÉ et le bandeau rouge s\'affiche', g === false && BAR.style.display === 'block' && /Lecture incomplète/.test(BAR.innerHTML) && /auto-fill est bloqué/.test(BAR.innerHTML));
  global.S = { lectures: { 'indisponibilités': { complet: true } } };
  t('… lectures complètes → auto-fill autorisé, bandeau masqué', guardLecturesCompletes() === true && (renderLectureBar(), BAR.style.display === 'none'));
}
{ // Les demandes en attente (badge 🔔) sont toujours chargées, quelle que soit leur date.
  const db = makeDB({ cap: 1000 }); global.EatimeScope = db.api;
  db.T('salarie_dispos').push({ id: 'p1', salarie_id: 'x', type: 'ponctuelle', date_specifique: '2027-03-01', statut: 'indispo', statut_demande: 'en_attente' });
  const d = await loadDisposPlanning(MONDAY);
  t('une demande en ATTENTE lointaine (mars 2027) est chargée pour le badge 🔔', d.rows.some(x => x.id === 'p1') && d.detail.en_attente === 1);
  const code = PL.replace(/\/\/[^\n]*/g, '');
  const od = code.slice(code.indexOf('async function openDemandes'), code.indexOf('async function openDemandes') + 900);
  t('la fenêtre 🔔 recharge par le MÊME chargeur (elle n\'écrase plus les indispos de la semaine)', /loadDisposPlanning\(MONDAY\)/.test(od) && !/from\('salarie_dispos'\)\.select\('\*'\)/.test(od));
  t('les trois lanceurs d\'auto-fill passent par la garde', ['autoFillDay', 'autoFillWeek', 'autoFillMultiWeek'].every(f => /guardLecturesCompletes\(\)/.test(extractFn(PL, f))));
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL · exception : ' + (e && e.stack || e)); console.log('\nSOME FAILED'); process.exit(1); });

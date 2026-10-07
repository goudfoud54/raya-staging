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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2. Stock : historique complet, dernière saisie juste, besoins justes ─────────────────');
const STK = read('stock/index.html');
const cp = require('child_process');
{
  const daysSinceSrc = STK.match(/function daysSince[\s\S]*?\n/)[0]; eval('global.daysSince=' + daysSinceSrc.replace(/^function daysSince/, 'function') + ';');
  // Extraction par simple comptage d'accolades (comme besoin_render_test) : l'extracteur commun bute sur un
  // motif d'expression régulière dans loadHistorique.
  const grabB = name => { const i = STK.search(new RegExp('(?:async\\s+)?function ' + name + '\\s*\\(')); let d = 0, a = STK.indexOf('{', i), j = a;
    for (; j < STK.length; j++) { if (STK[j] === '{') d++; else if (STK[j] === '}') { d--; if (d === 0) { j++; break; } } } return STK.slice(i, j); };
  for (const n of ['computeBesoin', 'loadHistorique', 'renderDashboard']) eval('global.' + n + '=' + grabB(n).replace(/^async function \w+/, 'async function') + ';');
  global.fmtD = window.fmtD || (d => d || '');
  eval('global.escapeHtmlS=' + STK.match(/const escapeHtmlS=([^\n]*);/)[1] + ';');
  global.BESOIN_STALE_DAYS = 4; global.eur = n => Number(n || 0).toFixed(2) + ' €'; global.filterHistorique = () => {};
  const DOMS = {}; global.document = { getElementById: id => DOMS[id] || (DOMS[id] = { innerHTML: '', value: '' }), querySelectorAll: () => [] };
  global.val = id => (DOMS[id] ? DOMS[id].value : '');
  global.ORG = { id: 'org1', journee_exploitation_debut: '05:00' };
  // 3 snacks × 400 produits = 1 200 couples (> 1 000 : la lecture de la vue DOIT paginer), ~4 800 saisies.
  const SNACKS = ['s1', 's2', 's3'], NP = 400;
  global.S = { snacks: SNACKS.map(id => ({ id, nom: 'Raya ' + id })), produits: [], stockMax: [] };
  for (let i = 0; i < NP; i++) { S.produits.push({ id: 'p' + i, nom: 'Produit ' + i, categorie: 'Cat', cout_unitaire: 1 }); SNACKS.forEach(sid => S.stockMax.push({ restaurant_id: sid, produit_id: 'p' + i, quantite_max: 10, actif: true, mode_commentaire: 'aucun' })); }
  const today = exploitationToday('05:00');
  function histo(db) {
    let k = 0;
    for (const sid of SNACKS) for (let i = 0; i < NP; i++) for (let j = 4; j >= 1; j--)       // 4 saisies par couple, la plus récente il y a 1 jour
      db.T('stock_saisies').push({ id: 'z' + String(++k).padStart(6, '0'), organization_id: 'org1', restaurant_id: sid, produit_id: 'p' + i, quantite: (i + j) % 7, date_saisie: addDaysYMD(today, -j), created_at: '2026-01-01T00:00:0' + j + 'Z' });
    // La vue, reproduite avec la MÊME règle que la migration v6.37 (date desc, created_at desc, id desc).
    // ⚠ La règle SQL elle-même a été vérifiée sur la base réelle (467 couples, 0 écart) ; ici on teste le front.
    const best = {};
    for (const r of db.T('stock_saisies')) { const key = r.restaurant_id + '|' + r.produit_id, b = best[key];
      if (!b || r.date_saisie > b.date_saisie || (r.date_saisie === b.date_saisie && (r.created_at > b.created_at || (r.created_at === b.created_at && r.id > b.id)))) best[key] = r; }
    Object.values(best).forEach(r => db.T('stock_saisies_dernieres').push({ ...r }));
    return best;
  }
  // Besoins : 1 200 couples, plafond 1 000.
  let db = makeDB({ cap: 1000 }); const best = histo(db); global.sb = db.api; global.EatimeScope = db.api;
  const R = await computeBesoin(SNACKS);
  const attendu = Object.values(best).reduce((a, r) => a + Math.max(0, 10 - Number(r.quantite)), 0);
  const calcule = R.list.reduce((a, x) => a + x.totalNeed, 0);
  t(`besoins sur 1 200 couples (vue paginée sous plafond 1 000) : besoin total ${calcule} = ${attendu} attendu`, !R.erreur && calcule === attendu, JSON.stringify({ erreur: R.erreur, calcule, attendu }));
  t('… aucun produit compté « jamais saisi » à tort', R.list.every(x => !x.anyJamais));
  // Contre-preuve : l'ANCIEN computeBesoin (tout l'historique, une requête) sur les mêmes données.
  let ancien = null; try { ancien = cp.execSync('git show 9d94fec:stock/index.html', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
  if (ancien) {
    eval('global._oldBesoin=' + extractFn(ancien, 'computeBesoin') + ';');
    const O = await _oldBesoin(SNACKS);
    const faux = O.list.reduce((a, x) => a + x.totalNeed, 0), jamais = O.list.filter(x => x.anyJamais).length;
    t(`CONTRÔLE : l'ancien calcul (historique tronqué à 1 000) donnait ${faux} au lieu de ${attendu}, ${jamais} produits « jamais saisis »`, faux !== attendu && jamais > 0, JSON.stringify({ faux, jamais }));
  } else console.log('   ℹ git indisponible : contre-preuve sur l\'ancien calcul non rejouée');
  // Lecture incomplète → la feuille de besoin est REFUSÉE (pas de commande sur données partielles).
  db = makeDB({ cap: 1000 }); histo(db); global.EatimeScope = db.api;
  let n = 0; db.hooks['stock_saisies_dernieres:select'] = q => { if (!(q.o.count && q.o.head) && ++n === 2) db.t.stock_saisies_dernieres.splice(0, 5); return null; };
  const R2 = await computeBesoin(SNACKS);
  t('lecture incomplète de la vue → feuille de besoin REFUSÉE, l\'écart est dit', !!R2.erreur && R2.list.length === 0 && /reçue\(s\) sur/.test(R2.erreur), R2.erreur);
  // Tableau de bord : un snack de 1 100 produits (> 1 000 lignes dans la vue).
  db = makeDB({ cap: 1000 }); global.EatimeScope = db.api; global.SNACK = { id: 'big', nom: 'Raya Big' };
  S.produits = []; S.stockMax = [];
  for (let i = 0; i < 1100; i++) { S.produits.push({ id: 'q' + i, nom: 'Q' + i, cout_unitaire: 2 }); S.stockMax.push({ restaurant_id: 'big', produit_id: 'q' + i, quantite_max: 10, actif: true });
    db.T('stock_saisies_dernieres').push({ id: 'w' + String(i).padStart(5, '0'), organization_id: 'org1', restaurant_id: 'big', produit_id: 'q' + i, quantite: i % 5 === 0 ? 0 : 4, date_saisie: addDaysYMD(today, -2) }); }
  const el = { innerHTML: '' }; await renderDashboard(el);
  const kpi = lbl => { const m = el.innerHTML.match(new RegExp(lbl + '</div><div class="val">([^<]*)<')); return m && m[1]; };
  t('tableau de bord, 1 100 produits : « Non saisis (30j) » = 0 (avant : tous ceux au-delà des 1 000 premiers)', kpi('Non saisis \\(30j\\)') === '0', kpi('Non saisis \\(30j\\)'));
  t('… « Ruptures » = 220 (une sur cinq), valorisation 7 040,00 €', kpi('Ruptures') === '220' && /7040\.00 €/.test(el.innerHTML), JSON.stringify({ r: kpi('Ruptures') }));
  // Historique : 3 500 saisies d'un mois, un snack.
  db = makeDB({ cap: 1000 }); global.EatimeScope = db.api; global.SNACK = { id: 's1', nom: 'Raya s1' };
  for (let i = 0; i < 3500; i++) db.T('stock_saisies').push({ id: 'h' + String(i).padStart(5, '0'), organization_id: 'org1', restaurant_id: 's1', produit_id: 'q' + (i % 300), quantite: 1, date_saisie: addDaysYMD('2026-09-01', i % 30) });
  DOMS.hist_from = { value: '2026-09-01' }; DOMS.hist_to = { value: '2026-09-30' }; DOMS.hist_prod = { value: '' }; DOMS.histList = { innerHTML: '' };
  await loadHistorique();
  const lignes = (DOMS.histList.innerHTML.match(/<tr data-pname|<tr/g) || []).length - 1;
  t('historique : 3 500 saisies d\'un mois → 3 500 lignes affichées, « liste complète »', lignes === 3500 && /3500 saisie\(s\) sur la période — liste complète/.test(DOMS.histList.innerHTML), lignes);
  const { data: vieux } = await db.api.from('stock_saisies').select('*').eq('restaurant_id', 's1').limit(500);
  t('CONTRÔLE : l\'ancien .limit(500) n\'en montrait que 500', vieux.length === 500);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 3. Finance et HACCP : un total juste, ou pas de total ─────────────────────────────────');
{
  const FIN = read('finance/index.html'), HAC = read('haccp/index.html');
  global.fetchAllOrThrow = window.EatimeUtils.fetchAllOrThrow;
  const grabG = (src, name) => { const i = src.search(new RegExp('(?:async\\s+)?function ' + name + '\\s*\\(')); let d = 0, a = src.indexOf('{', i), j = a;
    for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) { j++; break; } } } return src.slice(i, j); };
  // Finance : tableau de bord sur 1 500 lignes de CA (une année, 3 restaurants + services).
  eval('global.lireTout=' + FIN.match(/const lireTout=([^\n;]*);/)[1] + ';');
  eval('global.finMk=' + FIN.match(/const finMk=([\s\S]*?\};)/)[1].replace(/;$/, '') + ';');
  eval('global.lectureKo=' + grabG(FIN, 'lectureKo').replace(/^function lectureKo/, 'function') + ';');
  eval('global.renderDashboardFin=' + grabG(FIN, 'renderDashboard').replace(/^async function renderDashboard/, 'async function') + ';');
  global.periodRange = () => ({ from: '2026-01-01', to: '2026-12-31' }); global.periodLbl = () => '2026';
  // Doublures d'affichage : les graphiques (Chart.js) sont dessinés APRÈS le calcul et hors sujet ici.
  global.Chart = function () { return { destroy() {} }; }; global.CHARTS = global.CHARTS || {};
  global.document = { getElementById: () => ({ innerHTML: '', getContext: () => ({}), style: {} }), querySelectorAll: () => [] };
  global.SNACK = null; global.eur = n => Number(n || 0).toFixed(2) + ' €'; global.pct = n => Number(n || 0).toFixed(1) + ' %';
  let db = makeDB({ cap: 1000 }); global.EatimeScope = db.api;
  for (let i = 0; i < 1500; i++) db.T('fin_ca_journalier').push({ id: 'ca' + String(i).padStart(5, '0'), restaurant_id: 'r' + (i % 3), date: addDaysYMD('2026-01-01', i % 300), service: 'total', ca_ttc: 100, ca_ht: 90 });
  let el = { innerHTML: '' };
  try { await renderDashboardFin(el); } catch (e) { el.innerHTML = 'EXCEPTION ' + e.message; }
  t('finance : CA TTC sur 1 500 saisies = 150 000,00 € (requête unique : 100 000 €)', /150000\.00 €<\/div><div class="sub">1500 saisies/.test(el.innerHTML), (el.innerHTML.match(/CA TTC<\/div><div class="val">[^<]*<\/div><div class="sub">[^<]*/) || [el.innerHTML.slice(0, 200)])[0]);
  let n = 0; db.hooks['fin_ca_journalier:select'] = q => { if (!(q.o.count && q.o.head) && ++n === 2) db.t.fin_ca_journalier.splice(0, 3); return null; };
  el = { innerHTML: '' }; await renderDashboardFin(el);
  t('… lecture incomplète → « Chiffres non affichés », aucun total partiel', /⛔ Chiffres non affichés/.test(el.innerHTML) && !/€/.test(el.innerHTML), el.innerHTML.slice(0, 160));
  // Marge : la SEULE lecture Finance déjà tronquée en production (créneaux du planning, ~860/mois pour 3
  // restaurants). 1 800 créneaux de 4 h sur deux mois, 12 €/h brut, coefficient 1,5 → 129 600 € chargés.
  eval('global.renderMarge=' + grabG(FIN, 'renderMarge').replace(/^async function renderMarge/, 'async function') + ';');
  db = makeDB({ cap: 1000 }); global.EatimeScope = db.api;
  global.S = { salaries: [{ id: 'm1', taux_horaire_brut: 12, coef_charges_perso: 1.5 }] }; global.ORG = { coef_charges: 1.42 };
  for (let i = 0; i < 1800; i++) db.T('planning_creneaux').push({ id: 'pc' + String(i).padStart(5, '0'), restaurant_id: 'r' + (i % 3), salarie_id: 'm1', date: addDaysYMD('2026-08-01', i % 60), heure_debut: '11:00', heure_fin: '15:00' });
  el = { innerHTML: '' }; try { await renderMarge(el); } catch (e) { el.innerHTML = 'EXCEPTION ' + e.message; }
  const masse = (el.innerHTML.match(/Masse salariale chargée \(planning\)<\/td><td[^>]*>([^<]*)</) || [])[1];
  t('marge : masse salariale sur 1 800 créneaux = 129 600 € (requête unique tronquée : 72 000 €)', masse === '129600.00 €', masse || el.innerHTML.slice(0, 200));
  // HACCP : un registre incomplet n'est pas présenté comme complet ; plus de limit(500) avant le filtre snack.
  const hacCode = HAC.replace(/\/\/[^\n]*/g, '');
  t('HACCP : plus aucun .limit(500) dans le module', !/\.limit\(500\)/.test(hacCode));
  eval('global.hMk=' + HAC.match(/const hMk=([\s\S]*?\};)/)[1].replace(/;$/, '') + ';');
  db = makeDB({ cap: 1000 }); global.EatimeScope = db.api;
  for (let i = 0; i < 1200; i++) db.T('haccp_huiles').push({ id: 'h' + String(i).padStart(5, '0'), ts: new Date(Date.UTC(2026, 9, 1) + i * 60000).toISOString(), equipement_id: 'e' + (i % 2) });
  const rows = await fetchAllOrThrow('contrôles d\'huile', hMk('haccp_huiles', 0, null, null, null), { cols: '*' });
  t('HACCP : 1 200 contrôles d\'huile lus en entier (avant : 500, puis filtrés par restaurant)', rows.length === 1200);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 4. VERROU : aucune lecture d\'une table à fort volume sans pagination ni justification ─');
// Même principe que orgscope_test : le dépôt entier est balayé. Pour chaque .from('<table>') d'une table
// qui grossit, on suit la CHAÎNE d'appels jusqu'à son dernier maillon (parenthèses équilibrées — pas
// « jusqu'au prochain ; », qui fusionnerait les dizaines de lectures d'un même Promise.all). Une lecture
// passe si :
//   • elle est un CONSTRUCTEUR de page : .select(c,o) (deux identifiants) — la signature de fetchAllRows ;
//   • ou elle porte /* borné : <raison non vide> */ (lecture petite PAR NATURE : 1 salarié × 1 semaine…) ;
//   • ou c'est un alias sans select (const T=()=>…from('t')) annoté /* paginé : … */.
// Toute .limit(n>1) sur ces tables exige aussi une annotation. Écritures (insert/upsert/update/delete) ignorées.
const TABLES_VOLUME = ['pointages', 'salarie_dispos', 'retards', 'stock_saisies', 'stock_saisies_dernieres', 'stock_snapshots_mensuels',
  'planning_creneaux', 'alternance_jours', 'fin_ca_journalier', 'fin_depenses', 'fin_encaissements', 'fin_versements',
  'fin_transactions_bancaires', 'haccp_releves_temperature', 'haccp_huiles', 'haccp_receptions', 'haccp_nettoyages'];
function fichiers(d, out = []) {
  for (const f of fs.readdirSync(d)) { if (['node_modules', '.git', 'tests', 'scripts', 'migrations'].includes(f)) continue;
    const p = path.join(d, f), st = fs.statSync(p); if (st.isDirectory()) fichiers(p, out); else if (/\.(html|js|ts|mjs)$/.test(f)) out.push(p); }
  return out;
}
// Suit .meth(args) .meth(args) … en sautant espaces, retours et commentaires ; renvoie maillons + commentaires.
function chaine(src, i) {
  const maillons = [], comms = []; let k = i;
  for (;;) {
    let j = k;
    for (;;) { while (/\s/.test(src[j])) j++; if (src.startsWith('/*', j)) { const e = src.indexOf('*/', j); comms.push(src.slice(j, e + 2)); j = e + 2; continue; }
      if (src.startsWith('//', j)) { const e = src.indexOf('\n', j); comms.push(src.slice(j, e)); j = e; continue; } break; }
    const m = /^\.(\w+)\s*\(/.exec(src.slice(j, j + 60)); if (!m) break;
    let p = j + m[0].length, d = 1;
    while (p < src.length && d > 0) { const c = src[p];
      if (c === '"' || c === "'" || c === '`') { const q = c; p++; while (p < src.length && src[p] !== q) { if (src[p] === '\\') p++; p++; } }
      else if (c === '(') d++; else if (c === ')') d--; p++; }
    maillons.push({ m: m[1], args: src.slice(j + m[0].length, p - 1) }); k = p;
  }
  return { maillons, comms };
}
const verdicts = [];
for (const f of fichiers(ROOT)) {
  const src = fs.readFileSync(f, 'utf8'), rel = path.relative(ROOT, f), re = /\.from\(\s*'([a-z_]+)'\s*\)/g; let m;
  while ((m = re.exec(src))) {
    if (!TABLES_VOLUME.includes(m[1])) continue;
    const { maillons, comms } = chaine(src, m.index + m[0].length);
    const noms = maillons.map(x => x.m);
    if (noms.some(n => ['insert', 'upsert', 'update', 'delete'].includes(n))) continue;
    const ligne = src.slice(0, m.index).split('\n').length, ou = `${rel}:${ligne} (${m[1]})`;
    const annot = comms.find(c => /\/\*\s*(borné|paginé)\s*:\s*\S/.test(c));
    const sel = maillons.find(x => x.m === 'select');
    const page = sel && /^\s*\w+\s*,\s*\w+\s*$/.test(sel.args);
    const lim = maillons.find(x => x.m === 'limit' && !/^\s*1\s*$/.test(x.args));
    let ok1 = true, pourquoi = '';
    if (!sel && !annot) { ok1 = false; pourquoi = 'alias sans select non annoté'; }
    else if (sel && !page && !annot) { ok1 = false; pourquoi = 'lecture NON paginée et non justifiée'; }
    else if (lim && !annot) { ok1 = false; pourquoi = `.limit(${lim.args}) non justifié`; }
    else if (annot && /\/\*\s*(borné|paginé)\s*:\s*\*\//.test(annot)) { ok1 = false; pourquoi = 'annotation sans raison'; }
    verdicts.push({ ou, ok: ok1, pourquoi, mode: page ? 'paginé' : (annot ? 'borné' : '—') });
  }
}
const ko = verdicts.filter(v => !v.ok);
t(`${verdicts.length} lectures de tables à fort volume vérifiées (contrôle de non-vacuité : ≥ 40, mesuré 43 en oct. 2026)`, verdicts.length >= 40, verdicts.length);
t(`… toutes paginées (${verdicts.filter(v => v.mode === 'paginé').length}) ou justifiées « borné » (${verdicts.filter(v => v.mode === 'borné').length}) — en défaut : ${ko.length}`, ko.length === 0, ko.map(v => v.ou + ' → ' + v.pourquoi).join('\n      '));
// Contrôle de méthode : le scanner DOIT attraper une lecture nue réintroduite.
{ const faux = "x; const{data}=await EatimeScope.from('salarie_dispos').select('*'); y; await EatimeScope.from('pointages').select(c,o).limit(500).eq('a',1);";
  const r = []; const re2 = /\.from\(\s*'([a-z_]+)'\s*\)/g; let mm;
  while ((mm = re2.exec(faux))) { const { maillons, comms } = chaine(faux, mm.index + mm[0].length); const sel = maillons.find(x => x.m === 'select');
    const annot = comms.find(c => /\/\*\s*(borné|paginé)\s*:\s*\S/.test(c)); const lim = maillons.find(x => x.m === 'limit');
    r.push(!(sel && !/^\s*\w+\s*,\s*\w+\s*$/.test(sel.args) && !annot) && !(lim && !annot)); }
  t('CONTRÔLE : le scanner rejette .select(\'*\') nu ET un .limit(500) même sur un constructeur paginé', r[0] === false && r[1] === false, JSON.stringify(r)); }

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL · exception : ' + (e && e.stack || e)); console.log('\nSOME FAILED'); process.exit(1); });

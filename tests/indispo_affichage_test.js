// Harnais — affichage des indisponibilités (Salariés v0.28, utils.js v1.9).
//
// Ce qu'il prouve, sur le VRAI code (utils.js chargé tel quel, renderDispoList extrait de salaries/index.html) :
//   A. une date « 2026-10-24 » s'affiche « Samedi 24 octobre » QUEL QUE SOIT LE FUSEAU du navigateur :
//      le harnais se relance lui-même sous plusieurs TZ (Paris, Los Angeles, Martinique, Tahiti,
//      Kiritimati +14) et exige des textes identiques — avec la contre-preuve que l'ancienne expression
//      new Date('2026-10-24').toLocaleDateString(...) affiche « vendredi 23 » à Los Angeles ;
//   B. libellés : plages (« 18:00 → minuit », « journée entière », fin au lendemain), statuts, récurrentes ;
//   C. 4 jours consécutifs d'arrêt maladie → UNE ligne « Du … au … » dépliable, 4 boutons × dedans ;
//      pas de regroupement à travers un trou d'un jour, ni entre plages ou motifs différents ;
//   D. hier → « Historique », demain → liste principale ; « ce soir 18:00 → minuit » reste visible
//      jusqu'à la fin de la journée d'exploitation (04:30 le lendemain : visible ; 05:30 : historique),
//      avec la contre-preuve qu'un « passé = date < aujourd'hui calendaire » la cacherait à 04:30 ;
//   E. invariant de complétude SUR LES ID : chaque ligne reçue est dans exactement une entrée, et la page
//      rend exactement un bouton × par ligne (visibles + historique = nombre de lignes du salarié) ;
//   F. aucune écriture ni lecture en base pendant le rendu, et les lignes reçues ne sont pas modifiées ;
//   G. garde-fous statiques : plus aucun new Date(date_specifique) dans le dépôt ; toute page qui appelle
//      les nouvelles fonctions charge utils.js en ?v=1.9 au moins (sinon un cache ancien = liste vide).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { extractFn } = require('./extract.js');

const RACINE = path.join(__dirname, '..');
global.window = globalThis;
require(path.join(RACINE, 'utils.js'));
const U = globalThis.EatimeUtils;

// Instant fixe : mercredi 21 octobre 2026, 12:00 à Paris (10:00 UTC). L'année courante est donc 2026.
const NOW = Date.parse('2026-10-21T10:00:00Z');
const parisMs = (ymd, hm) => U.parisWallToUtcMs(ymd, U.toMin(hm));

// ── Mode ENFANT : calcule les textes sensibles au fuseau et les imprime en JSON ───────────────────
if (process.env.INDISPO_TZ_CHILD) {
  const o = { nowMs: NOW };
  const L = U.listeIndispos([
    { id: 'a', type: 'ponctuelle', date_specifique: '2026-10-20', statut: 'indispo' },
    { id: 'b', type: 'ponctuelle', date_specifique: '2026-10-22', statut: 'indispo' },
    { id: 'c', type: 'ponctuelle', date_specifique: '2026-10-21', heure_debut: '18:00:00', heure_fin: '00:00:00', statut: 'indispo' },
  ], { nowMs: parisMs('2026-10-22', '04:30') });
  process.stdout.write(JSON.stringify({
    tz: process.env.TZ,
    d1024: U.ymdLong('2026-10-24', o),
    d0101: U.ymdLong('2027-01-01', o),
    d0801: U.ymdLong('2026-08-01', o),
    range: U.ymdRange('2026-07-21', '2026-07-24', o),
    quand: U.indispoQuand({ type: 'ponctuelle', date_specifique: '2026-10-24' }, o),
    visibles: L.aVenir.map(e => e.cle).join(','), hist: L.historique.map(m => m.entrees.map(e => e.cle).join(',')).join('|'),
    ancien: new Date('2026-10-24').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
  }));
  process.exit(0);
}

let ok = true;
const t = (label, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label + (cond || detail === undefined ? '' : '  → ' + detail));
  ok = !!cond && ok;
};

// ══════════ A. Indépendance au fuseau du navigateur ══════════
console.log('── A. Même texte dans tous les fuseaux ──');
const TZS = ['Europe/Paris', 'America/Los_Angeles', 'America/Martinique', 'Pacific/Tahiti', 'Pacific/Kiritimati', 'UTC'];
const res = TZS.map(tz => JSON.parse(execFileSync(process.execPath, [__filename], {
  env: Object.assign({}, process.env, { TZ: tz, INDISPO_TZ_CHILD: '1' }), encoding: 'utf8' })));
const champs = ['d1024', 'd0101', 'd0801', 'range', 'quand', 'visibles', 'hist'];
res.forEach(r => t(`TZ=${r.tz} : « 2026-10-24 » → « Samedi 24 octobre »`, r.d1024 === 'Samedi 24 octobre', r.d1024));
t('textes et classement STRICTEMENT identiques dans les ' + TZS.length + ' fuseaux',
  res.every(r => champs.every(k => r[k] === res[0][k])),
  JSON.stringify(res.map(r => champs.map(k => r[k]).join(' / '))));
t('« 1er » et année d\'une autre année : « Vendredi 1er janvier 2027 »', res[0].d0101 === 'Vendredi 1er janvier 2027', res[0].d0101);
t('« Samedi 1er août » (année courante omise)', res[0].d0801 === 'Samedi 1er août', res[0].d0801);
const la = res.find(r => r.tz === 'America/Los_Angeles');
t('CONTRE-PREUVE : l\'ancienne expression new Date(\'2026-10-24\') affiche la VEILLE à Los Angeles',
  /vendredi 23/.test(la.ancien), la.ancien);
t('… et le bon jour à Paris (c\'est pourquoi le défaut ne se voyait pas en métropole)',
  /samedi 24/.test(res.find(r => r.tz === 'Europe/Paris').ancien));

// ══════════ B. Libellés ══════════
console.log('── B. Libellés en français clair ──');
const B = [
  [U.indispoPlage({}), 'journée entière'],
  [U.indispoPlage({ heure_debut: '18:00:00', heure_fin: '00:00:00' }), '18:00 → minuit'],
  [U.indispoPlage({ heure_debut: '10:00:00', heure_fin: '15:00:00' }), '10:00 → 15:00'],
  [U.indispoPlage({ heure_debut: '18:00:00', heure_fin: '02:00:00' }), '18:00 → 02:00 le lendemain'],
  [U.indispoPlage({ heure_debut: '18:00' }), 'à partir de 18:00'],
  [U.indispoPlage({ heure_fin: '15:00' }), 'jusqu’à 15:00'],
  [U.indispoStatut({ statut: 'indispo' }), 'Indisponible'],
  [U.indispoStatut({ statut: 'dispo_limitee' }), 'Disponibilité limitée'],
  [U.indispoQuand({ type: 'recurrente', jour_semaine: 3 }), 'Tous les jeudis'],
  [U.indispoQuand({ type: 'recurrente', jour_semaine: 0 }), 'Tous les lundis'],
  [U.indispoQuand({ type: 'recurrente', jour_semaine: 6 }), 'Tous les dimanches'],
  [U.indispoQuand({ type: 'recurrente', jour_semaine: null }), 'Récurrente — jour non renseigné'],
  [U.indispoQuand({ type: 'ponctuelle' }), 'Date non renseignée'],
  [U.ymdRange('2026-07-30', '2026-08-03', { nowMs: NOW }), 'Du jeudi 30 juillet au lundi 3 août'],
  [U.ymdRange('2025-12-29', '2026-01-02', { nowMs: NOW }), 'Du lundi 29 décembre 2025 au vendredi 2 janvier 2026'],
  [U.ymdRange('2025-07-21', '2025-07-24', { nowMs: NOW }), 'Du lundi 21 au jeudi 24 juillet 2025'],
  [U.indispoDemande({ statut_demande: 'validee' }), ''],
  [U.indispoDemande({}), ''],
  [U.indispoDemande({ statut_demande: 'en_attente' }), 'En attente de validation'],
];
B.forEach(([obtenu, attendu]) => t(`« ${attendu} »`, obtenu === attendu, obtenu));
const triees = [
  { id: 'p2', type: 'ponctuelle', date_specifique: '2026-08-01' }, { id: 'r4', type: 'recurrente', jour_semaine: 3 },
  { id: 'p1', type: 'ponctuelle', date_specifique: '2026-07-24' }, { id: 'p3', type: 'ponctuelle', date_specifique: '2026-07-21' },
  { id: 'r0', type: 'recurrente', jour_semaine: 0 },
].sort(U.indispoTri).map(d => d.id).join(',');
t('tri : récurrentes (lundi → dimanche) puis ponctuelles par date croissante', triees === 'r0,r4,p3,p1,p2', triees);

// ══════════ C. Regroupement des jours consécutifs ══════════
console.log('── C. Périodes « Du … au … » ──');
const am = (id, date, extra) => Object.assign({ id, salarie_id: 'S', type: 'ponctuelle', statut: 'indispo', statut_demande: 'validee', motif: 'Arrêt maladie', date_specifique: date }, extra || {});
const arret = [am('m3', '2026-07-23'), am('m1', '2026-07-21'), am('m4', '2026-07-24'), am('m2', '2026-07-22')];
const Lc = U.listeIndispos(arret, { nowMs: parisMs('2026-07-20', '12:00') });
t('4 jours consécutifs d\'arrêt maladie → UNE entrée', Lc.aVenir.length === 1, Lc.aVenir.length);
const e0 = Lc.aVenir[0];
t('… libellée « Du mardi 21 au vendredi 24 juillet »', e0.quand === 'Du mardi 21 au vendredi 24 juillet', e0.quand);
t('… qui porte les 4 lignes, dans l\'ordre des dates', e0.lignes.map(d => d.id).join(',') === 'm1,m2,m3,m4' && e0.nbJours === 4 && e0.periode);
const Lgap = U.listeIndispos([am('g1', '2026-07-21'), am('g2', '2026-07-22'), am('g4', '2026-07-24')], { nowMs: parisMs('2026-07-20', '12:00') });
t('un trou d\'un jour coupe la période (21–22 puis 24)', Lgap.aVenir.length === 2 && Lgap.aVenir[1].quand === 'Vendredi 24 juillet', Lgap.aVenir.map(e => e.quand).join(' | '));
const Lmix = U.listeIndispos([am('x1', '2026-07-21'), am('x2', '2026-07-22', { motif: 'Congé payé' }), am('x3', '2026-07-23', { heure_debut: '18:00', heure_fin: '00:00' })], { nowMs: parisMs('2026-07-20', '12:00') });
t('motif ou plage différents → jamais regroupés', Lmix.aVenir.length === 3, Lmix.aVenir.length);
const Lpl = U.listeIndispos([am('y1', '2026-07-21'), am('y2', '2026-07-22', { heure_debut: '18:00', heure_fin: '00:00' })], { nowMs: parisMs('2026-07-20', '12:00') });
t('même motif, jours consécutifs, plage différente → deux lignes distinctes', Lpl.aVenir.length === 2, Lpl.aVenir.map(e => e.quand).join(' | '));
const Lst = U.listeIndispos([am('z1', '2026-07-21'), am('z2', '2026-07-22', { statut_demande: 'en_attente' })], { nowMs: parisMs('2026-07-20', '12:00') });
t('validée puis en attente le lendemain → jamais fusionnées', Lst.aVenir.length === 2);
const Ldup = U.listeIndispos([am('d1', '2026-07-21'), am('d2', '2026-07-21'), am('d3', '2026-07-22')], { nowMs: parisMs('2026-07-20', '12:00') });
t('deux saisies du même jour : une seule période, 2 jours, 3 lignes (aucune avalée)',
  Ldup.aVenir.length === 1 && Ldup.aVenir[0].nbJours === 2 && Ldup.aVenir[0].lignes.length === 3);

// ══════════ D. Passé / à venir — journée d'exploitation ══════════
console.log('── D. Historique et journée d\'exploitation ──');
const hier = am('hier', '2026-10-20'), demain = am('demain', '2026-10-22');
const Ld = U.listeIndispos([hier, demain], { nowMs: NOW });
t('une indispo d\'HIER est dans « Historique »', Ld.historique.length === 1 && Ld.historique[0].entrees[0].cle === 'hier' && Ld.historique[0].label === 'Octobre 2026');
t('celle de DEMAIN est dans la liste principale', Ld.aVenir.length === 1 && Ld.aVenir[0].cle === 'demain');
const soir = am('soir', '2026-10-21', { heure_debut: '18:00:00', heure_fin: '00:00:00', motif: null });
const vis = (nowMs, cutoff) => U.listeIndispos([soir], { nowMs, cutoff }).aVenir.length === 1;
t('ce soir 18:00 → minuit : visible à 23:30', vis(parisMs('2026-10-21', '23:30')));
t('… toujours visible le lendemain à 04:30 (service pas terminé, bascule 05:00)', vis(parisMs('2026-10-22', '04:30')));
t('… dans l\'historique à 05:30', !vis(parisMs('2026-10-22', '05:30')));
t('… bascule réglée à 06:00 par l\'organisation : encore visible à 05:30', vis(parisMs('2026-10-22', '05:30'), '06:00'));
// Contre-preuve : la règle naïve « passé = date < aujourd'hui calendaire (Paris) » la cache à 04:30.
const naif = (d, nowMs) => d.date_specifique < U.ymdLocal(nowMs);
t('CONTRE-PREUVE : la règle « minuit pile » l\'aurait cachée à 04:30', naif(soir, parisMs('2026-10-22', '04:30')) === true);
const tard = am('tard', '2026-10-21', { heure_debut: '18:00', heure_fin: '06:30', motif: null });
t('fin au lendemain APRÈS la bascule (18:00 → 06:30) : visible à 06:00, historique à 06:45',
  U.listeIndispos([tard], { nowMs: parisMs('2026-10-22', '06:00') }).aVenir.length === 1
  && U.listeIndispos([tard], { nowMs: parisMs('2026-10-22', '06:45') }).comptes.historique === 1);
const enCours = [am('c1', '2026-10-19'), am('c2', '2026-10-20'), am('c3', '2026-10-21'), am('c4', '2026-10-22')];
const Lec = U.listeIndispos(enCours, { nowMs: NOW });
t('arrêt en cours : « Du mercredi 21 au jeudi 22 octobre » visible, 19–20 dans l\'historique',
  Lec.aVenir.length === 1 && Lec.aVenir[0].quand === 'Du mercredi 21 au jeudi 22 octobre'
  && Lec.historique[0].entrees[0].quand === 'Du lundi 19 au mardi 20 octobre', Lec.aVenir.map(e => e.quand).join('|'));
const Lrec = U.listeIndispos([{ id: 'r', type: 'recurrente', jour_semaine: 3, statut: 'indispo' }], { nowMs: NOW });
t('une récurrente n\'est jamais archivée', Lrec.recurrentes.length === 1 && Lrec.comptes.historique === 0);
const Lmois = U.listeIndispos([am('j30', '2026-07-30'), am('j31', '2026-07-31'), am('a01', '2026-08-01'), am('s05', '2026-09-05')], { nowMs: NOW });
t('historique par mois, le plus récent d\'abord ; une période à cheval est rangée au mois de son DÉBUT',
  Lmois.historique.map(m => m.label + ':' + m.n).join(',') === 'Septembre 2026:1,Juillet 2026:3'
  && Lmois.historique[1].entrees[0].quand === 'Du jeudi 30 juillet au samedi 1er août',
  Lmois.historique.map(m => m.label + ':' + m.n).join(','));

// ══════════ E. Complétude sur les id (fixture riche + aléatoire) ══════════
console.log('── E. Aucune ligne perdue ni dupliquée ──');
function verifierIds(rows, L, nom) {
  const vus = [];
  const prendre = e => e.lignes.forEach(d => vus.push(d.id));
  L.recurrentes.forEach(prendre); L.aVenir.forEach(prendre); L.aCompleter.forEach(prendre);
  L.historique.forEach(m => m.entrees.forEach(prendre));
  const attendu = rows.map(d => d.id).sort().join(','), obtenu = vus.slice().sort().join(',');
  const c = L.comptes;
  t(nom + ' : chaque id exactement une fois (' + rows.length + ' lignes)', attendu === obtenu && new Set(vus).size === vus.length,
    'manquants=' + rows.filter(d => !vus.includes(d.id)).length + ' doublons=' + (vus.length - new Set(vus).size));
  t(nom + ' : visibles + historique = total', c.visibles + c.historique === rows.length && c.total === rows.length
    && c.recurrentes + c.aVenir + c.aCompleter === c.visibles, JSON.stringify(c));
}
const riche = [
  ...arret, am('t1', '2025-12-30'), am('t2', '2025-12-31'), am('t3', '2026-01-01'), am('t4', '2026-01-02'),
  am('dd1', '2026-10-25'), am('dd2', '2026-10-25'), am('pl', '2026-10-26', { heure_debut: '10:00', heure_fin: '15:00' }),
  am('ref', '2026-10-27', { statut_demande: 'refusee' }), am('att', '2026-10-28', { statut_demande: 'en_attente' }),
  { id: 'sansdate', salarie_id: 'S', type: 'ponctuelle', statut: 'indispo' },
  { id: 'r1', salarie_id: 'S', type: 'recurrente', jour_semaine: 3, heure_debut: '17:00', heure_fin: '00:00', statut: 'indispo' },
  { id: 'rbad', salarie_id: 'S', type: 'recurrente', statut: 'indispo' }, soir,
];
const copie = JSON.stringify(riche);
verifierIds(riche, U.listeIndispos(riche, { nowMs: NOW }), 'fixture riche');
t('listeIndispos ne modifie ni le tableau reçu (ordre) ni ses lignes', JSON.stringify(riche) === copie);
let seed = 42; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const MOTIFS = ['Arrêt maladie', 'Congé payé', null, 'Congé sans solde'];
const alea = Array.from({ length: 800 }, (_, i) => rnd(10) === 0
  ? { id: 'R' + i, type: 'recurrente', jour_semaine: rnd(7), statut: 'indispo' }
  : { id: 'P' + i, type: 'ponctuelle', statut: rnd(5) ? 'indispo' : 'dispo_limitee', motif: MOTIFS[rnd(4)],
      date_specifique: U.addDaysYMD('2026-01-01', rnd(400)), heure_debut: rnd(4) ? null : '18:00', heure_fin: rnd(4) ? null : '00:00' });
alea.forEach(d => { if (!d.heure_debut) d.heure_fin = null; });
verifierIds(alea, U.listeIndispos(alea, { nowMs: NOW }), '800 lignes aléatoires');

// ══════════ F. Le VRAI renderDispoList : un × par ligne, aucun accès base, rien de modifié ══════════
console.log('── F. Rendu de la fiche (salaries/index.html) ──');
const SAL = fs.readFileSync(path.join(RACINE, 'salaries', 'index.html'), 'utf8');
const acces = [];
const espion = nom => new Proxy(function () {}, { get: (o, k) => { acces.push(nom + '.' + String(k)); return espion(nom + '.' + String(k)); }, apply: () => { acces.push(nom + '()'); return espion(nom + '()'); } });
global.sb = espion('sb'); global.EatimeScope = espion('EatimeScope');
const vraiFetchAll = global.fetchAllRows; global.fetchAllRows = () => { acces.push('fetchAllRows'); return Promise.resolve({ rows: [] }); };
const host = { innerHTML: '' };
global.document = { getElementById: id => (id === 'dispoList' ? host : null) };
global._dlOpen = new Set();
global.JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']; // constante de page (utilisée par l'ancien rendu)
// Les aides de rendu sont optionnelles à l'extraction : la contre-preuve rejoue l'ANCIEN renderDispoList (sans elles).
['dlToggle', '_dlLigne', 'renderDispoList', '_cutoff'].forEach(n => { try { eval('global.' + n + '=' + extractFn(SAL, n) + ';'); } catch (e) { console.log('  (absente de la page : ' + n + ')'); } });
global.ORG = { journee_exploitation_debut: '05:00:00' };
global.currentFiche = { id: 'S' };
const avant = JSON.stringify(riche);
global.S = { dispos: riche.concat([am('autre', '2026-10-22', { salarie_id: 'AUTRE' })]) };
global.disposOf = sid => S.dispos.filter(x => x.salarie_id === sid);
const vraiNow = Date.now; Date.now = () => NOW;
let rendu = '';
try { renderDispoList(); rendu = host.innerHTML; } catch (e) { t('renderDispoList s\'exécute', false, e.message); }
Date.now = vraiNow;
const boutons = [...rendu.matchAll(/onclick="delDispo\('([^']+)'\)"/g)].map(m => m[1]);
const attendus = riche.map(d => d.id);
t('un bouton × par ligne du salarié, ni plus ni moins (' + attendus.length + ')',
  boutons.length === attendus.length && attendus.every(id => boutons.includes(id)), boutons.length + ' boutons');
t('les lignes d\'un autre salarié ne sont pas affichées', !boutons.includes('autre'));
const nHist = U.listeIndispos(riche, { nowMs: NOW, cutoff: '05:00:00' }).comptes.historique;
t('« Historique (' + nHist + ') » affiché, replié par défaut', rendu.includes('<summary>Historique (' + nHist + ')</summary>') && !/data-k="hist" open/.test(rendu));
t('la période d\'arrêt est un bloc dépliable « Du … au … »', /<details class="dl-grp"[^>]*>\s*<summary class="subitem"><div><b>Du mardi 21 au vendredi 24 juillet<\/b> · 4 jours/.test(rendu));
t('dates techniques « AAAA-MM-JJ » absentes du rendu', !/\b20\d\d-\d\d-\d\d\b/.test(rendu));
t('statut en mots (« Indisponible »), jamais « indispo » brut', rendu.includes('Indisponible') && !/· indispo\b/.test(rendu));
t('récurrente : « Tous les jeudis » · « 17:00 → minuit »', rendu.includes('<b>Tous les jeudis</b> · 17:00 → minuit'));
t('AUCUN accès à la base pendant le rendu (ni lecture, ni écriture)', acces.length === 0, acces.slice(0, 5).join(', '));
t('les lignes reçues ne sont pas modifiées (contenu et ordre)', JSON.stringify(riche) === avant);
const xss = [{ id: 'x', salarie_id: 'S', type: 'ponctuelle', date_specifique: '2026-10-30', statut: 'indispo', motif: '<img src=x onerror=alert(1)>' }];
global.S = { dispos: xss }; renderDispoList();
t('motif saisi par un salarié échappé (pas d\'injection HTML)', !host.innerHTML.includes('<img') && host.innerHTML.includes('&lt;img'));
global.S = { dispos: [] }; renderDispoList();
t('aucune ligne → « Aucune indisponibilité enregistrée »', host.innerHTML.includes('Aucune indisponibilité enregistrée'));
global.fetchAllRows = vraiFetchAll;

// ══════════ H. Les autres listes : même format, même tri (vrai code de chaque page) ══════════
console.log('── H. Demandes (Salariés, Planning), « Moi », Dispos ──');
const DEM = [
  { id: 'q3', salarie_id: 'S', type: 'ponctuelle', date_specifique: '2026-11-07', statut: 'indispo', statut_demande: 'en_attente', created_at: '2026-10-01', motif: '<b>x</b>' },
  { id: 'q1', salarie_id: 'S', type: 'recurrente', jour_semaine: 3, heure_debut: '17:00', heure_fin: '00:00', statut: 'indispo', statut_demande: 'en_attente', created_at: '2026-10-03' },
  { id: 'q2', salarie_id: 'S', type: 'ponctuelle', date_specifique: '2026-10-24', statut: 'indispo', statut_demande: 'en_attente', created_at: '2026-10-02' },
];
const ordre = (html, ids) => ids.map(id => html.indexOf("'" + id + "'")).every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1]));
const modal = { innerHTML: '' };
global.document = { getElementById: id => (id === 'modalHost' || id === 'pdfModal' ? modal : { innerHTML: '' }) };
global.S = { dispos: DEM.slice(), salaries: [{ id: 'S', prenom: 'Léa', nom: 'Test' }] };
eval('global.openDemandes=' + extractFn(SAL, 'openDemandes') + ';');
openDemandes();
t('Salariés › Demandes : « Samedi 24 octobre » et « Tous les jeudis · 17:00 → minuit »',
  modal.innerHTML.includes('Samedi 24 octobre · journée entière') && modal.innerHTML.includes('Tous les jeudis · 17:00 → minuit'));
t('Salariés › Demandes : tri récurrente, puis 24/10, puis 07/11 (avant : ordre d\'arrivée)', ordre(modal.innerHTML, ['q1', 'q2', 'q3']));
t('Salariés › Demandes : motif échappé', !modal.innerHTML.includes('<b>x</b>') && modal.innerHTML.includes('&lt;b&gt;x'));
(async () => {
  const PL = fs.readFileSync(path.join(RACINE, 'planning', 'index.html'), 'utf8');
  global.MONDAY = '2026-10-19';
  global.loadDisposPlanning = async () => ({ rows: DEM.slice(), complet: true });
  global.renderLectureBar = () => {}; global.updateDemandesBadge = () => {};
  eval('global.escP=' + extractFn(PL, 'escP') + ';');
  global.voirMotifAbsence = () => true;
  modal.innerHTML = '';
  eval('global.openDemandes=' + extractFn(PL, 'openDemandes') + ';');
  await openDemandes();
  t('Planning › Demandes : mêmes textes que Salariés',
    modal.innerHTML.includes('Samedi 24 octobre · journée entière') && modal.innerHTML.includes('Tous les jeudis · 17:00 → minuit'), modal.innerHTML.slice(0, 120));
  t('Planning › Demandes : même tri', ordre(modal.innerHTML, ['q1', 'q2', 'q3']));

  const MOI = fs.readFileSync(path.join(RACINE, 'moi', 'index.html'), 'utf8');
  global.SALARIE = { id: 'S' }; global.ORG = { journee_exploitation_debut: '05:00' };
  const mien = [am('h1', '2026-10-19'), am('h2', '2026-10-20'), DEM[1], am('f1', '2026-10-24', { statut_demande: 'en_attente', motif: null }), am('n', '2026-10-22', { statut_demande: null, motif: null })];
  global.fetchAllRows = async () => ({ rows: mien.slice(), complet: true });
  global.EatimeScope = { from: () => ({ select: () => ({}) }) };
  global.openDispo = () => {};
  eval('global.renderDispos=' + extractFn(MOI, 'renderDispos') + ';');
  const elMoi = { innerHTML: '' };
  Date.now = () => NOW; await renderDispos(elMoi); Date.now = vraiNow;
  const hm = elMoi.innerHTML;
  t('« Moi » : récurrente, puis jeudi 22, puis samedi 24 octobre', hm.indexOf('Tous les jeudis') < hm.indexOf('Jeudi 22 octobre') && hm.indexOf('Jeudi 22 octobre') < hm.indexOf('Samedi 24 octobre') && hm.indexOf('Tous les jeudis') >= 0);
  t('« Moi » : arrêt passé replié dans « Historique (2) » en une période', hm.includes('Historique (2)') && hm.includes('Du lundi 19 au mardi 20 octobre'));
  t('« Moi » : statut de demande absent = « Validée » (comme le planning), pas « En attente »',
    /Jeudi 22 octobre<\/div><span class="badge ok">Validée/.test(hm), hm.match(/Jeudi 22 octobre.{0,80}/)?.[0]);

  const DIS = fs.readFileSync(path.join(RACINE, 'dispos', 'index.html'), 'utf8');
  global.ME = { id: 'S' };
  const chaine = { select: () => chaine, eq: () => chaine, order: () => chaine, limit: async () => ({ data: [am('o', '2026-10-01'), am('v', '2026-10-24'), DEM[1]] }) };
  global.sb = { from: () => chaine };
  const myList = { innerHTML: '' };
  global.document = { getElementById: id => (id === 'myList' ? myList : { innerHTML: '' }) };
  eval('global.loadMine=' + extractFn(DIS, 'loadMine') + ';');
  Date.now = () => NOW; await loadMine(); Date.now = vraiNow;
  const hd = myList.innerHTML;
  t('Dispos : « Samedi 24 octobre », récurrente en tête, demande passée repliée « Passées (1) »',
    hd.includes('Samedi 24 octobre') && hd.indexOf('Tous les jeudis') < hd.indexOf('Samedi 24 octobre') && hd.includes('Passées (1)') && hd.indexOf('Passées (1)') < hd.indexOf('Jeudi 1er octobre'), hd.slice(0, 160));
  finir();
})().catch(e => { t('section H s\'exécute', false, e.stack); finir(); });

function finir() {
// ══════════ G. Garde-fous statiques ══════════
console.log('── G. Garde-fous dans le dépôt ──');
const pages = [];
(function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(f => {
  if (f.name === '.git' || f.name === 'node_modules' || f.name === 'tests') return;
  const p = path.join(d, f.name);
  if (f.isDirectory()) walk(p); else if (/\.html$/.test(f.name)) pages.push(p);
}); })(RACINE);
const fautifs = pages.filter(p => /new Date\(\s*[\w.]*date_specifique/.test(fs.readFileSync(p, 'utf8'))).map(p => path.relative(RACINE, p));
t('plus aucun new Date(…date_specifique) dans les pages', fautifs.length === 0, fautifs.join(', '));
const NOUVELLES = /\b(listeIndispos|indispoQuand|indispoPlage|indispoTri|indispoPassee|indispoStatut|ymdLong|ymdRange)\b/;
const sousVersion = pages.filter(p => {
  const s = fs.readFileSync(p, 'utf8'); if (!NOUVELLES.test(s)) return false;
  const m = s.match(/utils\.js\?v=([\d.]+)/); if (!m) return true;
  const [a, b] = m[1].split('.').map(Number); return a < 1 || (a === 1 && b < 9);
}).map(p => path.relative(RACINE, p));
t('toute page utilisant les nouvelles fonctions charge utils.js ?v=1.9 au moins', sousVersion.length === 0, sousVersion.join(', '));
const appelants = pages.filter(p => NOUVELLES.test(fs.readFileSync(p, 'utf8'))).map(p => path.relative(RACINE, p)).sort();
t('appelants attendus : dispos, moi, planning, salaries', appelants.join(',') === ['dispos/index.html', 'moi/index.html', 'planning/index.html', 'salaries/index.html'].join(','), appelants.join(','));

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
}

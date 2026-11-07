// Harnais — HACCP : archivage au lieu de suppression, plus aucun refus silencieux, tablette cloisonnée
// (HACCP v0.3, haccp-kiosk sur eatime-kiosk-v12, migrations v6.38 → v6.40).
//
// Ce qu'il prouve, HORS LIGNE, sur le VRAI code (fonctions extraites de haccp/index.html, vrai access.js) :
//   A. un refus de la base (0 ligne touchée, SANS erreur — ce que renvoie Supabase quand une politique RLS
//      refuse) produit un MESSAGE, plus un silence ; contre-preuve : l'ancien delEq (git HEAD~) se tait ;
//   B. boutons : un non-administrateur ne voit ni « Supprimer définitivement » ni les ✕ des relevés ;
//      s'il force l'appel, il reçoit un message et AUCUNE requête de suppression ne part ;
//   C. suppression définitive : refusée (avec le nombre de relevés) s'il existe un relevé ; un refus 23503
//      de la base est aussi traduit ; sans relevé, la suppression part ;
//   D. archiver : l'équipement sort des formulaires de saisie mais reste dans les filtres (« archivé »), et
//      ses relevés restent dans la liste et dans le chemin du PDF DDPP (aucun filtre sur `actif`) ;
//   E. access.js : isAdminOrSuper dit la même chose que is_admin_or_super() en base (relevé de production) ;
//   F. tablette : plus de PIN envoyé, référentiel par kiosk_haccp_referentiel (plus de lecture directe des
//      équipements de toutes les organisations), CACHE_VERSION bumpé ; migrations : plus aucune cascade vers
//      les relevés, droits de gestion = has_module_access('haccp').
//
// Ce qu'il ne peut pas prouver : le comportement des politiques RLS. Il a été prouvé EN BASE, dans une
// transaction annulée (rapport du 2026-11-07) : tablette anonyme, manager avec / sans accès HACCP, admin.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { extractFn } = require('./extract.js');

const RACINE = path.join(__dirname, '..');
let ok = true;
const t = (label, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label + (cond || detail === undefined ? '' : '  → ' + detail));
  ok = !!cond && ok;
};

global.window = globalThis;
require(path.join(RACINE, 'access.js'));
const HACCP = fs.readFileSync(path.join(RACINE, 'haccp', 'index.html'), 'utf8');

// ── Faux client : chaque appel est journalisé ; la réponse d'une écriture est réglable par test ──────
const journal = [];
let reponseEcriture = { data: [{ id: 'x' }], error: null };
let comptes = {};                                   // table → nombre de relevés renvoyé par un comptage
function constructeur(table) {
  const etat = { table, op: 'select', filtres: [], head: false };
  const b = {
    select(cols, o) { if (o && o.head) etat.head = true; if (etat.op !== 'select') etat.retour = cols; return b; },
    update(p) { etat.op = 'update'; etat.patch = p; return b; },
    delete() { etat.op = 'delete'; return b; },
    insert(p) { etat.op = 'insert'; etat.patch = p; return b; },
    eq(c, v) { etat.filtres.push([c, v]); return b; },
    order() { return b; },
    then(res, rej) {
      journal.push(Object.assign({}, etat));
      const r = etat.head ? { count: comptes[table] || 0, error: null }
        : (etat.op === 'select' ? { data: [], error: null } : reponseEcriture);
      return Promise.resolve(r).then(res, rej);
    },
  };
  return b;
}
global.EatimeScope = { from: constructeur };
global.sb = { from: constructeur };
const toasts = []; global.toast = m => toasts.push(m);
let confirmations = true; global.confirm = () => confirmations;
global.document = { getElementById: () => ({ innerHTML: '' }) };
global.loadCommonData = async () => {};
global.closeModal = () => {};
global.val = () => '';
global.num = () => null;
global.SNACK = null;
global.TYPES_EQ = { frigo: 'Frigo', friteuse: 'Friteuse' };
global.PERIODICITES = { quotidien: 'Quotidien' };
global.ORG = { id: 'ORG', permissions: { haccp: ['admin', 'manager'] } };
const EQ_ACTIF = { id: 'e1', nom: 'Frigo A', type: 'frigo', actif: true, organization_id: 'ORG' };
const EQ_ARCH = { id: 'e2', nom: 'Frigo remplacé', type: 'frigo', actif: false, organization_id: 'ORG' };
const FRIT_ARCH = { id: 'f2', nom: 'Vieille friteuse', type: 'friteuse', actif: false, organization_id: 'ORG' };
global.S = { snacks: [], equipements: [EQ_ACTIF, EQ_ARCH, FRIT_ARCH], zones: [{ id: 'z1', nom: 'Plonge', actif: true }], salaries: [] };

const fonctions = ['ecrireH', 'peutGererH', 'estAdminH', 'eqSaisie', 'zonesSaisie', 'eqOfSnack', 'zonesOfSnack', '_boutonsRef', '_blocArchives',
  'archiverRef', 'compterReleves', 'supprimerRefDefinitif', 'renderEquipements', 'renderZones', 'saveEq', 'delEq', 'delHuile', 'delReleve'];
fonctions.forEach(n => { try { eval('global.' + n + '=' + extractFn(HACCP, n) + ';'); } catch (e) { t('fonction présente : ' + n, false, e.message); } });
// Constantes de page (const …= à une ligne) : réinstallées depuis le source réel.
for (const n of ['escH', 'lblArch']) {
  const m = HACCP.match(new RegExp('const ' + n + '=([^\\n]*);\\n'));
  if (m) eval('global.' + n + '=' + m[1] + ';'); else t('constante présente : ' + n, false);
}
{ const i = HACCP.indexOf('const REF={'), j = HACCP.indexOf('\n};', i); eval('global.REF=' + HACCP.slice(i + 'const REF='.length, j + 2) + ';'); }

const MANAGER = { role: 'manager', module_exceptions: {} };
const ADMIN = { role: 'admin', module_exceptions: {} };
const reset = () => { journal.length = 0; toasts.length = 0; reponseEcriture = { data: [{ id: 'x' }], error: null }; comptes = {}; confirmations = true; };

(async () => {
  // ══════════ A. Refus silencieux → message ══════════
  console.log('── A. Un refus de la base produit un message ──');
  global.ME = MANAGER; reset();
  reponseEcriture = { data: [], error: null };          // RLS : 0 ligne, pas d'erreur
  await archiverRef('eq', 'e1', false);
  t('archiver refusé par la base (0 ligne) → « Vous n’avez pas les droits pour archiver cet équipement »',
    toasts.some(m => /droits pour archiver cet équipement/.test(m)), toasts.join(' | '));
  t('… et la requête demandait bien les lignes touchées (.select(\'id\'))', journal.some(j => j.op === 'update' && j.retour === 'id'));
  reset(); reponseEcriture = { data: [], error: null };
  global.val = id => ({ eq_nom: 'Frigo A', eq_id: 'e1' }[id] || '');
  await saveEq();
  t('modifier refusé (0 ligne) → message, plus de « Enregistré ✓ » trompeur',
    toasts.some(m => /droits pour modifier cet équipement/.test(m)) && !toasts.some(m => /Enregistré/.test(m)), toasts.join(' | '));
  t('le formulaire n\'écrit plus `actif` (un seul chemin : archiver / réactiver)', journal.every(j => !j.patch || !('actif' in j.patch)));
  global.val = () => '';
  reset(); reponseEcriture = { data: [], error: null };
  await delHuile('h1');
  t('supprimer un contrôle d\'huile refusé → message', toasts.some(m => /droits pour supprimer un contrôle/.test(m)), toasts.join(' | '));
  reset(); await archiverRef('eq', 'e1', false);
  t('archiver accepté (1 ligne) → « Archivé ✓ — relevés conservés »', toasts.some(m => /Archivé ✓/.test(m)), toasts.join(' | '));
  // Contre-preuve : l'ANCIEN delEq (avant ce chantier) avec la même réponse « 0 ligne, pas d'erreur ».
  const ancien = execFileSync('git', ['show', '00c7149:haccp/index.html'], { cwd: RACINE, encoding: 'utf8' });
  eval('global.delEqAncien=' + extractFn(ancien, 'delEq').replace(/^async function delEq/, 'async function delEqAncien') + ';');
  global.renderEquipements0 = global.renderEquipements; global.renderEquipements = () => {};
  reset(); reponseEcriture = { data: [], error: null, count: 0 };
  await delEqAncien('e1');
  t('CONTRE-PREUVE : l\'ancien « Supprimer » refusé par la base ne disait RIEN', toasts.length === 0, toasts.join(' | '));
  t('… et c\'était une suppression (effacement en cascade des relevés si elle passait)', journal.some(j => j.op === 'delete'));
  global.renderEquipements = global.renderEquipements0;

  // ══════════ B. Boutons selon les droits (lus dans access.js) ══════════
  console.log('── B. Boutons affichés = droits de la base ──');
  global.ME = MANAGER;
  const htmlManager = _boutonsRef('eq', EQ_ARCH) + _boutonsRef('eq', EQ_ACTIF);
  t('manager avec accès HACCP : « Archiver » et « Réactiver » visibles', /Archiver/.test(htmlManager) && /Réactiver/.test(htmlManager));
  t('manager : « Supprimer définitivement » ABSENT', !/définitivement/.test(htmlManager));
  global.ME = ADMIN;
  t('administrateur : « Supprimer définitivement » présent sur un archivé', /Supprimer définitivement/.test(_boutonsRef('eq', EQ_ARCH)));
  t('… mais jamais sur un équipement ACTIF (archiver d\'abord)', !/définitivement/.test(_boutonsRef('eq', EQ_ACTIF)));
  global.ME = { role: 'salarie', module_exceptions: {} };
  t('rôle sans accès HACCP (salarié, permissions par défaut) : aucun bouton de gestion', _boutonsRef('eq', EQ_ACTIF) === '' && _boutonsRef('eq', EQ_ARCH) === '');
  global.ME = { role: 'salarie', module_exceptions: { haccp: true } };
  t('… sauf exception individuelle « HACCP autorisé » (réglage de l\'établissement)', /Archiver/.test(_boutonsRef('eq', EQ_ACTIF)));
  global.ME = MANAGER; reset();
  await supprimerRefDefinitif('eq', 'e2');
  t('non-admin qui FORCE la suppression définitive → message « pas les droits »', toasts.some(m => /pas les droits pour supprimer définitivement/.test(m)), toasts.join(' | '));
  t('… et aucune requête de suppression ni de comptage n\'est partie', journal.length === 0, JSON.stringify(journal));
  const crois = ['delReleve', 'delHuile', 'delReception', 'delNettoyage'].map(fn => {
    const m = HACCP.match(new RegExp('\\$\\{estAdminH\\(\\)\\?`<button[^`]*onclick="' + fn + '\\('));
    return [fn, !!m];
  });
  t('les ✕ de suppression des relevés ne s\'affichent qu\'à l\'administrateur (4 listes)', crois.every(x => x[1]), JSON.stringify(crois));
  global.EatimeAccess.isAdminOrSuper = undefined; global.ME = ADMIN;
  t('access.js ancien en cache (sans isAdminOrSuper) : le bouton est masqué, la page ne casse pas', estAdminH() === false && !/définitivement/.test(_boutonsRef('eq', EQ_ARCH)));
  delete require.cache[require.resolve(path.join(RACINE, 'access.js'))]; require(path.join(RACINE, 'access.js'));

  // ══════════ C. Suppression définitive : jamais s'il existe un relevé ══════════
  console.log('── C. Suppression définitive ──');
  global.ME = ADMIN; reset();
  comptes = { haccp_releves_temperature: 12, haccp_huiles: 3 };
  await supprimerRefDefinitif('eq', 'e2');
  t('admin, équipement avec relevés → refus qui dit combien (12 + 3)', toasts.some(m => /12 relevé\(s\) de température et 3 contrôle\(s\) d’huile/.test(m)), toasts.join(' | '));
  t('… et AUCUNE requête de suppression', !journal.some(j => j.op === 'delete'));
  t('… comptage seul (head), aucune ligne de relevé rapatriée', journal.length === 2 && journal.every(j => j.head));
  reset(); comptes = {};
  await supprimerRefDefinitif('eq', 'e2');
  t('admin, équipement SANS relevé → la suppression part', journal.some(j => j.op === 'delete' && j.retour === 'id') && toasts.some(m => /Supprimé définitivement/.test(m)), toasts.join(' | '));
  reset(); comptes = {}; reponseEcriture = { data: null, error: { code: '23503', message: 'violates foreign key' } };
  await supprimerRefDefinitif('eq', 'e2');
  t('relevé arrivé entre-temps → la base refuse (23503) et c\'est DIT', toasts.some(m => /refusée par la base : des relevés y sont rattachés/.test(m)), toasts.join(' | '));
  reset(); comptes = { haccp_nettoyages: 5 };
  await supprimerRefDefinitif('zone', 'z1');
  t('zone de nettoyage avec 5 nettoyages → même refus', toasts.some(m => /5 nettoyage\(s\)/.test(m)) && !journal.some(j => j.op === 'delete'), toasts.join(' | '));
  reset(); await delEq('e1');
  t('l\'ancien point d\'entrée delEq ARCHIVE désormais (aucune suppression)', journal.some(j => j.op === 'update' && j.patch.actif === false) && !journal.some(j => j.op === 'delete'));

  // ══════════ D. Archivé : hors saisie, dans la consultation et le registre ══════════
  console.log('── D. Un équipement archivé reste dans le registre ──');
  global.ME = MANAGER;
  t('formulaires de saisie : équipements actifs seulement', eqSaisie().map(e => e.id).join(',') === 'e1');
  const sansActif = ['renderTemperatures', 'renderHuiles', 'renderNettoyage', 'renderDashboard', 'exportPDF'].filter(n => /\bactif\b/.test(extractFn(HACCP, n)));
  t('listes de relevés, tableau de bord et PDF DDPP ne filtrent JAMAIS sur `actif`', sansActif.length === 0, sansActif.join(', '));
  const openRel = extractFn(HACCP, 'openReleve'), openHu = extractFn(HACCP, 'openHuile');
  t('nouveau relevé / nouveau contrôle d\'huile : listes de saisie (eqSaisie)', /eqSaisie\(\)/.test(openRel) && /eqSaisie\(\)/.test(openHu) && !/eqOfSnack\(\)/.test(openRel + openHu));
  t('nouveau nettoyage : zones actives seulement (zonesSaisie)', /<select id="n_zone">\$\{zonesSaisie\(\)/.test(HACCP));
  t('filtres de consultation : archivés gardés, marqués « (archivé) »', lblArch(EQ_ARCH) === 'Frigo remplacé (archivé)' && /filtEq[\s\S]{0,200}lblArch\(e\)/.test(HACCP) && /filtFr[\s\S]{0,200}lblArch\(e\)/.test(HACCP));
  // Rendu réel de la liste des contrôles d'huile : un contrôle de la friteuse ARCHIVÉE est bien listé.
  const hote = { innerHTML: '' };
  global.document = { getElementById: id => (id === 'huileList' ? hote : { innerHTML: '', value: '' }) };
  global.val = () => ''; global.hMk = () => () => {}; global.fmtDt = () => '07/11'; global.ACTIONS_HUILE = { controle: 'Contrôle' };
  global.nameSal = () => '—'; global.lectureKoH = () => {};
  global.fetchAllOrThrow = async () => [{ id: 'h9', ts: '2026-11-01T10:00:00Z', action: 'controle', conforme: true, equipement_id: 'f2', haccp_equipements: { nom: 'Vieille friteuse', restaurant_id: null } }];
  eval('global.renderHuiles=' + extractFn(HACCP, 'renderHuiles') + ';');
  await renderHuiles({ innerHTML: '' });
  t('liste réelle des contrôles d\'huile : le relevé de la friteuse ARCHIVÉE y figure', /Vieille friteuse/.test(hote.innerHTML), hote.innerHTML.slice(0, 120));
  global.document = { getElementById: () => ({ innerHTML: '' }) };
  let rendu = ''; global.document = { getElementById: () => ({ set innerHTML(v) { rendu = v; } }) };
  renderEquipements({ set innerHTML(v) { rendu = v; } });
  t('écran Équipements : actifs dans le tableau, archivés dans « Équipements archivés (2) » replié',
    /Frigo A/.test(rendu) && /Équipements archivés \(2\)/.test(rendu) && rendu.indexOf('Frigo remplacé') > rendu.indexOf('Équipements archivés'));

  // ══════════ E. access.js ↔ base ══════════
  console.log('── E. Même règle « administrateur » dans la page et en base ──');
  const fx = fs.readFileSync(path.join(__dirname, 'fixtures', 'is_admin_or_super.sql'), 'utf8');
  const m = fx.match(/role in \(([^)]*)\)/);
  const rolesSql = m ? m[1].split(',').map(s => s.trim().replace(/'/g, '')).sort().join(',') : '';
  t('EatimeAccess.ROLES_ADMIN = rôles de is_admin_or_super() en production', rolesSql === EatimeAccess.ROLES_ADMIN.slice().sort().join(','), rolesSql + ' vs ' + EatimeAccess.ROLES_ADMIN);
  t('isAdminOrSuper : admin et super_admin oui, manager et salarié non',
    EatimeAccess.isAdminOrSuper({ role: 'admin' }) && EatimeAccess.isAdminOrSuper({ role: 'super_admin' })
    && !EatimeAccess.isAdminOrSuper({ role: 'manager' }) && !EatimeAccess.isAdminOrSuper({ role: 'salarie' }) && !EatimeAccess.isAdminOrSuper(null));
  t('aucune page ne recopie un test « admin » pour la suppression HACCP', !/role===['"]admin['"]/.test(HACCP));

  // ══════════ F. Tablette et migrations ══════════
  console.log('── F. Tablette et migrations ──');
  const K = fs.readFileSync(path.join(RACINE, 'haccp-kiosk', 'index.html'), 'utf8');
  t('tablette : plus aucun PIN envoyé avec un relevé', !/saisi_par_pin/.test(K));
  t('tablette : référentiel par kiosk_haccp_referentiel(restaurant)', /sb\.rpc\('kiosk_haccp_referentiel',\{p_restaurant:SNACK_ID\}\)/.test(K));
  t('tablette : plus de lecture directe des équipements / zones (toutes organisations)', !/from\('haccp_equipements'\)|from\('haccp_zones_nettoyage'\)/.test(K));
  t('tablette : échec du référentiel AFFICHÉ (pas de liste vide silencieuse)', /Liste des équipements indisponible/.test(K));
  t('tablette : la réception relit seulement son id', /\.select\('id'\)\.single\(\)/.test(K));
  const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  t('sw.js : CACHE_VERSION bumpé (eatime-kiosk-v12) pour que les tablettes prennent la nouvelle version', /CACHE_VERSION = 'eatime-kiosk-v12'/.test(sw));
  const M = fs.readFileSync(path.join(RACINE, 'migrations', 'v6.39_haccp_archivage_kiosque.sql'), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
  t('v6.39 : aucune clé étrangère en CASCADE vers les relevés', !/references public\.haccp_(equipements|zones_nettoyage)\(id\) on delete cascade/i.test(M)
    && (M.match(/on delete no action/g) || []).length === 3);
  t('v6.39 : gérer équipements et zones = has_module_access(\'haccp\') (4 politiques)', (M.match(/create policy haccp_(equipements|zones_nettoyage)_(insert|update)[\s\S]*?has_module_access\('haccp'\)/g) || []).length === 4);
  t('v6.39 : plus de lecture anonyme des relevés', ['haccp_releves_temperature_anon_select', 'haccp_huiles_anon_select', 'haccp_nettoyages_anon_select']
    .every(p => new RegExp('drop policy if exists ' + p).test(M) && !new RegExp('create policy ' + p).test(M)));
  t('v6.39 : insertions anonymes contrôlées par fonction (actif + même organisation)', (M.match(/haccp_(equipement|zone)_saisissable\((equipement|zone)_id, organization_id\)/g) || []).length === 3);
  const M40 = fs.readFileSync(path.join(RACINE, 'migrations', 'v6.40_haccp_kiosque_lecture_fermee.sql'), 'utf8');
  t('v6.40 (fermeture de la lecture des équipements) porte sa condition : tablettes en v12', /NE PAS APPLIQUER[\s\S]*eatime-kiosk-v12/.test(M40));

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL · exécution : ' + e.stack); console.log('\nSOME FAILED'); process.exit(1); });

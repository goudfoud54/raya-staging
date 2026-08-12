// v6.32 — PORTÉE « ORGANISATION ACTIVE ».
//
// Symptôme d'origine : le patron bascule son compte super_admin sur « Raya Metz » et l'écran des
// salariés en affiche 39 — les 32 actifs de Groupe Raya PLUS les 7 de Raya Metz. Ce n'est pas une
// fuite (un admin/manager reste borné par RLS) mais une erreur de JUSTESSE : toutes les politiques
// portent « OR auth_role() = 'super_admin' », donc pour lui la base ne filtre plus rien, et les
// requêtes ne filtraient pas non plus.
//
// CE HARNAIS A DEUX MOITIÉS :
//   1. un CONTRÔLE DE CODE qui échoue si une lecture d'une table rattachée à une organisation ne
//      passe pas par le point d'accès borné — c'est lui qui empêche la correction de se défaire ;
//   2. des tests de COMPORTEMENT du helper (bornes, fail-closed, garde-fou d'écriture).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Scope = require(path.join(ROOT, 'orgscope.js'));

let ok = true, n = 0;
const t = (l, c, extra) => { n++; console.log((c ? 'PASS' : 'FAIL') + ' · ' + l + (c ? '' : '   ↳ ' + (extra == null ? '' : extra))); ok = c && ok; };

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EXCEPTIONS — chacune justifiée. Toute lecture non bornée qui n'est PAS ici fait échouer le harnais.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Modules entiers hors périmètre.
const DOSSIERS_EXEMPTS = {
  'badgeuse':    'Kiosque tablette : tourne en anon, sans session ni profil, donc sans organisation active. Sa portée vient du restaurant choisi sur la tablette (kiosk-shared.js) et de RLS.',
  'kiosk':       'Kiosque tablette — même raison que badgeuse.',
  'stock-kiosk': 'Kiosque tablette — même raison que badgeuse.',
  'haccp-kiosk': 'Kiosque tablette — même raison que badgeuse.',
  'dispos':      'Kiosque tablette lui aussi, malgré son nom : le salarié choisit son nom puis saisit son PIN, sans session ni profil. Sa portée vient du snack enregistré sur la tablette (localStorage « dispos_kiosk_snack ») et il filtre déjà .eq(organization_id, SNACK_ORG) sur les salariés.'
};
// Appels précis tolérés. `suite` est testée sur le texte qui suit immédiatement l'appel : la
// tolérance porte sur UNE requête précise, pas sur toute la table. Tolérer « profiles » en bloc
// laisserait passer la liste des utilisateurs d'une organisation, qui doit bien être bornée.
const APPELS_TOLERES = [
  // ⚠ La tolérance porte sur la LECTURE (.select) uniquement. Une première version tolérait tout
  // « profiles » suivi de .eq('id', …) : elle laissait donc passer un delete() et un update() sur
  // n'importe quel utilisateur, y compris d'une autre organisation. Les deux ont été bornés.
  { table: 'profiles', suite: /^\s*\.select\([^)]*\)[^;]{0,140}\.eq\(\s*'id'/, motif: 'LECTURE de son PROPRE profil au démarrage (.select(…).eq(\'id\')) : c\'est elle qui révèle l\'organisation active — on ne peut pas la borner sur l\'information qu\'elle est justement chargée d\'apporter.' },
  { table: 'profiles', suite: /^\s*\.select\([^)]*\)[^;]{0,140}\.eq\(\s*'user_id'/, motif: 'Même amorçage, variante par user_id : la ligne est celle de l\'utilisateur connecté, identifiée par son propre identifiant de session.' },
  { table: 'profiles', fichiers: ['parametres/index.html'], suite: /^\s*\.update\(\{organization_id:/, motif: 'BASCULE d\'organisation elle-même : elle écrit la nouvelle organisation sur SON PROPRE profil (.eq(\'id\', ME.id)). La borner sur l\'organisation active serait circulaire — c\'est l\'opération qui la change.' },
  { table: 'invitations', suite: /\.eq\(\s*'token'/, motif: 'Acceptation d\'une invitation : l\'utilisateur n\'a pas encore d\'organisation, la ligne se retrouve par son jeton — le borner serait impossible et inutile (le jeton est le secret).' },
  { table: 'restaurants', fichiers: ['orgscope.js'], motif: 'Amorçage du helper lui-même : il filtre explicitement .eq(\'organization_id\') pour construire la liste des restaurants sur laquelle il bornera ensuite les autres tables.' },
  { table: 'salaries', fichiers: ['orgscope.js'], motif: 'Amorçage du helper lui-même : même raison, pour construire la liste des salariés de l\'organisation active.' }
];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 1. CLASSEMENT DES TABLES ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Le classement doit refléter le schéma RÉEL. Ces valeurs ont été lues en base le 2026-08-12.
t('salaries est bornée par organization_id', Scope.portee('salaries') === 'org');
t('planning_creneaux est bornée par le restaurant (aucune colonne organization_id)',
  Scope.portee('planning_creneaux') === 'resto');
// Le piège : salarie_roles PORTE une colonne restaurant_id, mais elle est NULL sur les 42 lignes.
// Filtrer dessus renverrait zéro ligne et effacerait les rôles de tous les salariés.
t('salarie_roles est bornée par le SALARIÉ, pas par restaurant_id (NULL sur les 42 lignes)',
  Scope.portee('salarie_roles') === 'salarie');
t('pointages est bornée par le salarié, comme sa politique RLS', Scope.portee('pointages') === 'salarie');
t('salarie_dispos / documents / contraintes sont bornées par le salarié',
  ['salarie_dispos', 'salarie_documents', 'salarie_contraintes'].every(x => Scope.portee(x) === 'salarie'));
t('organizations est volontairement NON bornée (le sélecteur doit toutes les lister)',
  Scope.portee('organizations') === 'globale' && !!Scope.exceptions().organizations);
t('chaque table non bornée porte une justification écrite',
  Object.values(Scope.exceptions()).every(v => typeof v === 'string' && v.length > 40),
  JSON.stringify(Object.keys(Scope.exceptions())));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2. FAIL-CLOSED : rien ne passe avant init() ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Un helper qui laisserait passer une requête non filtrée en cas de problème serait pire que pas de
// helper : il aurait l'air sûr ici et fuirait en production.
{
  let leve = false;
  try { Scope.from('salaries'); } catch (e) { leve = true; }
  // from() seul ne lève pas (pas de client) — c'est select() qui borne. On teste via un faux client.
  const faux = { from: () => ({ select: () => ({ eq: () => ({}), in: () => ({}) }) }) };
  Scope.__test_sb = faux;
  t('le helper n\'est pas prêt tant qu\'init() n\'a pas été appelé', Scope.pret() === false);
}

// Faux client Supabase : enregistre les filtres appliqués au lieu d'appeler le réseau.
function fauxClient(jeu) {
  const journal = [];
  const q = (table, rows) => {
    const st = { table, filtres: [], rows: rows.slice() };
    const api = {
      eq(col, val) { st.filtres.push(['eq', col, val]); st.rows = st.rows.filter(r => r[col] === val); return api; },
      in(col, vals) { st.filtres.push(['in', col, vals]); st.rows = st.rows.filter(r => vals.includes(r[col])); return api; },
      order() { return api; }, gte() { return api; }, limit() { return api; },
      then(res) { journal.push(st); return Promise.resolve({ data: st.rows, error: null }).then(res); }
    };
    return api;
  };
  return {
    journal,
    from(table) {
      return {
        select: () => q(table, jeu[table] || []),
        update: () => q(table, jeu[table] || []),
        delete: () => q(table, jeu[table] || []),
        insert: rows => { journal.push({ table, insert: rows }); return Promise.resolve({ data: rows, error: null }); },
        upsert: rows => { journal.push({ table, upsert: rows }); return Promise.resolve({ data: rows, error: null }); }
      };
    }
  };
}

// ── Le scénario RÉEL du patron, avec les effectifs réels lus en base ──────────────────────────
const RAYA = 'dc0a81a8-60ec-437f-8aa6-e43b8e2b1978';   // Groupe Raya  — 32 salariés actifs
const METZ = 'ce1f350a-26ba-471b-9d12-95fb37ac87fc';   // Raya Metz    —  7 salariés actifs
const JEU = {
  salaries: [].concat(
    Array.from({ length: 32 }, (_, i) => ({ id: 'raya-s' + i, organization_id: RAYA, actif: true })),
    Array.from({ length: 7 }, (_, i) => ({ id: 'metz-s' + i, organization_id: METZ, actif: true }))),
  restaurants: [].concat(
    Array.from({ length: 3 }, (_, i) => ({ id: 'raya-r' + i, organization_id: RAYA })),
    [{ id: 'metz-r0', organization_id: METZ }]),
  planning_creneaux: [].concat(
    Array.from({ length: 20 }, (_, i) => ({ id: 'c' + i, restaurant_id: 'raya-r0' })),
    Array.from({ length: 5 }, (_, i) => ({ id: 'm' + i, restaurant_id: 'metz-r0' }))),
  salarie_roles: [].concat(
    Array.from({ length: 40 }, (_, i) => ({ id: 'sr' + i, salarie_id: 'raya-s0', restaurant_id: null })),
    Array.from({ length: 2 }, (_, i) => ({ id: 'mr' + i, salarie_id: 'metz-s0', restaurant_id: null }))),
  factures: [{ id: 'f1', organization_id: RAYA }, { id: 'f2', organization_id: METZ }]
};

async function main() {
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n── 3. LE SCÉNARIO DU PATRON — 39 devient 7, puis 32 ──');
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  {
    const sb = fauxClient(JEU);
    await Scope.init(sb, METZ, { nom: 'Raya Metz', role: 'super_admin', banniere: false });
    const { data } = await Scope.from('salaries').select('*');
    t('super_admin basculé sur Raya Metz : 7 salariés, et non 39', data.length === 7, data.length + ' lignes');
    const f = sb.journal.find(x => x.table === 'salaries' && x.filtres);
    t('la requête porte bien un filtre explicite sur organization_id',
      f && f.filtres.some(([op, col, v]) => op === 'eq' && col === 'organization_id' && v === METZ),
      JSON.stringify(f && f.filtres));
  }
  {
    const sb = fauxClient(JEU);
    await Scope.init(sb, RAYA, { nom: 'Groupe Raya', role: 'super_admin', banniere: false });
    const { data } = await Scope.from('salaries').select('*');
    t('retour sur Groupe Raya : 32 salariés', data.length === 32, data.length + ' lignes');
    const { data: fac } = await Scope.from('factures').select('*');
    t('les factures suivent la même bascule', fac.length === 1 && fac[0].id === 'f1', JSON.stringify(fac));
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n── 4. TABLES SANS organization_id ──');
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  {
    const sb = fauxClient(JEU);
    await Scope.init(sb, METZ, { nom: 'Raya Metz', role: 'super_admin', banniere: false });
    const { data: cre } = await Scope.from('planning_creneaux').select('*');
    t('les créneaux sont bornés par les restaurants de l\'organisation (5, pas 25)',
      cre.length === 5, cre.length + ' lignes');
    const { data: sr } = await Scope.from('salarie_roles').select('*');
    t('les rôles sont bornés par le salarié — 2, et surtout PAS 0',
      sr.length === 2, sr.length + ' lignes');
    const j = sb.journal.find(x => x.table === 'salarie_roles');
    t('le filtre des rôles porte sur salarie_id, jamais sur restaurant_id (NULL partout)',
      j && j.filtres.some(([op, col]) => op === 'in' && col === 'salarie_id')
        && !j.filtres.some(([, col]) => col === 'restaurant_id'), JSON.stringify(j && j.filtres));
  }
  // Organisation sans restaurant : doit voir ZÉRO ligne, jamais toutes.
  {
    const sb = fauxClient(JEU);
    await Scope.init(sb, 'org-vide', { nom: 'Org vide', role: 'super_admin', banniere: false });
    const { data } = await Scope.from('planning_creneaux').select('*');
    t('organisation sans restaurant : zéro créneau (fermé), pas la totalité', data.length === 0, data.length + '');
    const j = sb.journal.find(x => x.table === 'planning_creneaux');
    t('une liste vide est bornée par un UUID sentinelle, jamais par .in(col, [])',
      j && j.filtres.some(([op, col, v]) => op === 'in' && col === 'restaurant_id' && v.length === 1),
      JSON.stringify(j && j.filtres));
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n── 5. ÉCRITURES ──');
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  {
    const sb = fauxClient(JEU);
    await Scope.init(sb, METZ, { nom: 'Raya Metz', role: 'super_admin', banniere: false });
    await Scope.from('salaries').insert({ nom: 'X' });
    const ins = sb.journal.find(x => x.insert);
    t('un insert est estampillé avec l\'organisation active',
      ins && ins.insert.organization_id === METZ, JSON.stringify(ins && ins.insert));
    const { data } = await Scope.from('salaries').update({ actif: false });
    t('un update porte la borne de l\'organisation (aucune ligne d\'une autre org atteinte)',
      data.every(r => r.organization_id === METZ), data.length + ' lignes');

    // Garde-fou : l'enregistrement visé est en mémoire, le refus doit être VISIBLE.
    const alertes = [];
    global.alert = m => alertes.push(m);
    t('modifier un salarié de Groupe Raya depuis Raya Metz est REFUSÉ',
      Scope.verifierAppartenance({ id: 'x', organization_id: RAYA }, 'Ce salarié') === false);
    t('le refus est affiché à l\'utilisateur, pas silencieux',
      alertes.length === 1 && /refus/i.test(alertes[0]), JSON.stringify(alertes));
    t('modifier un salarié de l\'organisation active est permis',
      Scope.verifierAppartenance({ id: 'y', organization_id: METZ }) === true);
    t('une création (aucun enregistrement visé) est permise', Scope.verifierAppartenance(null) === true);
    t('un enregistrement rattaché à un restaurant d\'une autre organisation est refusé',
      Scope.verifierAppartenance({ id: 'z', restaurant_id: 'raya-r0' }) === false);
    t('un enregistrement rattaché à un salarié d\'une autre organisation est refusé',
      Scope.verifierAppartenance({ id: 'w', salarie_id: 'raya-s1' }) === false);
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n── 6. CONTRÔLE DE CODE — aucune lecture non bornée ne doit subsister ──');
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  const fichiers = [];
  (function walk(dir, rel) {
    for (const f of fs.readdirSync(dir)) {
      if (f === 'node_modules' || f === '.git' || f === 'tests' || f === 'migrations') continue;
      const p = path.join(dir, f), r = rel ? rel + '/' + f : f;
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p, r);
      else if (f.endsWith('.html') || f.endsWith('.js')) fichiers.push({ p, r });
    }
  })(ROOT, '');

  const bornees = new Set(Scope.tablesBornees());
  // Scanner isolé pour être exerçable sur une source de test : c'est ce qui prouve qu'il ÉCHOUE
  // vraiment sur une requête sans filtre, plutôt que de passer au vert parce qu'il ne trouve rien.
  function scanner(source, rel) {
    // On retire les commentaires : plusieurs citent volontairement « sb.from('salaries') » pour
    // expliquer la correction, et feraient échouer une recherche naïve.
    const src = source.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map(l => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n');
    const res = { total: 0, tolerees: 0, manques: [] };
    const re = /sb\s*\.\s*from\(\s*'([a-z_0-9]+)'\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      const table = m[1];
      if (!bornees.has(table)) continue;                       // classe D ou table hors modèle
      res.total++;
      const suite = src.slice(m.index + m[0].length, m.index + m[0].length + 220);
      const tol = APPELS_TOLERES.find(x => x.table === table
        && (!x.fichiers || x.fichiers.includes(rel))
        && (!x.suite || x.suite.test(suite)));
      if (tol) { res.tolerees++; continue; }
      res.manques.push(rel + ':' + src.slice(0, m.index).split('\n').length + '  sb.from(\'' + table + '\')');
    }
    return res;
  }

  // ── Le harnais doit ÉCHOUER sur une requête sans filtre — vérifié, pas supposé ────────────────
  t('une lecture non bornée réintroduite est DÉTECTÉE',
    scanner("const {data} = await sb.from('salaries').select('*').order('nom');", 'faux.html').manques.length === 1);
  t('la même lecture passée par le point d\'accès borné ne l\'est pas',
    scanner("const {data} = await EatimeScope.from('salaries').select('*').order('nom');", 'faux.html').manques.length === 0);
  t('une table non rattachée à une organisation reste libre',
    scanner("await sb.from('organizations').select('*');", 'faux.html').manques.length === 0);
  t('la tolérance est CIBLÉE : le propre profil passe, la liste des utilisateurs non',
    scanner("await sb.from('profiles').select('*').eq('id',u.id);", 'faux.html').manques.length === 0 &&
    scanner("await sb.from('profiles').select('*').order('nom');", 'faux.html').manques.length === 1);
  // Le trou de la première version : « profiles suivi de .eq('id') » tolérait aussi les ÉCRITURES,
  // donc la suppression d'un utilisateur d'une autre organisation.
  t('supprimer un utilisateur par son id n\'est PAS toléré (c\'est une écriture)',
    scanner("await sb.from('profiles').delete().eq('id',id);", 'faux.html').manques.length === 1);
  t('modifier un utilisateur par son id n\'est PAS toléré non plus',
    scanner("await sb.from('profiles').update({role:'admin'}).eq('id',id);", 'faux.html').manques.length === 1);
  t('la bascule d\'organisation reste tolérée, et seulement dans l\'écran Paramètres',
    scanner("await sb.from('profiles').update({organization_id:id}).eq('id',ME.id);", 'parametres/index.html').manques.length === 0 &&
    scanner("await sb.from('profiles').update({organization_id:id}).eq('id',ME.id);", 'salaries/index.html').manques.length === 1);
  t('un commentaire citant sb.from() ne déclenche pas de faux positif',
    scanner("// exemple : sb.from('salaries').select('*')\nconst x=1;", 'faux.html').manques.length === 0);

  const manques = [];
  let total = 0, tolerees = 0;
  for (const { p, r } of fichiers) {
    const dossier = r.includes('/') ? r.split('/')[0] : '';
    if (DOSSIERS_EXEMPTS[dossier]) continue;
    const res = scanner(fs.readFileSync(p, 'utf8'), r);
    total += res.total; tolerees += res.tolerees; manques.push(...res.manques);
  }
  console.log('   ' + total + ' appels directs à une table bornée · ' + tolerees + ' tolérés · ' + manques.length + ' à corriger');
  if (manques.length) {
    const parFichier = {};
    manques.forEach(x => { const f = x.split(':')[0]; (parFichier[f] = parFichier[f] || []).push(x); });
    Object.entries(parFichier).sort((a, b) => b[1].length - a[1].length)
      .forEach(([f, l]) => console.log('     ' + String(l.length).padStart(3) + '  ' + f));
  }
  t('aucune lecture directe d\'une table rattachée à une organisation',
    manques.length === 0, manques.length + ' appel(s) — détail ci-dessus');
  t('chaque module exempté porte une justification écrite',
    Object.values(DOSSIERS_EXEMPTS).every(v => v.length > 40));
  t('chaque appel toléré porte une justification écrite',
    APPELS_TOLERES.every(x => x.motif && x.motif.length > 40));

  console.log('\n' + (ok ? '✅' : '❌') + ' orgscope_test — ' + n + ' vérifications');
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.log('FAIL · exception : ' + e.message); console.log(e.stack); process.exit(1); });

// Harnais d'accès par module — permissions individuelles (exceptions par utilisateur).
//
// Ce que ce harnais garantit, HORS LIGNE (aucune base, aucun réseau) :
//   A. le vrai access.js (chargé, pas réimplémenté) donne le verdict attendu sur tests/cas_acces.json ;
//   B. la table DEFAULT_PERMS de access.js et celle de module_access_decide() en SQL sont identiques
//      (extraction du texte de la migration v6.30, comparaison clé par clé) ;
//   C. l'ORDRE des règles est le même des deux côtés (super_admin → rôle inconnu → exception → org → défaut) ;
//   D. AUCUNE page du dépôt n'appelle canAccessModule avec un rôle nu — sinon les exceptions
//      seraient ignorées et un accès refusé serait quand même accordé ;
//   E. toute page qui appelle canAccessModule lit bien `module_exceptions` dans son select de profil
//      (un select à colonnes explicites sans cette colonne = exceptions `undefined` = accès accordé
//      à tort, en silence — exactement le piège « réglage jamais lu à l'exécution ») ;
//   F. l'écran Paramètres liste les mêmes modules que DEFAULT_PERMS.
//
// Ce qu'il ne peut PAS faire : exécuter le SQL. La parité de verdict côté base se prouve avec
// scripts/parite_acces_sql.js (même fichier de cas, exécuté en base). Voir tests/README.md.
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
let ok = true;
const t = (label, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label + (cond || detail === undefined ? '' : '  → ' + detail));
  ok = cond && ok;
};

// ── Chargement du VRAI access.js (il s'auto-installe sur globalThis hors navigateur) ──
require(path.join(RACINE, 'access.js'));
const A = globalThis.EatimeAccess;
if (!A || typeof A.effectiveAccess !== 'function') {
  console.log('FAIL · access.js ne fournit pas effectiveAccess\nSOME FAILED');
  process.exit(1);
}

// ══════════ A. Les cas communs, à travers le vrai effectiveAccess ══════════
const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'cas_acces.json'), 'utf8')).cas;
console.log('── A. ' + CAS.length + ' cas communs (tests/cas_acces.json) via le vrai access.js ──');
let casKo = 0;
CAS.forEach(c => {
  // Le profil tel que le navigateur le reçoit : rôle + exceptions tri-état.
  const profil = { role: c.role, module_exceptions: c.exception === null ? {} : { [c.module]: c.exception } };
  const obtenu = A.canAccessModule(c.module, profil, c.perms);
  if (obtenu !== c.attendu) { casKo++; console.log('  FAIL · ' + c.nom + ' → attendu ' + c.attendu + ', obtenu ' + obtenu); }
});
t('les ' + CAS.length + ' cas communs donnent le verdict attendu', casKo === 0, casKo + ' cas en écart');

// Tri-état : une valeur non booléenne doit être traitée comme « hérité », jamais comme « refusé ».
t('tri-état — exception absente = hérité (manager garde planning)',
  A.canAccessModule('planning', { role: 'manager', module_exceptions: {} }, null) === true);
t('tri-état — exception à null = hérité, pas refusé',
  A.canAccessModule('planning', { role: 'manager', module_exceptions: { planning: null } }, null) === true);
t('tri-état — valeur parasite (chaîne) = hérité, pas autorisé',
  A.canAccessModule('facturation', { role: 'manager', module_exceptions: { facturation: 'oui' } }, null) === false);
t('tri-état — module_exceptions absent du profil (page non migrée en base) = hérité',
  A.canAccessModule('planning', { role: 'manager' }, null) === true);

// La source affichée à l'administrateur doit dire d'où vient l'accès.
const d1 = A.describeAccess('facturation', { role: 'manager', module_exceptions: { facturation: true } }, null);
const d2 = A.describeAccess('planning', { role: 'manager', module_exceptions: {} }, null);
const d3 = A.describeAccess('salaries', { role: 'manager', module_exceptions: {} }, null);
t('describeAccess — « autorisé (exception) »', d1.allowed && d1.source === 'exception' && d1.texte === 'autorisé (exception)', d1.texte);
t('describeAccess — « autorisé (rôle manager) »', d2.allowed && d2.source === 'defaut' && d2.texte === 'autorisé (rôle manager)', d2.texte);
t('describeAccess — « refusé (rôle) »', !d3.allowed && d3.texte === 'refusé (rôle)', d3.texte);

// canAccessModule DOIT être la simple projection d'effectiveAccess (exigence « une seule logique »).
let projectionOk = true;
CAS.forEach(c => {
  const profil = { role: c.role, module_exceptions: c.exception === null ? {} : { [c.module]: c.exception } };
  if (A.canAccessModule(c.module, profil, c.perms) !== A.effectiveAccess(c.module, profil, c.perms).allowed) projectionOk = false;
});
t('canAccessModule === effectiveAccess().allowed sur tous les cas', projectionOk);

// ══════════ B + C. Parité STRUCTURELLE avec l'implémentation SQL ══════════
console.log('── B/C. Parité structurelle avec migrations/v6.30 (SQL) ──');
const SQL = fs.readFileSync(path.join(RACINE, 'migrations', 'v6.30_permissions_individuelles.sql'), 'utf8');
const corps = SQL.slice(SQL.indexOf('create or replace function public.module_access_decide'),
                        SQL.indexOf('-- ───────────── 3. has_module_access'));
t('le corps de module_access_decide est bien trouvé dans la migration', corps.length > 200);

// B. Table des défauts : `when 'module' then array['a','b']` → comparée clé par clé à DEFAULT_PERMS.
const defautsSql = {};
for (const m of corps.matchAll(/when\s+'([^']+)'\s+then\s+array\[([^\]]*)\]/g)) {
  defautsSql[m[1]] = m[2].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}
const clesJs = Object.keys(A.DEFAULT_PERMS).sort();
const clesSql = Object.keys(defautsSql).sort();
t('DEFAULT_PERMS — mêmes modules des deux côtés (' + clesJs.length + ')',
  JSON.stringify(clesJs) === JSON.stringify(clesSql),
  'JS=' + clesJs.join(',') + ' | SQL=' + clesSql.join(','));
let rolesKo = [];
clesJs.forEach(k => {
  const a = (A.DEFAULT_PERMS[k] || []).slice().sort();
  const b = (defautsSql[k] || []).slice().sort();
  if (JSON.stringify(a) !== JSON.stringify(b)) rolesKo.push(k + ' (JS=' + a.join('|') + ' SQL=' + b.join('|') + ')');
});
t('DEFAULT_PERMS — mêmes rôles pour chaque module', rolesKo.length === 0, rolesKo.join(' ; '));

// Le défaut du `else` SQL (module inconnu) doit valoir celui de JS (DEFAULT_PERMS[inconnu] → []).
const elseSql = (corps.match(/else\s+array\[([^\]]*)\]/) || [null, ''])[1]
  .split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
t('module inconnu — échec fermé des deux côtés (aucun rôle, sauf super_admin)',
  elseSql.length === 0
  && A.canAccessModule('zzz-inconnu', { role: 'admin', module_exceptions: {} }, null) === false
  && A.canAccessModule('zzz-inconnu', { role: 'manager', module_exceptions: {} }, null) === false
  && A.canAccessModule('zzz-inconnu', { role: 'super_admin', module_exceptions: {} }, null) === true,
  'else SQL = [' + elseSql.join('|') + ']');

// C. Ordre des règles : la position relative des 4 étapes doit être la même des deux côtés.
const posSuper = corps.indexOf("p_role = 'super_admin'");
const posNull  = corps.indexOf('p_role is null');
const posExc   = corps.indexOf('p_exception is true');
const posOrg   = corps.indexOf('p_perms ? p_module');
const posDef   = corps.indexOf('v_default := case');
t('ordre SQL : super_admin → rôle inconnu → exception → perms org → défaut',
  posSuper >= 0 && posSuper < posNull && posNull < posExc && posExc < posOrg && posOrg < posDef);
// Même ordre côté JS, vérifié par le comportement et non par le texte :
t('ordre JS — super_admin ignore l’exception refusant',
  A.canAccessModule('facturation', { role: 'super_admin', module_exceptions: { facturation: false } }, { facturation: [] }) === true);
t('ordre JS — l’exception prime sur les permissions de l’organisation',
  A.canAccessModule('facturation', { role: 'manager', module_exceptions: { facturation: true } }, { facturation: [] }) === true
  && A.canAccessModule('facturation', { role: 'manager', module_exceptions: { facturation: false } }, { facturation: ['*'] }) === false);
t('ordre JS — les permissions de l’organisation priment sur le défaut du module',
  A.canAccessModule('facturation', { role: 'manager', module_exceptions: {} }, { facturation: ['manager'] }) === true);

// ══════════ D + E. Aucune page ne peut ignorer les exceptions en silence ══════════
console.log('── D/E. Câblage réel des pages du dépôt ──');
const PAGES = fs.readdirSync(RACINE)
  .flatMap(e => {
    const p = path.join(RACINE, e);
    if (e === 'index.html') return [e];
    try { if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'index.html'))) return [e + '/index.html']; } catch (_) {}
    return [];
  })
  .filter(f => fs.readFileSync(path.join(RACINE, f), 'utf8').includes('EatimeAccess.canAccessModule'));

t('des pages appelant canAccessModule sont bien trouvées', PAGES.length >= 14, PAGES.length + ' page(s)');

// D. Un appel passant `X.role` au lieu du profil ignorerait les exceptions.
const roleNu = PAGES.filter(f => /canAccessModule\([^)]*\.role\s*,/.test(fs.readFileSync(path.join(RACINE, f), 'utf8')));
t('aucune page n’appelle canAccessModule avec un rôle nu', roleNu.length === 0, roleNu.join(', '));

// E. Le profil chargé par la page doit contenir module_exceptions (sinon exceptions = undefined).
const sansColonne = PAGES.filter(f => {
  const src = fs.readFileSync(path.join(RACINE, f), 'utf8');
  // Les selects de profil de la page : `.from('profiles').select('…')`
  const selects = [...src.matchAll(/from\('profiles'\)\s*\.\s*select\('([^']*)'\)/g)].map(m => m[1]);
  if (!selects.length) return true;                       // aucune lecture de profil = suspect
  // Au moins un select doit ramener la colonne : soit '*', soit la colonne nommée.
  return !selects.some(s => s.trim() === '*' || /\bmodule_exceptions\b/.test(s));
});
t('toute page appelant canAccessModule lit bien module_exceptions', sansColonne.length === 0, sansColonne.join(', '));

// ══════════ F. L'écran Paramètres couvre exactement les modules connus ══════════
const PARAM = fs.readFileSync(path.join(RACINE, 'parametres', 'index.html'), 'utf8');
const mListe = PARAM.match(/const MODULES_LIST=\[([^\]]*)\]/);
const modulesUi = mListe ? mListe[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean).sort() : [];
t('Paramètres liste exactement les modules de DEFAULT_PERMS',
  JSON.stringify(modulesUi) === JSON.stringify(clesJs),
  'UI=' + modulesUi.join(',') + ' | DEFAULT_PERMS=' + clesJs.join(','));

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);

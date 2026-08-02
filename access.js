// Eatime360 — contrôle d'accès par module : SOURCE DE VÉRITÉ UNIQUE.
// Chargé via <script src="access.js"> (racine) ou <script src="../access.js"> (page module),
// dans le <head>, AVANT le script inline de la page.
//
// Historique du bug corrigé : il existait deux logiques déconnectées — index.html (portail)
// lisait ORG.permissions pour afficher/masquer les CARTES, mais chaque page de module faisait
// SA PROPRE vérification de rôle codée en dur, qui n'interrogeait jamais ORG.permissions. Résultat :
// un manager pouvait être bloqué sur un module où l'admin lui avait donné accès, ou entrer par URL
// directe sur un module dont on lui avait retiré l'accès (la carte était juste masquée). Désormais
// le portail ET chaque page passent par `canAccessModule` ci-dessous → un seul comportement.
(function (g) {
  'use strict';

  // Permissions par défaut si l'org n'a rien configuré pour un module donné (fallback PAR MODULE,
  // pas tout-ou-rien : une clé absente de ORG.permissions retombe ici ; une clé présente mais vide
  // [] est respectée = accès retiré volontairement). '*' = tous les rôles connectés.
  const DEFAULT_PERMS = {
    moi: ['*'],
    'import-contrats': ['admin', 'manager'], // gère aussi bulk-upload-contrats (même permission)
    salaries: ['admin'],
    calendrier: ['admin', 'manager'],
    avertissements: ['admin'],
    pilotage: ['admin', 'manager'],
    planning: ['admin', 'manager'],
    badgeuse: ['*'],
    dispos: ['*'],
    haccp: ['admin', 'manager'],
    'haccp-kiosk': ['*'],
    finance: ['admin'],
    stock: ['admin', 'manager'],
    'stock-kiosk': ['*'],
    facturation: ['admin'],
    parametres: ['admin'],
  };

  // Décide si un rôle a accès à un module, exactement comme le portail.
  //  - super_admin passe toujours (bypass total, comme dans index.html).
  //  - si ORG.permissions définit explicitement le module (même []), c'est cette valeur qui prime.
  //  - sinon on retombe sur DEFAULT_PERMS[moduleId] (fallback par module → pas de régression quand
  //    une org a des permissions sauvegardées AVANT que ce module soit configurable).
  // Une valeur malformée (chaîne, objet, null) vaut « aucun rôle autorisé » et NON « on essaie
  // quand même » : sans le Array.isArray, `'admin'.includes('admin')` renvoie true et une valeur
  // corrompue accorderait l'accès. Même verdict que module_access_decide() en base (jsonb_typeof).
  function rolesFor(moduleId, orgPermissions) {
    if (orgPermissions && Object.prototype.hasOwnProperty.call(orgPermissions, moduleId)) {
      const v = orgPermissions[moduleId];
      return Array.isArray(v) ? v : [];
    }
    const d = DEFAULT_PERMS[moduleId];
    return Array.isArray(d) ? d : [];   // module inconnu → aucun rôle (échec fermé)
  }

  // Exception individuelle (profiles.module_exceptions) — TROIS états, jamais deux :
  //   true  = autorisé explicitement · false = refusé explicitement · absent/null/autre = hérité.
  // Comparaisons strictes obligatoires : `if (exceptions[m])` confondrait « refusé » et « hérité ».
  function exceptionFor(moduleId, exceptions) {
    if (!exceptions || typeof exceptions !== 'object') return null;
    const v = exceptions[moduleId];
    if (v === true) return true;
    if (v === false) return false;
    return null;
  }

  // SOURCE DE VÉRITÉ UNIQUE de la décision d'accès, côté navigateur. Doit rester identique à
  // `module_access_decide()` en Postgres (migration v6.30) — la parité est vérifiée par
  // tests/acces_test.js (structurel, hors ligne) et scripts/parite_acces_sql.js (exécuté en base).
  //
  // Ordre de décision, du plus fort au plus faible :
  //   1. super_admin       → toujours autorisé, jamais concerné par les exceptions ;
  //   2. exception         → l'exception individuelle prime sur le rôle, dans les deux sens ;
  //   3. permissions org   → la liste de rôles configurée par l'organisation pour ce module ;
  //   4. défaut du module  → DEFAULT_PERMS.
  //
  // Renvoie { allowed, source, roles } où `source` sert à l'écran Paramètres pour dire D'OÙ vient
  // l'accès : 'super_admin' | 'exception' | 'org' | 'defaut'.
  function effectiveAccess(moduleId, profileOrRole, orgPermissions) {
    const isProfile = profileOrRole && typeof profileOrRole === 'object';
    const role = isProfile ? profileOrRole.role : profileOrRole;
    // Un appel à l'ancienne signature (rôle nu) ignorerait les exceptions → accès accordé à tort
    // quand une exception le refuse. On ne peut pas échouer fermé (page blanche en prod), donc on
    // crie dans la console ; tests/acces_test.js interdit ce cas dans le dépôt.
    if (!isProfile && typeof console !== 'undefined' && console.warn) {
      console.warn('[EatimeAccess] canAccessModule appelé avec un rôle nu (« ' + role + ' ») au lieu du profil : '
        + 'les exceptions individuelles sont IGNORÉES pour le module « ' + moduleId + ' ».');
    }
    if (role === 'super_admin') return { allowed: true, source: 'super_admin', roles: null };
    // Rôle inconnu → refus, AVANT toute autre règle (échec fermé : sans ça un rôle absent
    // obtiendrait les modules ouverts à '*'). Identique au garde-fou de module_access_decide().
    if (role === null || role === undefined || role === '') return { allowed: false, source: 'role-inconnu', roles: null };

    const exc = exceptionFor(moduleId, isProfile ? profileOrRole.module_exceptions : null);
    if (exc === true) return { allowed: true, source: 'exception', roles: null };
    if (exc === false) return { allowed: false, source: 'exception', roles: null };

    const rs = rolesFor(moduleId, orgPermissions);
    const fromOrg = !!(orgPermissions && Object.prototype.hasOwnProperty.call(orgPermissions, moduleId));
    return { allowed: rs.includes('*') || rs.includes(role), source: fromOrg ? 'org' : 'defaut', roles: rs };
  }

  // Le booléen utilisé par le portail et par chaque page module. Simple projection d'effectiveAccess :
  // impossible que les deux divergent (exigence « une seule logique »).
  // `profileOrRole` : passer le PROFIL complet (il porte module_exceptions). Un rôle nu reste accepté
  // pour ne pas casser une page oubliée, mais il ignore les exceptions et journalise un avertissement.
  function canAccessModule(moduleId, profileOrRole, orgPermissions) {
    return effectiveAccess(moduleId, profileOrRole, orgPermissions).allowed;
  }

  const ROLE_LABELS = { super_admin: 'super admin', admin: 'admin', manager: 'manager', salarie: 'salarié' };

  // Phrase lisible par un administrateur : « autorisé (exception) », « autorisé (rôle manager) »,
  // « refusé (rôle) ». Utilisée par Paramètres › Utilisateurs pour montrer le RÉSULTAT, pas le réglage.
  function describeAccess(moduleId, profileOrRole, orgPermissions) {
    const eff = effectiveAccess(moduleId, profileOrRole, orgPermissions);
    const role = (profileOrRole && typeof profileOrRole === 'object') ? profileOrRole.role : profileOrRole;
    const rl = ROLE_LABELS[role] || role || '—';
    let why;
    if (eff.source === 'super_admin') why = 'super admin';
    else if (eff.source === 'exception') why = 'exception';
    else if (eff.allowed) why = 'rôle ' + rl;
    else why = 'rôle';
    return Object.assign({}, eff, { texte: (eff.allowed ? 'autorisé' : 'refusé') + ' (' + why + ')' });
  }

  // Remplit un élément (ou document.body) avec un écran "accès refusé" standard + lien portail.
  // Utilisé par les pages module quand canAccessModule renvoie false.
  function renderAccessDenied(moduleLabel) {
    return '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px;text-align:center;background:var(--bg,#0b0b15);color:var(--text,#e8e8ec)">'
      + '<div style="font-size:54px;margin-bottom:14px">⛔</div>'
      + '<div style="color:var(--bad,#c45a5a);font-size:20px;font-weight:700;margin-bottom:8px">Accès non autorisé</div>'
      + '<div style="color:var(--muted,#7b7b8a);max-width:420px;font-size:14px;line-height:1.5;margin-bottom:22px">Tu n’as pas accès à ce module (' + (moduleLabel || '') + ').<br>Demande à un administrateur de t’ajouter dans Paramètres › Permissions.</div>'
      + '<a href="../" style="padding:10px 18px;border-radius:10px;border:1px solid var(--line-2,rgba(255,255,255,.14));color:var(--text,#e8e8ec);font-weight:600;font-size:13px;text-decoration:none">↩ Retour au portail</a>'
      + '</div>';
  }

  // ── MOTIF D'UNE ABSENCE : donnée SENSIBLE, jamais visible par les collègues ────────────────────
  // Le motif d'une indisponibilité mélange le TYPE d'absence et un commentaire libre. Un « arrêt
  // maladie » est une donnée de santé (catégorie particulière au sens du RGPD) ; une « absence
  // injustifiée » est une information disciplinaire, affichée avant même que le salarié ait été
  // entendu. Ni l'une ni l'autre ne regarde l'équipe : savoir QUE quelqu'un est absent suffit à
  // comprendre l'organisation, c'est le seul besoin légitime.
  //
  // Ce n'est délibérément PAS un réglage : aucun restaurateur n'a de raison légitime d'exposer
  // l'état de santé d'un salarié à ses collègues, et lui laisser le choix reviendrait à lui offrir
  // la possibilité de se mettre en faute. L'application tranche.
  //
  // ⚠ La règle ne se déduit PAS de l'accès au module : un salarié peut recevoir l'accès au planning
  // par exception individuelle sans avoir à connaître les motifs de ses collègues. On tranche donc
  // sur le RÔLE, plus le cas « sa propre absence ».
  //   encadrement (super_admin / admin / manager) → motif visible
  //   salarié sur SA propre absence               → motif visible
  //   tout le reste                               → libellé neutre
  // Le PDF, lui, est expurgé SANS CONDITION : il est imprimé et affiché en salle (voir planning).
  const ROLES_ENCADREMENT = ['super_admin', 'admin', 'manager'];
  function canSeeAbsenceMotif(profile, salarieId) {
    if (!profile) return false;
    if (ROLES_ENCADREMENT.indexOf(profile.role) >= 0) return true;
    // Sa propre absence : on exige les deux identifiants non vides, sinon deux null se « valent ».
    return !!(salarieId && profile.salarie_id && profile.salarie_id === salarieId);
  }

  g.EatimeAccess = { DEFAULT_PERMS, canAccessModule, effectiveAccess, exceptionFor, describeAccess, rolesFor, renderAccessDenied, canSeeAbsenceMotif, ROLES_ENCADREMENT };
})(typeof window !== 'undefined' ? window : globalThis);

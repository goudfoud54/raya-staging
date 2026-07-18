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
  function rolesFor(moduleId, orgPermissions) {
    if (orgPermissions && Object.prototype.hasOwnProperty.call(orgPermissions, moduleId)) {
      return orgPermissions[moduleId] || [];
    }
    return DEFAULT_PERMS[moduleId] || [];
  }

  function canAccessModule(moduleId, role, orgPermissions) {
    if (role === 'super_admin') return true;
    const rs = rolesFor(moduleId, orgPermissions);
    return rs.includes('*') || rs.includes(role);
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

  g.EatimeAccess = { DEFAULT_PERMS, canAccessModule, rolesFor, renderAccessDenied };
})(window);

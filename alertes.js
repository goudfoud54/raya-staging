// alertes.js — ÉTAT LISIBLE des alertes (stock / retard). SOURCE UNIQUE, partagée front + harnais.
// Objectif : le silence d'une alerte ne doit JAMAIS être ambigu. Une alerte non opérationnelle
// (inactive, ou active sans destinataire) doit se déclarer elle-même, partout où elle est visible.
// Aucune dépendance DOM/réseau ici → testable par harnais Node.
(function (g) {
  'use strict';

  // Renvoie l'état d'une config d'alerte, prêt à afficher.
  //   cfg  : ligne stock_alertes_config / retard_alertes_config, ou null/undefined si aucune ligne.
  //   type : 'stock' | 'retard'.
  // severite : 'absente' (aucune config) · 'inactive' (case décochée) · 'sans_dest' (active mais
  //            aucun destinataire → rien ne part) · 'ok' (active + au moins un destinataire).
  function etatAlerte(cfg, type) {
    const t = type === 'retard' ? 'retard' : 'stock';
    if (!cfg) return { severite: 'absente', active: false, canaux: [], label: 'non configurée — aucune alerte ne partira' };

    const canaux = [];
    if (cfg.email_alerte) canaux.push('email');
    if (cfg.wa_groupe_id) canaux.push('WhatsApp');
    if (t === 'retard' && cfg.notif_salarie) canaux.push('push salarié');

    const active = cfg.actif === true;
    const heure = t === 'stock' ? String(cfg.heure_check || '22:30').slice(0, 5) : null;

    if (!active) {
      return { severite: 'inactive', active: false, canaux,
        label: 'inactive' + (canaux.length ? ' (destinataires renseignés, mais case décochée)' : '') };
    }
    if (!canaux.length) {
      return { severite: 'sans_dest', active: true, canaux: [],
        label: 'active mais AUCUN destinataire — rien ne partira' };
    }
    return { severite: 'ok', active: true, canaux,
      label: 'active — ' + canaux.join(' + ') + (heure ? ' · ' + heure : '') };
  }

  // true si l'alerte est réellement opérationnelle (active + au moins un destinataire).
  function alerteOperationnelle(cfg, type) { return etatAlerte(cfg, type).severite === 'ok'; }

  // Agrège sur les restaurants ACTIFS : liste ceux dont au moins une alerte n'est pas opérationnelle.
  // stockCfgByResto / retardCfgByResto : objets { [restaurant_id]: cfg }.
  // Sert le bandeau du portail (présent tant qu'il reste un trou, disparaît de lui-même sinon).
  function alertesManquantes(restaurants, stockCfgByResto, retardCfgByResto) {
    const out = [];
    for (const r of (restaurants || [])) {
      if (r.actif === false) continue;
      const manque = [];
      if (!alerteOperationnelle(stockCfgByResto ? stockCfgByResto[r.id] : null, 'stock')) manque.push('stock');
      if (!alerteOperationnelle(retardCfgByResto ? retardCfgByResto[r.id] : null, 'retard')) manque.push('retard');
      if (manque.length) out.push({ id: r.id, nom: r.nom, manque });
    }
    return out;
  }

  const api = { etatAlerte, alerteOperationnelle, alertesManquantes };
  g.EatimeAlertes = api;
  // Drop-in globaux (comme utils.js / ui.js).
  g.etatAlerte = etatAlerte; g.alerteOperationnelle = alerteOperationnelle; g.alertesManquantes = alertesManquantes;
})(typeof window !== 'undefined' ? window : globalThis);

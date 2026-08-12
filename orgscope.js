/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   orgscope.js — PORTÉE « ORGANISATION ACTIVE » · v1.0
   ═══════════════════════════════════════════════════════════════════════════════════════════════

   POURQUOI CE FICHIER EXISTE
   Les requêtes du produit ne filtraient pas par organisation : elles s'en remettaient entièrement
   à RLS. Pour un client (admin/manager) c'est suffisant — la politique borne à son organisation.
   Pour un `super_admin`, non : toutes les politiques portent « OR auth_role() = 'super_admin' », ce
   qui est VOULU (le support doit pouvoir intervenir chez un client), mais fait que la base ne filtre
   plus rien. Résultat constaté : basculé sur « Raya Metz », l'écran des salariés en affichait 39 —
   les 32 actifs de Groupe Raya PLUS les 7 de Raya Metz.

   LES DEUX BARRIÈRES NE FONT PAS LE MÊME TRAVAIL, ET SE CUMULENT :
     • RLS               = barrière de SÉCURITÉ  — empêche un client d'atteindre ce qui n'est pas à lui ;
     • le filtre de ce fichier = barrière de JUSTESSE — garantit qu'on travaille sur l'organisation
       qu'on CROIT, y compris pour un super_admin qui a légitimement accès à plusieurs.
   C'est le symétrique de la leçon inscrite dans CLAUDE.md (« tout filtrage en JavaScript est purement
   décoratif » du point de vue sécurité) : l'inverse est vrai aussi — RLS ne remplace pas un filtre
   applicatif dès qu'un utilisateur voit légitimement plusieurs organisations.

   USAGE
       await EatimeScope.init(sb, ME.organization_id, {nom: ORG.nom, role: ME.role});
       const {data} = await EatimeScope.from('salaries').select('*').order('nom');
   `from()` renvoie un constructeur de requête Supabase déjà borné. Tout le reste (order, gte, limit…)
   s'enchaîne normalement.

   FAIL-CLOSED — jamais d'ouverture silencieuse
   Une requête bornée lancée AVANT init() lève une exception. Un helper qui laisserait passer une
   requête non filtrée en cas de problème serait pire que pas de helper du tout : il aurait l'air sûr
   dans le harnais et fuirait en production. « Les échecs silencieux sont pires que les pannes. »
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ── CLASSEMENT DES TABLES — établi table par table sur le schéma RÉEL, pas deviné ──────────────
  // Le chemin de rattachement retenu est celui qu'emploie DÉJÀ la politique RLS de la table : si la
  // base remonte à l'organisation par le salarié, le filtre applicatif fait pareil. Deux chemins
  // différents pour une même table finiraient par diverger.

  // A — colonne organization_id portée par la table elle-même.
  const PAR_ORG = ['alternance_calendrier','alternance_jours','api_keys','assistant_conversations',
    'bons_livraison','calendar_events','cfa_color_mappings','clients','disciplinary_actions',
    'email_alertes_log','fact_compteurs','fact_paiements','fact_parametres','factures','factures_lignes',
    'fin_ca_journalier','fin_categories','fin_comptes_bancaires','fin_depenses','fin_encaissements',
    'fin_imports_bancaires','fin_regles_catego','fin_transactions_bancaires','fin_versements',
    'fournisseurs','haccp_equipements','haccp_huiles','haccp_nettoyages','haccp_reception_controles',
    'haccp_receptions','haccp_releves_temperature','haccp_zones_nettoyage','ia_usage_log','invitations',
    'kiosk_heartbeats','org_roles','parametres','parametres_notifs','pin_attempts','planning_regles',
    'produits','profiles','push_subscriptions','restaurants','retard_alertes_config','retards',
    'salaries','stock_alertes_config','stock_commentaires','stock_max','stock_produits','stock_saisies',
    'stock_snapshots_mensuels','team_tasks','wa_bot_config','wa_queue'];

  // B — pas d'organization_id : rattachement par le RESTAURANT (comme la politique RLS).
  const PAR_RESTO = ['planning_creneaux','planning_derogations','planning_effectifs','manager_restaurants'];

  // C — pas d'organization_id : rattachement par le SALARIÉ (comme la politique RLS).
  // ⚠ salarie_roles porte bien une colonne restaurant_id, mais elle est NULL sur les 42 lignes de la
  // base : filtrer dessus renverrait ZÉRO ligne et effacerait les rôles de tous les salariés. Sa
  // politique RLS passe par salaries — on fait pareil. Même raisonnement pour pointages, qui a une
  // colonne restaurant_id renseignée mais dont la RLS remonte par le salarié.
  const PAR_SALARIE = ['salarie_roles','salarie_dispos','salarie_documents','salarie_contraintes','pointages'];

  // C bis — table de paires : deux colonnes salarié, on borne sur la première (l'autre est du même bord).
  const PAR_SALARIE_A = ['salarie_paires'];

  // D — VOLONTAIREMENT NON BORNÉES. Chaque exception est justifiée ; il n'y en a pas d'autre.
  const NON_BORNEES = {
    organizations:   'C\'est la table des organisations elle-même : le sélecteur de bascule doit toutes les lister pour un super_admin. La borner rendrait la bascule impossible.',
    system_modules:  'Catalogue des modules du produit, identique pour tous les clients — aucune donnée d\'organisation.',
    _mcp_upload_buffer: 'Tampon technique interne, sans rattachement.'
  };

  const KIND = {};
  PAR_ORG.forEach(t => KIND[t] = 'org');
  PAR_RESTO.forEach(t => KIND[t] = 'resto');
  PAR_SALARIE.forEach(t => KIND[t] = 'salarie');
  PAR_SALARIE_A.forEach(t => KIND[t] = 'salarie_a');

  // UUID qui n'existe pas : borne une liste vide de façon FERMÉE. Une organisation sans restaurant
  // doit voir zéro ligne, jamais toutes. On n'appelle pas .in(col, []) — son rendu dépend du parseur.
  const AUCUN = '00000000-0000-0000-0000-000000000000';

  let _sb = null, _orgId = null, _orgNom = '', _role = '';
  let _restoIds = null, _salIds = null, _pret = false;

  function _exiger() {
    if (!_pret) throw new Error(
      'EatimeScope : requête bornée lancée avant init(). ' +
      'Appelez « await EatimeScope.init(sb, ME.organization_id) » avant toute lecture. ' +
      'Refus volontaire : renvoyer des lignes non filtrées serait une fuite silencieuse.');
  }

  // Applique la borne de l'organisation active à une requête déjà construite (post-select).
  function borner(table, q) {
    const kind = KIND[table];
    if (!kind) return q;                       // table non rattachée (classe D) ou inconnue du modèle
    _exiger();
    if (kind === 'org')       return q.eq('organization_id', _orgId);
    if (kind === 'resto')     return q.in('restaurant_id', _restoIds.length ? _restoIds : [AUCUN]);
    if (kind === 'salarie')   return q.in('salarie_id',    _salIds.length   ? _salIds   : [AUCUN]);
    if (kind === 'salarie_a') return q.in('salarie_a_id',  _salIds.length   ? _salIds   : [AUCUN]);
    return q;
  }

  // Estampille organization_id sur les lignes écrites, quand la table la porte. Évite qu'un insert
  // fait depuis l'organisation A atterrisse sans rattachement ou dans B.
  function estampiller(table, rows) {
    if (KIND[table] !== 'org') return rows;
    _exiger();
    const un = r => (r && typeof r === 'object' && r.organization_id == null)
      ? Object.assign({}, r, { organization_id: _orgId }) : r;
    return Array.isArray(rows) ? rows.map(un) : un(rows);
  }

  const API = {
    /** Borne toutes les requêtes suivantes sur cette organisation. À appeler après le chargement du profil. */
    async init(sb, orgId, opts) {
      opts = opts || {};
      if (!sb) throw new Error('EatimeScope.init : client Supabase manquant.');
      if (!orgId) throw new Error('EatimeScope.init : organisation active inconnue (ME.organization_id vide).');
      _sb = sb; _orgId = orgId; _orgNom = opts.nom || ''; _role = opts.role || '';
      // Les tables sans organization_id se bornent par la liste des restaurants / salariés de
      // l'organisation. Ces deux listes sont chargées ICI, filtrées explicitement elles aussi.
      const [r, s] = await Promise.all([
        sb.from('restaurants').select('id').eq('organization_id', orgId),
        sb.from('salaries').select('id').eq('organization_id', orgId)
      ]);
      if (r.error) throw new Error('EatimeScope.init : lecture des restaurants impossible — ' + r.error.message);
      if (s.error) throw new Error('EatimeScope.init : lecture des salariés impossible — ' + s.error.message);
      _restoIds = (r.data || []).map(x => x.id);
      _salIds   = (s.data || []).map(x => x.id);
      _pret = true;
      if (opts.banniere !== false) API.banniere();
      return { restaurants: _restoIds.length, salaries: _salIds.length };
    },

    /** Point d'accès UNIQUE aux tables rattachées à une organisation. */
    from(table) {
      const b = _sb.from(table);
      return {
        select: (...a) => borner(table, b.select(...a)),
        update: (patch, ...a) => borner(table, b.update(patch, ...a)),
        delete: (...a) => borner(table, b.delete(...a)),
        insert: (rows, ...a) => b.insert(estampiller(table, rows), ...a),
        upsert: (rows, ...a) => b.upsert(estampiller(table, rows), ...a)
      };
    },

    /** Organisation active — source unique pour l'affichage et les contrôles. */
    orgId() { return _orgId; },
    orgNom() { return _orgNom; },
    pret() { return _pret; },
    restaurantIds() { return (_restoIds || []).slice(); },
    salarieIds() { return (_salIds || []).slice(); },

    /** Classement d'une table (pour le harnais et les écrans de diagnostic). */
    portee(table) { return KIND[table] || (NON_BORNEES[table] ? 'globale' : 'inconnue'); },
    tablesBornees() { return Object.keys(KIND).slice(); },
    exceptions() { return Object.assign({}, NON_BORNEES); },

    /**
     * GARDE-FOU D'ÉCRITURE — à appeler AVANT toute modification, désactivation ou suppression.
     * L'enregistrement visé est déjà en mémoire (fiche ouverte) : le contrôle est synchrone et le
     * refus est VISIBLE. Sans lui, une écriture inter-organisation passe la borne .eq() et n'affecte
     * simplement aucune ligne — ce qui se lit comme un succès dans presque tout le code.
     * @returns {boolean} true si l'écriture est permise ; false (et alerte) sinon.
     */
    verifierAppartenance(row, quoi) {
      if (!_pret) { alert('Organisation active inconnue — écriture refusée.'); return false; }
      if (!row) return true;                                   // création : rien à vérifier
      const oid = row.organization_id;
      if (oid != null && oid !== _orgId) {
        alert('Écriture refusée.\n\n' + (quoi || 'Cet enregistrement') + ' appartient à une AUTRE organisation '
            + 'que celle sur laquelle vous travaillez actuellement (' + (_orgNom || _orgId) + ').\n\n'
            + 'Basculez sur la bonne organisation dans Paramètres avant de modifier.');
        return false;
      }
      // Table sans organization_id : on remonte par le restaurant ou le salarié quand l'info est là.
      if (oid == null && row.restaurant_id && _restoIds && !_restoIds.includes(row.restaurant_id)) {
        alert('Écriture refusée.\n\n' + (quoi || 'Cet enregistrement') + ' est rattaché à un restaurant '
            + 'qui n\'appartient pas à l\'organisation active (' + (_orgNom || _orgId) + ').');
        return false;
      }
      if (oid == null && row.salarie_id && _salIds && !_salIds.includes(row.salarie_id)) {
        alert('Écriture refusée.\n\n' + (quoi || 'Cet enregistrement') + ' concerne un salarié '
            + 'qui n\'appartient pas à l\'organisation active (' + (_orgNom || _orgId) + ').');
        return false;
      }
      return true;
    },

    /**
     * Bandeau PERMANENT de l'organisation active. Discret pour un client mono-organisation (il n'en
     * a qu'une, l'information est du bruit), visible pour un super_admin — c'est lui qui bascule et
     * lui seul qui peut se tromper d'organisation sans s'en apercevoir.
     */
    banniere() {
      try {
        if (typeof document === 'undefined' || !document.body) return;
        if (_role !== 'super_admin') return;                   // un client ne bascule jamais
        // PASTILLE D'ANGLE, pas bandeau pleine largeur. Les douze modules ont leurs propres barres
        // fixes (en-tête, pied d'onglets) : une bande sur toute la largeur en recouvrirait certaines,
        // et compenser par un padding sur <body> écraserait celui que la page s'est déjà donné.
        // Une pastille en bas à gauche est « discrète mais permanente » sans rien déplacer.
        let el = document.getElementById('eatime-org-banner');
        if (!el) {
          el = document.createElement('div');
          el.id = 'eatime-org-banner';
          el.setAttribute('role', 'status');
          el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483000;'
            + 'background:rgba(58,45,16,.94);color:#f0d68a;border:1px solid #c8a035;border-radius:999px;'
            + 'font:600 11px/1.3 system-ui,-apple-system,sans-serif;'
            + 'padding:5px 11px;letter-spacing:.02em;pointer-events:none;max-width:60vw;'
            + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.35)';
          document.body.appendChild(el);
        }
        el.textContent = '🏢 ' + (_orgNom || _orgId) + ' · super_admin';
        el.title = 'Organisation active : ' + (_orgNom || _orgId)
                 + '. Vous êtes super_admin : toute écriture s\'applique à CETTE organisation.';
      } catch (e) { /* l'absence de pastille ne doit jamais empêcher la page de fonctionner */ }
    }
  };

  global.EatimeScope = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

-- v6.12 — AUDIT 2026-06-14, lot 2 / P1 : supprimer les policies permissives redondantes par (rôle, action).
-- Méthode : re-scoper chaque policy « large » (TO public) vers TO authenticated quand anon a déjà sa
-- policy dédiée (anon_select / anon_insert / anon_read). Ces policies larges sont org-scopées
-- (organization_id = auth_org()) → déjà FAUSSES pour anon : aucun changement fonctionnel, juste fin de la
-- double-évaluation flaggée par l'advisor. Vérifié : les sous-requêtes des CHECK anon (v6.10) lisent
-- restaurants/salaries via leurs policies anon_read (USING true) et haccp_* via anon_select (actif=true).
-- ⚠️ APPLIQUÉ SUR TEST `ynnqvtfayrdteqtgxeuk` le 2026-06-14. NE PAS appliquer en PROD sans GO.

-- HACCP : SELECT (équipements/zones) et INSERT (huiles/nettoyages/réceptions/relevés) → réservés aux authentifiés.
alter policy haccp_equipements_select          on public.haccp_equipements          to authenticated;
alter policy haccp_zones_nettoyage_select      on public.haccp_zones_nettoyage      to authenticated;
alter policy haccp_huiles_insert               on public.haccp_huiles               to authenticated;
alter policy haccp_nettoyages_insert           on public.haccp_nettoyages           to authenticated;
alter policy haccp_receptions_insert           on public.haccp_receptions           to authenticated;
alter policy haccp_releves_temperature_insert  on public.haccp_releves_temperature  to authenticated;

-- Pointages / restaurants / salaries / salarie_roles / salarie_dispos : policies « _all » (org-scopées) → authentifiés.
-- Anon garde son accès via : pointages_anon_insert/select, restaurants_anon_read, salaries_anon_read,
-- salarie_roles_anon_read, salarie_dispos_anon_insert/select (+ RPC delete_dispo_kiosk de v6.10).
alter policy pointages_all       on public.pointages       to authenticated;
alter policy restaurants_all     on public.restaurants     to authenticated;
alter policy salaries_all        on public.salaries        to authenticated;
alter policy salarie_roles_all   on public.salarie_roles   to authenticated;
alter policy salarie_dispos_all  on public.salarie_dispos  to authenticated;

-- Stock : SELECT (produits/max) et INSERT (saisies) → authentifiés ; anon garde anon_select / anon_insert.
alter policy stock_produits_select on public.stock_produits to authenticated;
alter policy stock_max_select      on public.stock_max      to authenticated;
alter policy stock_saisies_insert  on public.stock_saisies  to authenticated;

-- salarie_documents : la policy « _all » (TO public, FOR ALL) rendait INUTILE la restriction admin/manager
-- des écritures (sal_doc_insert/delete). On la supprime → seules les policies granulaires régissent l'accès
-- (SELECT = même org ; INSERT/DELETE = admin/manager/super_admin de l'org). Aucun flux n'UPDATE cette table.
drop policy if exists salarie_documents_all on public.salarie_documents;

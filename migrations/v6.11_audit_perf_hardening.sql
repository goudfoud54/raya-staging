-- v6.11 — AUDIT 2026-06-14, lot 2 : P2 (RLS initplan) + P3 (index FK fort trafic) + S9 (search_path).
-- ⚠️ APPLIQUÉ SUR TEST `ynnqvtfayrdteqtgxeuk` le 2026-06-14. NE PAS appliquer en PROD sans GO.
-- Aucune donnée détruite. Sémantique des policies INCHANGÉE (on enveloppe juste les appels auth.* en
-- sous-requête pour qu'ils soient évalués UNE fois par requête au lieu d'une fois par ligne).

-- ── P2 : auth_rls_initplan — envelopper auth.uid()/auth_org()/auth_role()/is_admin_or_super() en (select …)
alter policy profiles_select on public.profiles
  using ((id = (select auth.uid())) OR ((select is_admin_or_super()) AND (organization_id = (select auth_org()))) OR ((select auth_role()) = 'super_admin'));
alter policy profiles_update on public.profiles
  using ((id = (select auth.uid())) OR ((select is_admin_or_super()) AND (organization_id = (select auth_org()))) OR ((select auth_role()) = 'super_admin'));

alter policy asst_conv_owner on public.assistant_conversations
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy tt_select on public.team_tasks
  using ((organization_id = (select auth_org())) AND ((select is_admin_or_super()) OR ((select auth_role()) = 'manager') OR (salarie_id = (select salarie_id from profiles where id = (select auth.uid())))));
alter policy tt_update on public.team_tasks
  using ((organization_id = (select auth_org())) AND ((select is_admin_or_super()) OR ((select auth_role()) = 'manager') OR (salarie_id = (select salarie_id from profiles where id = (select auth.uid())))))
  with check (organization_id = (select auth_org()));

-- ── P3 : index sur les FK à fort trafic (planning, pointages, finance).
create index if not exists idx_planning_creneaux_salarie on public.planning_creneaux (salarie_id);
create index if not exists idx_pointages_salarie         on public.pointages (salarie_id);
create index if not exists idx_pointages_restaurant      on public.pointages (restaurant_id);

create index if not exists idx_fin_ca_journalier_restaurant on public.fin_ca_journalier (restaurant_id);
create index if not exists idx_fin_ca_journalier_saisi_par  on public.fin_ca_journalier (saisi_par);

create index if not exists idx_fin_depenses_restaurant on public.fin_depenses (restaurant_id);
create index if not exists idx_fin_depenses_categorie  on public.fin_depenses (categorie_id);
create index if not exists idx_fin_depenses_saisi_par  on public.fin_depenses (saisi_par);

create index if not exists idx_fin_encaissements_versement  on public.fin_encaissements (versement_id);
create index if not exists idx_fin_encaissements_restaurant on public.fin_encaissements (restaurant_id);
create index if not exists idx_fin_encaissements_saisi_par  on public.fin_encaissements (saisi_par);

create index if not exists idx_fin_versements_restaurant on public.fin_versements (restaurant_id);
create index if not exists idx_fin_versements_saisi_par  on public.fin_versements (saisi_par);

create index if not exists idx_fin_tx_encaissement on public.fin_transactions_bancaires (encaissement_id);
create index if not exists idx_fin_tx_compte       on public.fin_transactions_bancaires (compte_id);
create index if not exists idx_fin_tx_import       on public.fin_transactions_bancaires (import_id);
create index if not exists idx_fin_tx_categorie    on public.fin_transactions_bancaires (categorie_id);
create index if not exists idx_fin_tx_depense      on public.fin_transactions_bancaires (depense_id);

create index if not exists idx_fin_imports_imported_by on public.fin_imports_bancaires (imported_by);
create index if not exists idx_fin_imports_compte     on public.fin_imports_bancaires (compte_id);

create index if not exists idx_fin_regles_categorie on public.fin_regles_catego (categorie_id);

-- ── S9 : figer le search_path des fonctions SECURITY DEFINER / triggers.
alter function public.auth_org()                 set search_path = public, pg_temp;
alter function public.auth_role()                set search_path = public, pg_temp;
alter function public.is_admin_or_super()        set search_path = public, pg_temp;
alter function public.trigger_check_stock_alerts() set search_path = public, pg_temp;
alter function public.tg_set_updated_at_cal()    set search_path = public, pg_temp;
alter function public.tg_set_updated_at_disc()   set search_path = public, pg_temp;
alter function public.tg_set_updated_at_tt()     set search_path = public, pg_temp;

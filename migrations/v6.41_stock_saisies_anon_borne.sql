-- v6.41 — Saisies de stock : la clé publique ne peut plus modifier ni effacer l'historique (2026-11-07)
--
-- CONSTAT (prouvé en production dans une transaction ANNULÉE, 2026-11-07) : le rôle anon (clé publique,
-- présente dans le source de chaque page) pouvait MODIFIER et SUPPRIMER les 46 970 saisies de stock des
-- 3 organisations. Les politiques `stock_saisies_anon_update` / `_anon_delete` ne vérifiaient qu'une
-- cohérence (« le restaurant appartient à l'organisation de la ligne »), pas l'appelant.
--
-- BESOIN RÉEL DE LA TABLETTE STOCK (stock-kiosk l.275-354) : corriger ou vider une case DU JOUR — elle ne
-- modifie que les saisies chargées pour la journée d'exploitation en cours (SAISIES_TODAY).
--
-- CORRECTIF : modification / suppression anonymes limitées aux saisies CRÉÉES depuis moins de 36 heures
-- (une journée d'exploitation entière, fin de service après minuit comprise, plus une marge). created_at
-- est désormais imposé par la base à l'insertion : impossible de créer une ligne « du futur » pour la garder
-- modifiable. L'historique au-delà de 36 h n'est plus modifiable que par un administrateur connecté.
--
-- LIMITE : les 36 dernières heures de saisies restent modifiables par quiconque détient la clé publique et
-- un identifiant de ligne (lisible aujourd'hui par la lecture anonyme). Le correctif complet passe par
-- l'appairage des tablettes (identité secrète), chantier à part.
--
-- RETOUR ARRIÈRE :
--   drop trigger if exists stock_saisies_created_at_impose on public.stock_saisies;
--   drop function if exists public.stock_created_at_impose();
--   drop policy if exists stock_saisies_anon_update on public.stock_saisies;
--   create policy stock_saisies_anon_update on public.stock_saisies for update to anon
--     using (exists (select 1 from restaurants r where r.id = stock_saisies.restaurant_id and r.organization_id = stock_saisies.organization_id))
--     with check (exists (select 1 from restaurants r where r.id = stock_saisies.restaurant_id and r.organization_id = stock_saisies.organization_id));
--   drop policy if exists stock_saisies_anon_delete on public.stock_saisies;
--   create policy stock_saisies_anon_delete on public.stock_saisies for delete to anon
--     using (exists (select 1 from restaurants r where r.id = stock_saisies.restaurant_id and r.organization_id = stock_saisies.organization_id));
--   (définitions d'origine relevées dans pg_policies le 2026-11-07)

create or replace function public.stock_created_at_impose()
returns trigger language plpgsql set search_path = public as $f$
begin
  new.created_at := now();
  return new;
end $f$;
drop trigger if exists stock_saisies_created_at_impose on public.stock_saisies;
create trigger stock_saisies_created_at_impose before insert on public.stock_saisies
  for each row execute function public.stock_created_at_impose();

drop policy if exists stock_saisies_anon_update on public.stock_saisies;
create policy stock_saisies_anon_update on public.stock_saisies for update to anon
  using (created_at > now() - interval '36 hours'
         and exists (select 1 from public.restaurants r
                     where r.id = stock_saisies.restaurant_id and r.organization_id = stock_saisies.organization_id))
  with check (exists (select 1 from public.restaurants r
                      where r.id = stock_saisies.restaurant_id and r.organization_id = stock_saisies.organization_id));
drop policy if exists stock_saisies_anon_delete on public.stock_saisies;
create policy stock_saisies_anon_delete on public.stock_saisies for delete to anon
  using (created_at > now() - interval '36 hours'
         and exists (select 1 from public.restaurants r
                     where r.id = stock_saisies.restaurant_id and r.organization_id = stock_saisies.organization_id));

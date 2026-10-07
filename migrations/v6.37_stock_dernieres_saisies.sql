-- v6.37 — « Dernière saisie par produit » : une VUE plutôt que tout l'historique (2026-10, lectures plafonnées)
--
-- POURQUOI. Le stock calculait la dernière saisie de chaque produit en rapatriant l'historique complet
-- (calcul des besoins) ou 30 jours (tableau de bord) — ~3 500 saisies par mois et par restaurant. Supabase
-- rend au plus 1 000 lignes par réponse, SANS erreur : ces calculs portaient déjà sur une partie seulement
-- des saisies (journaux de l'API, 2026-10-07 : réponses « 0-999 »), et un produit non vu en apparaissait
-- « jamais saisi » ou avec une ancienne quantité. La vue rend UNE ligne par (restaurant, produit) : 467
-- lignes pour toute la base au 2026-10-07 (351 au plus pour une organisation), au lieu de ~29 000.
--
-- RÈGLE. La saisie la plus récente par date_saisie ; à date égale (deux saisies le même jour pour le même
-- produit — 13 cas en base, AUCUN sur une dernière saisie au 2026-10-07), la plus récemment créée.
-- Vérifié sur les données réelles avant application : 467 couples, 0 date différente du maximum.
--
-- SÉCURITÉ. security_invoker = true : la vue s'exécute avec les droits de CELUI QUI LIT, donc la RLS de
-- stock_saisies s'applique (cloisonnement par organisation). Sans cette option, la vue tournerait avec
-- les droits de son propriétaire et exposerait les saisies de toutes les organisations via l'API.
-- Lecture retirée à anon (les tablettes n'en ont pas besoin) ; accordée à authenticated.
--
-- ADDITIF ET RÉVERSIBLE. Aucune donnée modifiée. Retour arrière :
--   drop view if exists public.stock_saisies_dernieres;
--   drop index if exists public.stock_saisies_resto_prod_date_idx;

create index if not exists stock_saisies_resto_prod_date_idx
  on public.stock_saisies (restaurant_id, produit_id, date_saisie desc, created_at desc, id desc);

create or replace view public.stock_saisies_dernieres
with (security_invoker = true) as
select distinct on (restaurant_id, produit_id)
       id, organization_id, restaurant_id, produit_id, quantite, commentaire, date_saisie, created_at
from public.stock_saisies
order by restaurant_id, produit_id, date_saisie desc, created_at desc, id desc;

revoke all on public.stock_saisies_dernieres from anon, public;
grant select on public.stock_saisies_dernieres to authenticated;

comment on view public.stock_saisies_dernieres is
  'Dernière saisie de stock par (restaurant, produit). security_invoker : RLS de stock_saisies appliquée. Migration v6.37.';

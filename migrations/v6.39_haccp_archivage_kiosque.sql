-- v6.39 — HACCP : traçabilité protégée, droits alignés sur le module, tablettes cloisonnées (2026-11-07)
--
-- ANNONCÉE AU PATRON AVANT APPLICATION. Additive pour les tablettes en service (eatime-kiosk-v11) : rien
-- de ce qu'elles font aujourd'hui n'est retiré (prouvé par une insertion anonyme de test, annulée).
-- La lecture anonyme des ÉQUIPEMENTS et des ZONES reste ouverte : elle sera fermée par v6.40 une fois les
-- tablettes passées en v12 (celles-ci lisent leur référentiel par kiosk_haccp_referentiel, ci-dessous).
--
-- 1. AUCUN CHEMIN NE PEUT PLUS EFFACER DES RELEVÉS EN CASCADE.
--    Supprimer un équipement effaçait tous ses relevés (températures, huiles), supprimer une zone tous ses
--    nettoyages : ON DELETE CASCADE. Ces relevés sont la preuve présentée en contrôle sanitaire (DDPP).
--    → NO ACTION : la suppression d'un équipement / d'une zone qui a des relevés est REFUSÉE (23503).
--    NO ACTION plutôt que RESTRICT : même refus, mais vérifié en fin d'instruction — la suppression d'une
--    organisation entière (qui emporte équipements ET relevés par leurs propres cascades) reste possible
--    quel que soit l'ordre des cascades. Testé dans une transaction annulée (2026-11-07) : les deux variantes
--    refusent la suppression d'un équipement avec relevé et acceptent celle de l'organisation.
--
-- 2. QUI PEUT GÉRER ÉQUIPEMENTS ET ZONES = QUI A ACCÈS AU MODULE HACCP (réglage de l'établissement).
--    Avant : AJOUTER = tout membre de l'organisation (y compris un salarié sans accès au module) ;
--            MODIFIER / ARCHIVER = administrateur seulement — d'où le « supprimer ne fait rien » d'un manager.
--    Après : ajouter, modifier, archiver, réactiver = has_module_access('haccp') — la même règle que la page
--            (access.js canAccessModule), réglable dans Paramètres › Permissions, exceptions individuelles comprises.
--    SUPPRIMER (définitivement) : inchangé — administrateur seulement, et la clé étrangère du point 1 la
--    refuse s'il existe un relevé.
--
-- 3. TABLETTES : CLOISONNEMENT ENTRE ORGANISATIONS.
--    Les politiques anonymes de lecture des relevés (températures, huiles, nettoyages) n'avaient AUCUN filtre
--    d'organisation (« EXISTS équipement de la même organisation que la ligne » est une cohérence, pas un
--    cloisonnement) : la clé publique lisait tous les relevés de tous les clients, avec salarie_id,
--    restaurant_id, organization_id. La tablette n'en lit aucun (insertions sans retour) → lecture retirée.
--    Réceptions : la tablette relit la ligne qu'elle vient de créer (insert … select id) et y ajoute la photo
--    → lecture/modification anonymes limitées aux réceptions créées depuis moins de 30 minutes, created_at
--    étant désormais imposé par la base (impossible de l'antidater pour garder une ligne lisible).
--    Contrôles de réception : aucune page ne s'en sert en anonyme → politiques anonymes retirées.
--    Insertions anonymes : le contrôle « équipement / zone de la même organisation » passe par une fonction
--    SECURITY DEFINER (indispensable : sans elle, fermer la lecture des équipements en v6.40 ferait échouer
--    TOUTES les saisies des tablettes) et refuse un équipement ARCHIVÉ (une tablette restée sur l'ancienne
--    version ne peut plus saisir sur un équipement archivé).
--    Référentiel de la tablette : kiosk_haccp_referentiel(restaurant) ne rend que les équipements et zones
--    ACTIFS de l'organisation de CE restaurant (corrige aussi l'affichage d'équipements « tous restaurants »
--    d'une autre organisation).
--
-- LIMITE ASSUMÉE (à traiter dans un chantier « appairage des tablettes ») : une tablette n'a pas d'identité
-- secrète. Quiconque connaît l'identifiant d'un restaurant (lisible publiquement aujourd'hui, audit #94) peut
-- lire les NOMS d'équipements de ce restaurant et insérer des relevés pour son organisation.
--
-- RETOUR ARRIÈRE : migrations/v6.39_haccp_archivage_kiosque_rollback.sql (recrée exactement l'état d'avant).

-- ── 1. Clés étrangères : plus de cascade vers les relevés ─────────────────────────────────────────────
alter table public.haccp_releves_temperature drop constraint haccp_releves_temperature_equipement_id_fkey;
alter table public.haccp_releves_temperature add constraint haccp_releves_temperature_equipement_id_fkey
  foreign key (equipement_id) references public.haccp_equipements(id) on delete no action;
alter table public.haccp_huiles drop constraint haccp_huiles_equipement_id_fkey;
alter table public.haccp_huiles add constraint haccp_huiles_equipement_id_fkey
  foreign key (equipement_id) references public.haccp_equipements(id) on delete no action;
alter table public.haccp_nettoyages drop constraint haccp_nettoyages_zone_id_fkey;
alter table public.haccp_nettoyages add constraint haccp_nettoyages_zone_id_fkey
  foreign key (zone_id) references public.haccp_zones_nettoyage(id) on delete no action;

-- ── 2. Gérer équipements et zones = accès au module HACCP ─────────────────────────────────────────────
drop policy if exists haccp_equipements_insert on public.haccp_equipements;
create policy haccp_equipements_insert on public.haccp_equipements for insert to authenticated
  with check ((auth_role() = 'super_admin') or (organization_id = auth_org() and has_module_access('haccp')));
drop policy if exists haccp_equipements_update on public.haccp_equipements;
create policy haccp_equipements_update on public.haccp_equipements for update to authenticated
  using      ((auth_role() = 'super_admin') or (organization_id = auth_org() and has_module_access('haccp')))
  with check ((auth_role() = 'super_admin') or (organization_id = auth_org() and has_module_access('haccp')));
drop policy if exists haccp_zones_nettoyage_insert on public.haccp_zones_nettoyage;
create policy haccp_zones_nettoyage_insert on public.haccp_zones_nettoyage for insert to authenticated
  with check ((auth_role() = 'super_admin') or (organization_id = auth_org() and has_module_access('haccp')));
drop policy if exists haccp_zones_nettoyage_update on public.haccp_zones_nettoyage;
create policy haccp_zones_nettoyage_update on public.haccp_zones_nettoyage for update to authenticated
  using      ((auth_role() = 'super_admin') or (organization_id = auth_org() and has_module_access('haccp')))
  with check ((auth_role() = 'super_admin') or (organization_id = auth_org() and has_module_access('haccp')));

-- ── 3a. Contrôles d'insertion anonyme par fonction (indépendants de la lecture anonyme) ───────────────
create or replace function public.haccp_equipement_saisissable(p_equipement uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $f$
  select exists (select 1 from public.haccp_equipements e
                 where e.id = p_equipement and e.organization_id = p_org and e.actif is not false)
$f$;
create or replace function public.haccp_zone_saisissable(p_zone uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $f$
  select exists (select 1 from public.haccp_zones_nettoyage z
                 where z.id = p_zone and z.organization_id = p_org and z.actif is not false)
$f$;
revoke all on function public.haccp_equipement_saisissable(uuid, uuid) from public;
revoke all on function public.haccp_zone_saisissable(uuid, uuid) from public;
grant execute on function public.haccp_equipement_saisissable(uuid, uuid) to anon, authenticated;
grant execute on function public.haccp_zone_saisissable(uuid, uuid) to anon, authenticated;

drop policy if exists haccp_releves_temperature_anon_insert on public.haccp_releves_temperature;
create policy haccp_releves_temperature_anon_insert on public.haccp_releves_temperature for insert to anon
  with check (public.haccp_equipement_saisissable(equipement_id, organization_id));
drop policy if exists haccp_huiles_anon_insert on public.haccp_huiles;
create policy haccp_huiles_anon_insert on public.haccp_huiles for insert to anon
  with check (public.haccp_equipement_saisissable(equipement_id, organization_id));
drop policy if exists haccp_nettoyages_anon_insert on public.haccp_nettoyages;
create policy haccp_nettoyages_anon_insert on public.haccp_nettoyages for insert to anon
  with check (public.haccp_zone_saisissable(zone_id, organization_id));

-- ── 3b. Plus de lecture anonyme des relevés ───────────────────────────────────────────────────────────
drop policy if exists haccp_releves_temperature_anon_select on public.haccp_releves_temperature;
drop policy if exists haccp_huiles_anon_select on public.haccp_huiles;
drop policy if exists haccp_nettoyages_anon_select on public.haccp_nettoyages;
drop policy if exists haccp_reception_controles_anon_select on public.haccp_reception_controles;
drop policy if exists haccp_reception_controles_anon_insert on public.haccp_reception_controles;

-- Réceptions : seulement la ligne tout juste créée (relecture de l'id + ajout de la photo).
create or replace function public.haccp_created_at_impose()
returns trigger language plpgsql set search_path = public as $f$
begin
  new.created_at := now();
  return new;
end $f$;
drop trigger if exists haccp_created_at_impose on public.haccp_receptions;
create trigger haccp_created_at_impose before insert on public.haccp_receptions
  for each row execute function public.haccp_created_at_impose();

drop policy if exists haccp_receptions_anon_select on public.haccp_receptions;
create policy haccp_receptions_anon_select on public.haccp_receptions for select to anon
  using (created_at > now() - interval '30 minutes'
         and exists (select 1 from public.restaurants r
                     where r.id = haccp_receptions.restaurant_id and r.organization_id = haccp_receptions.organization_id));
drop policy if exists haccp_receptions_anon_update_photo on public.haccp_receptions;
create policy haccp_receptions_anon_update_photo on public.haccp_receptions for update to anon
  using (created_at > now() - interval '30 minutes'
         and exists (select 1 from public.restaurants r
                     where r.id = haccp_receptions.restaurant_id and r.organization_id = haccp_receptions.organization_id))
  with check (exists (select 1 from public.restaurants r
                      where r.id = haccp_receptions.restaurant_id and r.organization_id = haccp_receptions.organization_id));

-- ── 3c. Référentiel de la tablette : son restaurant, son organisation, actifs seulement ───────────────
create or replace function public.kiosk_haccp_referentiel(p_restaurant uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $f$
  with r as (select id, organization_id from public.restaurants where id = p_restaurant)
  select jsonb_build_object(
    'equipements', coalesce((select jsonb_agg(to_jsonb(e) order by e.ordre, e.nom)
                               from public.haccp_equipements e, r
                              where e.organization_id = r.organization_id and e.actif is not false
                                and (e.restaurant_id is null or e.restaurant_id = r.id)), '[]'::jsonb),
    'zones',       coalesce((select jsonb_agg(to_jsonb(z) order by z.ordre, z.nom)
                               from public.haccp_zones_nettoyage z, r
                              where z.organization_id = r.organization_id and z.actif is not false
                                and (z.restaurant_id is null or z.restaurant_id = r.id)), '[]'::jsonb))
$f$;
revoke all on function public.kiosk_haccp_referentiel(uuid) from public;
grant execute on function public.kiosk_haccp_referentiel(uuid) to anon, authenticated;

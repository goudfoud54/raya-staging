-- RETOUR ARRIÈRE de v6.39 — recrée EXACTEMENT les politiques, clés et droits relevés en production le
-- 2026-11-07 avant application (pg_policies / pg_constraint). Ne touche à aucune donnée.
-- ⚠ Remettre ON DELETE CASCADE réexpose les relevés à l'effacement en cascade.
-- ⚠ À n'appliquer qu'avec des tablettes encore capables de lire les équipements en direct (v11) ou après
--   avoir aussi annulé v6.40 : les tablettes v12 appellent kiosk_haccp_referentiel, supprimé ici.

alter table public.haccp_releves_temperature drop constraint haccp_releves_temperature_equipement_id_fkey;
alter table public.haccp_releves_temperature add constraint haccp_releves_temperature_equipement_id_fkey
  foreign key (equipement_id) references public.haccp_equipements(id) on delete cascade;
alter table public.haccp_huiles drop constraint haccp_huiles_equipement_id_fkey;
alter table public.haccp_huiles add constraint haccp_huiles_equipement_id_fkey
  foreign key (equipement_id) references public.haccp_equipements(id) on delete cascade;
alter table public.haccp_nettoyages drop constraint haccp_nettoyages_zone_id_fkey;
alter table public.haccp_nettoyages add constraint haccp_nettoyages_zone_id_fkey
  foreign key (zone_id) references public.haccp_zones_nettoyage(id) on delete cascade;

drop policy if exists haccp_equipements_insert on public.haccp_equipements;
create policy haccp_equipements_insert on public.haccp_equipements for insert to public
  with check ((auth_role() = 'super_admin'::text) or (organization_id = auth_org()));
drop policy if exists haccp_equipements_update on public.haccp_equipements;
create policy haccp_equipements_update on public.haccp_equipements for update to public
  using ((auth_role() = 'super_admin'::text) or ((organization_id = auth_org()) and is_admin_or_super()));
drop policy if exists haccp_zones_nettoyage_insert on public.haccp_zones_nettoyage;
create policy haccp_zones_nettoyage_insert on public.haccp_zones_nettoyage for insert to public
  with check ((auth_role() = 'super_admin'::text) or (organization_id = auth_org()));
drop policy if exists haccp_zones_nettoyage_update on public.haccp_zones_nettoyage;
create policy haccp_zones_nettoyage_update on public.haccp_zones_nettoyage for update to public
  using ((auth_role() = 'super_admin'::text) or ((organization_id = auth_org()) and is_admin_or_super()));

drop policy if exists haccp_releves_temperature_anon_insert on public.haccp_releves_temperature;
create policy haccp_releves_temperature_anon_insert on public.haccp_releves_temperature for insert to anon
  with check (exists (select 1 from haccp_equipements e where e.id = haccp_releves_temperature.equipement_id and e.organization_id = haccp_releves_temperature.organization_id));
drop policy if exists haccp_huiles_anon_insert on public.haccp_huiles;
create policy haccp_huiles_anon_insert on public.haccp_huiles for insert to anon
  with check (exists (select 1 from haccp_equipements e where e.id = haccp_huiles.equipement_id and e.organization_id = haccp_huiles.organization_id));
drop policy if exists haccp_nettoyages_anon_insert on public.haccp_nettoyages;
create policy haccp_nettoyages_anon_insert on public.haccp_nettoyages for insert to anon
  with check (exists (select 1 from haccp_zones_nettoyage z where z.id = haccp_nettoyages.zone_id and z.organization_id = haccp_nettoyages.organization_id));

create policy haccp_releves_temperature_anon_select on public.haccp_releves_temperature for select to anon
  using (exists (select 1 from haccp_equipements e where e.id = haccp_releves_temperature.equipement_id and e.organization_id = haccp_releves_temperature.organization_id));
create policy haccp_huiles_anon_select on public.haccp_huiles for select to anon
  using (exists (select 1 from haccp_equipements e where e.id = haccp_huiles.equipement_id and e.organization_id = haccp_huiles.organization_id));
create policy haccp_nettoyages_anon_select on public.haccp_nettoyages for select to anon
  using (exists (select 1 from haccp_zones_nettoyage z where z.id = haccp_nettoyages.zone_id and z.organization_id = haccp_nettoyages.organization_id));
create policy haccp_reception_controles_anon_select on public.haccp_reception_controles for select to anon
  using (exists (select 1 from haccp_receptions hr where hr.id = haccp_reception_controles.reception_id));
create policy haccp_reception_controles_anon_insert on public.haccp_reception_controles for insert to anon
  with check (exists (select 1 from haccp_receptions hr where hr.id = haccp_reception_controles.reception_id));

drop policy if exists haccp_receptions_anon_select on public.haccp_receptions;
create policy haccp_receptions_anon_select on public.haccp_receptions for select to anon
  using (exists (select 1 from restaurants r where r.id = haccp_receptions.restaurant_id and r.organization_id = haccp_receptions.organization_id));
drop policy if exists haccp_receptions_anon_update_photo on public.haccp_receptions;
create policy haccp_receptions_anon_update_photo on public.haccp_receptions for update to anon
  using (exists (select 1 from restaurants r where r.id = haccp_receptions.restaurant_id and r.organization_id = haccp_receptions.organization_id))
  with check (exists (select 1 from restaurants r where r.id = haccp_receptions.restaurant_id and r.organization_id = haccp_receptions.organization_id));
drop trigger if exists haccp_created_at_impose on public.haccp_receptions;
drop function if exists public.haccp_created_at_impose();

drop function if exists public.kiosk_haccp_referentiel(uuid);
drop function if exists public.haccp_equipement_saisissable(uuid, uuid);
drop function if exists public.haccp_zone_saisissable(uuid, uuid);

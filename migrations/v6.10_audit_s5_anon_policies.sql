-- v6.10 — AUDIT 2026-06-14, lot 2 / S5 : resserrer les policies anon `WITH CHECK (true)`.
-- Objectif : un anonyme (kiosque) ne peut plus insérer une ligne dont l'organisation revendiquée
-- ne correspond pas à l'entité parente réelle (restaurant / équipement / zone). On s'appuie sur les
-- policies SELECT anon déjà présentes sur restaurants/salaries/haccp_equipements/haccp_zones_nettoyage.
-- ⚠️ APPLIQUÉ SUR TEST `ynnqvtfayrdteqtgxeuk` le 2026-06-14. NE PAS appliquer en PROD sans GO.
-- N'affecte que les insertions anon : les pages admin passent par des policies distinctes (org-scoped).

-- ── pointages : la paire (salarie, restaurant) doit appartenir à la MÊME organisation.
alter policy pointages_anon_insert on public.pointages
  with check (
    restaurant_id is not null and salarie_id is not null and exists (
      select 1 from salaries s join restaurants r on r.organization_id = s.organization_id
      where s.id = pointages.salarie_id and r.id = pointages.restaurant_id
    )
  );

-- ── stock_saisies : l'org revendiquée = celle du restaurant cité.
alter policy stock_saisies_anon_insert on public.stock_saisies
  with check (exists (
    select 1 from restaurants r where r.id = stock_saisies.restaurant_id
      and r.organization_id = stock_saisies.organization_id
  ));

-- ── HACCP relevés / huiles : l'org revendiquée = celle de l'équipement.
alter policy haccp_releves_temperature_anon_insert on public.haccp_releves_temperature
  with check (exists (
    select 1 from haccp_equipements e where e.id = haccp_releves_temperature.equipement_id
      and e.organization_id = haccp_releves_temperature.organization_id
  ));
alter policy haccp_huiles_anon_insert on public.haccp_huiles
  with check (exists (
    select 1 from haccp_equipements e where e.id = haccp_huiles.equipement_id
      and e.organization_id = haccp_huiles.organization_id
  ));

-- ── HACCP nettoyages : l'org revendiquée = celle de la zone.
alter policy haccp_nettoyages_anon_insert on public.haccp_nettoyages
  with check (exists (
    select 1 from haccp_zones_nettoyage z where z.id = haccp_nettoyages.zone_id
      and z.organization_id = haccp_nettoyages.organization_id
  ));

-- ── HACCP réceptions : l'org revendiquée = celle du restaurant.
alter policy haccp_receptions_anon_insert on public.haccp_receptions
  with check (exists (
    select 1 from restaurants r where r.id = haccp_receptions.restaurant_id
      and r.organization_id = haccp_receptions.organization_id
  ));

-- ── HACCP contrôles de réception : insert anon INUTILISÉ par les kiosques (seul /haccp admin l'écrit).
drop policy if exists haccp_rc_anon_insert on public.haccp_reception_controles;

-- ── salarie_dispos INSERT : salarié réel + uniquement des demandes `en_attente`.
alter policy salarie_dispos_anon_insert on public.salarie_dispos
  with check (
    statut_demande = 'en_attente' and exists (select 1 from salaries s where s.id = salarie_dispos.salarie_id)
  );

-- ── salarie_dispos DELETE : on retire le DELETE anon `USING (true)` (n'importe qui pouvait tout supprimer).
-- Remplacé par une RPC PIN-gated, pour que le kiosque /dispos garde sa fonction « annuler ma demande ».
drop policy if exists salarie_dispos_anon_delete on public.salarie_dispos;

create or replace function public.delete_dispo_kiosk(p_id uuid, p_pin text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  delete from salarie_dispos d using salaries s
   where d.id = p_id and d.salarie_id = s.id
     and d.statut_demande = 'en_attente'     -- on ne supprime jamais une demande déjà tranchée
     and s.pin_badgeuse = p_pin;             -- preuve d'identité = PIN du salarié propriétaire
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.delete_dispo_kiosk(uuid, text) from public;
grant execute on function public.delete_dispo_kiosk(uuid, text) to anon, authenticated;

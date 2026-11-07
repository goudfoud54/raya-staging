-- v6.38 — URGENT : les codes PIN de badgeuse ne sont plus recopiés dans les relevés HACCP (2026-11-07)
--
-- CONSTAT (production, 2026-11-07). La tablette HACCP écrivait le PIN tapé par le salarié dans la colonne
-- `saisi_par_pin` de chaque relevé (températures, huiles, nettoyages, réceptions). Ces tables sont lisibles
-- par le rôle anon (clé publique, présente dans le source de toutes les pages) SANS filtre d'organisation :
-- une simple requête REST sans connexion rendait 345 PIN en clair, tous identiques au PIN ACTUEL de
-- badgeuse de 18 salariés (17 actifs), avec salarie_id, restaurant_id et organization_id à côté.
-- La colonne n'est LUE nulle part dans le dépôt (seule la tablette l'écrit).
--
-- CORRECTIF.
--   1. Les copies existantes sont effacées. Les vrais PIN restent dans salaries.pin_badgeuse (vérifié :
--      345/345 copies identiques au PIN actuel) — aucune information perdue. Pas de sauvegarde : sauvegarder
--      des secrets recopiés irait à l'encontre du correctif.
--   2. Un déclencheur force la colonne à NULL à chaque insertion ou modification : même une tablette encore
--      sur l'ancienne version (cache) ne peut plus en écrire. La tablette n'a besoin d'aucune mise à jour.
--
-- RETOUR ARRIÈRE (déclencheurs seulement — les copies effacées ne se récupèrent pas, et n'ont pas d'usage) :
--   drop trigger if exists haccp_pin_jamais_stocke on public.haccp_releves_temperature;
--   drop trigger if exists haccp_pin_jamais_stocke on public.haccp_huiles;
--   drop trigger if exists haccp_pin_jamais_stocke on public.haccp_nettoyages;
--   drop trigger if exists haccp_pin_jamais_stocke on public.haccp_receptions;
--   drop function if exists public.haccp_pin_jamais_stocke();
--
-- À LA CHARGE DU PATRON : ces PIN ont été lisibles publiquement — les changer pour les salariés concernés.

create or replace function public.haccp_pin_jamais_stocke()
returns trigger language plpgsql set search_path = public as $$
begin
  new.saisi_par_pin := null;
  return new;
end $$;

drop trigger if exists haccp_pin_jamais_stocke on public.haccp_releves_temperature;
create trigger haccp_pin_jamais_stocke before insert or update on public.haccp_releves_temperature
  for each row execute function public.haccp_pin_jamais_stocke();
drop trigger if exists haccp_pin_jamais_stocke on public.haccp_huiles;
create trigger haccp_pin_jamais_stocke before insert or update on public.haccp_huiles
  for each row execute function public.haccp_pin_jamais_stocke();
drop trigger if exists haccp_pin_jamais_stocke on public.haccp_nettoyages;
create trigger haccp_pin_jamais_stocke before insert or update on public.haccp_nettoyages
  for each row execute function public.haccp_pin_jamais_stocke();
drop trigger if exists haccp_pin_jamais_stocke on public.haccp_receptions;
create trigger haccp_pin_jamais_stocke before insert or update on public.haccp_receptions
  for each row execute function public.haccp_pin_jamais_stocke();

-- Les déclencheurs ci-dessus s'appliquent aussi à cet effacement (update → NULL).
update public.haccp_releves_temperature set saisi_par_pin = null where saisi_par_pin is not null;
update public.haccp_huiles              set saisi_par_pin = null where saisi_par_pin is not null;
update public.haccp_nettoyages          set saisi_par_pin = null where saisi_par_pin is not null;
update public.haccp_receptions          set saisi_par_pin = null where saisi_par_pin is not null;

comment on column public.haccp_releves_temperature.saisi_par_pin is 'OBSOLÈTE (v6.38) : toujours NULL — un PIN ne se stocke jamais dans un relevé.';
comment on column public.haccp_huiles.saisi_par_pin is 'OBSOLÈTE (v6.38) : toujours NULL — un PIN ne se stocke jamais dans un relevé.';
comment on column public.haccp_nettoyages.saisi_par_pin is 'OBSOLÈTE (v6.38) : toujours NULL — un PIN ne se stocke jamais dans un relevé.';
comment on column public.haccp_receptions.saisi_par_pin is 'OBSOLÈTE (v6.38) : toujours NULL — un PIN ne se stocke jamais dans un relevé.';

-- v6.13 — AUDIT 2026-06-14, lot 2 / C1+D5 : `snacks_priorites` = source unique.
-- Un trigger dérive `snack_origine_id` (priorité 1) et `est_multi` (>1 resto) depuis `snacks_priorites`,
-- au lieu de la synchro faite à la main en JS (fragile, déjà désynchronisée sur 2 salariés).
-- ⚠️ APPLIQUÉ SUR TEST `ynnqvtfayrdteqtgxeuk` le 2026-06-14. NE PAS appliquer en PROD sans GO.

-- 1) Backfill : les salariés ayant un snack_origine_id mais pas de snacks_priorites (désync v5.5).
update public.salaries
   set snacks_priorites = jsonb_build_array(jsonb_build_object('restaurant_id', snack_origine_id, 'priorite', 1))
 where snack_origine_id is not null
   and (snacks_priorites is null or snacks_priorites = '[]'::jsonb);

-- 2) Fonction de dérivation des champs legacy depuis la liste de priorités.
create or replace function public.sync_snacks_legacy()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare arr jsonb; n int; r1 uuid;
begin
  arr := coalesce(new.snacks_priorites, '[]'::jsonb);
  n := jsonb_array_length(arr);
  if n > 0 then
    -- restaurant de priorité 1 (sinon, la plus petite priorité disponible)
    select (e->>'restaurant_id')::uuid into r1
      from jsonb_array_elements(arr) e where (e->>'priorite')::int = 1 limit 1;
    if r1 is null then
      select (e->>'restaurant_id')::uuid into r1
        from jsonb_array_elements(arr) e order by (e->>'priorite')::int nulls last limit 1;
    end if;
    new.snack_origine_id := r1;
    new.est_multi := (n > 1);
  end if;
  -- snacks_priorites vide → on ne touche pas aux champs legacy (compat saisie legacy éventuelle).
  return new;
end $$;

-- 3) Trigger BEFORE INSERT/UPDATE : la base garantit la cohérence, plus le JS.
drop trigger if exists trg_sync_snacks_legacy on public.salaries;
create trigger trg_sync_snacks_legacy
  before insert or update of snacks_priorites on public.salaries
  for each row execute function public.sync_snacks_legacy();

-- 4) Re-normalise les lignes backfillées (déclenche la dérivation sur l'existant).
update public.salaries set snacks_priorites = snacks_priorites
 where snacks_priorites is not null and snacks_priorites <> '[]'::jsonb;

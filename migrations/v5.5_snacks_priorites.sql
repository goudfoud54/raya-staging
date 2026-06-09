-- Migration v5.5 — Affectation multi-restaurants avec priorité par salarié
-- ⚠️ NE PAS appliquer sans GO explicite (projet TEST ynnqvtfayrdteqtgxeuk).
-- Remplace le couple (snack_origine_id + est_multi) par une liste ordonnée de restaurants.
-- On CONSERVE snack_origine_id et est_multi : ils restent synchronisés (snack_origine_id = priorité 1,
-- est_multi = plus d'un resto coché) pour ne rien casser dans le planning, l'auto-fill et l'assistant IA.

-- 1) Nouvelle colonne : [{ "restaurant_id": "...", "priorite": 1 }, { ..., "priorite": 2 }, ...]
alter table public.salaries
  add column if not exists snacks_priorites jsonb not null default '[]'::jsonb;

-- 2) Migration douce : le snack d'origine actuel devient la priorité 1
update public.salaries
  set snacks_priorites = jsonb_build_array(jsonb_build_object('restaurant_id', snack_origine_id, 'priorite', 1))
  where snack_origine_id is not null
    and (snacks_priorites is null or snacks_priorites = '[]'::jsonb);

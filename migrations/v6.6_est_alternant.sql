-- v6.6 — Case « alternant / apprenti » sur la fiche salarié.
-- Quand cochée, l'onglet 🎓 Alternance est visible/débloqué ; sinon masqué.
alter table public.salaries add column if not exists est_alternant boolean not null default false;

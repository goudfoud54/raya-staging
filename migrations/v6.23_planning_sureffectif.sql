-- v6.23 — Phase 3 « distribution » de l'auto-fill : marquage des créneaux en SUREFFECTIF
-- ─────────────────────────────────────────────────────────────────────────────
-- La phase 3 de l'auto-fill peut, pour amener un salarié à son heures_min, poser un créneau
-- AU-DELÀ du nb_cible configuré (sureffectif ciblé). Ces créneaux sont marqués pour être
-- repérables dans la grille (liseré/fond distinct + title) et retirables d'un clic par l'admin.
--
-- Colonne SEULE (pas de seed planning_regles ici) : planning_regles est scopé par restaurant_id
-- (multi-tenant) — un seed global serait soit sans restaurant, soit masqué par la RLS. La règle
-- 'sureffectif_minimum' est créée à la volée depuis les Réglages (toggle), défaut OFF côté code.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.planning_creneaux ADD COLUMN IF NOT EXISTS sureffectif boolean NOT NULL DEFAULT false;

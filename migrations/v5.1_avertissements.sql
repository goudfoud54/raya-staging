-- Migration v5.1 — Module Avertissements
-- Ajoute la colonne de mémoire des antécédents inclus dans les courriers de sanction.
-- ⚠️ NE PAS appliquer sans GO explicite de l'utilisateur (projet TEST ynnqvtfayrdteqtgxeuk).
-- Tant que cette colonne n'existe pas, la sélection des antécédents fonctionne EN MÉMOIRE
-- (utilisée à la génération du PDF) ; activer la persistance en passant HAS_ANTECEDENTS_COL=true
-- dans avertissements/index.html après application.

alter table public.disciplinary_actions
  add column if not exists antecedents_included jsonb not null default '[]'::jsonb;

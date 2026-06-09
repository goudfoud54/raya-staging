-- Migration v5.7 — Avertissements : précision des faits + lieu = restaurant
-- ⚠️ NE PAS appliquer sans GO explicite (projet TEST ynnqvtfayrdteqtgxeuk). Aucune donnée détruite.

-- 1) Précision des faits sur le dossier disciplinaire
alter table public.disciplinary_actions
  add column if not exists faits_heure time,                 -- heure des faits (optionnelle)
  add column if not exists faits_impact text,                -- lien de causalité / préjudice subi par l'entreprise
  add column if not exists faits_restaurant_id uuid references public.restaurants(id);  -- lieu = restaurant choisi (sinon faits_lieu en texte libre)

-- 2) Adresse par restaurant (pour imprimer nom + adresse + ville exacts sur les courriers, zéro typo)
alter table public.restaurants
  add column if not exists adresse text,
  add column if not exists code_postal text,
  add column if not exists ville text;

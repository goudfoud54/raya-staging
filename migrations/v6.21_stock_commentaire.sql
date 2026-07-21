-- v6.21 — Commentaire par produit sur le kiosk Stock
-- ─────────────────────────────────────────────────────────────────────────────
-- commentaire_actif : toggle admin par (restaurant_id, produit_id), sur le même modèle que la
--   case « Désactiver » (colonne stock_max.actif) — autorise le salarié à laisser une remarque
--   libre pour CE produit sur CE snack dans le kiosk. Indépendant de `actif`.
-- commentaire : la remarque libre SAISIE par le salarié, stockée avec la quantité dans stock_saisies.
--
-- ⚠ IMPORTANT (faille évitée) : le kiosk écrit en rôle `anon`, et les GRANT INSERT/UPDATE sur
--   stock_saisies sont SCOPÉS PAR COLONNE (liste blanche : id, organization_id, restaurant_id,
--   produit_id, quantite, date_saisie, created_at). Sans grant explicite sur `commentaire`, Postgres
--   rejetterait l'écriture du nouveau champ par l'anon. On l'ajoute donc à la liste (anon + authenticated).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.stock_max     ADD COLUMN IF NOT EXISTS commentaire_actif boolean NOT NULL DEFAULT false;
ALTER TABLE public.stock_saisies ADD COLUMN IF NOT EXISTS commentaire text;

GRANT INSERT(commentaire), UPDATE(commentaire) ON public.stock_saisies TO anon;
GRANT INSERT(commentaire), UPDATE(commentaire) ON public.stock_saisies TO authenticated;

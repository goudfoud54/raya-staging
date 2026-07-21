-- v6.22 — Mode commentaire à 3 états + quantité nullable
-- ─────────────────────────────────────────────────────────────────────────────
-- Remplace le booléen stock_max.commentaire_actif (livré en v6.21) par un enum texte
-- mode_commentaire à 3 valeurs :
--   'aucun'       : pas de commentaire (défaut, comportement historique).
--   'optionnel'   : quantité obligatoire + commentaire libre EN PLUS (= ancien commentaire_actif=true).
--   'obligatoire' : commentaire UNIQUEMENT (pas de quantité) — obligatoire pour valider la saisie.
-- Migration des données : les rares lignes commentaire_actif=true deviennent 'optionnel'.
--
-- stock_saisies.quantite devient NULLABLE : une saisie « commentaire uniquement » n'a
-- littéralement pas de quantité (ex: la monnaie de caisse, la liste des goûts dispo…).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.stock_max ADD COLUMN IF NOT EXISTS mode_commentaire text NOT NULL DEFAULT 'aucun';

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='stock_max' AND column_name='commentaire_actif') THEN
    UPDATE public.stock_max SET mode_commentaire='optionnel' WHERE commentaire_actif=true AND mode_commentaire='aucun';
    ALTER TABLE public.stock_max DROP COLUMN commentaire_actif;
  END IF;
END $$;

ALTER TABLE public.stock_max DROP CONSTRAINT IF EXISTS stock_max_mode_commentaire_chk;
ALTER TABLE public.stock_max ADD CONSTRAINT stock_max_mode_commentaire_chk CHECK (mode_commentaire IN ('aucun','optionnel','obligatoire'));

ALTER TABLE public.stock_saisies ALTER COLUMN quantite DROP NOT NULL;

-- v6.26 — Refonte du PDF de facture : paramètres configurables par organisation.
-- Additif et réversible. Appliqué sur le projet TEST ynnqvtfayrdteqtgxeuk uniquement.
alter table public.fact_parametres add column if not exists couleur_accent  text;  -- filets, total TTC
alter table public.fact_parametres add column if not exists couleur_bandeau text;  -- bandeaux de regroupement + en-têtes
alter table public.fact_parametres add column if not exists mode_reglement  text;  -- « Par virement », etc.
-- logo_url existe déjà : réutilisé pour stocker un data URL base64 (même approche que signature_data).

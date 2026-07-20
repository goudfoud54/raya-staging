-- v6.20 — Heures d'ouverture / fermeture par restaurant
-- ─────────────────────────────────────────────────────────────────────────────
-- Contexte : jusqu'ici aucune notion d'horaires nulle part. Ces colonnes servent
-- d'abord à calibrer les règles planning fin_semaine (plafond de fin lun→jeu) et
-- fin_weekend (plafond de fin ven+sam) : l'écran Réglages du planning propose une
-- suggestion = heure de fermeture + marge, au lieu d'un champ vide sans indication.
--
-- Structure : 2 tiers (semaine = lun→jeu, week-end = ven+sam) alignés EXACTEMENT sur
-- le découpage des règles fin_semaine / fin_weekend, avec ouverture ET fermeture pour
-- chaque tier. Volontairement PAS un horaire par jour (7×2 colonnes) : inutile pour
-- calibrer ces deux règles et sur-dimensionné. Le couple ouverture+fermeture reste
-- réutilisable ailleurs plus tard (affichage des horaires, génération de créneaux
-- cohérents avec l'ouverture réelle) sans refonte.
--
-- Toutes NULLABLES, sans défaut : un restaurant existant sans horaires renseignés
-- n'est pas impacté (comportement planning inchangé tant que rien n'est saisi).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS ouverture_semaine time; -- ouverture lun→jeu
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS fermeture_semaine time; -- fermeture lun→jeu
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS ouverture_weekend time; -- ouverture ven+sam
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS fermeture_weekend time; -- fermeture ven+sam

COMMENT ON COLUMN public.restaurants.ouverture_semaine IS 'Heure d''ouverture lundi→jeudi (NULL = non renseigné)';
COMMENT ON COLUMN public.restaurants.fermeture_semaine IS 'Heure de fermeture lundi→jeudi — base de suggestion pour la règle planning fin_semaine';
COMMENT ON COLUMN public.restaurants.ouverture_weekend IS 'Heure d''ouverture vendredi & samedi (NULL = non renseigné)';
COMMENT ON COLUMN public.restaurants.fermeture_weekend IS 'Heure de fermeture vendredi & samedi — base de suggestion pour la règle planning fin_weekend';

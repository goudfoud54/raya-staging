-- v6.36 — planning_creneaux.origine : d'où vient un créneau (auto-fill ou saisie humaine)
--
-- POURQUOI
-- La réparation par déplacement (planning v0.68) peut désormais libérer un créneau déjà en place pour
-- combler un poste vide, y compris dans un autre restaurant. Elle ne doit JAMAIS faire ça sur un créneau
-- que le patron a posé lui-même : il l'a peut-être placé exprès (un remplacement convenu avec quelqu'un).
-- Rien en base ne permettait de distinguer les deux. Cette colonne le permet.
--
-- CE QUE ÇA CHANGE, EXACTEMENT
--   'auto'   → posé par l'auto-fill. Déplaçable par la réparation.
--   'manuel' → saisi à la main. JAMAIS déplacé ; l'enchaînement possible est affiché en suggestion.
--   NULL     → origine inconnue (toutes les lignes existantes à l'instant de la migration). Traité
--              comme 'manuel' : on ne déplace pas ce dont on ne sait pas d'où ça vient.
--
-- SANS CETTE MIGRATION, L'APPLICATION FONCTIONNE. La colonne est reniflée au chargement (_AF.origineCol,
-- planning/index.html) : absente, elle n'est simplement pas écrite, et la réparation se limite aux
-- créneaux posés pendant la génération en cours. Le rapport le dit. C'est une dégradation, pas une panne.
--
-- RISQUE : faible. Ajout d'une colonne NULLABLE, sans valeur par défaut, sans contrainte sur l'existant,
-- sans index. Aucune ligne n'est réécrite. Aucun code existant ne nomme cette colonne (les select sont
-- en '*', les insert nomment leurs colonnes).
--
-- RETOUR EN ARRIÈRE : ALTER TABLE public.planning_creneaux DROP COLUMN origine;
--   (à faire APRÈS être revenu à une version du front qui ne l'écrit pas — sinon les insertions échouent
--    jusqu'au prochain rechargement de page, le temps que _AF.origineCol repasse à false.)

ALTER TABLE public.planning_creneaux
  ADD COLUMN IF NOT EXISTS origine text;

COMMENT ON COLUMN public.planning_creneaux.origine IS
  'Origine du créneau : ''auto'' (posé par l''auto-fill, déplaçable par la réparation phase 2) ou ''manuel'' (saisi par un humain, jamais déplacé automatiquement). NULL = antérieur à v6.36, traité comme manuel.';

-- Contrôle : les kiosques n'écrivent pas dans planning_creneaux, aucun GRANT à `anon` n'est requis ici
-- (contrairement aux colonnes ajoutées pour la badgeuse / le stock, cf. CLAUDE.md).

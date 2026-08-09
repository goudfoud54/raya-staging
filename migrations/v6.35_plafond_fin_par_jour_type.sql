-- v6.35 — PLAFOND D'HEURE DE FIN : UNE RÈGLE PAR JOUR-TYPE, LES 7 JOURS COUVERTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LE PROBLÈME
-- Il n'existait que deux règles de plafond d'heure de fin :
--     fin_semaine  → lundi, mardi, mercredi, JEUDI
--     fin_weekend  → vendredi, samedi
-- LE DIMANCHE N'APPARTENAIT À AUCUNE DES DEUX. _endCapMin renvoyait null ce jour-là, checkPlacement
-- ne plafonnait rien, et le panneau « Heure de fin max (jour) » sortait sur `if(!cap) return;` — donc
-- affichait un vert rassurant là où il n'y avait AUCUN contrôle. Un jour sans plafond n'est pas un
-- jour permissif : c'est un contrôle manquant que rien ne signale.
--
-- S'ajoutait une seconde sentinelle : le code lisait '00:00' comme « pas de plafond », et l'interface
-- (finRuleInput) relisait '00:00' comme « jamais configurée ». Conséquence : un plafond à MINUIT —
-- l'heure de fermeture la plus courante — était littéralement impossible à enregistrer ; la valeur
-- saisie disparaissait de l'écran au rendu suivant. Depuis v0.64, '00:00' vaut minuit et « pas de
-- plafond » se dit par une valeur VIDE, affichée en clair dans les Réglages.
--
-- ÉTAT LU EN BASE AVANT MIGRATION (org « Groupe Raya », 2026-08-09) :
--     fin_semaine = '00:00'  active=true   restaurant_id=NULL   → soit, en ancienne sémantique,
--                                                                 « jamais configurée » : lun→jeu
--                                                                 n'était PAS plafonné non plus.
--     fin_weekend = '02:00'  active=true   restaurant_id=NULL   → seul plafond réellement en vigueur.
-- Autrement dit : 5 jours sur 7 sans plafond, dont 4 parce que la valeur du patron était avalée.
--
-- CE QUE FAIT CETTE MIGRATION — ADDITIVE, IDEMPOTENTE, RÉVERSIBLE
--   • crée fin_lu_me, fin_je, fin_ve, fin_sa, fin_di, en reprenant les valeurs existantes ;
--   • NE SUPPRIME PAS fin_semaine / fin_weekend : elles restent en base comme repli (le code les
--     relit si la nouvelle clé est absente) et comme filet de retour arrière. Elles sont masquées
--     de l'écran Réglages (RULE_META.deprecated) pour qu'aucun réglage n'ait deux champs.
--   • préserve le découpage par restaurant : une exception posée sur un restaurant précis
--     (restaurant_id renseigné) engendre les mêmes exceptions sur les nouvelles clés.
--
-- ⚠ TRADUCTION DU '00:00' HÉRITÉ EN VALEUR VIDE
-- Dans l'ancienne interface, '00:00' voulait dire « jamais configurée ». Le reprendre tel quel le
-- ferait désormais lire comme MINUIT — c'est-à-dire inventer une contrainte que personne n'a posée,
-- et transformer d'un coup en infractions des créneaux jusque-là conformes. On le traduit donc en
-- valeur VIDE : aucun plafond, mais AFFICHÉ comme tel dans les Réglages au lieu d'être silencieux.
--
-- EFFET SUR LE COMPORTEMENT : AUCUN. Avant migration, le code retombe sur les anciennes règles avec
-- l'ancienne sémantique ; après migration, il lit les nouvelles, qui portent les mêmes valeurs. La
-- migration rend l'état EXPLICITE et MODIFIABLE — elle ne change aucun plafond.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- 1) Les quatre jour-types déjà couverts par une ancienne règle -----------------------------------
INSERT INTO public.planning_regles (organization_id, restaurant_id, cle, libelle, active, valeur, type_regle)
SELECT src.organization_id,
       src.restaurant_id,
       m.new_cle,
       m.libelle,
       src.active,
       -- '00:00' hérité = « jamais configurée » (ancienne sémantique) → valeur vide.
       CASE WHEN coalesce(src.valeur,'') IN ('', '00:00') THEN '' ELSE src.valeur END,
       coalesce(src.type_regle, 'dure')
FROM public.planning_regles src
JOIN (VALUES
        ('fin_semaine', 'fin_lu_me', 'Heure de fin maximale — lundi à mercredi'),
        ('fin_semaine', 'fin_je',    'Heure de fin maximale — jeudi'),
        ('fin_weekend', 'fin_ve',    'Heure de fin maximale — vendredi'),
        ('fin_weekend', 'fin_sa',    'Heure de fin maximale — samedi')
     ) AS m(old_cle, new_cle, libelle) ON m.old_cle = src.cle
WHERE NOT EXISTS (
        SELECT 1 FROM public.planning_regles x
        WHERE x.organization_id = src.organization_id
          AND x.restaurant_id IS NOT DISTINCT FROM src.restaurant_id
          AND x.cle = m.new_cle);

-- 2) Le dimanche — aucune ancienne règle ne le mentionnait, donc rien à reprendre -----------------
-- Créé VIDE et donc visible comme « aucun plafond » dans les Réglages, avec la fin du poste le plus
-- tardif du dimanche proposée en suggestion. C'est au patron de trancher, pas à la migration.
INSERT INTO public.planning_regles (organization_id, restaurant_id, cle, libelle, active, valeur, type_regle)
SELECT DISTINCT
       src.organization_id, src.restaurant_id, 'fin_di',
       'Heure de fin maximale — dimanche', true, '', 'dure'
FROM public.planning_regles src
WHERE src.cle IN ('fin_semaine', 'fin_weekend')
  AND NOT EXISTS (
        SELECT 1 FROM public.planning_regles x
        WHERE x.organization_id = src.organization_id
          AND x.restaurant_id IS NOT DISTINCT FROM src.restaurant_id
          AND x.cle = 'fin_di');

-- 3) Contrôle — doit renvoyer 5 lignes par (organisation, portée restaurant) ----------------------
--   SELECT organization_id, restaurant_id, cle, valeur, active
--     FROM public.planning_regles
--    WHERE cle IN ('fin_lu_me','fin_je','fin_ve','fin_sa','fin_di')
--    ORDER BY organization_id, restaurant_id NULLS FIRST, cle;
-- Attendu pour « Groupe Raya » (restaurant_id NULL) :
--   fin_lu_me = ''       (aucun plafond — hérité du '00:00' qui n'en était pas un)
--   fin_je    = ''       (idem)
--   fin_ve    = '02:00'
--   fin_sa    = '02:00'
--   fin_di    = ''       (jamais couvert)

-- 4) RETOUR ARRIÈRE -------------------------------------------------------------------------------
-- Les anciennes règles n'ayant pas été touchées, il suffit de supprimer les nouvelles : le code
-- retombe automatiquement dessus (cf. FIN_LEGACY_OF_JT / _endCapState).
--   DELETE FROM public.planning_regles
--    WHERE cle IN ('fin_lu_me','fin_je','fin_ve','fin_sa','fin_di');

-- 5) SUPPRESSION DES ANCIENNES CLÉS — PAS MAINTENANT ----------------------------------------------
-- Ne les supprimer qu'une fois cette migration confirmée en production ET le repli retiré du code
-- (FIN_LEGACY_OF_JT). Tant que le repli existe, elles sont le seul filet si les nouvelles lignes
-- venaient à manquer.
--   DELETE FROM public.planning_regles WHERE cle IN ('fin_semaine','fin_weekend');

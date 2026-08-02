-- v6.33 — planning_regles : cloisonnement par ORGANISATION + retrait des droits anon
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- FAILLE CORRIGÉE (annoncée dans v6.19 lignes 9-16, laissée « pour un chantier dédié » — c'est ici).
-- Elle était plus grave que documentée : v6.19 parlait d'« utilisateur authentifié », or la policy
-- était FOR ALL TO public ET le rôle `anon` détenait SELECT/INSERT/UPDATE/DELETE sur la table.
--
-- VÉRIFIÉ EN PRODUCTION AVANT CORRECTION, avec la seule clé publique (aucun compte) :
--   • lecture   : GET  /planning_regles          → content-range 0-15/16 (les 16 règles renvoyées)
--   • création  : POST /planning_regles          → 201, ligne créée
--   • modification : PATCH                       → 200, valeur remplacée
--   • suppression  : DELETE                      → 200, ligne supprimée
--   (test mené sur une ligne jetable `zz_test_securite_anon`, supprimée dans la foulée ;
--    aucune des 16 vraies règles n'a été touchée.)
-- Portée : 16 des 17 lignes avaient restaurant_id NULL, donc exposées. La 17e (sureffectif_minimum,
-- portant un restaurant_id) était protégée par le second membre du OR.
-- Contexte multi-tenant : la base compte déjà 3 organisations ; les 2 autres (sans restaurant)
-- pouvaient lire et écrire les règles du Groupe Raya.
--
-- MODÈLE RETENU (demandé par le patron) :
--   organization_id NOT NULL  → porte le cloisonnement.
--   restaurant_id conservé    → NULL = valeur par DÉFAUT de l'organisation
--                               renseigné = EXCEPTION pour un restaurant précis
--                               (une brasserie et un fast-food n'ont pas les mêmes règles).
--   Résolution côté application (_ruleCtx / _regleOf) : l'exception du restaurant AFFICHÉ l'emporte
--   sur la valeur par défaut de l'organisation.
--
-- ACCÈS : seul planning/index.html lit cette table, en AUTHENTIFIÉ. Vérifié : aucun kiosque
-- (kiosk, badgeuse, stock-kiosk, haccp-kiosk) ni edge function ne la touche → retrait de `anon` sans risque.
--
-- RETOUR EN ARRIÈRE (si le planning n'affichait plus ses règles) :
--   DROP POLICY IF EXISTS planning_regles_all ON public.planning_regles;
--   CREATE POLICY planning_regles_all ON public.planning_regles FOR ALL TO public
--     USING ((restaurant_id IS NULL) OR (EXISTS (SELECT 1 FROM public.restaurants r
--            WHERE r.id = planning_regles.restaurant_id
--              AND (r.organization_id = auth_org() OR auth_role() = 'super_admin'))));
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_regles TO anon;
--   ALTER TABLE public.planning_regles ALTER COLUMN organization_id DROP NOT NULL;
--   -- (la colonne organization_id peut rester : elle est ignorée par l'ancienne policy)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- NOTE : pas de BEGIN/COMMIT explicite — chaque étape est sûre isolément (la seule qui pouvait
-- laisser un état dangereux, le remplacement de policy, est ordonnée pour ne jamais découvrir la
-- table). Le fichier reste donc rejouable tel quel, y compris par un outil qui gère sa propre
-- transaction.

-- 1) Colonne de cloisonnement -------------------------------------------------------------------
ALTER TABLE public.planning_regles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2) Backfill ------------------------------------------------------------------------------------
-- a. Lignes portant un restaurant : l'organisation se déduit du restaurant (source sûre).
UPDATE public.planning_regles p
   SET organization_id = r.organization_id
  FROM public.restaurants r
 WHERE p.restaurant_id = r.id
   AND p.organization_id IS NULL;

-- b. Lignes globales (restaurant_id NULL) : elles appartiennent de fait à l'organisation qui
--    exploite les restaurants. On la déduit plutôt que de coder un UUID en dur, pour que ce fichier
--    reste rejouable sur une autre base.
UPDATE public.planning_regles
   SET organization_id = (
         SELECT r.organization_id FROM public.restaurants r
         GROUP BY r.organization_id ORDER BY count(*) DESC, r.organization_id LIMIT 1)
 WHERE organization_id IS NULL;

-- c. Garde-fou : plutôt que de laisser passer un cloisonnement incomplet, on ÉCHOUE bruyamment.
--    (Cas possible sur une base sans aucun restaurant : mieux vaut un blocage visible qu'une
--    règle orpheline qui redeviendrait invisible pour tout le monde.)
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.planning_regles WHERE organization_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'v6.33 interrompue : % règle(s) sans organisation. Renseignez-les à la main avant de rejouer.', n;
  END IF;
END $$;

-- d. DÉFAUT = organisation de l'appelant. Deux raisons :
--    1. ORDRE DE DÉPLOIEMENT — cette migration s'applique AVANT que le code qui renseigne
--       organization_id ne soit en ligne. Sans ce défaut, tout réglage modifié dans l'intervalle
--       échouerait sur la contrainte NOT NULL, en pleine production.
--    2. FILET DURABLE — si un jour un chemin d'écriture oublie la colonne, la ligne atterrit quand
--       même dans la bonne organisation au lieu d'être rejetée ou, pire, orpheline.
--    Un appel sans session (anon) donnerait NULL → NOT NULL rejette : c'est le comportement voulu.
ALTER TABLE public.planning_regles ALTER COLUMN organization_id SET DEFAULT auth_org();

ALTER TABLE public.planning_regles ALTER COLUMN organization_id SET NOT NULL;

-- 3) Unicité --------------------------------------------------------------------------------------
-- Une seule valeur par défaut d'organisation, et une seule exception par restaurant, pour une clé.
-- Sans ça, deux lignes concurrentes pour la même règle rendraient la valeur appliquée arbitraire.
CREATE UNIQUE INDEX IF NOT EXISTS planning_regles_org_cle_defaut
  ON public.planning_regles(organization_id, cle) WHERE restaurant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS planning_regles_org_resto_cle
  ON public.planning_regles(organization_id, restaurant_id, cle) WHERE restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_planning_regles_org ON public.planning_regles(organization_id);

-- 4) Policy scopée sur l'organisation -------------------------------------------------------------
-- TO authenticated (et non public) : `anon` n'est plus concerné, même s'il retrouvait un GRANT.
-- WITH CHECK explicite (l'ancienne policy n'en avait pas) : on ne peut pas écrire une règle dans une
-- autre organisation, ni rattacher une exception à un restaurant qui n'appartient pas à la sienne.
--
-- ⚠ ORDRE : on CRÉE la nouvelle policy AVANT de retirer l'ancienne. Les policies permissives se
-- cumulent en OR : l'intervalle est donc momentanément plus permissif, jamais bloquant. L'ordre
-- inverse (DROP puis CREATE) laisserait une fenêtre SANS AUCUNE policy, où RLS refuse tout — le
-- planning des trois snacks tomberait dans la minute si l'exécution s'arrêtait là.
ALTER TABLE public.planning_regles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planning_regles_org ON public.planning_regles;
CREATE POLICY planning_regles_org ON public.planning_regles
  FOR ALL TO authenticated
  USING (
    organization_id = auth_org() OR auth_role() = 'super_admin'
  )
  WITH CHECK (
    (organization_id = auth_org() OR auth_role() = 'super_admin')
    AND (
      restaurant_id IS NULL
      OR EXISTS (SELECT 1 FROM public.restaurants r
                  WHERE r.id = planning_regles.restaurant_id
                    AND r.organization_id = planning_regles.organization_id)
    )
  );

-- L'ancienne, celle qui laissait passer « restaurant_id IS NULL » pour tout le monde.
DROP POLICY IF EXISTS planning_regles_all ON public.planning_regles;

-- 5) Retrait des droits anonymes ------------------------------------------------------------------
REVOKE ALL ON public.planning_regles FROM anon;


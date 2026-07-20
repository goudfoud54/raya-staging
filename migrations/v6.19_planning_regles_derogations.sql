-- v6.19 — Planning : régularisation de planning_regles + table d'audit des dérogations
-- ─────────────────────────────────────────────────────────────────────────────
-- Contexte : la table planning_regles était utilisée par planning/index.html mais
-- n'avait AUCUNE migration versionnée (créée à la main hors versionnement, cf. le
-- commentaire dans v6.5_alternance_cfa.sql). Ce fichier documente son schéma réel
-- de façon idempotente pour le rendre traçable et reproductible, sans rien casser
-- sur les bases existantes (CREATE / ADD ... IF NOT EXISTS partout).
--
-- ⚠ FAILLE MULTI-TENANT CONNUE (rapportée, NON corrigée ici — hors scope) :
--   La policy planning_regles_all est ALL / public avec WITH CHECK nul et un qual
--   qui autorise « restaurant_id IS NULL ». Or TOUTES les règles actuelles ont
--   restaurant_id = NULL (règles globales). Conséquence : n'importe quel
--   utilisateur authentifié, quelle que soit son organisation, peut LIRE ET
--   MODIFIER ces règles globales. Un vrai cloisonnement nécessiterait d'ajouter
--   organization_id + re-scoper la table et les policies — non trivial, laissé
--   pour un chantier dédié. On reproduit ici la policy TELLE QUELLE (verbatim).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Schéma de planning_regles (idempotent : ne recrée rien si déjà présent) ----
CREATE TABLE IF NOT EXISTS public.planning_regles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  cle           text NOT NULL,
  libelle       text,
  active        boolean DEFAULT true,
  valeur        text,
  type_regle    text DEFAULT 'dure'
);

-- Rattrapage colonne par colonne pour les bases où la table préexistait mais
-- serait incomplète (défensif — no-op si tout est déjà là).
ALTER TABLE public.planning_regles ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.planning_regles ADD COLUMN IF NOT EXISTS libelle    text;
ALTER TABLE public.planning_regles ADD COLUMN IF NOT EXISTS active     boolean DEFAULT true;
ALTER TABLE public.planning_regles ADD COLUMN IF NOT EXISTS valeur     text;
ALTER TABLE public.planning_regles ADD COLUMN IF NOT EXISTS type_regle text DEFAULT 'dure';

ALTER TABLE public.planning_regles ENABLE ROW LEVEL SECURITY;

-- Policy reproduite à l'identique de l'existant (verbatim). DROP+CREATE pour rester
-- idempotent sans dépendre d'un « CREATE POLICY IF NOT EXISTS » (non supporté partout).
DROP POLICY IF EXISTS planning_regles_all ON public.planning_regles;
CREATE POLICY planning_regles_all ON public.planning_regles
  FOR ALL TO public
  USING (
    (restaurant_id IS NULL) OR (EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = planning_regles.restaurant_id
        AND (r.organization_id = auth_org() OR auth_role() = 'super_admin')
    ))
  );

-- 2) Semences idempotentes des règles attendues par l'app mais parfois absentes --
-- Ces lignes manquaient en base : sans elles, l'écran Réglages n'affichait pas
-- certaines règles et le code retombait sur des valeurs par défaut codées en dur.
-- On sème en GLOBAL (restaurant_id NULL), cohérent avec les règles existantes.
-- Défauts choisis pour PRÉSERVER le comportement actuel :
--   • repos_quotidien / repos_quotidien_h : repos quotidien légal 11h (désormais
--     obligatoire côté code — la ligne existe surtout pour l'afficher, verrouillée).
--   • effectifs_exacts = actif : le contrôle « effectifs cibles » signale déjà
--     tout écart (n != cible), y compris le sur-effectif → on garde ce défaut.
--   • fin_veille_ecole / examen : seuils alternants déjà utilisés en fallback.
INSERT INTO public.planning_regles (restaurant_id, cle, libelle, active, valeur, type_regle)
SELECT v.restaurant_id, v.cle, v.libelle, v.active, v.valeur, v.type_regle
FROM (VALUES
  (NULL::uuid, 'repos_quotidien',   'Repos quotidien minimum (fin soir → matin J+1)',       true,  'true',  'dure'),
  (NULL::uuid, 'repos_quotidien_h', 'Durée du repos quotidien (heures)',                     true,  '11',    'dure'),
  (NULL::uuid, 'effectifs_exacts',  'Compteurs = objectif exact',                            true,  'true',  'dure'),
  (NULL::uuid, 'fin_veille_ecole',  'Heure max de fin de shift la veille d''un jour d''école', true, '22:00', 'dure'),
  (NULL::uuid, 'fin_veille_examen', 'Heure max de fin de shift la veille d''un examen',      true,  '19:00', 'dure')
) AS v(restaurant_id, cle, libelle, active, valeur, type_regle)
WHERE NOT EXISTS (
  SELECT 1 FROM public.planning_regles p
  WHERE p.cle = v.cle AND p.restaurant_id IS NOT DISTINCT FROM v.restaurant_id
);

-- 3) Table d'audit des dérogations manuelles ------------------------------------
-- La saisie manuelle du planning peut désormais forcer un créneau qui enfreint une
-- règle (remplacement d'urgence), mais UNIQUEMENT via une confirmation à double
-- étape. Chaque forçage est journalisé ici : qui, quand, quelle règle, pourquoi.
CREATE TABLE IF NOT EXISTS public.planning_derogations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  salarie_id    uuid REFERENCES public.salaries(id)    ON DELETE SET NULL,
  date          date NOT NULL,
  service       text,
  regle_cle     text,
  regle_label   text,
  motif         text,
  forced_by     uuid REFERENCES public.profiles(id),
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_planning_derogations_resto_date
  ON public.planning_derogations(restaurant_id, date);

ALTER TABLE public.planning_derogations ENABLE ROW LEVEL SECURITY;

-- Lecture/écriture réservées aux membres de l'organisation du restaurant (ou super_admin).
-- À l'écriture, forced_by est verrouillé sur l'utilisateur courant (auth.uid()) → pas
-- d'usurpation possible de l'auteur d'une dérogation.
DROP POLICY IF EXISTS planning_derogations_all ON public.planning_derogations;
CREATE POLICY planning_derogations_all ON public.planning_derogations
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = planning_derogations.restaurant_id
        AND (r.organization_id = auth_org() OR auth_role() = 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = planning_derogations.restaurant_id
        AND (r.organization_id = auth_org() OR auth_role() = 'super_admin')
    )
    AND forced_by = auth.uid()
  );

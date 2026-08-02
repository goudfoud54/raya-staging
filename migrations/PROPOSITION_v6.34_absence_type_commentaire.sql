-- ⚠ PROPOSITION — NE PAS APPLIQUER SANS VALIDATION DU PATRON ⚠
-- Ce fichier n'est PAS une migration à jouer. Il est nommé « PROPOSITION_ » exprès pour ne pas être
-- confondu avec les vNN_*.sql appliqués. Il chiffre et prépare la séparation demandée ; la décision
-- d'exécuter appartient au patron.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LE PROBLÈME DE FOND
-- `salarie_dispos.motif` est UNE SEULE chaîne qui mélange deux choses de nature différente :
--     motif = type + (' — ' + commentaire libre)        (planning/index.html, « Ajouter une absence »)
-- C'est cette confusion qui rendait la fuite inévitable : impossible d'afficher l'un sans l'autre.
-- Le correctif v0.62 tait le champ ENTIER hors encadrement — c'est sûr, mais grossier : l'encadrement
-- ne peut pas non plus filtrer, compter ou exporter par type d'absence.
--
-- CHIFFRAGE SUR LA PRODUCTION (lecture seule, 2026-08-02) — 397 indisponibilités au total :
--   Congé payé ............ 161   (dont 35 avec commentaire)
--   Autre ................. 101   (dont 101 avec commentaire — « Autre » n'a de sens QUE par son texte)
--   Congé sans solde ....... 72   (dont  0)
--   Arrêt maladie .......... 42   (dont  0)   ← donnée de SANTÉ
--   Absence injustifiée ..... 1   (dont  0)   ← donnée DISCIPLINAIRE
--   texte libre / vide ..... 20
--   ────────────────────────────
--   377 lignes commencent par un type reconnu  → séparables MÉCANIQUEMENT, sans perte.
--   136 lignes portent « type — commentaire »  → le découpage sur le premier « — » suffit.
--     1 ligne  est un texte libre sans type    → à traiter à la main (ou classée « Autre »).
--    19 lignes n'ont aucun motif               → type NULL.
-- Conclusion : la séparation est faisable sans perte d'information, avec UNE seule ligne à arbitrer.
--
-- CE QUE ÇA APPORTE
--   • le type devient une donnée structurée : filtrable, comptable, exportable (bilan des arrêts,
--     suivi des congés) sans jamais toucher au commentaire ;
--   • le commentaire libre — le plus imprévisible, celui où un encadrant écrit ce qu'il veut — peut
--     être restreint plus finement que le type ;
--   • l'affichage neutre ne dépend plus d'une troncature de chaîne mais d'une colonne.
--
-- CE QUE ÇA N'APPORTE PAS : la règle d'affichage reste la MÊME. Tant que la séparation n'est pas
-- faite, et même après, rien de ce champ ne s'affiche hors encadrement (cf. canSeeAbsenceMotif).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- 1) Colonnes (additif, réversible : `motif` n'est ni supprimé ni modifié) ------------------------
ALTER TABLE public.salarie_dispos ADD COLUMN IF NOT EXISTS absence_type text;
ALTER TABLE public.salarie_dispos ADD COLUMN IF NOT EXISTS absence_commentaire text;

COMMENT ON COLUMN public.salarie_dispos.absence_type IS
  'Type d''absence normalisé. Donnée potentiellement SENSIBLE (santé : « Arrêt maladie » ; discipline : « Absence injustifiée ») — jamais affichée hors encadrement.';
COMMENT ON COLUMN public.salarie_dispos.absence_commentaire IS
  'Commentaire libre saisi par l''encadrant. JAMAIS affiché hors encadrement.';

-- 2) Découpage (idempotent : ne touche que les lignes pas encore ventilées) -----------------------
UPDATE public.salarie_dispos SET
  absence_type = substring(motif from '^(Arrêt maladie|Congé payé|Congé sans solde|Absence injustifiée|Autre)'),
  absence_commentaire = nullif(btrim(regexp_replace(motif, '^(Arrêt maladie|Congé payé|Congé sans solde|Absence injustifiée|Autre)\s*(—\s*)?', '')), '')
WHERE motif IS NOT NULL AND btrim(motif) <> '' AND absence_type IS NULL
  AND motif ~ '^(Arrêt maladie|Congé payé|Congé sans solde|Absence injustifiée|Autre)';

-- La ligne sans type reconnu : on préserve le texte, on la classe « Autre » plutôt que de la perdre.
UPDATE public.salarie_dispos SET absence_type='Autre', absence_commentaire=btrim(motif)
WHERE motif IS NOT NULL AND btrim(motif) <> '' AND absence_type IS NULL;

-- 3) Contrôle : aucune information perdue --------------------------------------------------------
-- À exécuter APRÈS le découpage. Doit renvoyer 0 ligne : toute divergence signalerait une perte.
--   SELECT id, motif, absence_type, absence_commentaire FROM public.salarie_dispos
--    WHERE motif IS NOT NULL AND btrim(motif) <> ''
--      AND btrim(coalesce(absence_type,'') || coalesce(' — ' || absence_commentaire, '')) <> btrim(motif);

-- 4) NE PAS supprimer `motif` dans la foulée -----------------------------------------------------
-- Le garder au moins une version : il est la seule preuve que le découpage est fidèle, et le code
-- actuel le lit encore (indispoBadge). Suppression seulement quand plus aucun code ne le référence.

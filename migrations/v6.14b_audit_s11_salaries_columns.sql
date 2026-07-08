-- v6.14b — AUDIT 2026-06-14, S11 : restreindre les colonnes de `salaries` lisibles par `anon`.
-- Avant : anon (clé publique) pouvait lire TOUTES les colonnes, dont `pin_badgeuse` ET la PII
-- (num_secu, salaire, adresse, date de naissance…). Après S11, les kiosques vérifient le PIN via
-- l'edge function `verify-pin` (service_role) et n'ont plus besoin de lire le PIN ni la PII.
-- ⚠️ APPLIQUER EN PROD UNIQUEMENT APRÈS avoir déployé `verify-pin` + poussé le front (sinon les
--    anciens kiosques en cache, qui lisent `pin_badgeuse`, casseraient). APPLIQUÉ SUR TEST le 2026-06-14.
-- `authenticated` (admin) et `service_role` conservent l'accès complet.

revoke select on public.salaries from anon;
grant select (id, organization_id, nom, prenom, couleur, actif, snack_origine_id, est_multi)
  on public.salaries to anon;

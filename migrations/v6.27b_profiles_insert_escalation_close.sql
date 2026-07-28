-- v6.27b — CRITIQUE : ferme une escalade super_admin par INSERT sur `profiles` (chaîne F5/C6 rouverte).
-- ✅ APPLIQUÉ SUR PROD `ynnqvtfayrdteqtgxeuk` le 2026-07-28.
--
-- Découvert pendant le chantier kiosque lot 1 (recensement de TOUTES les écritures anon, cf. consigne).
-- La policy `profiles_insert` avait with_check = TRUE, roles {public} (donc anon + authenticated),
-- et anon/authenticated détenaient le GRANT INSERT(role, organization_id). Résultat : un client
-- pouvait INSÉRER un profil role='super_admin' dans une organisation réelle.
--
-- Le trigger F5 `protect_profile_privilege` ne couvre que UPDATE -> l'INSERT le contournait
-- entièrement. Et C6b (repli raya-group supprimé de handle_new_user) a rendu la PRÉCONDITION
-- atteignable : un signup sans invitation valide ne crée plus de profil, donc des auth.users SANS
-- profil existent désormais (4 constatés). L'attaquant s'inscrit -> obtient un uid sans profil ->
-- POST /rest/v1/profiles {id:<son uid>, role:'super_admin', organization_id:<org réelle>} -> super_admin.
-- => la "chaîne de compromission totale" déclarée fermée était rouverte par une autre porte.
--
-- Preuve AVANT (anon, uid aléatoire, rollback garanti par la FK) : l'insert atteignait la violation
-- de clé étrangère (foreign_key_violation) -> la RLS AVAIT ACCEPTÉ la ligne ; avec un uid sans profil
-- réel, l'exploit réussissait.
-- Preuve APRÈS : même insert -> "permission denied for table profiles".
--
-- Aucun code CLIENT n'insère de profil (vérifié). Les 2 seuls chemins légitimes de création,
-- handle_new_user et accept_invitation_existing_user, sont SECURITY DEFINER (owner=postgres) :
-- ils contournent la RLS et conservent le droit INSERT du propriétaire -> NON impactés (prouvé :
-- un insert en contexte postgres réussit toujours, rollback ; l'acceptation d'invitation est OK).

drop policy if exists profiles_insert on public.profiles;
revoke insert on public.profiles from anon, authenticated;

-- ── RETOUR ARRIÈRE (déconseillé — réouvre l'escalade) ──
-- grant insert on public.profiles to anon, authenticated;
-- create policy profiles_insert on public.profiles for insert with check (true);
--
-- ── DURCISSEMENT ULTÉRIEUR SUGGÉRÉ (hors de ce lot) : étendre le trigger F5 à
--    BEFORE INSERT OR UPDATE pour protéger l'invariant de colonne même si une policy INSERT
--    permissive réapparaissait. Non fait ici car drop+revoke ferme déjà la faille.

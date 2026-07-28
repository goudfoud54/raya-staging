-- v6.27 — Kiosque lot 1 : retire le VESTIGE d'écriture anonyme sur `pointages` (faille O3).
-- ✅ APPLIQUÉ SUR PROD `ynnqvtfayrdteqtgxeuk` le 2026-07-28.
--
-- Reprend et FINALISE v6.17 (qui était écrite mais "PAS ENCORE APPLIQUÉE ni TEST ni PROD").
-- La garde de v6.17 était : ne pas appliquer avant que TOUTES les tablettes badgeuse tournent sur
-- le front create-pointage (l'ancien front, en cache, insérait encore en direct via la clé anon).
-- Cette garde est LEVÉE, prouvée par la donnée de prod :
--   select source, count(*), count(kiosk_id) from pointages where ts > now()-interval '21 days' ...
--   -> 479/479 pointages en source='kiosk' AVEC kiosk_id (signature de create-pointage), 0 insert
--      direct, sur les 3 snacks, dernier le 2026-07-28. Aucune tablette n'écrit plus en direct.
--
-- La badgeuse passe par l'edge function create-pointage (service_role, RLS-exempt) qui re-vérifie
-- le PIN, la cohérence org/resto, la séquence d'état, l'anti double-tap et le rate-limit — TOUT ce
-- que la policy anon ne vérifiait pas (elle permettait d'antidater un pointage pour n'importe quel
-- salarie de n'importe quelle org). createPointage() = fetch pur vers l'edge, SANS repli d'insert direct.
--
-- Preuve de fermeture (passe B rejouée en anon, rollback garanti) : l'insert d'un pointage antidaté
-- de 30 j -> "permission denied for table pointages". La lecture anon (pointages_anon_select) reste
-- intacte : la badgeuse lit toujours le dernier pointage (badgeuse/index.html:209).

drop policy if exists pointages_anon_insert on public.pointages;

-- GRANT anon devenu mort (plus aucune policy anon d'écriture) -> retiré (défense en profondeur).
-- On CONSERVE SELECT (lecture badgeuse) et REFERENCES ; authenticated garde INSERT/UPDATE
-- (corrections planning admin, source='admin_correction').
revoke insert, update on public.pointages from anon;

-- ── RETOUR ARRIÈRE (si une tablette non identifiée écrivait réellement en direct) ──
-- grant insert on public.pointages to anon;
-- create policy pointages_anon_insert on public.pointages for insert to anon
--   with check ((restaurant_id is not null) and (salarie_id is not null) and exists (
--     select 1 from salaries s join restaurants r on r.organization_id = s.organization_id
--     where s.id = pointages.salarie_id and r.id = pointages.restaurant_id));

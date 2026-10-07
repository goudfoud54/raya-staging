-- PROPOSITION — NON APPLIQUÉE. À exécuter seulement après accord du patron.
-- Nettoyage des week-ends mis en « repos » par l'ancien pré-remplissage automatique du calendrier
-- d'alternance (retiré en salaries v0.23).
--
-- ÉTAT CONSTATÉ EN PRODUCTION (ynnqvtfayrdteqtgxeuk, lecture seule, 2026-10-07)
--   87 jours de week-end en « repos » dans toute la base :
--   • 86 — Assma EL HAI (Groupe Raya) : TOUS les samedis et dimanches du 06/09/2025 au 28/06/2026,
--     créés d'un seul coup (même horodatage à la microseconde : 2026-07-20 15:54:49.597508+00)
--     → signature du pré-remplissage automatique, pas d'une saisie jour par jour.
--   • 1  — youssef smayet (Raya Metz, AUTRE organisation, fiche non marquée alternant) : dimanche
--     27/06/2027 isolé, créé le 04/09/2026 → ressemble à une saisie volontaire. NON concerné ici.
--
-- EFFET RÉEL DE CES LIGNES : AUCUN hors de l'écran Salariés. Le planning (grille, checkPlacement,
-- auto-fill) et les alertes de retard ne lisent que « ecole » et « examen » ; « repos » n'est lu nulle
-- part ailleurs. Le nettoyage est donc COSMÉTIQUE (affichage du calendrier d'Assma, année 2025-2026
-- terminée). Il n'est pas nécessaire au correctif.
--
-- RETOUR ARRIÈRE : la sauvegarde ci-dessous conserve les 86 lignes ; pour les remettre :
--   insert into public.alternance_jours select * from sauvegardes.repos_weekend_20261007;
--
-- La sauvegarde va dans un schéma À PART (« sauvegardes »), non exposé par l'API : une table créée dans
-- `public` hérite des droits par défaut d'anon/authenticated et serait lisible via l'API REST avec la
-- clé publique tant qu'elle existe. Droits retirés explicitement par sécurité.

begin;

create schema if not exists sauvegardes;
revoke all on schema sauvegardes from public, anon, authenticated;

-- Sauvegarde intégrale avant suppression.
create table if not exists sauvegardes.repos_weekend_20261007 as
  select * from public.alternance_jours
  where organization_id = 'dc0a81a8-60ec-437f-8aa6-e43b8e2b1978'          -- Groupe Raya
    and salarie_id      = '12e78c56-63ee-4f2b-9082-aef9a10fa2df'          -- Assma EL HAI
    and type = 'repos' and source = 'manuel'
    and extract(isodow from date) >= 6
    and created_at = '2026-07-20 15:54:49.597508+00';

revoke all on sauvegardes.repos_weekend_20261007 from public, anon, authenticated;

-- Garde : on n'efface RIEN si le périmètre n'est pas exactement celui constaté.
do $$
declare n int;
begin
  select count(*) into n from sauvegardes.repos_weekend_20261007;
  if n <> 86 then
    raise exception 'Périmètre inattendu : % ligne(s) au lieu de 86 — nettoyage annulé', n;
  end if;
end $$;

delete from public.alternance_jours
where id in (select id from sauvegardes.repos_weekend_20261007);

commit;

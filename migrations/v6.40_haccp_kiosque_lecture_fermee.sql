-- v6.40 — Fermer la lecture anonyme des équipements et zones HACCP (ÉTAPE CONDITIONNELLE)
--
-- ⚠ NE PAS APPLIQUER tant que TOUTES les tablettes HACCP actives ne tournent pas en eatime-kiosk-v12 :
--   une tablette v11 lit les équipements EN DIRECT et afficherait des listes VIDES (plus aucune saisie
--   possible) jusqu'à sa mise à jour. Vérification :
--     select restaurant_id, running_version, seen_at from kiosk_heartbeats where kiosk_type = 'haccp';
--   Les tablettes v12 lisent leur référentiel par kiosk_haccp_referentiel (v6.39).
--
-- Ce que ça ferme : la lecture, par la clé publique, des équipements et zones ACTIFS de TOUTES les
-- organisations (politiques « actif = true » sans filtre d'organisation).
-- Les insertions des tablettes n'en dépendent plus (fonctions SECURITY DEFINER de v6.39).
--
-- RETOUR ARRIÈRE :
--   create policy haccp_equipements_anon_select on public.haccp_equipements for select to anon using (actif = true);
--   create policy haccp_zones_nettoyage_anon_select on public.haccp_zones_nettoyage for select to anon using (actif = true);

drop policy if exists haccp_equipements_anon_select on public.haccp_equipements;
drop policy if exists haccp_zones_nettoyage_anon_select on public.haccp_zones_nettoyage;

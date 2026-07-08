-- v6.17 — Badgeuse : retire le droit d'INSERT direct anon sur `pointages`.
-- ⚠️ NE PAS APPLIQUER avant d'avoir confirmé que le nouveau front (create-pointage, commit
--    "fix(badgeuse): pointage anti-fraude serveur") est bien LIVE sur GitHub Pages ET que les
--    kiosques badgeuse fonctionnent avec. Même leçon que v6.14b (S11 PIN) : appliquer avant que
--    le front soit poussé casserait le pointage en direct (l'ancien front, en cache navigateur,
--    insère encore directement via `sb.from('pointages').insert(...)`).
-- Une fois confirmé : tous les inserts passent par create-pointage (service_role, anti-fraude
-- réelle : PIN re-vérifié, séquence d'état, anti double-tap). L'anon garde uniquement la lecture
-- (pointages_anon_select, pour afficher l'état "présent/pause/absent" sur la grille du kiosque).
-- PAS ENCORE APPLIQUÉ (ni TEST ni PROD) au moment de l'écriture de cette migration.

drop policy if exists pointages_anon_insert on public.pointages;

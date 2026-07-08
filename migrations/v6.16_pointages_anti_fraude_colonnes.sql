-- v6.16 — Badgeuse : colonnes de traçabilité (anti-fraude) + correction admin sur `pointages`.
-- ⚠️ Migration ADDITIVE uniquement (ajout de colonnes nullable) : ne touche à AUCUNE policy RLS
--    existante, donc AUCUN risque de casser l'insert anon actuel (badgeuse/dispos/etc. en prod
--    tant que le nouveau front avec create-pointage n'est pas poussé — cf. v6.17 pour la suite).
-- APPLIQUÉ SUR TEST `ynnqvtfayrdteqtgxeuk`. NE PAS appliquer en PROD sans GO.

-- kiosk_id : identifiant de tablette (localStorage, cf. utils.js:kioskId()) — trace quelle tablette
-- a émis le pointage, permet de détecter un même kiosk_id utilisé sur plusieurs restaurants (spoof).
alter table public.pointages add column if not exists kiosk_id text;

-- Traçabilité d'une correction manuelle par un admin/manager (module admin pointages).
alter table public.pointages add column if not exists corrige_par uuid references public.profiles(id) on delete set null;
alter table public.pointages add column if not exists corrige_le timestamptz;
alter table public.pointages add column if not exists motif_correction text;

comment on column public.pointages.kiosk_id is 'Identifiant tablette (S11/anti-fraude), rempli par create-pointage.';
comment on column public.pointages.corrige_par is 'Profil admin ayant modifié ce pointage a posteriori (module admin).';
comment on column public.pointages.corrige_le is 'Horodatage de la dernière correction admin.';
comment on column public.pointages.motif_correction is 'Motif texte libre saisi par l''admin lors d''une correction (oubli de sortie, erreur, etc.).';

create index if not exists idx_pointages_kiosk on public.pointages(kiosk_id) where kiosk_id is not null;

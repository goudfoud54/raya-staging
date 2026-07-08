-- v6.9 — Correctifs sécurité issus de l'AUDIT 2026-06-14 (lot critique + quick wins DB)
-- Constats couverts : S3, S8 (partiel), D3, S10.
-- ⚠️ APPLIQUÉ SUR TEST `ynnqvtfayrdteqtgxeuk` le 2026-06-14. NE PAS appliquer en PROD
--    (`cnuepnkwsvzgzitegemb`) sans GO explicite.
-- Aucune donnée détruite. Idempotent (IF EXISTS / IF NOT EXISTS).

-- ── S3a : activer la RLS sur la table technique `_mcp_upload_buffer` (advisor ERROR rls_disabled_in_public).
-- Sans policy, anon/authenticated n'y accèdent plus via PostgREST. Les fonctions SECURITY DEFINER
-- (mcp_upload_*) continuent d'y accéder (elles s'exécutent avec les droits du propriétaire).
alter table public._mcp_upload_buffer enable row level security;

-- ── S3b : révoquer l'exécution publique des fonctions d'UPLOAD Storage (réservées au service_role / edge).
revoke execute on function public.mcp_upload_file(text, text, text, text, boolean) from anon, authenticated;
revoke execute on function public.mcp_upload_from_buffer(text, text, text, text, boolean, boolean) from anon, authenticated;

-- ── S8 : révoquer `anon` sur les fonctions non destinées au public (leurs appelants authentifiés restent OK).
revoke execute on function public.next_facture_number(uuid, integer) from anon;          -- appelée par /facturation (authenticated)
revoke execute on function public.recalc_calendar_auto_events(uuid) from anon;            -- appelée par /calendrier (authenticated)
revoke execute on function public.trigger_check_stock_alerts() from anon, authenticated;  -- usage interne / cron uniquement
-- NB : auth_org() / auth_role() / is_admin_or_super() / get_invitation_public() restent exécutables
--      (utilisées par les policies RLS et l'onboarding public) — durcissement séparé, à tester avant.

-- ── D3 : unicité du PIN badgeuse PAR ORGANISATION (aucun doublon existant — vérifié avant migration).
create unique index if not exists salaries_org_pin_uniq
  on public.salaries (organization_id, pin_badgeuse)
  where pin_badgeuse is not null;

-- ── S10 : empêcher le LISTING du bucket public `org-logos` (l'accès par URL d'objet reste possible :
-- le front n'utilise que upload + getPublicUrl, jamais .list()).
drop policy if exists org_logos_read on storage.objects;

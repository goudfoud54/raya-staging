-- v6.9b — Correctif de v6.9 (S3b/S8) : le REVOKE doit viser PUBLIC, pas anon.
-- En Postgres, EXECUTE est accordé par défaut à PUBLIC à la création de la fonction ;
-- `REVOKE ... FROM anon` est donc sans effet (anon hérite via PUBLIC). On révoque depuis PUBLIC
-- puis on re-GRANT aux seuls appelants légitimes.
-- ⚠️ APPLIQUÉ SUR TEST `ynnqvtfayrdteqtgxeuk` le 2026-06-14. NE PAS appliquer en PROD sans GO.

-- Fonctions d'upload Storage → réservées au service_role (edge functions claude-upload-doc / mcp-upload-doc).
revoke execute on function public.mcp_upload_file(text, text, text, text, boolean) from public;
revoke execute on function public.mcp_upload_from_buffer(text, text, text, text, boolean, boolean) from public;
grant  execute on function public.mcp_upload_file(text, text, text, text, boolean) to service_role;
grant  execute on function public.mcp_upload_from_buffer(text, text, text, text, boolean, boolean) to service_role;

-- next_facture_number → appelée par /facturation (authenticated).
revoke execute on function public.next_facture_number(uuid, integer) from public;
grant  execute on function public.next_facture_number(uuid, integer) to authenticated, service_role;

-- recalc_calendar_auto_events → appelée par /calendrier (authenticated).
revoke execute on function public.recalc_calendar_auto_events(uuid) from public;
grant  execute on function public.recalc_calendar_auto_events(uuid) to authenticated, service_role;

-- trigger_check_stock_alerts → usage interne / cron (service_role uniquement).
revoke execute on function public.trigger_check_stock_alerts() from public;
grant  execute on function public.trigger_check_stock_alerts() to service_role;

-- NB : auth_org() / auth_role() / is_admin_or_super() / get_invitation_public() restent exécutables
--      par PUBLIC : indispensables à l'évaluation des policies RLS (anon/authenticated) et à l'onboarding.

-- v6.14a — AUDIT 2026-06-14, S11 : journal des tentatives de PIN (rate-limit kiosques).
-- ⚠️ APPLIQUÉ SUR TEST `ynnqvtfayrdteqtgxeuk` le 2026-06-14. NE PAS appliquer en PROD sans GO.
-- Écrit uniquement par l'edge function `verify-pin` (service_role). Aucun accès anon/authenticated.

create table if not exists public.pin_attempts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,
  restaurant_id   uuid,
  kiosk_id        text,
  ok              boolean not null default false,
  ts              timestamptz not null default now()
);
create index if not exists pin_attempts_kiosk_ts_idx on public.pin_attempts (kiosk_id, ts);
create index if not exists pin_attempts_org_ts_idx   on public.pin_attempts (organization_id, ts);

alter table public.pin_attempts enable row level security;
-- Aucune policy → anon/authenticated n'y accèdent pas via PostgREST. Le service_role (edge) bypasse la RLS.
revoke all on public.pin_attempts from anon, authenticated;

-- Purge > 24 h (la fonction edge purge déjà à chaque appel ; ceci permet un cron optionnel).
create or replace function public.purge_pin_attempts()
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from public.pin_attempts where ts < now() - interval '24 hours';
$$;
revoke execute on function public.purge_pin_attempts() from public;
grant execute on function public.purge_pin_attempts() to service_role;

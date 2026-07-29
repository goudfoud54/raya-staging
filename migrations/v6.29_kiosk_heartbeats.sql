-- v6.29 — Marqueur de version des kiosques (heartbeat).
-- ✅ APPLIQUÉ SUR PROD `ynnqvtfayrdteqtgxeuk` le 2026-07-29.
--
-- Chaque tablette signale périodiquement son état via l'edge function kiosk-ping (service_role,
-- verify_jwt=false, posture create-pointage) — JAMAIS d'écriture anon directe. Une ligne par
-- (restaurant, type de kiosque). L'écran Paramètres → Tablettes lit cette table (RLS org-scopée) et
-- compare running_version à la CACHE_VERSION déployée (lue dans sw.js) pour classer à jour / ancienne /
-- muette. Prérequis au lot 2 de sécurité (refermer les lectures anon en sachant quel code tourne).

create table if not exists public.kiosk_heartbeats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kiosk_type text not null,                 -- 'badgeuse' | 'stock' | 'haccp' | 'hub'
  running_version text,                     -- CACHE_VERSION du SW actif = code réellement EXÉCUTÉ
  update_staged text,                       -- CACHE_VERSION d'un SW "waiting" (nouvelle version téléchargée, en attente)
  seen_at timestamptz not null default now(),
  unique (restaurant_id, kiosk_type)        -- ⚠ limite ASSUMÉE : 2 tablettes du même type sur un snack partageraient la ligne
);

alter table public.kiosk_heartbeats enable row level security;

create policy kiosk_heartbeats_select on public.kiosk_heartbeats for select
  using (organization_id = auth_org() or auth_role() = 'super_admin');
create policy kiosk_heartbeats_delete on public.kiosk_heartbeats for delete
  using ((organization_id = auth_org() and is_admin_or_super()) or auth_role() = 'super_admin');

-- Aucune policy INSERT/UPDATE : seule l'edge (service_role) écrit. Table HORS surface anon.
revoke all on public.kiosk_heartbeats from anon;
grant select, delete on public.kiosk_heartbeats to authenticated;
grant select, insert, update, delete on public.kiosk_heartbeats to service_role;

-- ── RETOUR ARRIÈRE ──
-- drop table if exists public.kiosk_heartbeats;  (+ supprimer l'edge kiosk-ping, git revert front)

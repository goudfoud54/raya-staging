-- v6.24 — Alertes de retard (écart planning prévu ↔ pointages réels)
-- Trois tables : configuration par restaurant, historique/anti-doublon des retards, abonnements push web.
-- Additive et réversible. Rien ne s'envoie tant qu'aucune config n'est `actif=true` (défaut OFF).
-- Appliqué sur le projet TEST ynnqvtfayrdteqtgxeuk uniquement.

-- ───────────────────────── 1. Config par restaurant (calquée sur stock_alertes_config) ─────────────────────────
create table if not exists public.retard_alertes_config (
  restaurant_id          uuid primary key references public.restaurants(id) on delete cascade,
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  actif                  boolean not null default false,           -- OFF par défaut : l'outil ne surprend personne
  seuil_minutes          integer not null default 15,              -- retard = X min après l'heure prévue sans pointage
  plage_debut            time    not null default '06:00',         -- ne pas alerter hors de cette plage (resto fermé)
  plage_fin              time    not null default '23:59',
  alerte_sortie_oubliee  boolean not null default false,           -- alerter aussi les sorties non pointées
  sortie_grace_minutes   integer not null default 30,              -- délai après l'heure de fin avant d'alerter la sortie
  notif_salarie          boolean not null default true,            -- push au salarié concerné (souvent un simple oubli)
  email_alerte           text,                                     -- email de secours
  wa_groupe_id           text,                                     -- groupe WhatsApp de travail des managers (JID)
  wa_groupe_nom          text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- ───────────────────────── 2. Retards : historique ET trace anti-doublon ─────────────────────────
-- La clé unique (salarie, resto, date, service, type) EST le garde-fou « une seule alerte par créneau ».
-- Détection : ligne créée quand le retard est constaté. Résolution : pointage_ts/retard_minutes/statut
-- remplis lors d'un passage ultérieur du cron (heure réelle + durée exacte → exploitable en disciplinaire).
create table if not exists public.retards (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  salarie_id       uuid not null references public.salaries(id) on delete cascade,
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  date             date not null,                     -- date LOCALE (Europe/Paris) du créneau prévu
  service          text not null,                     -- 'midi' | 'soir'
  type             text not null default 'retard',    -- 'retard' | 'sortie_oubliee'
  heure_prevue     time,                              -- heure_debut (retard) / heure_fin (sortie oubliée)
  seuil_minutes    integer,                           -- seuil au moment de la détection (snapshot)
  detecte_at       timestamptz not null default now(),
  pointage_ts      timestamptz,                       -- arrivée/sortie réelle (rempli à la résolution)
  retard_minutes   integer,                           -- durée exacte du retard (rempli à la résolution)
  statut           text not null default 'en_retard', -- en_retard | arrive | absent | sortie_manquante | sortie_ok
  notifie          jsonb default '{}'::jsonb,         -- canaux notifiés {push:true, wa:true, email:false}
  created_at       timestamptz default now(),
  unique (salarie_id, restaurant_id, date, service, type)
);
create index if not exists idx_retards_org_date  on public.retards(organization_id, date);
create index if not exists idx_retards_sal_date  on public.retards(salarie_id, date);
-- Résolution : retrouver rapidement les lignes encore ouvertes
create index if not exists idx_retards_open on public.retards(statut) where statut in ('en_retard','sortie_manquante');

-- ───────────────────────── 3. Abonnements push web (app salarié /moi/) ─────────────────────────
create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  salarie_id       uuid,
  organization_id  uuid,
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  user_agent       text,
  created_at       timestamptz default now(),
  last_used_at     timestamptz,
  disabled_at      timestamptz                       -- soft-delete quand le service push renvoie 404/410
);
create index if not exists idx_push_sub_salarie on public.push_subscriptions(salarie_id) where disabled_at is null;
create index if not exists idx_push_sub_profile on public.push_subscriptions(profile_id);

-- ───────────────────────── RLS ─────────────────────────
alter table public.retard_alertes_config enable row level security;
alter table public.retards               enable row level security;
alter table public.push_subscriptions    enable row level security;

-- Config : réglage admin, scoping org strict
drop policy if exists retard_cfg_admin on public.retard_alertes_config;
create policy retard_cfg_admin on public.retard_alertes_config
  for all to authenticated
  using (is_admin_or_super() and organization_id = auth_org())
  with check (is_admin_or_super() and organization_id = auth_org());

-- Retards : lecture seule côté client, org-wide — ALIGNÉE sur la policy de `pointages` (tout membre
-- authentifié de l'org, ou super_admin), sinon un manager non-admin verrait un panneau vide.
-- Écritures réservées au service_role (edge function) — qui bypasse la RLS.
drop policy if exists retards_read on public.retards;
create policy retards_read on public.retards
  for select to authenticated
  using (organization_id = auth_org() or auth_role() = 'super_admin');

-- Push subscriptions : chaque utilisateur gère UNIQUEMENT les siens (clé auth.uid()).
drop policy if exists push_sub_own on public.push_subscriptions;
create policy push_sub_own on public.push_subscriptions
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ───────────────────────── GRANTS (RLS ne filtre pas l'absence de privilège) ─────────────────────────
grant select, insert, update, delete on public.retard_alertes_config to authenticated;
grant select                        on public.retards               to authenticated;
grant select, insert, update, delete on public.push_subscriptions    to authenticated;

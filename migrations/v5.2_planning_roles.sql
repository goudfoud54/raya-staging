-- Migration v5.2 — Planning : rôles personnalisables par organisation + niveau d'expérience
-- ⚠️ NE PAS appliquer sans GO explicite (projet TEST ynnqvtfayrdteqtgxeuk).
-- Aucune donnée n'est détruite. Les plannings existants (role 'cuisine'/'caisse') restent valides :
-- la conversion en rôles personnalisables se fait en 1 clic côté UI (insère les org_roles correspondants).

-- 1) Table des rôles configurables, isolée par organisation
create table if not exists public.org_roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cle             text not null,                 -- slug stable stocké dans planning_creneaux.role / salarie_roles.role / planning_effectifs.role
  nom             text not null,                 -- libellé affiché (ex: "Cuisinier")
  couleur         text,                          -- couleur du badge dans la grille (optionnel)
  ordre           integer not null default 0,    -- ordre d'affichage
  actif           boolean not null default true, -- soft-delete : on désactive sans casser l'historique
  created_at      timestamptz default now(),
  unique (organization_id, cle)
);
create index if not exists org_roles_org_idx on public.org_roles(organization_id);

alter table public.org_roles enable row level security;
-- Même schéma de sécurité que les autres tables (helpers auth_org()/auth_role())
drop policy if exists org_roles_all on public.org_roles;
create policy org_roles_all on public.org_roles for all
  using ((organization_id = auth_org()) or (auth_role() = 'super_admin'))
  with check ((organization_id = auth_org()) or (auth_role() = 'super_admin'));

-- 2) Niveau d'expérience par rôle assigné à un salarié
--    (salarie_roles a déjà restaurant_id : un niveau par resto reste possible à l'avenir ;
--     pour l'instant l'UI assigne au niveau salarié, restaurant_id = null)
alter table public.salarie_roles
  add column if not exists niveau text not null default 'experimente';
-- valeurs attendues : 'experimente' | 'nouveau'  (les lignes existantes deviennent 'experimente')

-- 3) Contrainte d'expérience dans les effectifs cibles
alter table public.planning_effectifs
  add column if not exists nb_experimentes integer not null default 0;
-- "nb_cible" personnes requises, "dont nb_experimentes" expérimentées minimum

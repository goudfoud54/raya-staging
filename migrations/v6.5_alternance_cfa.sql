-- v6.5 — Alternance / CFA : planning d'école des apprentis (PROPOSITION — à appliquer sur GO)
-- 2 tables : alternance_calendrier (config CFA + doc source par salarié & année)
--            alternance_jours (1 ligne par jour taggé, précision au jour exact)
-- Les jours type 'ecole'/'examen' bloqueront l'auto-fill (lus côté planning, en plus des salarie_dispos).
-- Les règles "fin de shift max la veille d'école/examen" passent par planning_regles (pas de DDL ici).
-- Convention RLS identique aux autres tables (helpers auth_org()/auth_role()).

create table if not exists public.alternance_calendrier (
  id               uuid primary key default gen_random_uuid(),
  salarie_id       uuid not null references public.salaries(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  cfa_nom          text,
  annee_scolaire   text,                 -- ex: '2025-2026'
  date_debut       date,
  date_fin         date,
  source_doc_path  text,                 -- chemin bucket du PDF/image uploadé
  couleurs_legende jsonb,                -- mapping couleur détectée -> type (école/examen/…)
  statut           text not null default 'brouillon' check (statut in ('brouillon','valide')),
  created_at       timestamptz not null default now(),
  validated_at     timestamptz,
  unique (salarie_id, annee_scolaire)
);

create table if not exists public.alternance_jours (
  id               uuid primary key default gen_random_uuid(),
  salarie_id       uuid not null references public.salaries(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  date             date not null,
  type             text not null check (type in ('ecole','examen','entreprise','vacances','ferie','repos')),
  source           text not null default 'manuel' check (source in ('ocr','manuel')),
  note             text,
  created_at       timestamptz not null default now(),
  unique (salarie_id, date)
);
create index if not exists alt_jours_sal_date_idx on public.alternance_jours(salarie_id, date);
create index if not exists alt_jours_org_date_idx on public.alternance_jours(organization_id, date);

alter table public.alternance_calendrier enable row level security;
alter table public.alternance_jours      enable row level security;

create policy alt_cal_all on public.alternance_calendrier for all
  using ((organization_id = auth_org()) or (auth_role() = 'super_admin'))
  with check ((organization_id = auth_org()) or (auth_role() = 'super_admin'));

create policy alt_jours_all on public.alternance_jours for all
  using ((organization_id = auth_org()) or (auth_role() = 'super_admin'))
  with check ((organization_id = auth_org()) or (auth_role() = 'super_admin'));

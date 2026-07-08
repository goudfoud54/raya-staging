-- v6.15 — Alternance/CFA : mémoire du mapping COULEUR → CATÉGORIE, PAR ORGANISATION.
-- Aucune palette fixe : chaque org/CFA a ses couleurs. On mémorise ce que l'utilisateur a mappé pour
-- pré-remplir automatiquement les imports suivants (corrigible). Alimente la modale showCfaClusters.
-- ⚠️ APPLIQUÉ SUR TEST `ynnqvtfayrdteqtgxeuk` le 2026-06-14. NE PAS appliquer en PROD sans GO.

create table if not exists public.cfa_color_mappings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_label    text,                              -- nom du CFA / style de planning (désambiguïse), optionnel
  rgb             text not null,                     -- couleur représentative du cluster, format "r,g,b"
  categorie       text not null check (categorie in ('ecole','examen','entreprise','vacances','ferie','repos')),
  updated_at      timestamptz not null default now()
);
create index if not exists cfa_color_mappings_org_idx on public.cfa_color_mappings(organization_id, source_label);

alter table public.cfa_color_mappings enable row level security;
-- Isolation par organisation ; lecture/écriture réservées admin/manager (super_admin bypass).
create policy cfa_color_mappings_all on public.cfa_color_mappings for all
  using      ((organization_id = auth_org() and auth_role() in ('admin','manager','super_admin')) or auth_role() = 'super_admin')
  with check ((organization_id = auth_org() and auth_role() in ('admin','manager','super_admin')) or auth_role() = 'super_admin');

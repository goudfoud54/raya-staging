-- v6.31 — Numérotation des factures : mensuelle, configurable, attribuée SANS TROU par la base.
-- ✅ APPLIQUÉ SUR PROD `ynnqvtfayrdteqtgxeuk` le 2026-07-29.
--
-- Avant : compteur ANNUEL (fact_compteurs org+annee) + numéro construit côté navigateur via la RPC
-- next_facture_number → format annuel « 2026-001 », alors que les 11 factures réelles sont mensuelles
-- « N° 2026-MM-NNN ». Et l'attribution client (RPC puis insert) pouvait laisser un trou si l'insert échouait.
--
-- Après : le numéro est attribué par un TRIGGER BEFORE INSERT, dans la MÊME transaction que la facture :
--   • jamais de trou (un insert annulé annule l'incrément du compteur) ;
--   • jamais de doublon (l'upsert sérialise sur la clé primaire) ;
--   • format piloté par fact_parametres (préfixe + mensuel/annuel), donc réglable par organisation ;
--   • un numéro fourni explicitement (reprise/migration) est respecté.
-- Le front n'insère plus de numero et le relit. L'ancienne RPC est SUPPRIMÉE → un front périmé échoue
-- proprement (RPC introuvable) au lieu de créer un numéro au mauvais format.
--
-- Amorçage : déduit des 11 factures (max NNN par mois) → dernier_numero = dernier numéro UTILISÉ, donc
-- la prochaine facture d'un mois déjà utilisé reprend APRÈS (juillet: 2 → prochaine = 3) et un mois neuf
-- repart à 001 (août → « N° 2026-08-001 »). Vérifié empiriquement (org de test, tout annulé).
-- Choix produit : défaut 'mensuel' (usage observé) ; un revendeur peut passer 'annuel' dans les réglages.
-- NB : fact_parametres.prochaine_numero est un champ HÉRITÉ, non utilisé par ce mécanisme.

alter table public.fact_compteurs add column if not exists mois smallint not null default 0;
alter table public.fact_compteurs drop constraint if exists fact_compteurs_pkey;
alter table public.fact_compteurs add primary key (organization_id, annee, mois);

alter table public.fact_parametres add column if not exists format_numero text not null default 'mensuel';
alter table public.fact_parametres drop constraint if exists fact_parametres_format_numero_chk;
alter table public.fact_parametres add constraint fact_parametres_format_numero_chk check (format_numero in ('mensuel','annuel'));

create or replace function public.assign_facture_numero() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $fn$
declare v_prefix text; v_format text; v_annee int; v_mois int; v_key_mois int; v_seq int; v_d date;
begin
  if new.numero is not null and btrim(new.numero) <> '' then return new; end if;
  select coalesce(prefix_numero,''), coalesce(format_numero,'mensuel')
    into v_prefix, v_format from public.fact_parametres where organization_id = new.organization_id;
  v_format := coalesce(v_format,'mensuel');
  v_d := coalesce(new.date_facture, current_date);
  v_annee := extract(year from v_d)::int; v_mois := extract(month from v_d)::int;
  v_key_mois := case when v_format='mensuel' then v_mois else 0 end;
  insert into public.fact_compteurs (organization_id, annee, mois, dernier_numero)
    values (new.organization_id, v_annee, v_key_mois, 1)
    on conflict (organization_id, annee, mois)
    do update set dernier_numero = fact_compteurs.dernier_numero + 1, updated_at = now()
    returning dernier_numero into v_seq;
  new.numero := v_prefix || v_annee::text || '-'
             || case when v_format='mensuel' then lpad(v_mois::text,2,'0') || '-' else '' end
             || lpad(v_seq::text,3,'0');
  return new;
end $fn$;

drop trigger if exists trg_assign_facture_numero on public.factures;
create trigger trg_assign_facture_numero before insert on public.factures
  for each row execute function public.assign_facture_numero();

insert into public.fact_compteurs (organization_id, annee, mois, dernier_numero)
select organization_id, annee, mois, max(seq) from (
  select organization_id,
    (regexp_match(numero,'(\d{4})-(\d{2})-(\d{3})'))[1]::int as annee,
    (regexp_match(numero,'(\d{4})-(\d{2})-(\d{3})'))[2]::int as mois,
    (regexp_match(numero,'(\d{4})-(\d{2})-(\d{3})'))[3]::int as seq
  from public.factures where numero ~ '\d{4}-\d{2}-\d{3}'
) s group by organization_id, annee, mois
on conflict (organization_id, annee, mois) do update set dernier_numero = greatest(fact_compteurs.dernier_numero, excluded.dernier_numero);

update public.fact_parametres set prefix_numero='N° ', format_numero='mensuel'
  where organization_id='dc0a81a8-60ec-437f-8aa6-e43b8e2b1978';

drop function if exists public.next_facture_number(uuid, integer);

-- ── RETOUR ARRIÈRE : drop trigger + function assign_facture_numero ; recréer next_facture_number
--    (version annuelle d'origine) ; retirer la colonne mois / format_numero si besoin. Le front v0.7-
--    rappellera la RPC. (Les 11 factures et leurs numéros ne sont jamais touchés par cette migration.)

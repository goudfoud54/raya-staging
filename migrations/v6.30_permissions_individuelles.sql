-- v6.30 — PERMISSIONS INDIVIDUELLES PAR UTILISATEUR (exception par module, tri-état).
--
-- Besoin : « j'ai 2 managers et je veux que seulement 1 ait accès à Facturation ». Aujourd'hui les
-- accès se décident par rôle uniquement, donc deux managers ont forcément les mêmes droits.
-- L'alternative (multiplier les rôles : « manager », « manager sans finance »…) est un piège connu.
--
-- ── CHOIX DE STOCKAGE : colonne sur `profiles`, PAS table dédiée ──────────────────────────────
-- Le danger identifié d'avance : la policy `profiles_update` autorise `id = auth.uid()`, donc
-- TOUTE colonne posée sur `profiles` est modifiable par son propre titulaire. Une colonne
-- d'exceptions non protégée = n'importe quel manager s'accorde Facturation en une requête, soit
-- exactement l'escalade F5 qu'on vient de fermer sur `role`, un cran plus bas.
-- La colonne est donc protégée par le trigger EXISTANT `protect_profile_privilege` (BEFORE UPDATE,
-- vérifié : `CREATE TRIGGER trg_protect_profile_privilege BEFORE UPDATE ON public.profiles`),
-- étendu ici pour couvrir `module_exceptions` comme il couvre déjà `role` et `organization_id`.
-- L'INSERT n'a pas besoin d'être couvert : v6.27b a révoqué INSERT à anon+authenticated.
--
-- Pourquoi cette option plutôt qu'une table dédiée :
--   • zéro requête supplémentaire au chargement de chaque page (le profil est déjà lu) et zéro
--     lecture supplémentaire dans `has_module_access`, qui est évaluée par ligne sur ~60 policies ;
--   • réutilise des policies déjà auditées (profiles_select/update) au lieu d'en créer 4 nouvelles,
--     donc moins de surface neuve à se tromper ;
--   • le garde-fou n'est pas neuf non plus : c'est le trigger qui protège déjà `role`.
-- Le prix assumé : la protection repose sur un trigger, pas sur une policy. D'où la preuve par
-- tentative réelle (voir bloc PREUVES en fin de fichier).
--
-- ⚠️ GRANTS : les privilèges sur `profiles` sont posés COLONNE PAR COLONNE (vérifié dans
-- information_schema.column_privileges). Une colonne ajoutée sans GRANT explicite ferait échouer
-- TOUS les `select('*')` — c'est-à-dire le portail, planning, salaries, stock, haccp, finance,
-- facturation, moi et parametres, immédiatement. Les GRANT ci-dessous ne sont pas une précaution :
-- ils sont obligatoires pour que la migration ne casse pas la production.

-- ─────────────────────────── 1. La colonne ───────────────────────────
alter table public.profiles
  add column if not exists module_exceptions jsonb not null default '{}'::jsonb;

comment on column public.profiles.module_exceptions is
  'Exceptions d''accès par module, tri-état : {"facturation": true} = autorisé explicitement, '
  '{"facturation": false} = refusé explicitement, clé absente = hérité du rôle. '
  'Écriture réservée aux admins de l''organisation sur les AUTRES utilisateurs (trigger '
  'protect_profile_privilege) — un utilisateur ne peut pas modifier ses propres exceptions.';

-- Sans ces GRANT, tout `select *` sur profiles casse (privilèges par colonne — cf. en-tête).
grant select (module_exceptions), update (module_exceptions) on public.profiles to authenticated;
grant select (module_exceptions), update (module_exceptions), insert (module_exceptions)
  on public.profiles to service_role;
-- anon : AUCUN grant volontairement. Aucune page anon ne lit profiles avec `*` (recensé), et les
-- exceptions n'ont rien à faire dans une réponse publique.

-- ───────────── 2. Le cœur de décision, PUR (testable sans données) ─────────────
-- Doit rester identique à `effectiveAccess()` dans access.js (source de vérité côté navigateur).
-- La parité est vérifiée sur un jeu de cas commun (tests/cas_acces.json) par :
--   • tests/acces_test.js        → hors ligne, dans `node tests/run.js` (table DEFAULT_PERMS + cas JS)
--   • scripts/parite_acces_sql.js → exécuté en base, compare les verdicts SQL aux verdicts attendus
-- Fonction PURE (aucune lecture de table) précisément pour pouvoir être exercée sur une liste de
-- cas en une seule requête, sans créer d'utilisateurs de test en production.
create or replace function public.module_access_decide(
  p_module    text,
  p_role      text,
  p_perms     jsonb,      -- organizations.permissions (peut être null)
  p_exception boolean     -- true = autorisé, false = refusé, null = hérité
) returns boolean
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_allowed jsonb;
  v_default text[];
begin
  -- 1. super_admin passe partout, et n'est JAMAIS concerné par les exceptions.
  if p_role = 'super_admin' then return true; end if;

  -- 1 bis. Rôle inconnu → refus, AVANT toute autre règle. Cas dégénéré (profiles.role est NOT NULL,
  -- donc inatteignable en pratique) mais il doit échouer fermé : sans ce garde-fou, un rôle null
  -- obtiendrait les modules ouverts à '*'. C'était déjà le comportement de has_module_access avant
  -- v6.30 ; le conserver ici rend le remplacement strictement neutre (prouvé sur 680 cas, plus bas).
  if p_role is null or p_role = '' then return false; end if;

  -- 2. Exception individuelle — prime sur le rôle, dans les deux sens.
  --    `is true` / `is false` et non `if p_exception` : null (hérité) doit retomber plus bas.
  if p_exception is true  then return true;  end if;
  if p_exception is false then return false; end if;

  -- 3. Permissions de l'organisation, si elle a configuré ce module (même une liste vide = accès
  --    retiré volontairement).
  if p_perms is not null and p_perms ? p_module then
    v_allowed := p_perms -> p_module;
    -- Valeur malformée (null jsonb, chaîne, objet) = aucun rôle autorisé. Même verdict que
    -- côté JS, où rolesFor() force `Array.isArray(v) ? v : []`.
    if v_allowed is null or jsonb_typeof(v_allowed) <> 'array' then return false; end if;
    return coalesce((v_allowed ? '*') or (v_allowed ? p_role), false);
  end if;

  -- 4. DEFAULT_PERMS : doit rester identique à access.js (source de vérité côté client).
  v_default := case p_module
    when 'moi' then array['*']
    when 'import-contrats' then array['admin','manager']
    when 'salaries' then array['admin']
    when 'calendrier' then array['admin','manager']
    when 'avertissements' then array['admin']
    when 'pilotage' then array['admin','manager']
    when 'planning' then array['admin','manager']
    when 'badgeuse' then array['*']
    when 'dispos' then array['*']
    when 'haccp' then array['admin','manager']
    when 'haccp-kiosk' then array['*']
    when 'finance' then array['admin']
    when 'stock' then array['admin','manager']
    when 'stock-kiosk' then array['*']
    when 'facturation' then array['admin']
    when 'parametres' then array['admin']
    -- Module inconnu → AUCUN rôle autorisé (échec fermé). Avant v6.30 le `else` valait
    -- array['admin'] : un identifiant de module mal orthographié accordait silencieusement l'accès
    -- aux admins, alors que access.js le refusait déjà (DEFAULT_PERMS[inconnu] = absent = []).
    -- Les deux côtés refusent désormais, et un module ajouté au code sans être déclaré ici échoue
    -- de façon VISIBLE au lieu de s'ouvrir en silence. Branche inatteignable via les policies
    -- existantes : elles appellent toutes has_module_access() avec un littéral de la liste ci-dessus.
    else array[]::text[]
  end;

  return coalesce(('*' = any(v_default)) or (p_role = any(v_default)), false);
end;
$$;

-- ───────────── 3. has_module_access : simple enveloppe autour du cœur pur ─────────────
-- Une SEULE logique côté base : cette fonction ne décide plus rien, elle lit et délègue.
-- Perf : un seul select sur profiles (role + org + exceptions) au lieu de auth_role() + auth_org(),
-- qui faisaient deux lectures. Cette fonction est évaluée par ligne sur ~60 policies (fin_*, fact_*,
-- factures*, bons_livraison, clients) — v6.11 était une passe de durcissement perf, on ne régresse pas.
create or replace function public.has_module_access(p_module text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_role  text;
  v_org   uuid;
  v_exc   jsonb;
  v_perms jsonb;
  v_flag  boolean;
begin
  select role, organization_id, coalesce(module_exceptions, '{}'::jsonb)
    into v_role, v_org, v_exc
    from public.profiles
   where id = auth.uid();

  if v_role = 'super_admin' then return true; end if;
  if v_role is null or v_org is null then return false; end if;

  select permissions into v_perms from public.organizations where id = v_org;

  -- Tri-état : SEUL un vrai booléen jsonb compte comme exception ; toute autre valeur = hérité.
  -- (Identique à exceptionFor() en JS, qui exige `v === true` / `v === false`.)
  v_flag := case jsonb_typeof(v_exc -> p_module)
              when 'boolean' then (v_exc ->> p_module)::boolean
              else null
            end;

  return module_access_decide(p_module, v_role, v_perms, v_flag);
end;
$$;

-- ───────────── 4. Le garde-fou : extension du trigger F5 existant ─────────────
-- Règle : les exceptions sont un privilège, donc mêmes protections que `role`.
--   • contextes serveur de confiance (postgres / service_role) : inchangé, ils passent ;
--   • super_admin : peut tout modifier (y compris ses propres exceptions) ;
--   • admin : peut modifier les exceptions des AUTRES membres de SON organisation, jamais les siennes ;
--   • tout le reste (manager, salarié, et un admin sur sa propre ligne) : refus 42501.
-- Interdire l'auto-modification ferme d'un coup les deux sens du problème : un manager ne peut pas
-- s'accorder Facturation, et un admin ne peut pas se refuser Paramètres et se verrouiller dehors.
create or replace function public.protect_profile_privilege()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor text;
begin
  -- Contextes serveur de confiance : accept_invitation (definer postgres), admin-users (service_role).
  if current_user in ('postgres','service_role','supabase_admin') then
    return new;
  end if;

  v_actor := coalesce(auth_role(), '');

  -- Un utilisateur direct (authenticated/anon) ne peut changer ni son role ni son organization_id,
  -- sauf s'il est déjà super_admin (cas switchOrg du patron).
  if (new.role is distinct from old.role) or (new.organization_id is distinct from old.organization_id) then
    if v_actor <> 'super_admin' then
      raise exception 'Modification de role/organization_id non autorisee' using errcode='42501';
    end if;
  end if;

  -- v6.30 — exceptions par module : privilège, donc jamais auto-attribuable.
  if (new.module_exceptions is distinct from old.module_exceptions) then
    if v_actor = 'super_admin' then
      null;                                             -- super_admin : autorisé partout
    elsif v_actor = 'admin'
      and new.id <> auth.uid()                          -- jamais sur sa propre ligne
      and old.organization_id = auth_org() then         -- et seulement dans son organisation
      null;
    else
      raise exception 'Modification des exceptions de module non autorisee' using errcode='42501';
    end if;
  end if;

  return new;
end;
$$;

-- ────────── PREUVE DE NON-RÉGRESSION (exécutée avant application, 2026-07-29) ──────────
-- Remplacer une fonction qui garde ~60 policies de production mérite mieux qu'un échantillon.
-- L'ancien corps a été transcrit littéralement dans une fonction temporaire (zz_tmp_decide_ancien,
-- droppée depuis) et comparé au nouveau cœur sur le produit cartésien :
--   17 modules (16 connus + 1 inconnu) × 5 rôles × 8 formes de organizations.permissions
--   (absente, vide, [admin], [], [*], [manager,salarie], [admin,manager], autre-module) = 680 cas,
--   exceptions à null (état de TOUS les utilisateurs existants).
--   → 680 cas, 0 divergence. Le remplacement est neutre pour l'existant.
--
-- Deux écarts VOULUS sont apparus au passage et sont hors de ces 680 cas :
--   • rôle null ou '' : l'ancien has_module_access refusait (garde-fou dans l'enveloppe), le cœur
--     pur devait faire pareil sinon un rôle absent héritait des modules ouverts à '*'
--     → garde-fou « 1 bis » ci-dessus. Échec fermé, aligné sur access.js.
--   • organizations.permissions malformé ({"module":"admin"} au lieu de ["admin"]) : l'ancien code
--     appliquait l'opérateur jsonb `?` à une chaîne et ACCORDAIT l'accès ; le nouveau refuse.
--     Vérifié en base : aucune organisation n'a de valeur non-tableau (0 ligne), donc aucun effet
--     sur les données réelles. C'est aussi ce qui aligne le verdict SQL sur celui de access.js.
--
-- ─────────────────────────── PREUVES ATTENDUES ───────────────────────────
-- ⚠️ Toujours `set local role authenticated` AVANT de tester : sans lui la session tourne en
-- `postgres`, le bypass « contexte de confiance » s'applique, l'UPDATE réussit et on conclurait
-- l'inverse de la vérité.
--
--   -- (a) NÉGATIF — un manager tente de s'accorder Facturation → doit lever 42501
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uuid du manager>"}';
--     update public.profiles set module_exceptions = '{"facturation": true}'::jsonb
--      where id = '<uuid du manager>';
--   rollback;
--
--   -- (b) POSITIF (contrôle) — un admin modifie un AUTRE utilisateur de son org → doit réussir
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uuid de l admin>"}';
--     update public.profiles set module_exceptions = '{"facturation": true}'::jsonb
--      where id = '<uuid du manager>';
--   rollback;
--
-- Sans (b), un trigger qui refuserait TOUT passerait pour un trigger qui protège.
--
-- ── RETOUR ARRIÈRE ──
--   Les exceptions cessent d'être lues (le reste du comportement redevient exactement l'existant) :
--     create or replace function public.has_module_access(p_module text) ... (corps v6.29, conservé
--     dans l'historique git de ce fichier / dans le rapport de chantier)
--   La colonne peut rester en place sans effet. Suppression complète si vraiment souhaitée :
--     alter table public.profiles drop column module_exceptions;
--     drop function if exists public.module_access_decide(text, text, jsonb, boolean);
--   Le trigger revient à sa forme v6.27b en retirant le bloc « v6.30 » ci-dessus.

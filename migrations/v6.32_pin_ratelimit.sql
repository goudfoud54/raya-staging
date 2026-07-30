-- v6.32 — Limitation des tentatives de PIN sur des dimensions que l'appelant ne contrôle pas.
--
-- PROBLÈME CORRIGÉ
-- verify-pin et create-pointage comptaient les échecs par `kiosk_id`, une valeur FOURNIE PAR
-- L'APPELANT (utils.js kioskId() → un UUID de localStorage, recopié tel quel dans le corps de la
-- requête). Il suffisait d'en changer à chaque essai pour que le compteur ne serve à rien.
-- Ordre de grandeur mesuré le 30/07/2026 : 36 PIN en service sur 10 000 combinaisons à 4 chiffres,
-- soit ~278 requêtes pour tomber sur un PIN valide. verify-pin renvoie alors {id, nom, prenom} du
-- salarié — donc de quoi enchaîner immédiatement sur create-pointage et fabriquer des heures de
-- travail, donc de la paie.
--
-- ADDITIVE ET RÉVERSIBLE : voir le bloc de retour arrière en fin de fichier.
--
-- Aucun GRANT à `anon` n'est nécessaire, et c'est délibéré : pin_attempts et kiosk_registry ne
-- sont jamais écrits depuis le navigateur. Les kiosques passent par les edge functions, qui
-- utilisent le service_role (lequel contourne la RLS). Vérifié avant écriture sur
-- information_schema.column_privileges : sur pin_attempts, seul service_role a des privilèges ;
-- anon et authenticated n'en ont aucun.

-- ── 1) Dimensions supplémentaires sur les tentatives ─────────────────────────
alter table public.pin_attempts add column if not exists salarie_id  uuid;
alter table public.pin_attempts add column if not exists client_ip   text;
alter table public.pin_attempts add column if not exists kiosk_connu boolean not null default false;

comment on column public.pin_attempts.salarie_id is
  'Salarié visé par la tentative (create-pointage uniquement). Dimension INESCAPABLE : fabriquer les heures d''un salarié impose d''itérer les PIN contre CE salarie_id.';
comment on column public.pin_attempts.client_ip is
  'Adresse vue par la plateforme (dernier élément de x-forwarded-for). Imparfaite — tout un snack partage une IP derrière son routeur — mais NON fournie par l''appelant.';
comment on column public.pin_attempts.kiosk_connu is
  'La tablette était-elle déjà enregistrée (kiosk_registry) au moment de la tentative ? Le budget d''échecs org/IP ne compte que les tentatives d''appelants INCONNUS.';

-- Pas de clé étrangère sur salarie_id : la table est purgée toutes les 24 h et sert de télémétrie.
-- Une contrainte référentielle ferait échouer l'enregistrement d'une tentative portant sur un
-- salarié supprimé entre-temps — soit exactement le cas qu'on veut pouvoir tracer.

-- ── 2) Index de comptage ─────────────────────────────────────────────────────
-- Partiels : seuls les ÉCHECS sont comptés. Une rafale de pointages réussis (une trentaine de
-- salariés qui débauchent en même temps) ne touche donc aucun de ces compteurs.
create index if not exists pin_attempts_sal_ko_ts_idx
  on public.pin_attempts (salarie_id, ts) where ok = false;
create index if not exists pin_attempts_org_inconnu_ko_ts_idx
  on public.pin_attempts (organization_id, ts) where ok = false and kiosk_connu = false;
create index if not exists pin_attempts_ip_inconnu_ko_ts_idx
  on public.pin_attempts (client_ip, ts) where ok = false and kiosk_connu = false;

-- ── 3) Registre des tablettes légitimes ──────────────────────────────────────
-- Raison d'être : ne JAMAIS bloquer un vrai kiosque. Le budget d'échecs org/IP ne s'applique
-- qu'aux appelants inconnus. Sans cette exemption, un plafond à l'échelle de l'organisation se
-- retourne en déni de service : n'importe qui pourrait empêcher trois restaurants de pointer en
-- générant des échecs depuis l'extérieur. Une tablette entre au registre à sa première saisie de
-- PIN réussie, ce qu'un attaquant ne peut pas obtenir sans avoir déjà trouvé un PIN valide.
create table if not exists public.kiosk_registry (
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  kiosk_id        text        not null,
  first_seen      timestamptz not null default now(),
  last_ok         timestamptz not null default now(),
  primary key (organization_id, kiosk_id)
);
alter table public.kiosk_registry enable row level security;
-- RLS activée + AUCUNE policy = table fermée à anon et authenticated. Seul le service_role
-- (edge functions) y accède, en contournant la RLS. C'est volontaire : rien côté navigateur
-- n'a besoin de lire ni d'écrire ce registre.

comment on table public.kiosk_registry is
  'Tablettes ayant déjà validé un PIN. Exempte les vrais kiosques du budget d''échecs org/IP, pour que la limitation anti-bruteforce ne devienne pas un levier de déni de service sur les restaurants en service.';

-- ── RETOUR ARRIÈRE (à coller tel quel) ───────────────────────────────────────
-- drop table if exists public.kiosk_registry;
-- drop index if exists public.pin_attempts_ip_inconnu_ko_ts_idx;
-- drop index if exists public.pin_attempts_org_inconnu_ko_ts_idx;
-- drop index if exists public.pin_attempts_sal_ko_ts_idx;
-- alter table public.pin_attempts drop column if exists kiosk_connu;
-- alter table public.pin_attempts drop column if exists client_ip;
-- alter table public.pin_attempts drop column if exists salarie_id;
-- puis redéployer verify-pin et create-pointage depuis les sources d'origine
-- (scratchpad/correctifs/rollback/verify-pin.AVANT.ts et create-pointage.AVANT.ts).

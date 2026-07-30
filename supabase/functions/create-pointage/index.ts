// create-pointage (S11 suite) : crée un pointage CÔTÉ SERVEUR avec anti-fraude.
// Appelée par les kiosques anonymes (badgeuse). verify_jwt = false (pas de session).
// Utilise le service_role en interne (RLS bypass) — c'est CETTE fonction qui doit donc
// réimplémenter TOUTES les vérifications que la RLS anon faisait auparavant, PLUS le PIN :
//   1) le PIN correspond bien au salarié désigné (comme verify-pin)
//   2) salarié actif, et cohérence organisation/restaurant (comme la policy pointages_anon_insert)
//   3) transition d'état valide (arrivee → pause_debut/sortie → pause_fin/sortie → …) : un
//      insert direct par la RLS ne vérifiait AUCUNE séquence, c'était la vraie faille anti-fraude
//      (n'importe qui avec la clé anon pouvait poster n'importe quel type, à répétition).
//   4) anti double-tap : rejette un pointage du même type si le précédent du salarié date de
//      moins de 60 s (protection contre un double-clic ou un replay de requête).
// Entrée  : { organization_id, restaurant_id, salarie_id, type, pin, kiosk_id }
// Sortie  : 200 { ok:true, pointage:{id,type,ts} } | 401/409/429 { ok:false, error }
//
// v6.32 — La limitation ne repose plus sur le seul `kiosk_id` fourni par l'appelant. C'est ici
// que se joue l'enjeu de paie : fabriquer les heures d'un salarié impose d'itérer les PIN contre
// SON salarie_id, dimension que l'attaquant ne peut pas contourner. Décision déléguée à
// _shared/pin-ratelimit.mjs, partagée avec verify-pin (une seule règle, pas deux qui dérivent).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { decidePin, ipCliente, LIMITES } from '../_shared/pin-ratelimit.mjs';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DOUBLE_TAP_S = 60; // fenêtre anti double-tap : même type que le pointage précédent
const IP_FIABLE = false; // cf. verify-pin : enregistrée pour vérification, pas encore décisionnelle

const TYPES = new Set(['arrivee', 'pause_debut', 'pause_fin', 'sortie']);
// Transitions valides : à partir de l'état courant (déduit du dernier pointage du jour), quels
// types sont acceptés. Reflète stateOf()/showActions() côté client (badgeuse/index.html), mais
// appliqué ici pour de vrai (le client ne fait qu'une suggestion d'UI, jamais fiable pour la fraude).
function allowedNext(lastType: string | null): Set<string> {
  if (!lastType || lastType === 'sortie') return new Set(['arrivee']);
  if (lastType === 'arrivee' || lastType === 'pause_fin') return new Set(['pause_debut', 'sortie']);
  if (lastType === 'pause_debut') return new Set(['pause_fin', 'sortie']);
  return new Set(['arrivee']);
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
  const organization_id = String(body.organization_id || '').trim();
  const restaurant_id = String(body.restaurant_id || '').trim();
  const salarie_id = String(body.salarie_id || '').trim();
  const type = String(body.type || '').trim();
  const pin = String(body.pin || '').trim();
  const kiosk_id = String(body.kiosk_id || '').trim();

  if (!organization_id || !restaurant_id || !salarie_id || !kiosk_id) return json({ ok: false, error: 'Paramètres manquants' }, 400);
  if (!TYPES.has(type)) return json({ ok: false, error: 'Type de pointage invalide' }, 400);
  if (!/^\d{4}$/.test(pin)) return json({ ok: false, error: 'Code invalide' }, 401); // v6.18 : PIN strict 4 chiffres

  const client_ip = ipCliente(req.headers.get('x-forwarded-for'), null);
  const sb = createClient(SUPA_URL, SERVICE_KEY);

  // Housekeeping (partagé avec verify-pin sur la même table pin_attempts).
  await sb.from('pin_attempts').delete().lt('ts', new Date(Date.now() - LIMITES.RETENTION_H * 3600_000).toISOString());

  // Défaut sûr = TRUE (même raisonnement que dans verify-pin) : une lecture ratée ne doit pas
  // retirer aux vraies tablettes l'exemption qui les protège des plafonds organisation/IP.
  const { data: connu, error: eReg0 } = await sb.from('kiosk_registry')
    .select('kiosk_id').eq('organization_id', organization_id).eq('kiosk_id', kiosk_id).maybeSingle();
  if (eReg0) console.error(
    '[create-pointage] ⛔ registre des tablettes illisible : ' + eReg0.message +
    ' · La migration v6.32_pin_ratelimit.sql est-elle appliquée ? Plafonds organisation/IP neutralisés par sécurité.');
  const kioskConnu = eReg0 ? true : !!connu;

  const depuis = new Date(Date.now() - LIMITES.INCONNU_FENETRE_S * 1000).toISOString();
  const { data: echecs, error: eLect } = await sb.from('pin_attempts')
    .select('ts,kiosk_id,salarie_id,client_ip,kiosk_connu').eq('organization_id', organization_id)
    .eq('ok', false).gte('ts', depuis);
  // ⚠️ ORDRE IMPÉRATIF : migrations/v6.32_pin_ratelimit.sql doit être appliquée AVANT ce
  // déploiement (cf. le même garde-fou dans verify-pin). Le service continue plutôt que de
  // bloquer le pointage, mais l'anomalie est journalisée à chaque requête, en clair.
  if (eLect) console.error(
    '[create-pointage] ⛔ LIMITATION INACTIVE — lecture de pin_attempts impossible : ' + eLect.message +
    ' · La migration v6.32_pin_ratelimit.sql est-elle appliquée ? Tant que non, le PIN n\'est pas protégé contre le bruteforce.');
  const lignes = (echecs || []).map(a => ({ ...a, ms: new Date(a.ts).getTime() }));

  const d = decidePin({
    kioskConnu,
    echecsKiosk:   lignes.filter(a => a.kiosk_id === kiosk_id).map(a => a.ms),
    echecsSalarie: lignes.filter(a => a.salarie_id === salarie_id).map(a => a.ms),
    echecsOrg:     lignes.filter(a => !a.kiosk_connu).map(a => a.ms),
    echecsIp:      lignes.filter(a => !a.kiosk_connu && a.client_ip === client_ip).map(a => a.ms),
    ipFiable:      IP_FIABLE,
    maintenant:    Date.now(),
  });
  if (!d.autorise) {
    console.warn('[create-pointage] 429', JSON.stringify({ motif: d.motif, org: organization_id, salarie_id, kiosk_id, kioskConnu, client_ip }));
    return json({ ok: false, error: 'Trop de tentatives. Réessaie plus tard.', retry_after_s: d.retryApresS }, 429);
  }

  // 1) Le salarié doit appartenir à l'organisation ET le restaurant à la même organisation
  //    (même garde que la policy pointages_anon_insert, réimplémentée car service_role bypasse la RLS).
  const { data: sal } = await sb.from('salaries')
    .select('id,pin_badgeuse,actif,organization_id').eq('id', salarie_id).eq('organization_id', organization_id).maybeSingle();
  const { data: resto } = await sb.from('restaurants')
    .select('id').eq('id', restaurant_id).eq('organization_id', organization_id).maybeSingle();

  const pinOk = !!sal && !!resto && sal.actif !== false && sal.pin_badgeuse === pin;
  if (!pinOk) {
    const { error: eIns } = await sb.from('pin_attempts')
      .insert({ organization_id, restaurant_id, kiosk_id, ok: false, salarie_id, client_ip, kiosk_connu: kioskConnu });
    if (eIns) console.error('[create-pointage] insert pin_attempts:', eIns.message);
    return json({ ok: false, error: !sal || !resto ? 'Salarié/restaurant introuvable' : sal.actif === false ? 'Salarié inactif' : 'Code incorrect' }, 401);
  }

  // 2) Séquence : dernier pointage du salarié, TOUT restaurant confondu (une seule personne
  //    physique). Pas de coupure à minuit (borne jour civil) : un service soir 18h30→00h30 doit
  //    pouvoir enchaîner sur une "sortie" après minuit sans que le dernier pointage "disparaisse"
  //    de la fenêtre. Un pointage vieux de >18h est considéré périmé (état remis à zéro), même
  //    seuil que stateOf() côté client (badgeuse/index.html).
  const STALE_H = 18;
  const { data: recent } = await sb.from('pointages')
    .select('type,ts').eq('salarie_id', salarie_id).order('ts', { ascending: false }).limit(1);
  const lastRaw = recent?.[0] || null;
  const last = (lastRaw && (Date.now() - new Date(lastRaw.ts).getTime()) <= STALE_H * 3600_000) ? lastRaw : null;

  if (last && (Date.now() - new Date(last.ts).getTime()) < DOUBLE_TAP_S * 1000 && last.type === type) {
    return json({ ok: false, error: 'Pointage déjà enregistré il y a moins d\'une minute (double-tap ignoré)' }, 409);
  }
  const allowed = allowedNext(last?.type || null);
  if (!allowed.has(type)) {
    return json({ ok: false, error: `Action impossible dans l'état actuel (dernier pointage : ${last?.type || 'aucun'})` }, 409);
  }

  // 3) Insertion + enregistrement de la tablette + purge de ses échecs récents.
  const { data: pt, error: eIns } = await sb.from('pointages')
    .insert({ salarie_id, restaurant_id, type, kiosk_id, source: 'kiosk' }).select('id,type,ts').single();
  if (eIns) return json({ ok: false, error: 'Erreur enregistrement : ' + eIns.message }, 500);

  const { error: eReg } = await sb.from('kiosk_registry')
    .upsert({ organization_id, kiosk_id, last_ok: new Date().toISOString() }, { onConflict: 'organization_id,kiosk_id' });
  if (eReg) console.error('[create-pointage] upsert kiosk_registry:', eReg.message);
  await sb.from('pin_attempts').delete().eq('kiosk_id', kiosk_id).eq('ok', false);

  return json({ ok: true, pointage: pt });
});

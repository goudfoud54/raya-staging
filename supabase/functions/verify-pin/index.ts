// verify-pin (S11) : vérifie un PIN salarié CÔTÉ SERVEUR.
// Appelée par les kiosques anonymes (badgeuse, dispos, haccp-kiosk, stock-kiosk).
// verify_jwt = false (kiosques sans session). Utilise le service_role en interne (RLS bypass).
// Entrée  : { organization_id, restaurant_id, kiosk_id, pin }
// Sortie  : 200 { ok:true, salarie:{id,nom,prenom} } | 401 { ok:false, error } | 429 { error, retry_after_s }
//
// v6.32 — La limitation ne repose plus sur le seul `kiosk_id`, que l'APPELANT fournit : en changer
// à chaque essai suffisait à la neutraliser (~278 requêtes pour tomber sur un PIN valide, et cette
// fonction renvoie alors l'id du salarié, de quoi enchaîner sur create-pointage). La décision est
// désormais prise par _shared/pin-ratelimit.mjs, sur des dimensions que l'appelant ne contrôle pas.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { decidePin, ipCliente, LIMITES } from '../_shared/pin-ratelimit.mjs';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// La dimension IP ne sert à bloquer que si la plateforme fournit une adresse non forgeable.
// Tant que ce n'est pas VÉRIFIÉ en conditions réelles, l'IP est enregistrée (pour permettre la
// vérification) mais n'entre pas dans la décision : le compteur par organisation prend le relais.
// Un échec silencieux ici serait pire que l'absence de contrôle — cf. rapport.
const IP_FIABLE = false;

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
  const restaurant_id = body.restaurant_id ? String(body.restaurant_id).trim() : null;
  const kiosk_id = String(body.kiosk_id || '').trim();
  const pin = String(body.pin || '').trim();

  if (!organization_id || !kiosk_id) return json({ error: 'Paramètres manquants' }, 400);
  if (!/^\d{4}$/.test(pin)) return json({ ok: false, error: 'Code invalide' }, 401); // v6.18 : PIN strict 4 chiffres

  const client_ip = ipCliente(req.headers.get('x-forwarded-for'), null);
  const sb = createClient(SUPA_URL, SERVICE_KEY);

  // Housekeeping : purge des essais anciens (> 24 h), peu coûteux grâce à l'index (ts).
  await sb.from('pin_attempts').delete().lt('ts', new Date(Date.now() - LIMITES.RETENTION_H * 3600_000).toISOString());

  // La tablette est-elle enregistrée ? C'est ce qui l'exempte des plafonds organisation / IP,
  // pour qu'une attaque extérieure ne puisse pas empêcher un vrai kiosque de pointer.
  // Défaut sûr = TRUE. Si cette lecture échoue, considérer la tablette comme INCONNUE lui
  // retirerait son exemption, et les plafonds organisation/IP s'appliqueraient d'un coup aux
  // vrais restaurants — soit exactement le déni de service contre lequel le registre existe,
  // déclenchable par une simple lecture ratée. Bloquer trois restaurants est pire que ne pas
  // limiter : on penche du même côté ici que partout ailleurs, et on le dit dans les journaux.
  const { data: connu, error: eReg0 } = await sb.from('kiosk_registry')
    .select('kiosk_id').eq('organization_id', organization_id).eq('kiosk_id', kiosk_id).maybeSingle();
  if (eReg0) console.error(
    '[verify-pin] ⛔ registre des tablettes illisible : ' + eReg0.message +
    ' · La migration v6.32_pin_ratelimit.sql est-elle appliquée ? Plafonds organisation/IP neutralisés par sécurité.');
  const kioskConnu = eReg0 ? true : !!connu;

  // Une seule lecture, sur la fenêtre la plus large ; le filtrage par dimension est fait par
  // decidePin (fonction pure, testée par tests/pin_ratelimit_test.js).
  const depuis = new Date(Date.now() - LIMITES.INCONNU_FENETRE_S * 1000).toISOString();
  const { data: echecs, error: eLect } = await sb.from('pin_attempts')
    .select('ts,kiosk_id,client_ip,kiosk_connu').eq('organization_id', organization_id)
    .eq('ok', false).gte('ts', depuis);
  // ⚠️ ORDRE IMPÉRATIF : migrations/v6.32_pin_ratelimit.sql doit être appliquée AVANT ce
  // déploiement. Sans elle, les colonnes lues ici n'existent pas, la lecture échoue, et la
  // limitation retombe silencieusement à « tout autoriser ». On refuse cet échec muet : le
  // service continue (bloquer le pointage de trois restaurants serait pire), mais l'anomalie
  // est écrite en toutes lettres dans les journaux à CHAQUE requête, impossible à manquer.
  if (eLect) console.error(
    '[verify-pin] ⛔ LIMITATION INACTIVE — lecture de pin_attempts impossible : ' + eLect.message +
    ' · La migration v6.32_pin_ratelimit.sql est-elle appliquée ? Tant que non, le PIN n\'est pas protégé contre le bruteforce.');
  const lignes = (echecs || []).map(a => ({ ...a, ms: new Date(a.ts).getTime() }));

  const d = decidePin({
    kioskConnu,
    echecsKiosk:   lignes.filter(a => a.kiosk_id === kiosk_id).map(a => a.ms),
    echecsSalarie: [],                                   // pas de salarié désigné à ce stade
    echecsOrg:     lignes.filter(a => !a.kiosk_connu).map(a => a.ms),
    echecsIp:      lignes.filter(a => !a.kiosk_connu && a.client_ip === client_ip).map(a => a.ms),
    ipFiable:      IP_FIABLE,
    maintenant:    Date.now(),
  });
  if (!d.autorise) {
    // Le motif reste côté serveur : le renvoyer indiquerait à un attaquant quelle dimension le gêne.
    console.warn('[verify-pin] 429', JSON.stringify({ motif: d.motif, org: organization_id, kiosk_id, kioskConnu, client_ip }));
    return json({ error: 'Trop de tentatives. Réessaie plus tard.', retry_after_s: d.retryApresS }, 429);
  }

  // Lookup serveur par (organisation, pin). L'index unique (organization_id, pin_badgeuse) le rend direct.
  const { data: sal } = await sb.from('salaries')
    .select('id,nom,prenom,actif').eq('organization_id', organization_id).eq('pin_badgeuse', pin).maybeSingle();

  const ok = !!sal && sal.actif !== false;
  const { error: eIns } = await sb.from('pin_attempts')
    .insert({ organization_id, restaurant_id, kiosk_id, ok, client_ip, kiosk_connu: kioskConnu });
  if (eIns) console.error('[verify-pin] insert pin_attempts:', eIns.message);

  if (!ok) return json({ ok: false, error: sal && sal.actif === false ? 'Salarié inactif' : 'Code inconnu' }, 401);

  // Succès → la tablette entre (ou reste) au registre, et ses échecs récents sont effacés
  // (un utilisateur légitime ne reste pas bloqué par ses propres fautes de frappe).
  const { error: eReg } = await sb.from('kiosk_registry')
    .upsert({ organization_id, kiosk_id, last_ok: new Date().toISOString() }, { onConflict: 'organization_id,kiosk_id' });
  if (eReg) console.error('[verify-pin] upsert kiosk_registry:', eReg.message);
  await sb.from('pin_attempts').delete().eq('kiosk_id', kiosk_id).eq('ok', false);

  return json({ ok: true, salarie: { id: sal!.id, nom: sal!.nom, prenom: sal!.prenom } });
});

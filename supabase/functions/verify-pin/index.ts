// verify-pin (S11) : vérifie un PIN salarié CÔTÉ SERVEUR avec rate-limit par tablette (kiosk_id).
// Appelée par les kiosques anonymes (badgeuse, dispos, haccp-kiosk, stock-kiosk).
// verify_jwt = false (kiosques sans session). Utilise le service_role en interne (RLS bypass).
// Entrée  : { organization_id, restaurant_id, kiosk_id, pin }
// Sortie  : 200 { ok:true, salarie:{id,nom,prenom} } | 401 { ok:false, error } | 429 { error, retry_after_s }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_FAILS = 5;            // seuil d'échecs
const WINDOW_S = 300;          // fenêtre de 5 minutes
const RETENTION_H = 24;        // purge des essais > 24 h

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
  if (!/^\d{4,6}$/.test(pin)) return json({ ok: false, error: 'Code invalide' }, 401);

  const sb = createClient(SUPA_URL, SERVICE_KEY);

  // Housekeeping : purge des essais anciens (> 24 h), peu coûteux grâce à l'index (ts).
  await sb.from('pin_attempts').delete().lt('ts', new Date(Date.now() - RETENTION_H * 3600_000).toISOString());

  // Rate-limit : nombre d'échecs pour CETTE tablette dans la fenêtre.
  const since = new Date(Date.now() - WINDOW_S * 1000).toISOString();
  const { data: fails } = await sb.from('pin_attempts')
    .select('ts').eq('kiosk_id', kiosk_id).eq('ok', false).gte('ts', since).order('ts', { ascending: true });
  if ((fails?.length || 0) >= MAX_FAILS) {
    const oldest = new Date(fails![0].ts).getTime();
    const retry = Math.max(1, Math.ceil((oldest + WINDOW_S * 1000 - Date.now()) / 1000));
    return json({ error: 'Trop de tentatives. Réessaie plus tard.', retry_after_s: retry }, 429);
  }

  // Lookup serveur par (organisation, pin). L'index unique (organization_id, pin_badgeuse) le rend direct.
  const { data: sal } = await sb.from('salaries')
    .select('id,nom,prenom,actif').eq('organization_id', organization_id).eq('pin_badgeuse', pin).maybeSingle();

  const ok = !!sal && sal.actif !== false;
  await sb.from('pin_attempts').insert({ organization_id, restaurant_id, kiosk_id, ok });

  if (!ok) return json({ ok: false, error: sal && sal.actif === false ? 'Salarié inactif' : 'Code inconnu' }, 401);

  // Succès → on efface les échecs récents de cette tablette (un utilisateur légitime ne reste pas bloqué).
  await sb.from('pin_attempts').delete().eq('kiosk_id', kiosk_id).eq('ok', false);

  return json({ ok: true, salarie: { id: sal!.id, nom: sal!.nom, prenom: sal!.prenom } });
});

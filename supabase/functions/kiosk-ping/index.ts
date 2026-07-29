// kiosk-ping : une tablette signale son état (version exécutée + version téléchargée en attente).
// Appelée par les kiosques ANONYMES — verify_jwt = false, même posture que create-pointage : l'écriture
// se fait côté SERVEUR (service_role, RLS-exempt), la table n'est PAS écrite en anon direct. On valide
// que le restaurant appartient bien à l'organisation déclarée, puis on upsert une ligne par (restaurant,
// type). Surface de spam bornée : au pire, churn de seen_at/version sur des lignes de restaurants
// existants (clé unique), aucune donnée métier exposée.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPA_URL, SERVICE_KEY);

const TYPES = new Set(['badgeuse', 'stock', 'haccp', 'hub']);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'JSON invalide' }, 400); }
  const organization_id = String(body.organization_id || '').trim();
  const restaurant_id = String(body.restaurant_id || '').trim();
  const kiosk_type = String(body.kiosk_type || '').trim();
  const running_version = body.running_version ? String(body.running_version).slice(0, 64) : null;
  const update_staged = body.update_staged ? String(body.update_staged).slice(0, 64) : null;

  if (!organization_id || !restaurant_id) return json({ ok: false, error: 'Paramètres manquants' }, 400);
  if (!TYPES.has(kiosk_type)) return json({ ok: false, error: 'Type de kiosque invalide' }, 400);

  // Le restaurant doit appartenir à l'organisation déclarée (anti-écriture arbitraire cross-org).
  const { data: r } = await sb.from('restaurants').select('id')
    .eq('id', restaurant_id).eq('organization_id', organization_id).maybeSingle();
  if (!r) return json({ ok: false, error: 'restaurant/organisation inconnu' }, 400);

  const { error } = await sb.from('kiosk_heartbeats').upsert({
    organization_id, restaurant_id, kiosk_type, running_version, update_staged,
    seen_at: new Date().toISOString(),
  }, { onConflict: 'restaurant_id,kiosk_type' });
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true });
});

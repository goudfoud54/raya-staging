// send-test-alerte : éprouve la CHAÎNE RÉELLE d'une alerte (stock ou retard) jusqu'au destinataire.
// Envoie un email de test (Resend) ET/OU dépose un message de test dans wa_queue, puis renvoie le
// résultat PAR CANAL (envoyé / en attente / échec+raison). Appelé depuis Paramètres (authentifié
// admin/manager). Ne teste PAS « la config est valide » : il parcourt la vraie voie jusqu'au bout.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('ALERT_FROM_EMAIL') || 'alertes@eatime360.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Content-Type': 'application/json',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // 1. Authentifier l'appelant via son JWT.
  const authz = req.headers.get('Authorization') || '';
  const caller = createClient(SUPA_URL, ANON_KEY, { global: { headers: { Authorization: authz } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ ok: false, error: 'Non authentifié' }, 401);

  const sb = createClient(SUPA_URL, SERVICE_KEY);
  const { data: prof } = await sb.from('profiles').select('organization_id, role').eq('id', user.id).maybeSingle();
  if (!prof || !['admin', 'super_admin', 'manager'].includes(prof.role)) return json({ ok: false, error: 'Accès refusé' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const restaurant_id = body.restaurant_id;
  const type = body.type === 'retard' ? 'retard' : 'stock';
  if (!restaurant_id) return json({ ok: false, error: 'restaurant_id manquant' }, 400);

  const table = type === 'retard' ? 'retard_alertes_config' : 'stock_alertes_config';
  const { data: cfg } = await sb.from(table)
    .select('*, restaurants:restaurant_id(nom, organization_id)')
    .eq('restaurant_id', restaurant_id).maybeSingle();
  if (!cfg) return json({ ok: false, error: 'Alerte non configurée pour ce restaurant' });
  const r = (cfg as any).restaurants;
  if (prof.role !== 'super_admin' && r?.organization_id !== prof.organization_id) return json({ ok: false, error: 'Accès refusé' }, 403);
  const nom = r?.nom || 'restaurant';
  const label = type === 'retard' ? 'alerte de retard' : 'alerte feuille de stock';

  const out: any = { email: { skipped: true }, wa: { skipped: true } };

  // 2. EMAIL — envoi RÉEL via Resend.
  if (cfg.email_alerte) {
    if (!RESEND_KEY) out.email = { ok: false, error: 'Clé Resend absente côté serveur' };
    else {
      try {
        const rr = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL, to: [cfg.email_alerte],
            subject: `✅ Test — ${label} (${nom})`,
            html: `<div style="font-family:system-ui,sans-serif;max-width:560px"><h2 style="color:#2a8f5f">✅ Test d'alerte</h2><p>Message de <b>test</b> pour l'<b>${label}</b> du <b>${nom}</b>.</p><p>Si tu reçois cet email, ce canal fonctionne de bout en bout.</p><p style="font-size:12px;color:#888;margin-top:24px">— Eatime360</p></div>`,
          }),
        });
        const j = await rr.json().catch(() => ({}));
        out.email = { ok: rr.ok, status: rr.status, id: (j as any)?.id, error: rr.ok ? null : ((j as any)?.message || ('HTTP ' + rr.status)) };
        await sb.from('email_alertes_log').insert({
          organization_id: r?.organization_id, destinataire: cfg.email_alerte,
          sujet: `Test — ${label} (${nom})`, type: 'test', status: rr.ok ? 'sent' : 'failed', payload: out.email,
        });
      } catch (e) { out.email = { ok: false, error: String(e) }; }
    }
  }

  // 3. WHATSAPP — dépôt RÉEL dans wa_queue (la livraison dépend ensuite du bot Railway).
  if (cfg.wa_groupe_id) {
    try {
      const { error } = await sb.from('wa_queue').insert({
        organization_id: r?.organization_id, groupe_id: cfg.wa_groupe_id, groupe_nom: cfg.wa_groupe_nom,
        message: `✅ *Test* — ${label} du *${nom}*. Si tu vois ce message, le canal WhatsApp fonctionne.`, type: 'group',
      });
      out.wa = error ? { ok: false, error: error.message } : { ok: true, queued: true, note: 'déposé en file — livraison par le bot WhatsApp' };
    } catch (e) { out.wa = { ok: false, error: String(e) }; }
  }

  return json({ ok: true, restaurant: nom, type, aucun_destinataire: !cfg.email_alerte && !cfg.wa_groupe_id, canaux: out });
});

// check-stock-alerts : tourne tous les jours à 22:30 (Europe/Paris) via pg_cron.
// Pour chaque restaurant configuré avec une alerte active :
//   - Vérifie si une saisie stock_saisies existe pour la JOURNÉE D'EXPLOITATION en cours
//   - Si non : envoie un email (Resend) ET insert en queue WhatsApp
//   - Marque derniere_alerte_envoyee_at pour éviter doublons
//
// Journée d'exploitation : une saisie faite avant l'heure de bascule (par organisation, défaut 05:00)
// compte pour la veille. La LOGIQUE vit dans ./exploitation.mjs — module PUR partagé avec le harnais
// Node (tests/datelocal_test.js) ET recopié à l'identique dans le front utils.js, les 3 surfaces
// (écriture date_saisie, lecture, alerte) devant partager UNE SEULE définition du jour.
// ⚠️ L'heure de DÉCLENCHEMENT (22:30, réglée par restaurant via pg_cron) n'est PAS la bascule : c'est
// un rappel envoyé pendant le service pour que l'équipe fasse la feuille avant de fermer. À 22:30 la
// journée d'exploitation = le jour civil (22:30 ≥ 05:00), donc le comportement est inchangé.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { exploitationDay } from './exploitation.mjs';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('ALERT_FROM_EMAIL') || 'alertes@eatime360.com';

const sb = createClient(SUPA_URL, SERVICE_KEY);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY || !to) return { ok: false, skipped: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  const j = await r.json();
  return { ok: r.ok, response: j };
}

// Jour d'exploitation → libellé humain FR (ex. "27 juillet 2026").
function human(ymd: string) {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // 1. Récupérer toutes les configs actives
  const { data: configs, error: cErr } = await sb
    .from('stock_alertes_config')
    .select('*, restaurants:restaurant_id(id, nom, actif, organization_id)')
    .eq('actif', true);
  if (cErr) return new Response(JSON.stringify({ error: cErr.message }), { status: 500, headers: cors });

  // Heure de bascule PAR ORGANISATION (défaut 05:00 géré par exploitationDay si absent).
  const { data: orgs } = await sb.from('organizations').select('id, journee_exploitation_debut');
  const cutoffByOrg = new Map<string, string>();
  for (const o of (orgs || [])) cutoffByOrg.set((o as any).id, (o as any).journee_exploitation_debut);

  const results: any[] = [];

  for (const cfg of (configs || [])) {
    const r = (cfg as any).restaurants;
    if (!r || r.actif === false) continue;

    // Jour d'exploitation courant pour CETTE organisation (à 22:30 = jour civil).
    const cut = cutoffByOrg.get(r.organization_id);
    const today = exploitationDay(Date.now(), cut);
    const todayHuman = human(today);

    // 2. Y a-t-il eu au moins une saisie pour la journée d'exploitation en cours ?
    const { count, error: sErr } = await sb
      .from('stock_saisies')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', r.id)
      .eq('date_saisie', today);
    if (sErr) { results.push({ restaurant: r.nom, today, error: sErr.message }); continue; }

    if ((count || 0) > 0) {
      results.push({ restaurant: r.nom, today, status: 'ok', saisies: count });
      continue;
    }

    // 3. Pas de saisie → envoyer l'alerte
    // Vérif anti-doublon : si on a déjà alerté pour cette journée d'exploitation, on skip.
    if (cfg.derniere_alerte_envoyee_at) {
      const dLast = exploitationDay(cfg.derniere_alerte_envoyee_at, cut);
      if (dLast === today) { results.push({ restaurant: r.nom, today, status: 'already_alerted' }); continue; }
    }

    const subject = `⚠ Feuille de stock non remplie — ${r.nom}`;
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="color:#c45a5a">⚠ Feuille de stock manquante</h2>
      <p>La feuille de stock du <b>${r.nom}</b> pour <b>${todayHuman}</b> n'a pas été remplie à ${cfg.heure_check || '22:30'}.</p>
      <p style="color:#555">Merci de vérifier avec l'équipe en place.</p>
      <p style="font-size:12px;color:#888;margin-top:30px">— Eatime360</p>
    </div>`;

    let emailResult: any = { skipped: true };
    if (cfg.email_alerte) {
      emailResult = await sendEmail(cfg.email_alerte, subject, html);
      await sb.from('email_alertes_log').insert({
        organization_id: r.organization_id,
        destinataire: cfg.email_alerte,
        sujet: subject,
        type: 'stock_non_rempli',
        status: emailResult.ok ? 'sent' : 'failed',
        payload: emailResult,
      });
    }

    // 4. Queue WhatsApp si groupe configuré
    let waQueued = false;
    if (cfg.wa_groupe_id) {
      const waMsg = `⚠️ *Alerte stock*\n\nLa feuille de stock du *${r.nom}* pour ${todayHuman} n'a pas été remplie à ${cfg.heure_check || '22:30'}.\n\nMerci de vérifier avec l'équipe.`;
      await sb.from('wa_queue').insert({
        organization_id: r.organization_id,
        groupe_id: cfg.wa_groupe_id,
        groupe_nom: cfg.wa_groupe_nom,
        message: waMsg,
        type: 'group',
      });
      waQueued = true;
    }

    // 5. Marquer
    await sb.from('stock_alertes_config')
      .update({ derniere_alerte_envoyee_at: new Date().toISOString() })
      .eq('restaurant_id', r.id);

    results.push({ restaurant: r.nom, today, status: 'alerted', email: emailResult.ok, wa: waQueued });
  }

  return new Response(JSON.stringify({ ok: true, checked: configs?.length || 0, results }), { headers: cors });
});

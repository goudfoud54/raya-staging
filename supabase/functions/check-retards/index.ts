// check-retards — détection des retards & sorties non pointées (écart planning ↔ pointages).
// Déclenché toutes les 5 min par pg_cron (trigger_check_retards → net.http_post).
//
// Principe : NE FAIT RIEN tant qu'aucune retard_alertes_config n'est actif=true (défaut OFF).
// La LOGIQUE de détection vit dans ./detection.mjs (module pur, partagé avec le harnais Node — pas de jumeau).
// Cette fonction ne fait que : lire la base, appliquer les décisions, écrire les traces, et DISPATCHER
// les notifications via une couche « canaux » abstraite (push / WhatsApp / email) — de sorte qu'un futur
// canal (WhatsApp Business API, SMS) s'ajoute sans toucher à la détection.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.3';
import {
  parisLocal, decideRetard, decideSortie, resolveRetard, finMinutes,
} from './detection.mjs';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('ALERT_FROM_EMAIL') || 'alertes@eatime360.com';
const VAPID_KEYS = Deno.env.get('VAPID_KEYS') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:alertes@eatime360.com';

const sb = createClient(SUPA_URL, SERVICE_KEY);
const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const isoDate = (d: Date) => d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
const hhmm = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// ─────────────────────────── COUCHE CANAUX (abstraite) ───────────────────────────
let _appServer: any = null;
async function appServer() {
  if (_appServer) return _appServer;
  if (!VAPID_KEYS) return null;                                   // secret non posé → push désactivé (signalé, pas silencieux)
  const keys = await webpush.importVapidKeys(JSON.parse(VAPID_KEYS), { extractable: false });
  _appServer = await webpush.ApplicationServer.new({ contactInformation: VAPID_SUBJECT, vapidKeys: keys });
  return _appServer;
}

async function channelPush(salarieId: string, payload: any) {
  const server = await appServer();
  if (!server) return { ok: false, skipped: 'no_vapid' };
  const { data: subs } = await sb.from('push_subscriptions')
    .select('*').eq('salarie_id', salarieId).is('disabled_at', null);
  if (!subs || !subs.length) return { ok: false, skipped: 'no_sub' };
  let sent = 0, dead = 0;
  for (const s of subs) {
    try {
      const subscriber = server.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } });
      await subscriber.pushTextMessage(JSON.stringify(payload), {});
      await sb.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id);
      sent++;
    } catch (e) {
      const msg = String(e);
      if (/failed:\s*4(04|10)/.test(msg)) {                       // endpoint mort → soft-delete
        await sb.from('push_subscriptions').update({ disabled_at: new Date().toISOString() }).eq('id', s.id);
        dead++;
      }
    }
  }
  return { ok: sent > 0, sent, dead };
}

async function channelWa(cfg: any, orgId: string, message: string) {
  if (!cfg.wa_groupe_id) return { ok: false, skipped: 'no_group' };
  await sb.from('wa_queue').insert({
    organization_id: orgId, groupe_id: cfg.wa_groupe_id, groupe_nom: cfg.wa_groupe_nom,
    message, type: 'group',
  });
  return { ok: true, queued: true };
}

async function channelEmail(cfg: any, orgId: string, subject: string, html: string) {
  if (!RESEND_KEY || !cfg.email_alerte) return { ok: false, skipped: 'no_email' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [cfg.email_alerte], subject, html }),
  });
  return { ok: r.ok };
}

// Dispatch = point d'entrée unique. Route vers les canaux activés dans la config.
// notif : { salarieId, pushPayload, waMessage, emailSubject, emailHtml }
async function dispatch(cfg: any, orgId: string, notif: any) {
  const out: any = {};
  if (cfg.notif_salarie && notif.salarieId) out.push = await channelPush(notif.salarieId, notif.pushPayload);
  if (cfg.wa_groupe_id) out.wa = await channelWa(cfg, orgId, notif.waMessage);
  if (cfg.email_alerte) out.email = await channelEmail(cfg, orgId, notif.emailSubject, notif.emailHtml);
  return out;
}

// ─────────────────────────── DÉTECTION ───────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const nowIso = new Date().toISOString();
  const now = parisLocal(nowIso);
  const today = now.date;
  const yesterday = isoDate(new Date(Date.now() - 86400000));
  const results: any[] = [];

  const { data: configs, error: cErr } = await sb
    .from('retard_alertes_config')
    .select('*, restaurants:restaurant_id(id, nom, actif, organization_id)')
    .eq('actif', true);
  if (cErr) return new Response(JSON.stringify({ error: cErr.message }), { status: 500, headers: cors });

  for (const cfg of (configs || [])) {
    const r = (cfg as any).restaurants;
    if (!r || r.actif === false) continue;
    const orgId = r.organization_id;

    // Créneaux d'hier + aujourd'hui (hier nécessaire pour les sorties de soir à cheval sur minuit)
    const { data: creneaux } = await sb.from('planning_creneaux')
      .select('id, salarie_id, restaurant_id, date, service, heure_debut, heure_fin')
      .eq('restaurant_id', r.id).in('date', [yesterday, today]);
    if (!creneaux || !creneaux.length) { results.push({ resto: r.nom, creneaux: 0 }); continue; }

    const salIds = [...new Set(creneaux.map((c: any) => c.salarie_id).filter(Boolean))];

    // Pointages du resto sur ~36h (fenêtre couvrant hier+aujourd'hui), groupés par salarié
    const since = new Date(Date.now() - 40 * 3600 * 1000).toISOString();
    const { data: pts } = await sb.from('pointages')
      .select('salarie_id, restaurant_id, type, ts').eq('restaurant_id', r.id).gte('ts', since);
    const ptsBySal: Record<string, any[]> = {};
    for (const p of (pts || [])) (ptsBySal[p.salarie_id] ||= []).push(p);

    // Indispos + alternance des salariés concernés
    const { data: dispos } = salIds.length
      ? await sb.from('salarie_dispos').select('*').in('salarie_id', salIds) : { data: [] } as any;
    const disposBySal: Record<string, any[]> = {};
    for (const d of (dispos || [])) (disposBySal[d.salarie_id] ||= []).push(d);
    const { data: altern } = salIds.length
      ? await sb.from('alternance_jours').select('salarie_id, date, type').in('salarie_id', salIds).in('date', [yesterday, today]) : { data: [] } as any;
    const altBySal: Record<string, any[]> = {};
    for (const a of (altern || [])) (altBySal[a.salarie_id] ||= []).push(a);

    // Retards déjà tracés pour ces clés (dédup en mémoire + garde-fou index unique à l'insert)
    const { data: existing } = await sb.from('retards')
      .select('id, salarie_id, restaurant_id, date, service, type, statut, heure_prevue')
      .eq('restaurant_id', r.id).in('date', [yesterday, today]);
    const keyOf = (x: any) => `${x.salarie_id}|${x.date}|${x.service}|${x.type}`;
    const exMap: Record<string, any> = {};
    for (const e of (existing || [])) exMap[keyOf(e)] = e;

    // Noms salariés (pour les messages managers)
    const { data: sals } = salIds.length
      ? await sb.from('salaries').select('id, prenom, nom').in('id', salIds) : { data: [] } as any;
    const nameOf: Record<string, string> = {};
    for (const s of (sals || [])) nameOf[s.id] = `${s.prenom || ''} ${s.nom || ''}`.trim();

    let alertsRetard = 0, alertsSortie = 0, resolved = 0;

    for (const c of creneaux) {
      const pointages = ptsBySal[c.salarie_id] || [];
      const dsp = disposBySal[c.salarie_id] || [];
      const alt = altBySal[c.salarie_id] || [];

      // ── RETARD ──
      const exR = exMap[keyOf({ ...c, type: 'retard' })];
      const dR = decideRetard({ creneau: c, pointages, dispos: dsp, alternance: alt, now, cfg, existingRetard: exR });
      if (dR.alert) {
        // Insert atomique : ON CONFLICT DO NOTHING → on n'envoie QUE si on a bien créé la ligne (anti double-envoi).
        const { data: ins } = await sb.from('retards').upsert({
          organization_id: orgId, salarie_id: c.salarie_id, restaurant_id: r.id,
          date: c.date, service: c.service, type: 'retard',
          heure_prevue: c.heure_debut, seuil_minutes: cfg.seuil_minutes, statut: 'en_retard',
        }, { onConflict: 'salarie_id,restaurant_id,date,service,type', ignoreDuplicates: true }).select('id');
        if (ins && ins.length) {
          alertsRetard++;
          const nom = nameOf[c.salarie_id] || 'Un salarié';
          const notified = await dispatch(cfg, orgId, {
            salarieId: c.salarie_id,
            pushPayload: { type: 'retard', title: 'Pointage manquant', body: `Tu es attendu(e) depuis ${dR.retardMinutes} min au ${r.nom} — pense à badger si tu es déjà arrivé(e).`, url: '/raya-staging/moi/' },
            waMessage: `⏰ *Retard* — ${nom} attendu(e) au *${r.nom}* à ${String(c.heure_debut).slice(0, 5)} (${dR.retardMinutes} min de retard, service ${c.service}). Aucun pointage d'arrivée.`,
            emailSubject: `⏰ Retard — ${nom} (${r.nom})`,
            emailHtml: `<div style="font-family:system-ui,sans-serif"><h3>Retard non pointé</h3><p><b>${nom}</b> était attendu(e) au <b>${r.nom}</b> à ${String(c.heure_debut).slice(0, 5)} (service ${c.service}) et n'a pas badgé (${dR.retardMinutes} min). </p><p style="color:#888;font-size:12px">— Eatime360</p></div>`,
          });
          await sb.from('retards').update({ notifie: { push: notified.push?.ok || false, wa: notified.wa?.ok || false, email: notified.email?.ok || false } }).eq('id', ins[0].id);
        }
      }

      // ── SORTIE NON POINTÉE ──
      const exS = exMap[keyOf({ ...c, type: 'sortie_oubliee' })];
      const dS = decideSortie({ creneau: c, pointages, now, cfg, existingSortie: exS });
      if (dS.alert) {
        const { data: ins } = await sb.from('retards').upsert({
          organization_id: orgId, salarie_id: c.salarie_id, restaurant_id: r.id,
          date: c.date, service: c.service, type: 'sortie_oubliee',
          heure_prevue: c.heure_fin, statut: 'sortie_manquante',
        }, { onConflict: 'salarie_id,restaurant_id,date,service,type', ignoreDuplicates: true }).select('id');
        if (ins && ins.length) {
          alertsSortie++;
          const nom = nameOf[c.salarie_id] || 'Un salarié';
          const notified = await dispatch(cfg, orgId, {
            salarieId: c.salarie_id,
            pushPayload: { type: 'sortie_oubliee', title: 'Sortie non pointée', body: `Tu n'as pas badgé ta sortie au ${r.nom}. Pense à pointer en partant pour un décompte d'heures juste.`, url: '/raya-staging/moi/' },
            waMessage: `🚪 *Sortie non pointée* — ${nom} au *${r.nom}* (service ${c.service}, fin prévue ${String(c.heure_fin).slice(0, 5)}). Le décompte d'heures est faussé tant que la sortie n'est pas corrigée.`,
            emailSubject: `🚪 Sortie non pointée — ${nom} (${r.nom})`,
            emailHtml: `<div style="font-family:system-ui,sans-serif"><h3>Sortie non pointée</h3><p><b>${nom}</b> n'a pas badgé sa sortie au <b>${r.nom}</b> (service ${c.service}, fin prévue ${String(c.heure_fin).slice(0, 5)}).</p></div>`,
          });
          await sb.from('retards').update({ notifie: { push: notified.push?.ok || false, wa: notified.wa?.ok || false, email: notified.email?.ok || false } }).eq('id', ins[0].id);
        }
      }
    }

    // ── RÉSOLUTION : renseigner l'heure réelle + la durée exacte des retards ouverts (usage disciplinaire) ──
    for (const e of (existing || [])) {
      if (e.type !== 'retard' || (e.statut !== 'en_retard')) continue;
      const res = resolveRetard(e, ptsBySal[e.salarie_id] || [], now);
      if (res) { await sb.from('retards').update(res).eq('id', e.id); resolved++; }
    }

    results.push({ resto: r.nom, creneaux: creneaux.length, alertsRetard, alertsSortie, resolved });
  }

  return new Response(JSON.stringify({ ok: true, today, configs: configs?.length || 0, results }), { headers: cors });
});

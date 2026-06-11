// cfa-ocr : lit un calendrier annuel d'alternance (image) via Mistral vision (pixtral)
// et renvoie, par mois, la couleur dominante de chaque jour. Le mapping couleur->type
// et la correction se font côté client (étape de validation). Réservé admin/super_admin.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MISTRAL_KEY = Deno.env.get('MISTRAL_API_KEY') || '';
const MODEL = 'pixtral-large-latest';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function mistral(payload: any, max = 4): Promise<any> {
  let last = '';
  for (let a = 0; a < max; a++) {
    if (a > 0) await sleep(Math.pow(2, a) * 600);
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok) return await r.json();
    if (r.status === 429 || r.status === 503) { last = `${r.status}`; continue; }
    throw new Error(`Mistral ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  throw new Error(`Mistral surcharge (${last}).`);
}

const SYS = `Tu analyses l'image d'un CALENDRIER ANNUEL d'alternance (apprenti). Il est organise en COLONNES par mois (ex: FEVRIER, MARS, AVRIL, MAI, JUIN, JUILLET). Chaque ligne = un jour : numero, jour de semaine (Lu/Ma/Me/Je/Ve/Sa/Di), puis une ou deux cellules COLOREES.

Ta tache : pour CHAQUE mois visible et CHAQUE jour (1 jusqu'au dernier du mois), identifie la couleur DOMINANTE de la/les cellule(s) du jour, STRICTEMENT parmi :
- "cyan"   = bleu clair / turquoise
- "vert"   = vert clair (lime)
- "violet" = mauve / lavande clair / rose pale
- "rouge"  = rouge / rose vif
- "blanc"  = cellule vide (blanche)
- "ferie"  = la cellule contient le texte "FERIE"

REGLES : n'invente aucun mois absent de l'image. Liste TOUS les jours de chaque mois present. Si deux demi-cellules ont 2 couleurs differentes, choisis la plus saturee (rouge > cyan > vert > violet > blanc).

Reponds STRICTEMENT en JSON, sans aucun texte autour :
{"mois":[{"nom":"FEVRIER","jours":[{"d":1,"c":"violet"},{"d":2,"c":"cyan"}]}]}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!MISTRAL_KEY) return json({ error: 'MISTRAL_API_KEY manquante' }, 500);

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json({ error: 'Token manquant' }, 401);
  const sbCaller = createClient(SUPA_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: userRes } = await sbCaller.auth.getUser();
  if (!userRes?.user) return json({ error: 'Token invalide' }, 401);
  const sbAdmin = createClient(SUPA_URL, SERVICE_KEY);
  const { data: profile } = await sbAdmin.from('profiles').select('role, organization_id').eq('id', userRes.user.id).maybeSingle();
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return json({ error: 'Reserve aux administrateurs' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
  let img: string = body.image || '';
  if (!img) return json({ error: 'image manquante' }, 400);
  if (!img.startsWith('data:')) img = `data:image/png;base64,${img}`;

  let result: any;
  try {
    const j = await mistral({
      model: MODEL, temperature: 0, max_tokens: 6000,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: [
          { type: 'text', text: 'Voici le calendrier. Renvoie le JSON des couleurs par jour.' },
          { type: 'image_url', image_url: img },
        ] },
      ],
    });
    const content = j?.choices?.[0]?.message?.content || '{}';
    const m = content.match(/\{[\s\S]*\}/);
    try { result = JSON.parse(m ? m[0] : content); } catch { return json({ error: 'Sortie IA non-JSON', raw: content.slice(0, 800) }, 502); }
    try { await sbAdmin.from('ia_usage_log').insert({ organization_id: profile.organization_id, user_id: userRes.user.id, action: 'cfa_ocr', model: MODEL, tokens_in: j?.usage?.prompt_tokens || null, tokens_out: j?.usage?.completion_tokens || null }); } catch (_) {}
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
  return json({ ok: true, mois: result.mois || [] });
});

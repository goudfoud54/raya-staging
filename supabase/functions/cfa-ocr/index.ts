// cfa-ocr v3 : classification SEMANTIQUE contrainte (4 categories) + regles anti-hallucination.
// Le mapping final + correction + override week-ends + filtre examen se font cote client. Reserve admin.
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

const SYS = `Tu analyses l'image d'un CALENDRIER ANNUEL d'alternance, organise en BLOCS MENSUELS (ex "decembre-25", "janvier-26"...). Chaque bloc a un BANDEAU-TITRE bleu fonce (IGNORE) et une ligne d'en-tete "L M M J V S D" sur fond gris (IGNORE). Puis une grille de cases NUMEROTEES.

Pour CHAQUE case contenant un NUMERO, classe son FOND STRICTEMENT parmi ces 4 categories (n'invente AUCUNE autre couleur) :
- "ecole"      = fond BLEU CLAIR. C'est la TRES grande majorite des cases colorees en bleu.
- "examen"     = fond BLEU FONCE / SOMBRE marque. TRES RARE : seulement 1 ou 2 BLOCS d'une semaine entiere dans toute l'annee. Si une case est bleue mais que tu HESITES entre clair et fonce, choisis "ecole". Un simple lisere/bordure autour d'une case bleue CLAIRE ne suffit PAS : il faut un fond nettement plus FONCE que les autres cases bleues.
- "weekend"    = fond GRIS (samedis, dimanches, jours feries). Une case GRISE n'est JAMAIS un examen.
- "entreprise" = fond BLANC / sans remplissage.

N'utilise QUE ces 4 valeurs. Ignore les cases vides et les en-tetes. Lis le numero exact.

Reponds STRICTEMENT en JSON, sans texte autour :
{"mois":[{"nom":"decembre-25","jours":[{"d":1,"t":"entreprise"},{"d":19,"t":"ecole"}]}]}`;

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
      model: MODEL, temperature: 0, max_tokens: 8000,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: [
          { type: 'text', text: 'Voici le calendrier. Classe chaque jour numerote en ecole/examen/weekend/entreprise. Rappel : examen = uniquement bleu nettement FONCE, tres rare. Renvoie le JSON.' },
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

// legal-enhance : reformule motif + detail + impact d'une sanction disciplinaire en langage
// juridique (droit du travail FR), factuel et defendable aux prud'hommes.
// N'invente AUCUN fait. Reserve admin/super_admin. Journalise dans ia_usage_log.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MISTRAL_KEY = Deno.env.get('MISTRAL_API_KEY') || '';
const MODEL = 'mistral-small-2506';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function mistralCall(payload: any, maxRetries = 4): Promise<any> {
  let lastErr = '';
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await sleep(Math.pow(2, attempt) * 500);
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok) return await r.json();
    if (r.status === 429 || r.status === 503) { lastErr = `${r.status}`; continue; }
    throw new Error(`Mistral ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  throw new Error(`Mistral surcharge (${lastErr}).`);
}

const TYPE_LABELS: Record<string, string> = {
  avertissement: 'Avertissement simple', blame: 'Blame',
  mise_a_pied_disciplinaire: 'Mise a pied disciplinaire', mise_a_pied_conservatoire: 'Mise a pied conservatoire',
  licenciement_simple: 'Licenciement pour faute simple', licenciement_grave: 'Licenciement pour faute grave',
  licenciement_lourde: 'Licenciement pour faute lourde', rupture_conventionnelle: 'Rupture conventionnelle',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!MISTRAL_KEY) return json({ error: 'MISTRAL_API_KEY manquante' }, 500);

  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json({ error: 'Token manquant' }, 401);

  const sbCaller = createClient(SUPA_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: userRes } = await sbCaller.auth.getUser();
  if (!userRes?.user) return json({ error: 'Token invalide' }, 401);

  const sbAdmin = createClient(SUPA_URL, SERVICE_KEY);
  const { data: profile } = await sbAdmin.from('profiles').select('id, role, organization_id').eq('id', userRes.user.id).maybeSingle();
  if (!profile) return json({ error: 'Profil introuvable' }, 403);
  if (!['admin', 'super_admin'].includes(profile.role)) return json({ error: 'Reserve aux administrateurs' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
  const { type, motif_court, motif_detail, faits_impact, faits_date, faits_lieu, salarie_name } = body;
  if (!motif_court && !motif_detail && !faits_impact) return json({ error: 'Rien a reformuler.' }, 400);

  const typeLabel = TYPE_LABELS[type] || 'sanction disciplinaire';
  const sys = `Tu es juriste expert en droit du travail francais, specialise dans la redaction de procedures disciplinaires. On te transmet des faits bruts saisis par un employeur, en langage courant, concernant une sanction de type "${typeLabel}".

Ta mission : reformuler ces elements en langage juridique precis, factuel, neutre et defendable devant le conseil de prud'hommes. Le texte produit sera insere TEL QUEL dans une lettre officielle ECRITE PAR L'EMPLOYEUR et ADRESSEE AU SALARIE.

REGLES ABSOLUES :
- N'INVENTE AUCUN fait, nom, lieu, montant ou temoin non fourni. Tu reformules uniquement ce qui est donne.
- ADRESSE DIRECTE AU SALARIE (2eme personne) : le destinataire de la lettre EST le salarie. Redige TOUJOURS en t'adressant directement a lui avec "vous". Convertis SYSTEMATIQUEMENT toute formulation a la 3eme personne le concernant ("la salariee a fait...", "Madame X a commis...", "le salarie ne s'est pas presente", "il/elle" = le salarie) en adresse directe ("vous avez fait...", "vous avez commis...", "vous ne vous etes pas presente(e)"). N'emploie JAMAIS le nom du salarie ni la 3eme personne le concernant dans motif_detail et faits_impact. Accorde le participe passe au feminin entre parentheses si le sexe est inconnu : "presente(e)".
- EMPLOYEUR A LA 1ERE PERSONNE DU PLURIEL : la lettre est redigee, signee et envoyee par l'employeur LUI-MEME. Toute reference a l'employeur lorsqu'il parle de lui-meme doit etre a la 1ere personne du pluriel ("nous", "notre", "nos"), avec les verbes accordes en consequence. Convertis SYSTEMATIQUEMENT : "l'employeur" / "votre employeur" / "votre direction" / "la societe" / "l'entreprise" / le nom de la societe (ex: "GOUD FOUD", "[Nom de la societe]") lorsqu'il designe l'employeur qui ecrit -> "nous" ; "son" / "sa" / "ses" (de l'employeur) -> "notre" / "nos" ; "lui" / "il" / "elle" (= l'employeur) -> "nous". Exemples : "sans en informer votre employeur ni obtenir son autorisation" -> "sans nous en informer ni obtenir notre autorisation" ; "la confiance que l'employeur peut avoir en vous" -> "la confiance que nous pouvons avoir en vous" ; "GOUD FOUD ne peut tolerer ce comportement" -> "Nous ne pouvons tolerer ce comportement".
- ATTENTION AUX TIERS (ne PAS convertir en "nous") : si le texte designe un acteur DISTINCT de l'employeur — l'inspection du travail, un client, un fournisseur, un autre salarie, un collegue, un partenaire — ce tiers RESTE a la 3eme personne ("le client", "votre collegue", "l'inspection du travail"). Ce n'est PAS l'employeur : ne le transforme jamais en "nous". Ne convertis en "nous" QUE les references a l'employeur signataire lui-meme.
- DATES : ne convertis JAMAIS une reference temporelle vague (ex: "depuis 3 semaines", "souvent", "regulierement", "recemment") en date calendaire precise. Conserve l'expression telle quelle. N'emploie une date exacte que si elle est explicitement fournie.
- Reste strictement factuel : aucune injure, aucun jugement moral, aucune qualification penale hasardeuse.
- Emploie un vocabulaire RH/juridique sobre (ex: "manquement a l'obligation de ...", "comportement constitutif de ...", "absence injustifiee").
- Conserve TOUS les faits fournis ; tu peux les structurer. Ne cite pas d'articles de loi precis sauf s'ils sont fournis.

Produis :
- "motif_court" : une seule phrase de qualification juridique synthetique et impersonnelle (max ~120 caracteres), SANS le nom du salarie ni reference a l'employeur (ex: "Absence injustifiee et abandon de poste").
- "motif_detail" : un expose factuel structure, circonstancie et professionnel des faits reproches, redige a la 2eme personne pour le salarie ("vous") et a la 1ere personne du pluriel pour l'employeur ("nous", "notre").
- "faits_impact" : reformulation juridique de l'IMPACT/PREJUDICE que NOUS (l'employeur) avons subi (lien de causalite entre le manquement et le dommage), a la 2eme personne pour le salarie et a la 1ere personne du pluriel pour l'employeur ("votre absence a desorganise notre service..."), uniquement si un impact brut est fourni ; sinon chaine vide. N'invente aucun chiffre/montant non fourni.

Reponds STRICTEMENT en JSON valide : {"motif_court": "...", "motif_detail": "...", "faits_impact": "..."}. Aucun texte hors du JSON.`;

  const ctx = [
    salarie_name ? `Salarie concerne : ${salarie_name}` : '',
    faits_date ? `Date des faits : ${faits_date}` : '',
    faits_lieu ? `Lieu : ${faits_lieu}` : '',
    motif_court ? `Motif court (brut) : ${motif_court}` : '',
    motif_detail ? `Detail des faits (brut) : ${motif_detail}` : '',
    faits_impact ? `Impact / prejudice (brut) : ${faits_impact}` : '',
  ].filter(Boolean).join('\n');

  let result: any;
  try {
    const j = await mistralCall({ model: MODEL, temperature: 0.2, response_format: { type: 'json_object' }, messages: [ { role: 'system', content: sys }, { role: 'user', content: ctx } ] });
    const content = j?.choices?.[0]?.message?.content || '{}';
    try { result = JSON.parse(content); } catch { result = { motif_court: motif_court || '', motif_detail: content, faits_impact: faits_impact || '' }; }
    try { await sbAdmin.from('ia_usage_log').insert({ organization_id: profile.organization_id, user_id: profile.id, action: 'legal_enhance', model: MODEL, tokens_in: j?.usage?.prompt_tokens || null, tokens_out: j?.usage?.completion_tokens || null }); } catch (_) {}
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }

  return json({ ok: true, motif_court: result.motif_court || motif_court || '', motif_detail: result.motif_detail || motif_detail || '', faits_impact: result.faits_impact || faits_impact || '' });
});

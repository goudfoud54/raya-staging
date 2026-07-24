// import-contrat-ai — extraction structurée d'un contrat FR (CDI/CDD/CERFA apprentissage).
//
// Pipeline :
//   1. VISION (scans) : si le client envoie `images` (PNG base64 des pages rendues), on
//      interroge un modèle multimodal Mistral avec les IMAGES DES PAGES — la mise en page
//      (quel libellé va avec quelle case, bloc employeur vs bloc apprenti) est préservée,
//      contrairement à un OCR aplati en texte. Sur erreur → repli automatique sur l'OCR-texte.
//   2. OCR-TEXTE (PDF avec vraie couche texte) : Mistral OCR → markdown → chat json_schema.
//      Voie plus rapide/économique, gardée par défaut.
//
// Modèle vision retenu : mistral-small-2506 (Mistral Small 3.2, multimodal). Choisi car son
// accès est GARANTI avec la clé actuelle (déjà utilisé pour le chat en prod). Pour une précision
// supérieure sur les CERFA scannés difficiles, remplacer VISION_MODEL par 'pixtral-large-latest'
// ou 'mistral-medium-2505' (une seule ligne) — sous réserve que la clé y ait accès.
//
// Critère de bascule vision↔texte : décidé CÔTÉ CLIENT (densité de la couche texte native du
// PDF). Le client envoie `images` uniquement quand le document est un scan (peu/pas de texte
// natif). Rétro-compatible : import-contrats/index.html n'envoie que { base64 } → voie OCR.
//
// GARDE-FOUS (sanitize) : dernier rempart déterministe. Aucune valeur manifestement fausse
// (libellé de formulaire pris pour une valeur, date de naissance = aujourd'hui, email de
// l'employeur mis sur le salarié…) ne doit être écrite. Un champ douteux est VIDÉ et listé
// dans `rejected`. Mieux vaut vide que faux. Ne vide JAMAIS `nom` (clé de rapprochement).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MISTRAL_KEY = Deno.env.get('MISTRAL_API_KEY') || '';
const OCR_MODEL = 'mistral-ocr-latest';
const CHAT_MODEL = 'mistral-small-2506';
const VISION_MODEL = 'mistral-small-2506'; // multimodal ; voir en-tête pour l'upgrade

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function mistralCall(url: string, payload: any, maxRetries = 5): Promise<any> {
  let lastErr = '';
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await sleep(Math.pow(2, attempt) * 500 + Math.random() * 300);
    const r = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok) return await r.json();
    if (r.status === 429 || r.status === 503) { lastErr = `${r.status}: ${(await r.text()).slice(0, 200)}`; continue; }
    throw new Error(`Mistral ${r.status}: ${(await r.text()).slice(0, 500)}`);
  }
  throw new Error(`Mistral surchargé. ${lastErr}`);
}

// Champs employeur : EXTRAITS pour le contrôle croisé (jamais mappés sur la fiche salarié).
const EXTRACT_SCHEMA = { type: 'object', properties: { nom: { type: 'string' }, prenom: { type: 'string' }, sexe: { type: 'string' }, date_naissance: { type: 'string' }, lieu_naissance: { type: 'string' }, nationalite: { type: 'string' }, num_secu: { type: 'string' }, adresse: { type: 'string' }, code_postal: { type: 'string' }, ville: { type: 'string' }, telephone: { type: 'string' }, email: { type: 'string' }, type_contrat: { type: 'string' }, poste_intitule: { type: 'string' }, date_entree: { type: 'string' }, date_fin_contrat: { type: 'string' }, heures_hebdo: { type: 'number' }, salaire_mensuel_brut: { type: 'number' }, taux_horaire_brut: { type: 'number' }, titre_sejour_num: { type: 'string' }, titre_sejour_expire_le: { type: 'string' }, lieu_execution: { type: 'string' }, cfa_nom: { type: 'string' }, diplome_prepare: { type: 'string' }, maitre_apprentissage: { type: 'string' }, employeur_nom: { type: 'string' }, employeur_email: { type: 'string' }, employeur_telephone: { type: 'string' }, employeur_adresse: { type: 'string' }, employeur_ville: { type: 'string' }, employeur_code_postal: { type: 'string' }, confidence: { type: 'number' }, notes_ia: { type: 'string' } }, required: ['nom', 'confidence'], additionalProperties: false };

const SYSTEM_PROMPT = `Tu es un assistant RH expert qui extrait les données structurées d'un contrat de travail français (CDI, CDD, contrat d'apprentissage CERFA FA13).

Retourne UNIQUEMENT un JSON conforme au schéma demandé. Règles strictes :

DISTINCTION EMPLOYEUR / SALARIÉ (CRITIQUE) :
- Un contrat contient DEUX personnes/entités : l'EMPLOYEUR (la société qui recrute) et le SALARIÉ/APPRENTI (la personne recrutée).
- Les champs nom, prenom, date_naissance, adresse, code_postal, ville, telephone, email, num_secu, nationalite concernent EXCLUSIVEMENT le SALARIÉ/APPRENTI (la personne physique recrutée).
- Les coordonnées de l'employeur (raison sociale, adresse du siège/établissement, email, téléphone de la société) vont dans les champs employeur_*. Ne les mets JAMAIS dans les champs du salarié.
- Sur un CERFA : le bloc « L'EMPLOYEUR » est en haut, le bloc « L'APPRENTI(E) » ensuite. Ne les confonds pas.

NE JAMAIS PRENDRE UN LIBELLÉ POUR UNE VALEUR :
- Un formulaire affiche des LIBELLÉS de cases (« Date de naissance », « Nationalité », « Effectif total salariés de l'entreprise », « Type d'employeur », « Lieu d'exécution du contrat », « N° SIRET », « Code APE/NAF », « Adresse de l'établissement »…). Ce sont des INTITULÉS, jamais des valeurs.
- Si tu ne peux pas lire la VALEUR remplie d'une case avec certitude, laisse le champ VIDE. Ne recopie jamais l'intitulé de la case.
- N'invente JAMAIS. Si une info manque ou est illisible, omets le champ ou laisse-le vide. Un champ vide est préférable à un champ faux.

FORMATS :
- CERFA : code 'Nationalité' numérique (1=Française, 2=UE, 3=Hors UE) → valeur explicite.
- Département de naissance = 99 → étranger, mentionne le pays dans lieu_naissance.
- Toutes les dates → YYYY-MM-DD.
- Salaire : BRUT MENSUEL en euros. Taux horaire : salaire_mensuel / (heures_hebdo * 4.333) si non explicite.
- Nom de famille du salarié : EN MAJUSCULES.
- Si le document n'est pas un contrat : {"nom":"","confidence":0,"notes_ia":"Pas un contrat"}.`;

// ── Garde-fous déterministes ────────────────────────────────────────────────
// Normalisation : minuscules, sans accents, espaces compactés, ponctuation de bord retirée.
function _norm(v: any): string {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:'"-]+|[\s.,;:'"-]+$/g, '')
    .trim();
}

// Libellés de formulaire connus (CERFA + CDI/CDD). Rejet si la VALEUR ENTIÈRE est l'un d'eux.
const FORM_LABELS = new Set([
  'nom', 'nom de naissance', 'nom de famille', 'nom patronymique', 'nom d\'usage',
  'prenom', 'prenoms', 'prenom(s)', 'sexe', 'civilite',
  'date de naissance', 'ne le', 'nee le', 'lieu de naissance', 'departement de naissance',
  'nationalite', 'num secu', 'numero de securite sociale', 'n secu', 'nir',
  'adresse', 'adresse du salarie', 'adresse de l\'apprenti', 'adresse de l\'etablissement',
  'adresse de l\'employeur', 'code postal', 'ville', 'commune', 'telephone', 'tel', 'email',
  'courriel', 'e-mail', 'type de contrat', 'nature du contrat', 'poste', 'emploi occupe',
  'intitule du poste', 'date d\'effet', 'date de debut', 'date d\'entree', 'date d\'embauche',
  'date de fin', 'date de fin de contrat', 'effectif total salaries', 'effectif total salaries de',
  'effectif total salaries de l\'entreprise', 'type d\'employeur', 'employeur', 'raison sociale',
  'denomination', 'lieu d\'execution', 'lieu d\'execution du contrat', 'lieu de travail',
  'n siret', 'siret', 'siren', 'code ape', 'code naf', 'code ape naf', 'idcc', 'convention collective',
  'salarie', 'apprenti', 'apprenti(e)', 'maitre d\'apprentissage', 'maitre d\'apprentissage 1',
  'diplome prepare', 'diplome ou titre prepare', 'cfa', 'organisme de formation',
]);

// Phrases-libellés multi-mots : quasi impossibles à l'intérieur d'un vrai nom/adresse →
// rejet même en SOUS-CHAÎNE (safe car ces séquences n'apparaissent pas dans une valeur légitime).
const LABEL_PHRASES = [
  'effectif total', 'type d\'employeur', 'lieu d\'execution', 'date de naissance',
  'adresse de l\'etablissement', 'raison sociale', 'code ape', 'code naf',
  'securite sociale', 'departement de naissance', 'maitre d\'apprentissage',
  'diplome prepare', 'organisme de formation', 'convention collective',
];

const PREPOSITIONS_FIN = ['de', 'du', "d'", 'des', 'a', 'le', 'la', 'les', 'et', 'ou', 'au', 'aux', 'en'];

// Champs texte « courts » (identité / localisation) soumis aux heuristiques anti-libellé.
const SHORT_TEXT_FIELDS = new Set(['nom', 'prenom', 'ville', 'nationalite', 'lieu_naissance', 'sexe']);
// Champs texte soumis à la détection de libellé (courts + adresse + poste).
const LABELISH_FIELDS = new Set([...SHORT_TEXT_FIELDS, 'adresse', 'poste_intitule']);

function _looksLikeLabel(field: string, value: string): string | null {
  const n = _norm(value);
  if (!n) return null;
  if (FORM_LABELS.has(n)) return 'libellé de formulaire';
  for (const ph of LABEL_PHRASES) if (n.includes(ph)) return `contient le libellé « ${ph} »`;
  // Un « : » dans un champ court/adresse = artefact « Libellé : Valeur voisine ».
  if (value.includes(':')) return 'contient « : » (intitulé de case)';
  // Se termine par une préposition = fragment de libellé tronqué (« Effectif total salariés de »).
  const words = n.split(' ');
  if (words.length >= 2 && PREPOSITIONS_FIN.includes(words[words.length - 1])) return 'se termine par une préposition (fragment de libellé)';
  return null;
}

function _isValidDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d;
}

// sanitize(data, opts) → { data, rejected: [{field,value,reason}] }
// opts.today permet de fixer « aujourd'hui » pour les tests (défaut : date du jour UTC).
export function sanitize(raw: any, opts: any = {}) {
  const data = { ...(raw || {}) };
  const rejected: { field: string; value: any; reason: string }[] = [];
  const today = _isValidDate(opts.today) || new Date();
  const drop = (field: string, reason: string) => {
    if (field === 'nom') return; // clé de rapprochement — jamais vidée automatiquement
    if (data[field] === undefined || data[field] === null || data[field] === '') return;
    rejected.push({ field, value: data[field], reason });
    data[field] = '';
  };

  // 1) Libellés de formulaire pris pour des valeurs.
  for (const f of LABELISH_FIELDS) {
    if (!data[f]) continue;
    const why = _looksLikeLabel(f, String(data[f]));
    if (why) drop(f, why);
  }

  // 2) Ville : ne doit pas contenir de chiffre.
  if (data.ville && /\d/.test(String(data.ville))) drop('ville', 'une ville ne contient pas de chiffre');

  // 3) Code postal : exactement 5 chiffres.
  if (data.code_postal && !/^\d{5}$/.test(String(data.code_postal).trim())) drop('code_postal', 'code postal ≠ 5 chiffres');

  // 4) Email : forme plausible.
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) drop('email', 'adresse email invalide');

  // 5) Date de naissance : ni aujourd'hui, ni future, âge dans [14, 90].
  if (data.date_naissance) {
    const d = _isValidDate(data.date_naissance);
    if (!d) drop('date_naissance', 'date illisible');
    else {
      const age = (today.getTime() - d.getTime()) / (365.25 * 864e5);
      if (d.getTime() >= _startOfDay(today)) drop('date_naissance', 'date de naissance = aujourd\'hui ou future');
      else if (age < 14) drop('date_naissance', 'âge < 14 ans');
      else if (age > 90) drop('date_naissance', 'âge > 90 ans');
    }
  }

  // 6) Date d'entrée : postérieure à la naissance (si les deux présentes et valides).
  if (data.date_entree) {
    const de = _isValidDate(data.date_entree), dn = _isValidDate(data.date_naissance);
    if (!de) drop('date_entree', 'date illisible');
    else if (dn && de.getTime() <= dn.getTime()) drop('date_entree', 'date d\'entrée antérieure à la naissance');
  }

  // 7) Contrôle croisé EMPLOYEUR : un champ salarié identique au champ employeur = contamination.
  const eqEmp = (a: any, b: any) => a && b && _norm(a) === _norm(b);
  const digits = (v: any) => String(v ?? '').replace(/\D/g, '');
  if (eqEmp(data.email, data.employeur_email)) drop('email', 'identique à l\'email de l\'employeur');
  if (data.telephone && data.employeur_telephone && digits(data.telephone) === digits(data.employeur_telephone) && digits(data.telephone).length >= 6) drop('telephone', 'identique au téléphone de l\'employeur');
  if (eqEmp(data.adresse, data.employeur_adresse)) drop('adresse', 'identique à l\'adresse de l\'employeur');
  if (eqEmp(data.ville, data.employeur_ville) && eqEmp(data.code_postal, data.employeur_code_postal)) {
    drop('ville', 'localité identique à celle de l\'employeur');
    drop('code_postal', 'code postal identique à celui de l\'employeur');
  }

  // Les champs employeur_* ne sont pas destinés à la fiche : on les retire de la sortie.
  for (const k of Object.keys(data)) if (k.startsWith('employeur_')) delete data[k];

  return { data, rejected };
}
function _startOfDay(d: Date) { return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }

// ── Extraction ──────────────────────────────────────────────────────────────
async function extractViaOcr(base64: string, mime: string) {
  const ocrJ = await mistralCall('https://api.mistral.ai/v1/ocr', { model: OCR_MODEL, document: { type: 'document_url', document_url: `data:${mime || 'application/pdf'};base64,${base64}` }, include_image_base64: false }, 5);
  const text = (ocrJ?.pages || []).map((p: any) => p.markdown || p.text || '').join('\n\n');
  if (!text || text.length < 50) throw new Error('OCR texte vide');
  const chatJ = await mistralCall('https://api.mistral.ai/v1/chat/completions', { model: CHAT_MODEL, temperature: 0.1, response_format: { type: 'json_schema', json_schema: { name: 'extract_contrat', schema: EXTRACT_SCHEMA, strict: true } }, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `Voici le contenu textuel du contrat :\n\n${text.slice(0, 30000)}` }] }, 5);
  const content = chatJ?.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty response');
  return { data: JSON.parse(content), usage: chatJ?.usage, model: CHAT_MODEL };
}

async function extractViaVision(images: string[], mime: string) {
  const content: any[] = [{ type: 'text', text: 'Voici les pages du contrat en image. Extrais les données du SALARIÉ (pas de l\'employeur), sans jamais confondre un libellé de case avec une valeur.' }];
  for (const img of images.slice(0, 4)) {
    const url = img.startsWith('data:') ? img : `data:${mime && mime.startsWith('image/') ? mime : 'image/png'};base64,${img}`;
    content.push({ type: 'image_url', image_url: { url } });
  }
  const chatJ = await mistralCall('https://api.mistral.ai/v1/chat/completions', { model: VISION_MODEL, temperature: 0.1, response_format: { type: 'json_schema', json_schema: { name: 'extract_contrat', schema: EXTRACT_SCHEMA, strict: true } }, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content }] }, 5);
  const c = chatJ?.choices?.[0]?.message?.content;
  if (!c) throw new Error('empty vision response');
  return { data: JSON.parse(c), usage: chatJ?.usage, model: VISION_MODEL };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!MISTRAL_KEY) return json({ error: 'MISTRAL_API_KEY missing' }, 500);

  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json({ error: 'Missing Bearer' }, 401);

  const sbCaller = createClient(SUPA_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: userRes } = await sbCaller.auth.getUser();
  if (!userRes?.user) return json({ error: 'Invalid token' }, 401);

  const sbAdmin = createClient(SUPA_URL, SERVICE_KEY);
  const { data: profile } = await sbAdmin.from('profiles').select('role, organization_id').eq('id', userRes.user.id).maybeSingle();
  if (!profile || !['admin', 'manager', 'super_admin'].includes(profile.role)) return json({ error: 'Role insuffisant' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
  const { base64, mime_type, images } = body;
  if (!base64 && !(Array.isArray(images) && images.length)) return json({ error: 'base64 ou images requis' }, 400);

  const t0 = Date.now();
  try {
    let res: { data: any; usage: any; model: string };
    let via = 'ocr';
    if (Array.isArray(images) && images.length) {
      // Voie VISION (scan). Repli sur OCR-texte si la vision échoue et qu'on a le base64.
      try { res = await extractViaVision(images, mime_type); via = 'vision'; }
      catch (ve) {
        if (!base64) throw ve;
        res = await extractViaOcr(base64, mime_type); via = 'ocr-fallback';
      }
    } else {
      res = await extractViaOcr(base64, mime_type);
    }

    const { data, rejected } = sanitize(res.data);
    const elapsed = Date.now() - t0;
    try { await sbAdmin.from('ia_usage_log').insert({ organization_id: profile.organization_id, user_id: userRes.user.id, action: 'import_contrat', model: `${res.model}/${via}`, tokens_in: res.usage?.prompt_tokens || null, tokens_out: res.usage?.completion_tokens || null, elapsed_ms: elapsed }); } catch (_) {}
    return json({ ok: true, data, rejected, via, elapsed_ms: elapsed });
  } catch (e) { return json({ error: e.message || String(e) }, 500); }
});

// Pont OAuth du serveur MCP — harnais sur le code RÉEL extrait de supabase/functions/mcp/index.ts.
//
// Deux défauts corrigés, qui se combinaient :
//   1. `redirect_uri` n'était JAMAIS validé. Un lien piégé hébergé sur le vrai domaine
//      (…/oauth/authorize.html?redirect_uri=https://attaquant/) suffisait à faire partir le code
//      d'autorisation vers n'importe où.
//   2. Le code d'autorisation contenait la clé API en base64 simplement signé — donc lisible par
//      quiconque le récupérait — et voyageait dans une URL (historique, journaux, en-tête Referer).
//
// Le fichier est du TypeScript : on retire les annotations de type avant d'évaluer les fonctions.
// C'est bien le code déployé qui est testé, pas une recopie.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'mcp', 'index.ts'), 'utf8');

function extraire(marqueur, finMarqueur) {
  const d = src.indexOf(marqueur);
  if (d < 0) throw new Error('introuvable dans mcp/index.ts : ' + marqueur);
  const f = src.indexOf(finMarqueur, d);
  if (f < 0) throw new Error('fin introuvable pour : ' + marqueur);
  return src.slice(d, f);
}
// Retrait des annotations de type (ces fonctions n'utilisent que des types simples).
const detyper = (s) => s
  .replace(/:\s*Promise<[^>]*>/g, '')
  .replace(/:\s*(string|boolean|number|any|CryptoKey|Uint8Array|URL)\b/g, '')
  .replace(/\bas\s+\w+/g, '');

const bloc = detyper([
  extraire('function b64u(', 'async function codeKey('),
  extraire('async function codeKey(', '// ── Liste blanche'),
  extraire('const REDIRECTS_AUTORISES', 'function corsHeaders('),
].join('\n'));

const HMAC_SECRET = 'secret-de-test:mcp_oauth_v1';
globalThis.Deno = { env: { get: (k) => (k === 'MCP_REDIRECT_URIS' ? undefined : undefined) } };
const ctx = {};
eval(bloc + '\n;ctx.redirectAutorise=redirectAutorise;ctx.signPayload=signPayload;ctx.verifyPayload=verifyPayload;ctx.REDIRECTS_AUTORISES=REDIRECTS_AUTORISES;ctx.b64uBytes=b64uBytes;');

let ok = true; const t = (l, c) => { console.log((c ? 'PASS' : 'FAIL') + ' · ' + l); ok = c && ok; };

(async () => {
// ══ 1. redirect_uri : l'attaque exacte est refusée ═══════════════════════════════════════════
const refuses = [
  ['https://attaquant.example/callback',            'domaine quelconque en HTTPS'],
  ['https://claude.ai.attaquant.example/cb',        'domaine qui COMMENCE par le nom attendu'],
  ['http://claude.ai/callback',                     'HTTP en clair sur un domaine distant'],
  ['javascript:alert(1)',                           'schéma javascript:'],
  ['data:text/html,<script>',                       'schéma data:'],
  ['file:///etc/passwd',                            'schéma file:'],
  ['//attaquant.example/cb',                        'URL relative de protocole'],
  ['',                                              'chaîne vide'],
  ['pas une url',                                   'chaîne non analysable'],
  ['https://evil.example/#https://claude.ai/',      'domaine attendu placé dans le fragment'],
  ['https://evil.example/?r=https://claude.ai/',    'domaine attendu placé en paramètre'],
];
for (const [uri, quoi] of refuses) t('refusé — ' + quoi, ctx.redirectAutorise(uri) === false);

const acceptes = [
  ['https://claude.ai/api/mcp/auth_callback', 'client Claude'],
  ['https://claude.com/api/mcp/auth_callback', 'domaine claude.com'],
  ['http://localhost:8765/callback',          'client de bureau en local'],
  ['http://127.0.0.1:33418/oauth',            'boucle locale par adresse'],
];
for (const [uri, quoi] of acceptes) t('accepté — ' + quoi, ctx.redirectAutorise(uri) === true);

t('la liste blanche est configurable (variable MCP_REDIRECT_URIS)', /Deno\.env\.get\("MCP_REDIRECT_URIS"\)/.test(src));
t('toute valeur refusée est journalisée (pour identifier la bonne adresse)', /redirect_uri refusé/.test(src));

// ══ 2. Le code d'autorisation ne révèle plus la clé API ══════════════════════════════════════
const CLE = 'eat_Po0YjD5I_secret_qui_ne_doit_pas_fuiter';
const code = await ctx.signPayload({ api_key: CLE, cc: 'abc', ccm: 'S256', ru: 'https://claude.ai/cb', exp: Math.floor(Date.now()/1000) + 120 });

t('le code ne contient pas la clé en clair', !code.includes(CLE));
t('le code ne contient pas la clé en base64 non plus',
  !code.includes(Buffer.from(CLE).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')));
t('aucun décodage base64 du code ne fait apparaître la clé', (() => {
  for (const morceau of code.split('.')) {
    try { if (Buffer.from(morceau.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8').includes('eat_')) return false; } catch {}
  }
  return true;
})());
t('le serveur, lui, sait le relire', (await ctx.verifyPayload(code))?.api_key === CLE);
t('le code retient l\'adresse de retour pour laquelle il a été émis', (await ctx.verifyPayload(code))?.ru === 'https://claude.ai/cb');

// ══ 3. Le code ne peut pas être fabriqué ni trafiqué ═════════════════════════════════════════
const [v, iv, ct] = code.split('.');
t('version marquée v2', v === 'v2');
t('code trafiqué (un octet du chiffré modifié) → rejeté', await ctx.verifyPayload(
  v + '.' + iv + '.' + (ct.slice(0, -2) + (ct.slice(-2) === 'AA' ? 'AB' : 'AA'))) === null);
t('vecteur d\'initialisation modifié → rejeté', await ctx.verifyPayload(
  v + '.' + (iv.slice(0, -2) + (iv.slice(-2) === 'AA' ? 'AB' : 'AA')) + '.' + ct) === null);
t('ancien format signé (payload.hmac) → rejeté', await ctx.verifyPayload(
  Buffer.from(JSON.stringify({ api_key: CLE })).toString('base64url') + '.deadbeef') === null);
t('n\'importe quoi → rejeté', await ctx.verifyPayload('nawak') === null);
t('vide → rejeté', await ctx.verifyPayload('') === null);
t('deux codes successifs diffèrent (vecteur aléatoire)',
  (await ctx.signPayload({ a: 1 })) !== (await ctx.signPayload({ a: 1 })));

// ══ 4. PKCE : S256 obligatoire des deux côtés ════════════════════════════════════════════════
t('/authorize exige un code_challenge', /PKCE requis/.test(src));
t('/authorize refuse toute méthode autre que S256', /seule la méthode S256 est acceptée/.test(src));
t('/token refuse un code sans PKCE S256', /PKCE S256 requis/.test(src));
t('« plain » n\'est plus annoncé dans les métadonnées',
  /code_challenge_methods_supported: \["S256"\]/.test(src) && !/"plain"/.test(src));
t('durée de vie du code ramenée à 120 s', /\+ 120 \}\)/.test(src));

// ══ 5. Le refus ne doit pas servir de tremplin de redirection ouverte ════════════════════════
{
  const i = src.indexOf('if (!redirectAutorise(redirectUri))');
  const bloc = src.slice(i, i + 700);
  t('un redirect_uri refusé renvoie une page d\'erreur, PAS une redirection',
    /status: 400/.test(bloc) && !/redirectToPage/.test(bloc));
}
{
  const iVal = src.indexOf('if (!redirectAutorise(redirectUri))');
  const iCle = src.indexOf('const ak = await lookupKey(apiKey)');
  t('le redirect_uri est validé AVANT toute vérification de la clé', iVal > 0 && iCle > iVal);
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED'); process.exit(ok ? 0 : 1);
})();

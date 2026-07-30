// Limitation des tentatives de PIN — harnais sur la fonction de décision RÉELLE
// (supabase/functions/_shared/pin-ratelimit.mjs), celle-là même qui est déployée dans verify-pin
// et create-pointage. Aucune réimplémentation : pas de jumeau qui dérive.
//
// Ce que ce harnais doit démontrer, dans cet ordre d'importance :
//   1. la badgeuse continue de fonctionner en rafale de début/fin de service (contrainte du patron :
//      une trentaine de salariés pointent au même moment, depuis la même connexion) ;
//   2. une vraie tablette n'est JAMAIS bloquée par une attaque menée depuis l'extérieur — sinon on
//      aurait remplacé une faille d'intégrité par un déni de service sur trois restaurants ;
//   3. le bruteforce de PIN, lui, est bien arrêté, y compris quand l'attaquant fait tourner le
//      kiosk_id (ce qui suffisait à neutraliser l'ancienne limitation) et l'adresse IP.
const path = require('path');

(async () => {
const M = await import(path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'pin-ratelimit.mjs'));
const { decidePin, ipCliente, LIMITES } = M;

let ok = true; const t = (l, c) => { console.log((c ? 'PASS' : 'FAIL') + ' · ' + l); ok = c && ok; };

// ── Simulateur : reproduit ce que font verify-pin et create-pointage autour de decidePin ──
function nouveauMonde() {
  const tentatives = [];        // {ts, kiosk, salarie, ip, kioskConnu}  — échecs uniquement
  const registre = new Set();   // kiosk_id ayant déjà validé un PIN (kiosk_registry)
  return {
    registre,
    // pinBon : le PIN présenté est-il le bon ? ipFiable : la plateforme fournit-elle une IP sûre ?
    tenter({ kiosk, ip = '10.0.0.1', salarie = null, pinBon = false, ts, ipFiable = true }) {
      const kioskConnu = registre.has(kiosk);
      const d = decidePin({
        kioskConnu,
        echecsKiosk:   tentatives.filter(a => a.kiosk === kiosk).map(a => a.ts),
        echecsSalarie: salarie ? tentatives.filter(a => a.salarie === salarie).map(a => a.ts) : [],
        echecsOrg:     tentatives.filter(a => !a.kioskConnu).map(a => a.ts),
        echecsIp:      tentatives.filter(a => !a.kioskConnu && a.ip === ip).map(a => a.ts),
        ipFiable,
        maintenant: ts,
      });
      if (!d.autorise) return { bloque: true, motif: d.motif, retryApresS: d.retryApresS };
      if (pinBon) {
        registre.add(kiosk);                                   // la tablette devient connue
        for (let i = tentatives.length - 1; i >= 0; i--)       // un succès purge les échecs de CETTE tablette
          if (tentatives[i].kiosk === kiosk) tentatives.splice(i, 1);
        return { bloque: false, ok: true };
      }
      tentatives.push({ ts, kiosk, salarie, ip, kioskConnu });
      return { bloque: false, ok: false };
    },
  };
}
const S = 1000, MIN = 60 * S;

// ══ 1. La rafale de service — la contrainte à ne pas casser ══════════════════════════════════
{
  const m = nouveauMonde();
  m.registre.add('tablette-carnot');                       // tablette déjà en service
  let bloques = 0;
  for (let i = 0; i < 15; i++)                             // 15 pointages en 2 minutes, même IP
    if (m.tenter({ kiosk: 'tablette-carnot', ip: '81.250.4.7', salarie: 'sal-' + i, pinBon: true, ts: i * 8 * S }).bloque) bloques++;
  t('rafale : 15 pointages en 2 min, même tablette, même IP → 0 blocage', bloques === 0);
}
{
  const m = nouveauMonde();
  m.registre.add('tablette-carnot');
  let bloques = 0, tS = 0;
  for (let i = 0; i < 15; i++) {                           // idem, avec 2 fautes de frappe
    if (i === 4 || i === 9) { if (m.tenter({ kiosk: 'tablette-carnot', ip: '81.250.4.7', salarie: 'sal-' + i, pinBon: false, ts: tS }).bloque) bloques++; tS += 3 * S; }
    if (m.tenter({ kiosk: 'tablette-carnot', ip: '81.250.4.7', salarie: 'sal-' + i, pinBon: true, ts: tS }).bloque) bloques++;
    tS += 8 * S;
  }
  t('rafale : 15 pointages + 2 fautes de frappe → 0 blocage', bloques === 0);
}
{
  const m = nouveauMonde();                                 // 3 tablettes, 30 pointages, même IP publique
  ['carnot', 'grandcoeur', 'lobau'].forEach(k => m.registre.add(k));
  let bloques = 0;
  for (let i = 0; i < 30; i++)
    if (m.tenter({ kiosk: ['carnot', 'grandcoeur', 'lobau'][i % 3], ip: '81.250.4.7', salarie: 'sal-' + i, pinBon: true, ts: i * 4 * S }).bloque) bloques++;
  t('rafale : 30 pointages sur 3 tablettes derrière la même IP → 0 blocage', bloques === 0);
}
{
  const m = nouveauMonde();                                 // tablette neuve : inconnue au 1er usage
  const r = m.tenter({ kiosk: 'tablette-neuve', pinBon: true, ts: 0 });
  t('tablette neuve : première saisie correcte acceptée, puis enregistrée',
    !r.bloque && r.ok === true && m.registre.has('tablette-neuve'));
}

// ══ 2. L'attaque est arrêtée ═════════════════════════════════════════════════════════════════
{
  const m = nouveauMonde();                                 // kiosk_id neuf à chaque essai (l'ancienne parade)
  let i = 0, res;
  do { res = m.tenter({ kiosk: 'attaquant-' + i, ip: '203.0.113.9', ts: i * S }); i++; } while (!res.bloque && i < 300);
  t('bruteforce avec kiosk_id tournant → bloqué (l\'ancienne limitation ne voyait rien)', res.bloque);
  t('  … bloqué au ' + i + 'e essai, soit le budget des inconnus (' + LIMITES.INCONNU_MAX + ')', i === LIMITES.INCONNU_MAX + 1);
  t('  … motif « org » (dimension inescapable)', res.motif === 'org');
}
{
  const m = nouveauMonde();                                 // kiosk_id ET IP tournants
  let i = 0, res;
  do { res = m.tenter({ kiosk: 'att-' + i, ip: '198.51.100.' + (i % 254), ts: i * S }); i++; } while (!res.bloque && i < 300);
  t('bruteforce avec kiosk_id ET IP tournants → bloqué quand même (compteur organisation)',
    res.bloque && res.motif === 'org');
}
{
  const m = nouveauMonde();                                 // attaque ciblée sur un salarié précis
  m.registre.add('tablette-volee');
  let i = 0, res;
  do { res = m.tenter({ kiosk: 'tablette-volee', salarie: 'yasmina', ts: i * S }); i++; } while (!res.bloque && i < 300);
  t('attaque ciblée sur un salarié depuis une tablette CONNUE → bloquée', res.bloque);
  t('  … au ' + i + 'e essai (plafond salarié ou tablette = 5)', i === 6);
}
{
  const m = nouveauMonde();                                 // ~278 essais nécessaires en moyenne : jamais atteints
  let i = 0, res;
  do { res = m.tenter({ kiosk: 'att-' + i, ts: i * S }); i++; } while (!res.bloque && i < 278);
  t('l\'attaquant n\'atteint jamais les ~278 essais nécessaires pour tomber sur un PIN valide', i < 278);
}

// ══ 3. Le point qui compte le plus : pas de déni de service sur les restaurants ══════════════
{
  const m = nouveauMonde();
  m.registre.add('tablette-carnot');
  for (let i = 0; i < 50; i++) m.tenter({ kiosk: 'att-' + i, ip: '203.0.113.9', ts: i * S }); // attaque en cours
  const r = m.tenter({ kiosk: 'tablette-carnot', ip: '81.250.4.7', salarie: 'laila', pinBon: true, ts: 51 * S });
  t('ATTAQUE EN COURS (50 échecs) : la vraie tablette pointe toujours', !r.bloque && r.ok === true);
}
{
  const m = nouveauMonde();
  m.registre.add('tablette-carnot');
  for (let i = 0; i < 50; i++) m.tenter({ kiosk: 'att-' + i, ip: '81.250.4.7', ts: i * S });   // attaque depuis LA MÊME IP
  const r = m.tenter({ kiosk: 'tablette-carnot', ip: '81.250.4.7', salarie: 'laila', pinBon: true, ts: 51 * S });
  t('attaque depuis l\'IP DU SNACK : la vraie tablette pointe toujours (exemption du registre)',
    !r.bloque && r.ok === true);
}

// ══ 4. Fenêtres et retour d'information ══════════════════════════════════════════════════════
{
  const now = 10 * 60 * S;
  const vieux = [0, 1 * S, 2 * S, 3 * S, 4 * S];            // 5 échecs, tous > 5 min
  t('échecs sortis de la fenêtre : ne comptent plus',
    decidePin({ kioskConnu: true, echecsKiosk: vieux, echecsSalarie: [], echecsOrg: [], echecsIp: [], ipFiable: true, maintenant: now }).autorise === true);
  const frais = [now - 10 * S, now - 9 * S, now - 8 * S, now - 7 * S, now - 6 * S];
  const d = decidePin({ kioskConnu: true, echecsKiosk: frais, echecsSalarie: [], echecsOrg: [], echecsIp: [], ipFiable: true, maintenant: now });
  t('5 échecs dans la fenêtre → bloqué', d.autorise === false && d.motif === 'kiosk');
  t('retry_after calculé sur le PLUS ANCIEN échec de la fenêtre (≈290 s)', d.retryApresS === 290);
  t('retry_after toujours ≥ 1 s',
    decidePin({ kioskConnu: true, echecsKiosk: Array(5).fill(now - LIMITES.KIOSK_FENETRE_S * 1000), echecsSalarie: [], echecsOrg: [], echecsIp: [], ipFiable: true, maintenant: now }).retryApresS >= 1);
}
{
  const now = 1000000, ech = Array(20).fill(now - 1000);
  t('ipFiable=false : la dimension IP est neutralisée (l\'organisation prend le relais)',
    decidePin({ kioskConnu: false, echecsKiosk: [], echecsSalarie: [], echecsOrg: [], echecsIp: ech, ipFiable: false, maintenant: now }).autorise === true);
  t('ipFiable=true : la dimension IP bloque',
    decidePin({ kioskConnu: false, echecsKiosk: [], echecsSalarie: [], echecsOrg: [], echecsIp: ech, ipFiable: true, maintenant: now }).motif === 'ip');
  t('tablette connue : ni org ni IP ne s\'appliquent',
    decidePin({ kioskConnu: true, echecsKiosk: [], echecsSalarie: [], echecsOrg: ech, echecsIp: ech, ipFiable: true, maintenant: now }).autorise === true);
}

// ══ 5. ipCliente : une IP forgée par l'appelant ne doit pas l'emporter ═══════════════════════
t('x-forwarded-for simple → cette adresse', ipCliente('81.250.4.7') === '81.250.4.7');
t('chaîne de proxys → DERNIER élément (celui ajouté par le proxy de confiance)',
  ipCliente('203.0.113.9, 81.250.4.7') === '81.250.4.7');
t('valeur FORGÉE par l\'attaquant : reste à gauche, ne gagne pas',
  ipCliente('1.2.3.4, 203.0.113.9') === '203.0.113.9');
t('espaces et éléments vides ignorés', ipCliente('  1.2.3.4 ,, 81.250.4.7  ') === '81.250.4.7');
t('en-tête absent → repli', ipCliente(null, '10.0.0.5') === '10.0.0.5');
t('en-tête absent et pas de repli → null', ipCliente(null, null) === null);
t('en-tête vide → null (pas la chaîne vide)', ipCliente('', '') === null);

// ══ 6. Ordre des motifs : le plus précis l'emporte (message et retry cohérents) ══════════════
{
  const now = 1000000, cinq = Array(5).fill(now - 1000), vingt = Array(20).fill(now - 1000);
  t('kiosk avant salarié', decidePin({ kioskConnu: false, echecsKiosk: cinq, echecsSalarie: cinq, echecsOrg: vingt, echecsIp: vingt, ipFiable: true, maintenant: now }).motif === 'kiosk');
  t('salarié avant org',   decidePin({ kioskConnu: false, echecsKiosk: [],   echecsSalarie: cinq, echecsOrg: vingt, echecsIp: vingt, ipFiable: true, maintenant: now }).motif === 'salarie');
  t('org avant ip',        decidePin({ kioskConnu: false, echecsKiosk: [],   echecsSalarie: [],   echecsOrg: vingt, echecsIp: vingt, ipFiable: true, maintenant: now }).motif === 'org');
}

// ══ 7. Robustesse ═══════════════════════════════════════════════════════════════════════════
{
  const now = 1000;
  t('tableaux absents → autorisé (défaut sûr : on ne bloque pas sur une lecture ratée)',
    decidePin({ kioskConnu: false, ipFiable: true, maintenant: now }).autorise === true);
  t('horodatages non numériques ignorés',
    decidePin({ kioskConnu: true, echecsKiosk: [null, 'x', undefined, NaN], echecsSalarie: [], echecsOrg: [], echecsIp: [], ipFiable: true, maintenant: now }).autorise === true);
}

// ══ 8. Câblage des deux edge functions : aucune lecture muette ═══════════════════════════════
// Le module ci-dessus est pur ; ce qui l'entoure ne l'est pas. Une lecture qui échoue sans être
// vérifiée retomberait sur des valeurs par défaut, et la protection deviendrait décorative sans
// que rien ne le signale — le défaut le plus fréquent de ce projet, ici en code neuf.
{
  const fs = require('fs');
  for (const fn of ['verify-pin', 'create-pointage']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', fn, 'index.ts'), 'utf8');

    t(fn + ' : importe le module partagé (pas de recopie qui dériverait)',
      /from '\.\.\/_shared\/pin-ratelimit\.mjs'/.test(src));

    // La lecture du registre : son erreur DOIT être capturée, et le défaut doit être « connue ».
    // Défaut inverse = les vraies tablettes perdent leur exemption sur une simple lecture ratée,
    // et les plafonds organisation/IP s'appliquent d'un coup aux restaurants en service.
    t(fn + ' : l\'erreur de lecture du registre est capturée',
      /const \{ data: connu, error: eReg0 \} = await sb\.from\('kiosk_registry'\)/.test(src));
    t(fn + ' : registre illisible → tablette réputée CONNUE (défaut sûr, pas de blocage)',
      /const kioskConnu = eReg0 \? true : !!connu;/.test(src));
    t(fn + ' : registre illisible → journalisé en clair', /registre des tablettes illisible/.test(src));

    // La lecture des échecs : idem, avec un message qui nomme la migration manquante.
    t(fn + ' : l\'erreur de lecture de pin_attempts est capturée', /if \(eLect\) console\.error/.test(src));
    t(fn + ' : pin_attempts illisible → journalisé comme « LIMITATION INACTIVE »',
      /LIMITATION INACTIVE/.test(src) && /v6\.32_pin_ratelimit\.sql/.test(src));

    // Les écritures aussi : un enregistrement de tentative perdu, c'est un compteur faussé.
    t(fn + ' : l\'erreur d\'insertion dans pin_attempts est capturée', /error: eIns \} = await sb\.from\('pin_attempts'\)/.test(src));
    t(fn + ' : l\'erreur d\'upsert du registre est capturée', /error: eReg \} = await sb\.from\('kiosk_registry'\)/.test(src));

    // Le motif de blocage ne doit pas fuiter vers l'appelant : il lui dirait quelle dimension le
    // gêne. On inspecte la SEULE ligne de réponse, pas tout le bloc — le console.warn juste
    // au-dessus contient légitimement d.motif, et le tester en bloc rendait l'assertion inopérante.
    const i429 = src.indexOf('if (!d.autorise)');
    const bloc429 = src.slice(i429, src.indexOf('\n  }', i429));
    const reponse429 = (bloc429.match(/return json\([^\n]*\n?/) || [''])[0];
    t(fn + ' : la réponse 429 annonce bien un dépassement',
      /Trop de tentatives/.test(reponse429) && /retry_after_s/.test(reponse429));
    t(fn + ' : la réponse 429 ne révèle PAS le motif du blocage',
      reponse429.length > 0 && !/motif/.test(reponse429));

    // La limitation ne compte QUE les échecs : c'est ce qui fait passer la rafale de service.
    // Assertion portée sur la CHAÎNE DE LECTURE elle-même : un simple test de présence de
    // `.eq('ok', false)` dans le fichier passait encore alors que le filtre avait été retiré de
    // la lecture, parce que la purge après succès en contient une autre occurrence.
    t(fn + ' : la lecture des tentatives ne compte que les échecs',
      /\.eq\('ok', false\)\.gte\('ts', depuis\)/.test(src));
  }
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED'); process.exit(ok ? 0 : 1);
})();

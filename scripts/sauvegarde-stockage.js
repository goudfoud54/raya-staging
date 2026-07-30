#!/usr/bin/env node
/**
 * Sauvegarde locale des fichiers du stockage Supabase (Eatime360).
 *
 * POURQUOI CE SCRIPT EXISTE
 * Aucun plan Supabase — y compris payant — ne sauvegarde les fichiers du stockage. La
 * documentation officielle est explicite : « Database backups do not include objects you store via
 * the Storage API, as the database only includes metadata about these objects. »
 * (https://supabase.com/docs/guides/platform/backups)
 * Les contrats, pièces d'identité et courriers disciplinaires ne sont donc couverts par RIEN.
 * Ce script est le seul filet pour ces fichiers, et il doit être lancé à la main, régulièrement.
 *
 * USAGE
 *   export SUPABASE_URL="https://ynnqvtfayrdteqtgxeuk.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."      # Dashboard › Project Settings › API
 *   node scripts/sauvegarde-stockage.js /chemin/vers/mon/dossier/de/sauvegarde
 *
 * Options :
 *   --dry-run        n'écrit rien, se contente d'inventorier
 *   --force-depot    autorise une destination située dans un dépôt git (déconseillé, voir plus bas)
 *
 * CE QU'IL FAIT
 *   • parcourt TOUS les buckets, en descendant récursivement dans les sous-dossiers ;
 *   • pagine les listings (un listing tronqué en silence donnerait une sauvegarde tronquée) ;
 *   • reprend là où il s'est arrêté : un fichier déjà présent à la bonne taille n'est pas retéléchargé ;
 *   • écrit un manifeste (chemin, taille, empreinte SHA-256) qui rend la restauration vérifiable ;
 *   • signale CHAQUE échec et sort en code 1 — une sauvegarde qui saute des fichiers en silence
 *     serait pire que pas de sauvegarde du tout.
 *
 * CE QU'IL NE FAIT PAS
 *   Il ne sauvegarde QUE les fichiers. La base de données est un sujet distinct (`supabase db dump`),
 *   et reste à traiter.
 *
 * PROTECTION DE LA DESTINATION
 *   Le dépôt raya-staging est PUBLIC. Déposer 63 Mo de documents RH dedans les publierait. Le script
 *   refuse donc d'écrire dans un répertoire situé sous un dépôt git, sauf --force-depot explicite.
 */
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const FORCE_DEPOT = args.includes('--force-depot');
const DEST = args.filter(a => !a.startsWith('--'))[0];

function mourir(msg) { console.error('\n✗ ' + msg + '\n'); process.exit(2); }

if (!URL_BASE || !CLE) mourir(
  'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis dans l\'environnement.\n' +
  '  La clé se récupère dans le Dashboard Supabase › Project Settings › API › service_role.\n' +
  '  Ne la copie JAMAIS dans un fichier du dépôt : il est public.');
if (!DEST) mourir('Indique le dossier de destination :\n  node scripts/sauvegarde-stockage.js /chemin/vers/sauvegarde');

const RACINE = path.resolve(DEST);

// Refus d'écrire dans un dépôt git (le dépôt de ce projet est public).
function depotGitAuDessus(p) {
  let d = p;
  for (;;) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const parent = path.dirname(d);
    if (parent === d) return null;
    d = parent;
  }
}
{
  const depot = depotGitAuDessus(RACINE);
  if (depot && !FORCE_DEPOT) mourir(
    'La destination est dans un dépôt git : ' + depot + '\n' +
    '  Ce dépôt est public — y déposer des contrats et des pièces d\'identité les publierait.\n' +
    '  Choisis un dossier hors du dépôt, ou passe --force-depot si tu sais ce que tu fais.');
}

// Garde-fou : lancé avec la clé ANONYME, ce script ne voit rien (le listing des buckets renvoie
// une liste vide, en HTTP 200) et annoncerait une sauvegarde « complète » de zéro fichier. C'est
// arrivé au premier essai. On refuse donc explicitement toute clé qui n'est pas service_role.
{
  const morceaux = CLE.split('.');
  if (morceaux.length === 3) {
    let role = null;
    try { role = JSON.parse(Buffer.from(morceaux[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).role; } catch { /* pas un JWT lisible */ }
    if (role && role !== 'service_role') mourir(
      'La clé fournie a le rôle « ' + role +' », pas « service_role ».\n' +
      '  Avec cette clé, le stockage répond « aucun bucket » et la sauvegarde serait vide sans le dire.\n' +
      '  Prends la clé service_role : Dashboard Supabase › Project Settings › API.');
  }
}

const entetes = { apikey: CLE, Authorization: 'Bearer ' + CLE };
const echecs = [];
const manifeste = [];
let telecharges = 0, ignores = 0, octets = 0;

const mo = n => (n / 1048576).toFixed(2) + ' Mo';

async function jsonPost(chemin, corps) {
  const r = await fetch(URL_BASE + chemin, {
    method: 'POST',
    headers: { ...entetes, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText + ' sur ' + chemin + ' — ' + (await r.text()).slice(0, 200));
  return r.json();
}

async function listerBuckets() {
  const r = await fetch(URL_BASE + '/storage/v1/bucket', { headers: entetes });
  if (!r.ok) throw new Error('Listing des buckets impossible : HTTP ' + r.status + ' — ' + (await r.text()).slice(0, 200));
  return r.json();
}

// Listing récursif ET paginé. Les deux comptent : sans pagination on s'arrête au 100e fichier,
// sans récursion on ignore tout ce qui est dans un sous-dossier (66 des 125 fichiers, mesuré).
const PAGE = 100;
async function listerFichiers(bucket, prefixe = '') {
  const trouves = [];
  let offset = 0;
  for (;;) {
    const lot = await jsonPost('/storage/v1/object/list/' + encodeURIComponent(bucket), {
      prefix: prefixe, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (!Array.isArray(lot) || lot.length === 0) break;
    for (const e of lot) {
      const complet = prefixe ? prefixe + e.name : e.name;
      // Un dossier se reconnaît à l'absence de métadonnées (id null côté API Storage).
      if (e.id === null || !e.metadata) trouves.push(...await listerFichiers(bucket, complet + '/'));
      else trouves.push({ chemin: complet, taille: Number(e.metadata.size || 0), mime: e.metadata.mimetype || null });
    }
    if (lot.length < PAGE) break;
    offset += lot.length;
  }
  return trouves;
}

async function telecharger(bucket, f) {
  const cible = path.join(RACINE, bucket, f.chemin);
  // Reprise : un fichier déjà présent à la bonne taille n'est pas retéléchargé.
  try {
    const st = await fsp.stat(cible);
    if (st.size === f.taille && f.taille > 0) {
      ignores++;
      manifeste.push({ bucket, chemin: f.chemin, taille: st.size, sha256: await empreinte(cible), etat: 'deja-present' });
      return;
    }
  } catch { /* absent : on télécharge */ }

  if (DRY) { telecharges++; octets += f.taille; return; }

  const r = await fetch(URL_BASE + '/storage/v1/object/' + encodeURIComponent(bucket) + '/' + f.chemin.split('/').map(encodeURIComponent).join('/'), { headers: entetes });
  if (!r.ok) { echecs.push({ bucket, chemin: f.chemin, raison: 'HTTP ' + r.status + ' ' + r.statusText }); return; }
  const buf = Buffer.from(await r.arrayBuffer());

  await fsp.mkdir(path.dirname(cible), { recursive: true });
  const tmp = cible + '.partiel';
  await fsp.writeFile(tmp, buf);            // écriture puis renommage : jamais de fichier à moitié écrit
  await fsp.rename(tmp, cible);

  if (f.taille > 0 && buf.length !== f.taille)
    echecs.push({ bucket, chemin: f.chemin, raison: 'taille reçue ' + buf.length + ' ≠ taille annoncée ' + f.taille });

  telecharges++; octets += buf.length;
  manifeste.push({ bucket, chemin: f.chemin, taille: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), etat: 'telecharge' });
}

async function empreinte(fichier) {
  return crypto.createHash('sha256').update(await fsp.readFile(fichier)).digest('hex');
}

(async () => {
  console.log('Sauvegarde du stockage Eatime360');
  console.log('  source      : ' + URL_BASE);
  console.log('  destination : ' + RACINE + (DRY ? '   [DRY-RUN : rien ne sera écrit]' : ''));
  console.log('');

  let buckets;
  try { buckets = await listerBuckets(); }
  catch (e) { mourir('Connexion au stockage impossible : ' + e.message); }

  // Zéro bucket n'est PAS une sauvegarde réussie. L'API répond « [] » en HTTP 200 quand les droits
  // sont insuffisants : sans ce contrôle, le script annoncerait « ✓ complète » sans rien avoir copié.
  if (!Array.isArray(buckets) || buckets.length === 0) mourir(
    'Le stockage ne renvoie AUCUN bucket.\n' +
    '  Ce n\'est pas une sauvegarde vide, c\'est une sauvegarde qui a échoué : vérifie SUPABASE_URL\n' +
    '  et que la clé est bien la clé service_role.');

  let total = 0;
  for (const b of buckets) {
    let fichiers;
    try { fichiers = await listerFichiers(b.id); }
    catch (e) { echecs.push({ bucket: b.id, chemin: '(listing)', raison: e.message }); console.log('  ✗ ' + b.id + ' : listing impossible — ' + e.message); continue; }

    total += fichiers.length;
    const poids = fichiers.reduce((s, f) => s + f.taille, 0);
    console.log('  ' + b.id.padEnd(20) + fichiers.length.toString().padStart(4) + ' fichiers   ' + mo(poids).padStart(10)
      + (b.public ? '   (bucket public)' : '') + (fichiers.length === 0 ? '   ← vide : normal, ou droits insuffisants ?' : ''));
    for (const f of fichiers) await telecharger(b.id, f);
  }

  if (!DRY) {
    const chemin = path.join(RACINE, 'manifeste.json');
    await fsp.mkdir(RACINE, { recursive: true });
    await fsp.writeFile(chemin, JSON.stringify({
      source: URL_BASE, date: new Date().toISOString(),
      fichiers: manifeste.length, octets, entrees: manifeste.sort((a, c) => (a.bucket + a.chemin).localeCompare(c.bucket + c.chemin)),
    }, null, 2));
    console.log('\n  manifeste   : ' + chemin);
  }

  console.log('\n─────────────────────────────────────────────');
  console.log('  inventoriés  : ' + total + ' fichiers');
  console.log('  téléchargés  : ' + telecharges + '   (' + mo(octets) + ')');
  console.log('  déjà présents: ' + ignores);
  console.log('  échecs       : ' + echecs.length);

  if (echecs.length) {
    console.log('\n  ÉCHECS — ces fichiers ne sont PAS sauvegardés :');
    for (const e of echecs) console.log('    ✗ ' + e.bucket + '/' + e.chemin + ' — ' + e.raison);
    console.log('\n✗ Sauvegarde INCOMPLÈTE. Relance le script : il reprendra là où il s\'est arrêté.');
    process.exit(1);
  }
  console.log('\n✓ Sauvegarde complète.');
})().catch(e => mourir('Erreur inattendue : ' + (e && e.stack || e)));

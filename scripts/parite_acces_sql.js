#!/usr/bin/env node
/**
 * PARITÉ NAVIGATEUR ↔ BASE sur la décision d'accès par module.
 *
 * La règle d'accès existe en DEUX exemplaires — c'est structurel, on ne peut pas l'éviter :
 *   • navigateur : effectiveAccess()      dans access.js
 *   • base       : module_access_decide() en Postgres (migration v6.30)
 * Une divergence signifie soit un accès refusé à tort, soit un accès accordé à tort. Ce script est
 * la moitié « base » de la vérification : il envoie le MÊME jeu de cas que le harnais hors ligne
 * (tests/cas_acces.json) à la fonction RÉELLEMENT DÉPLOYÉE, via l'API RPC, et compare les verdicts.
 *
 * Pourquoi séparé de `node tests/run.js` : la suite est hors ligne par convention (aucune base,
 * aucun réseau). Un harnais qui se contenterait de « sauter » le test quand la base est injoignable
 * serait un trou silencieux — précisément ce que ce projet cherche à éviter. Donc script à part,
 * à lancer explicitement après toute modification de la règle d'accès (des deux côtés).
 *
 * Exécution (aucune clé secrète : la fonction est pure, elle ne lit aucune donnée) :
 *   node scripts/parite_acces_sql.js
 *   SUPA_URL=... SUPA_KEY=... node scripts/parite_acces_sql.js     # pour viser un autre projet
 *
 * Sort en code ≠ 0 dès qu'un seul cas diverge.
 */
const fs = require('fs');
const path = require('path');

const SUPA_URL = process.env.SUPA_URL || 'https://ynnqvtfayrdteqtgxeuk.supabase.co';
const SUPA_KEY = process.env.SUPA_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlubnF2dGZheXJkdGVxdGd4ZXVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4OTE1MTQsImV4cCI6MjA5NTQ2NzUxNH0._mfVAGexu7ew38UQk6adn42az4Gt_J3ePxR6O6wuWHc';

// Le VRAI access.js (il s'installe sur globalThis hors navigateur) — pas de réimplémentation.
require(path.join(__dirname, '..', 'access.js'));
const A = globalThis.EatimeAccess;

const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'cas_acces.json'), 'utf8')).cas;

async function decideEnBase(c) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/module_access_decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    body: JSON.stringify({ p_module: c.module, p_role: c.role, p_perms: c.perms, p_exception: c.exception }),
  });
  if (!r.ok) throw new Error(`RPC ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

(async () => {
  console.log(`Parité access.js ↔ module_access_decide() — ${CAS.length} cas · ${SUPA_URL}\n`);
  let divergences = 0, erreurs = 0;

  for (const c of CAS) {
    const profil = { role: c.role, module_exceptions: c.exception === null ? {} : { [c.module]: c.exception } };
    const js = A.canAccessModule(c.module, profil, c.perms);
    let sql;
    try { sql = await decideEnBase(c); }
    catch (e) { erreurs++; console.log(`  ERREUR · ${c.nom}\n           ${e.message}`); continue; }

    const accord = js === sql;
    const attendu = js === c.attendu && sql === c.attendu;
    if (!accord || !attendu) {
      divergences++;
      console.log(`  FAIL · ${c.nom}`);
      console.log(`         attendu=${c.attendu}  navigateur=${js}  base=${sql}` +
                  (accord ? '   (les deux d\'accord, mais faux)' : '   ← LES DEUX IMPLÉMENTATIONS DIVERGENT'));
    } else {
      console.log(`  ok   · ${c.nom}  (${js})`);
    }
  }

  const rate = divergences + erreurs;
  console.log(`\n${rate ? '✗' : '✓'} ${CAS.length - rate}/${CAS.length} cas identiques navigateur ↔ base` +
              (erreurs ? `  (${erreurs} erreur(s) réseau/RPC)` : ''));
  if (rate) { console.log('SOME FAILED'); process.exit(1); }
  console.log('ALL PASS');
})();

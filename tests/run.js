#!/usr/bin/env node
// Lanceur unique de la suite de non-régression du moteur de planning (+ salaries / edge functions).
//
//   node tests/run.js            → lance TOUS les harnais tests/*_test.js
//   node tests/run.js transfer   → lance uniquement les harnais dont le nom contient « transfer »
//
// Sort en code NON NUL si un seul harnais échoue. Un harnais est considéré en ÉCHEC si :
//   • son code de sortie est ≠ 0, OU
//   • sa sortie contient « SOME FAILED » / « FAIL » (ceinture + bretelles : un vieux harnais qui
//     imprimerait un échec sans faire process.exit(1) serait quand même compté rouge).
// Tous les chemins sont résolus par rapport à ce fichier (__dirname), jamais au répertoire courant.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const filter = process.argv[2] || '';
const files = fs.readdirSync(DIR)
  .filter(f => f.endsWith('_test.js'))
  .filter(f => !filter || f.includes(filter))
  .sort();

if (!files.length) { console.error('Aucun harnais ne correspond à « ' + filter + ' »'); process.exit(2); }

let passed = 0;
const failures = [];
const t0 = Date.now();

for (const f of files) {
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(DIR, f)], { cwd: DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    code = (e.status == null) ? 1 : e.status;                  // crash ou process.exit(≠0)
    out = (e.stdout || '') + (e.stderr || '');
  }
  const printedFail = /SOME FAILED|(^|\n)FAIL\b/.test(out);     // filet en cas d'exit 0 malgré un échec imprimé
  const okRun = (code === 0) && !printedFail;
  if (okRun) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + f); }
  else {
    failures.push(f);
    const reason = code !== 0 ? ('exit ' + code) : 'a imprimé un échec (exit 0)';
    console.log('  \x1b[31m✗\x1b[0m ' + f + '  (' + reason + ')');
    const tail = out.trim().split('\n').filter(l => /FAIL|Error|not defined|ENOENT|Cannot|throw/.test(l)).slice(-3);
    tail.forEach(l => console.log('      ' + l.trim()));
  }
}

const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log('\n' + (failures.length ? '\x1b[31m' : '\x1b[32m') +
  passed + '/' + files.length + ' harnais verts\x1b[0m  (' + dt + 's)');
if (failures.length) { console.log('Échecs : ' + failures.join(', ')); process.exit(1); }
process.exit(0);

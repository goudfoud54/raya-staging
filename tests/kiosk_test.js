// Marqueur de version des kiosques + mise à jour auto — logique PURE (utils.js), testée.
// kioskStatus : les 3 états doivent être DISTINCTS (muette ≠ ancienne, sinon l'écran ne sert pas de
// feu vert au lot 2). shouldAutoUpdate : c'est l'invariant de sécurité (jamais pendant un travail).
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'utils.js'), 'utf8');
const sandbox = {};
eval('var window=sandbox;' + src);
const { kioskStatus, shouldAutoUpdate } = sandbox.EatimeUtils;

let ok = true;
const t = (label, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' · ' + label); ok = cond && ok; };

const NOW = Date.parse('2026-07-29T12:00:00Z');
const ago = min => new Date(NOW - min * 60000).toISOString();
const MUTE = 15 * 60 * 1000;
const st = (row, current) => kioskStatus(row, current, NOW, MUTE).state;

// ── kioskStatus ──
t('vue à l\'instant + même version → à jour', st({ seen_at: ago(1), running_version: 'v11' }, 'v11') === 'a_jour');
t('vue récente + version dépassée → ancienne', st({ seen_at: ago(2), running_version: 'v10' }, 'v11') === 'ancienne');
t('muette (16 min) prime, MÊME si version dépassée', st({ seen_at: ago(16), running_version: 'v10' }, 'v11') === 'muette');
t('muette prime MÊME si à jour (plus de signe)', st({ seen_at: ago(30), running_version: 'v11' }, 'v11') === 'muette');
t('14 min < seuil → PAS muette (à jour)', st({ seen_at: ago(14), running_version: 'v11' }, 'v11') === 'a_jour');
t('16 min > seuil → muette', st({ seen_at: ago(16), running_version: 'v11' }, 'v11') === 'muette');
t('running_version absente → inconnue', st({ seen_at: ago(1), running_version: null }, 'v11') === 'inconnue');
t('version courante inconnue (fetch échoué) → inconnue', st({ seen_at: ago(1), running_version: 'v11' }, null) === 'inconnue');
t('seen_at absent → muette (âge infini)', st({ running_version: 'v11' }, 'v11') === 'muette');
t('âge exposé pour le libellé', kioskStatus({ seen_at: ago(20), running_version: 'v10' }, 'v11', NOW, MUTE).ageMs === 20 * 60000);

// ── shouldAutoUpdate (invariant de sécurité) ──
const base = { pending: true, isBusy: false, lastInteractionMs: NOW - 6 * 60000, lastAutoAt: null };
const su = (over) => shouldAutoUpdate(Object.assign({}, base, over), NOW, { idleMs: 5 * 60000, cooldownMs: 10 * 60000 });
t('inactif + pas occupé + màj en attente → true', su({}) === true);
t('pas de màj en attente → false', su({ pending: false }) === false);
t('OCCUPÉ prime sur inactif → false', su({ isBusy: true }) === false);
t('interaction récente (2 min) → false', su({ lastInteractionMs: NOW - 2 * 60000 }) === false);
t('interaction pile au seuil (5 min) → true', su({ lastInteractionMs: NOW - 5 * 60000 }) === true);
t('anti-boucle : dernier auto il y a 3 min → false', su({ lastAutoAt: NOW - 3 * 60000 }) === false);
t('anti-boucle expiré : dernier auto il y a 11 min → true', su({ lastAutoAt: NOW - 11 * 60000 }) === true);
t('occupé ET récent ET pas de màj → false (aucune condition)', su({ pending: false, isBusy: true, lastInteractionMs: NOW }) === false);

console.log(ok ? '\nALL PASSED' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);

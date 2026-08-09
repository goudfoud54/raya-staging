// Primitives de FICHIER du module planning (constantes, objets, petits helpers partagés) installées en
// global pour les harnais qui évaluent checkPlacement / autoFillCore.
//
// Pourquoi ce fichier : ces symboles vivent au niveau du fichier planning/index.html, pas à l'intérieur
// d'une fonction extraite. Un harnais qui n'évalue que `autoFillCore` ne les voit donc pas et casse sur
// « X is not defined ». Plutôt que de recopier les valeurs dans chaque harnais (elles dériveraient), on
// les EXTRAIT DU FICHIER RÉEL : changer un seuil ou un libellé met les harnais à jour tout seuls.
//
// N'y mettre QUE les dépendances d'autres fonctions extraites. Une fonction testée pour elle-même doit
// être extraite par le harnais qui la teste — sinon on ne saurait plus qui teste quoi.
//
// Usage, juste après la lecture du HTML :
//     require("./plprims.js").installPlanningPrims(h);
const fs = require('fs');
const path = require('path');
const { extractFn } = require('./extract.js');

// Fonctions appelées par d'autres fonctions extraites (checkPlacement, rowHoursCell, autoFillCore…).
const FNS = [
  '_finAbsM', '_restoNom', '_svcWindow', '_joinFr',
  '_dateFr', '_revalPhrase', '_withSnack',   // revalidation du planning existant
  'voirMotifAbsence',                 // droit de voir le motif d'une absence — appelée par explainViolation            // règles temporelles de checkPlacement
  '_hoursCellTip',                    // appelée par rowHoursCell
  '_jourDe', '_creTxt', '_absTxt',    // mise en forme des motifs de refus
  'explainViolation',                 // appelée par diagHole (motif « pourquoi » du rapport)
  'computeHoles', 'diagHole',         // sorties d'autoFillCore, partagées avec analyseWeek
  'costOfCreneaux',                   // coût, partagé par le pied de tableau et l'analyse
  '_virtualRegle', '_regleResolue', '_regleOf',  // résolution des réglages (exception resto > défaut org) — appelés par _ruleCtx
  'dayJourType', 'getShifts', 'posteEnvelope',   // bornes des POSTES : ce que l'auto-fill a le droit de produire
  '_endCapState', '_endCapMin', 'capCoverageGaps', // plafond d'heure de fin, un par jour-type (7 jours couverts)
  'horsPosteOf',                      // constat « créneau hors des postes » — appelé par revalidateWeek
];
// Objets `const X={…}` multi-lignes, extraits par équilibrage d'accolades.
const OBJS = ['RULE_META', 'RULE_SETTING_OF', 'RULE_SOURCE_OF'];
// Déclarations `const A=…, B=…;` d'une seule ligne, repérées par leur PREMIER identifiant.
// `_pmin` et `fmtH1` sont installés en GLOBAL parce que les primitives ci-dessus les résolvent à
// l'appel : plusieurs harnais gardent leur propre copie locale à leur module, invisible depuis ici.
// Leur copie locale continue de servir leur propre code — celle-ci ne sert qu'aux primitives.
const CONST_LINES = [
  { first: '_pmin', names: ['_pmin'] },
  { first: 'fmtH1', names: ['fmtH1'] },
  { first: '_fh', names: ['_fh'] },
  { first: '_hhmm', names: ['_hhmm'] },
  { first: 'F2H_SEUIL_DEF', names: ['F2H_SEUIL_DEF', 'F2H_MATIN_MIN'] },
  { first: 'PLAFOND_PROCHE_PCT', names: ['PLAFOND_PROCHE_PCT'] },
  { first: 'REVAL_SEMAINE', names: ['REVAL_SEMAINE'] },
  { first: '_creKey', names: ['_creKey'] },
  { first: 'JOURS', names: ['JOURS'] },
  { first: 'DEF_TIME', names: ['DEF_TIME'] },
  { first: 'PLACE_RULES', names: ['PLACE_RULES'] },
  // Modèle de plafond d'heure de fin par jour-type — les cinq tables doivent rester alignées.
  { first: 'JOUR_TYPES', names: ['JOUR_TYPES'] },
  { first: 'JOUR_TYPE_LABELS', names: ['JOUR_TYPE_LABELS'] },
  { first: 'FIN_CLE_OF_JT', names: ['FIN_CLE_OF_JT'] },
  { first: 'FIN_LEGACY_OF_JT', names: ['FIN_LEGACY_OF_JT'] },
  { first: 'JT_SAMPLE_DI', names: ['JT_SAMPLE_DI'] },
];

// Extrait `const <name>={…}` en équilibrant les accolades. Les COMMENTAIRES sont sautés AVANT les
// chaînes : ces objets sont largement commentés en français, et l'apostrophe de « qu'elles » ouvrirait
// une fausse chaîne qui désynchronise le comptage.
function grabObj(h, name) {
  const i = h.indexOf('const ' + name + '=');
  if (i < 0) throw new Error('objet introuvable : ' + name);
  let d = 0, j = h.indexOf('{', i);
  const st = j;
  for (; j < h.length; j++) {
    const c = h[j], n = h[j + 1];
    if (c === '/' && n === '/') { j = h.indexOf('\n', j); if (j < 0) j = h.length; continue; }
    if (c === '/' && n === '*') { j = h.indexOf('*/', j + 2) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { const q = c; j++; while (j < h.length && h[j] !== q) { if (h[j] === '\\') j++; j++; } continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) { j++; break; } }
  }
  return h.slice(st, j);
}

function installPlanningPrims(src) {
  const h = src || fs.readFileSync(path.join(__dirname, '..', 'planning/index.html'), 'utf8');
  for (const c of CONST_LINES) {
    const m = h.match(new RegExp('const ' + c.first + '\\s*=[^\\n]*'));
    if (!m) { console.log('MISS const', c.first); continue; }
    // eval DIRECT : les `var` atterrissent dans la portée de cette fonction, on les republie en global.
    eval(m[0].replace(/^const /, 'var ') + '\n' + c.names.map(n => 'global.' + n + '=' + n + ';').join(''));
  }
  for (const o of OBJS) {
    try { eval('global.' + o + '=' + grabObj(h, o) + ';'); }
    catch (e) { console.log('MISS obj', o, ('' + e).split('\n')[0]); }
  }
  for (const fn of FNS) {
    try { eval('global.' + fn + '=' + extractFn(h, fn) + ';'); }
    catch (e) { console.log('MISS prim', fn, ('' + e).split('\n')[0]); }
  }
}

module.exports = { installPlanningPrims, grabObj };

// Primitives de FICHIER du module planning (constantes + petits helpers partagés) installées en global
// pour les harnais qui évaluent checkPlacement / autoFillCore.
//
// Pourquoi ce fichier : ces symboles vivent au niveau du fichier planning/index.html, pas à l'intérieur
// d'une fonction extraite. Un harnais qui n'évalue que `checkPlacement` ne les voit donc pas et casse sur
// « X is not defined ». Plutôt que de recopier les valeurs dans chaque harnais (elles dériveraient), on
// les EXTRAIT DU FICHIER RÉEL : changer un seuil dans planning/index.html met les harnais à jour tout seuls.
//
// Usage, juste après la lecture du HTML :
//     require("./plprims.js").installPlanningPrims(h);
const fs = require('fs');
const path = require('path');
const { extractFn } = require('./extract.js');

// Fonctions de fichier appelées PAR d'autres fonctions extraites (donc invisibles d'un harnais qui
// n'extrait que l'appelante). N'y mettre que ces dépendances-là : une fonction testée pour elle-même
// doit être extraite par le harnais qui la teste, pas fournie ici.
const FNS = ['_finAbsM', '_restoNom', '_hoursCellTip'];
// Déclarations `const A=…, B=…;` d'une seule ligne, repérées par leur PREMIER identifiant.
// `_pmin` est installé en GLOBAL parce que _finAbsM (évalué ici) le résout à l'appel : plusieurs harnais
// gardent un _pmin local à leur module, invisible depuis ce fichier. Leur copie locale continue de servir
// leur propre code — celle-ci ne sert qu'aux primitives installées ci-dessous.
const CONST_LINES = [
  { first: '_pmin', names: ['_pmin'] },
  { first: 'fmtH1', names: ['fmtH1'] },
  { first: 'F2H_MAX_MIN', names: ['F2H_MAX_MIN', 'F2H_MATIN_MIN'] },
];

function installPlanningPrims(src) {
  const h = src || fs.readFileSync(path.join(__dirname, '..', 'planning/index.html'), 'utf8');
  for (const fn of FNS) {
    try { eval('global.' + fn + '=' + extractFn(h, fn) + ';'); }
    catch (e) { console.log('MISS prim', fn, ('' + e).split('\n')[0]); }
  }
  for (const c of CONST_LINES) {
    const m = h.match(new RegExp('const ' + c.first + '\\s*=[^\\n]*'));
    if (!m) { console.log('MISS const', c.first); continue; }
    // eval DIRECT : les `var` atterrissent dans la portée de cette fonction, on les republie en global.
    eval(m[0].replace(/^const /, 'var ') + '\n' + c.names.map(n => 'global.' + n + '=' + n + ';').join(''));
  }
}

module.exports = { installPlanningPrims };

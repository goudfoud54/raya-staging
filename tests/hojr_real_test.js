// Régression sur le CAS RÉEL « CONTRAT ADAM HOJR.pdf » (CERFA scanné).
// Valide la COUCHE GARDE-FOU sur les valeurs réelles du document :
//  1) si le modèle reproduit le bug exact rapporté → tous les champs faux vidés, nom gardé ;
//  2) si le modèle extrait correctement Adam → aucun champ légitime abîmé.
// (L'extraction OCR/vision elle-même nécessite une session admin live — non couverte ici.)
const fs = require('fs');
const SRC = fs.readFileSync(require("path").join(__dirname,"..","supabase/functions/import-contrat-ai/index.ts"), 'utf8');
let region = SRC.slice(SRC.indexOf('function _norm('), SRC.indexOf('// ── Extraction'));
[
  ['function _norm(v: any): string {', 'function _norm(v) {'],
  ['function _looksLikeLabel(field: string, value: string): string | null {', 'function _looksLikeLabel(field, value) {'],
  ['function _isValidDate(s: string): Date | null {', 'function _isValidDate(s) {'],
  ['export function sanitize(raw: any, opts: any = {}) {', 'function sanitize(raw, opts = {}) {'],
  ['const rejected: { field: string; value: any; reason: string }[] = [];', 'const rejected = [];'],
  ['const drop = (field: string, reason: string) => {', 'const drop = (field, reason) => {'],
  ['const eqEmp = (a: any, b: any) => a && b && _norm(a) === _norm(b);', 'const eqEmp = (a, b) => a && b && _norm(a) === _norm(b);'],
  ['const digits = (v: any) => String(v ?? \'\').replace(/\\D/g, \'\');', 'const digits = (v) => String(v ?? \'\').replace(/\\D/g, \'\');'],
  ['function _startOfDay(d: Date) { return', 'function _startOfDay(d) { return'],
].forEach(([a, b]) => { region = region.split(a).join(b); });
const sanitize = new Function(region + '\nreturn sanitize;')();

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.error('  ✗ ' + m)); };

// Bloc employeur réel (contaminant), présent dans les deux scénarios.
const EMP = {
  employeur_nom: 'SAS GOUD FOUD', employeur_email: 'goudfoud54@gmail.com',
  employeur_telephone: '0357299331', employeur_adresse: '108 RUE CHARLES III',
  employeur_ville: 'NANCY', employeur_code_postal: '54000',
};

// ── 1) Le bug EXACT rapporté (libellés + date du jour + coordonnées employeur) ──
const BUG = sanitize({
  nom: 'HOJR', prenom: 'Date De Naissance', date_naissance: '2026-07-23',
  adresse: "de l'établissement d'exécution du contrat : Type d'employeur : 16 E",
  ville: 'Effectif total salariés de',
  email: 'goudfoud54@gmail.com', telephone: '0357299331',
  ...EMP, confidence: 0.9,
}, { today: '2026-07-25' });
console.log('1) bug réel →', JSON.stringify(BUG.data));
ok(BUG.data.nom === 'HOJR', '1: Nom=HOJR conservé');
ok(BUG.data.prenom === '', '1: Prénom "Date De Naissance" vidé');
ok(BUG.data.date_naissance === '', '1: date du jour vidée (jamais 2026-07-23)');
ok(BUG.data.adresse === '', '1: adresse-libellé vidée (jamais un intitulé de case)');
ok(BUG.data.ville === '', '1: ville "Effectif total salariés de" vidée');
ok(BUG.data.email === '', '1: email employeur (goudfoud54) vidé');
ok(BUG.data.telephone === '', '1: téléphone employeur vidé');
ok(!('employeur_email' in BUG.data), '1: bloc employeur retiré de la sortie');

// ── 2) L'extraction CORRECTE d'Adam (ce que le nouveau pipeline doit produire) ──
const good = {
  nom: 'HOJR', prenom: 'Adam', date_naissance: '2008-08-31', sexe: 'M',
  nationalite: 'Française', num_secu: '1089835015232',
  adresse: '57 ALLEE DES DAMLIAS', code_postal: '54200', ville: 'DOMMARTIN LES TOUL',
  email: 'hojradam@gmail.com', telephone: '0745706503', type_contrat: 'alternant',
};
const GOOD = sanitize({ ...good, ...EMP, confidence: 0.9 }, { today: '2026-07-25' });
console.log('2) correct →', JSON.stringify(GOOD.data), '| rejected:', JSON.stringify(GOOD.rejected));
ok(GOOD.rejected.length === 0, '2: aucun rejet sur l\'extraction correcte d\'Adam (a ' + GOOD.rejected.length + ')');
for (const k of Object.keys(good)) ok(GOOD.data[k] === good[k], '2: ' + k + ' préservé (=' + JSON.stringify(GOOD.data[k]) + ')');

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAIL'} — ${pass} OK, ${fail} KO`);
process.exit(fail ? 1 : 0);

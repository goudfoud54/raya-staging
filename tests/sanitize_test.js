// Test du garde-fou sanitize() de import-contrat-ai — extraction depuis la source réelle.
const fs = require('fs');
const SRC = fs.readFileSync(require("path").join(__dirname,"..","supabase/functions/import-contrat-ai/index.ts"), 'utf8');

// Région pure : de `function _norm` jusqu'au marqueur `// ── Extraction`.
const start = SRC.indexOf('function _norm(');
const end = SRC.indexOf('// ── Extraction');
if (start < 0 || end < 0) { console.error('Marqueurs introuvables'); process.exit(1); }
let region = SRC.slice(start, end);

// Retrait des annotations TS (remplacements exacts, uniques).
const subs = [
  ['function _norm(v: any): string {', 'function _norm(v) {'],
  ['const FORM_LABELS = new Set([', 'const FORM_LABELS = new Set(['], // no-op anchor
  ['function _looksLikeLabel(field: string, value: string): string | null {', 'function _looksLikeLabel(field, value) {'],
  ['function _isValidDate(s: string): Date | null {', 'function _isValidDate(s) {'],
  ['export function sanitize(raw: any, opts: any = {}) {', 'function sanitize(raw, opts = {}) {'],
  ['const rejected: { field: string; value: any; reason: string }[] = [];', 'const rejected = [];'],
  ['const drop = (field: string, reason: string) => {', 'const drop = (field, reason) => {'],
  ['const eqEmp = (a: any, b: any) => a && b && _norm(a) === _norm(b);', 'const eqEmp = (a, b) => a && b && _norm(a) === _norm(b);'],
  ['const digits = (v: any) => String(v ?? \'\').replace(/\\D/g, \'\');', 'const digits = (v) => String(v ?? \'\').replace(/\\D/g, \'\');'],
  ['function _startOfDay(d: Date) { return', 'function _startOfDay(d) { return'],
];
for (const [a, b] of subs) { if (!region.includes(a)) { console.error('Substr manquant:', a); process.exit(1); } region = region.split(a).join(b); }

const sanitize = new Function(region + '\nreturn sanitize;')();

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } }

// ── A) Cas contaminé (type CONTRAT ADAM HOJR) ──────────────────────────────
const A = sanitize({
  nom: 'HOJR', prenom: 'Date De Naissance',
  date_naissance: '2026-07-23',
  adresse: "de l'établissement d'exécution du contrat : Type d'employeur : 16 E",
  ville: 'Effectif total salariés de',
  code_postal: '16 E',
  email: 'goudfoud54@gmail.com', employeur_email: 'GOUDFOUD54@gmail.com',
  telephone: '0612345678', employeur_telephone: '06 12 34 56 78',
  nationalite: 'Nationalité',
  confidence: 0.9,
}, { today: '2026-07-25' });
console.log('A) contaminé →', JSON.stringify(A.data), '\n   rejected:', A.rejected.map(r => r.field).join(','));
ok(A.data.nom === 'HOJR', 'A: nom HOJR préservé (jamais vidé)');
ok(A.data.prenom === '', 'A: prenom "Date De Naissance" vidé');
ok(A.data.date_naissance === '', 'A: date_naissance absurde vidée');
ok(A.data.adresse === '', 'A: adresse libellé vidée');
ok(A.data.ville === '', 'A: ville "Effectif total salariés de" vidée');
ok(A.data.code_postal === '', 'A: code_postal "16 E" vidé');
ok(A.data.email === '', 'A: email employeur vidé');
ok(A.data.telephone === '', 'A: telephone employeur vidé');
ok(A.data.nationalite === '', 'A: nationalite="Nationalité" (libellé) vidée');
ok(!('employeur_email' in A.data), 'A: champs employeur_* retirés de la sortie');
ok(A.rejected.length >= 7, 'A: >=7 champs listés dans rejected (a ' + A.rejected.length + ')');

// ── B) Cas propre (CDI/CDD réel) — RIEN ne doit être touché ────────────────
const cleanIn = {
  nom: 'MARTIN', prenom: 'Sophie',
  date_naissance: '1990-05-14',
  adresse: '12 rue de la Paix',
  code_postal: '75002', ville: 'Paris',
  email: 'sophie.martin@gmail.com', employeur_email: 'rh@entreprise.fr',
  telephone: '0612345678', employeur_telephone: '0140000000',
  nationalite: 'Française',
  type_contrat: 'CDI', poste_intitule: 'Serveur',
  date_entree: '2024-09-01',
  confidence: 0.95,
};
const B = sanitize(JSON.parse(JSON.stringify(cleanIn)), { today: '2026-07-25' });
console.log('B) propre →', JSON.stringify(B.data), '\n   rejected:', JSON.stringify(B.rejected));
ok(B.rejected.length === 0, 'B: aucun rejet sur un contrat propre (a ' + B.rejected.length + ')');
for (const k of ['nom', 'prenom', 'date_naissance', 'adresse', 'code_postal', 'ville', 'email', 'telephone', 'nationalite', 'type_contrat', 'poste_intitule', 'date_entree']) {
  ok(B.data[k] === cleanIn[k], 'B: ' + k + ' préservé (=' + JSON.stringify(B.data[k]) + ')');
}

// ── C) Cohérence des dates ─────────────────────────────────────────────────
const C = sanitize({ nom: 'X', date_naissance: '2000-01-01', date_entree: '1995-01-01', confidence: 0.8 }, { today: '2026-07-25' });
ok(C.data.date_entree === '' && C.data.date_naissance === '2000-01-01', 'C: date_entree antérieure à la naissance vidée, naissance conservée');

// ── D) Ville avec chiffre + CP invalide ────────────────────────────────────
const D = sanitize({ nom: 'X', ville: 'Paris 16', code_postal: '750', confidence: 0.8 });
ok(D.data.ville === '' && D.data.code_postal === '', 'D: ville-avec-chiffre et CP≠5 vidés');

// ── E) Adresse légitime avec « de » interne NON vidée ──────────────────────
const E = sanitize({ nom: 'X', adresse: "5 avenue de l'Opéra", ville: 'Saint-Étienne', confidence: 0.8 });
ok(E.data.adresse === "5 avenue de l'Opéra" && E.data.ville === 'Saint-Étienne', 'E: adresse/ville légitimes préservées');

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAIL'} — ${pass} assertions OK, ${fail} KO`);
process.exit(fail ? 1 : 0);

// Bons de livraison — fonctions PURES RÉELLES extraites de facturation/index.html.
// Couvre les cas nommés au chantier : bon multi-TVA · bon facturé non modifiable · cohérence
// booléen↔rattachement réel · totaux recalculés après modification d'une quantité.
const fs = require('fs'), path = require('path');
const h = fs.readFileSync(path.join(__dirname, '..', 'facturation/index.html'), 'utf8');
const from = h.indexOf('// ═══ BL — fonctions PURES');
const to = h.indexOf('// ═══ FIN BL pures');
if (from < 0 || to < 0) throw new Error('bloc de fonctions pures BL introuvable');
eval(h.slice(from, to) + ';Object.assign(global,{blLineTotals,blTotals,blFactureIndex,blEditable,validateBLLignes});');

let ok = true;
const t = (l, c) => { console.log((c ? 'PASS' : 'FAIL') + ' · ' + l); ok = c && ok; };

// ── blLineTotals : recalcul depuis qte × prix, JAMAIS la valeur stockée ──
let r = blLineTotals({ qte: 40, a: 4.2938, r: 6.4406 });
t('tA = qte×a arrondi 2déc (171,75)', r.tA === 171.75);
t('tR = qte×r arrondi 2déc (257,62)', r.tR === 257.62);
t('marge ligne = tR − tA', r.marge === +(257.62 - 171.75).toFixed(2));
// « totaux recalculés après modification d'une quantité » : une valeur tA/tR stockée périmée est IGNORÉE.
r = blLineTotals({ qte: 10, a: 2, r: 3, tA: 999, tR: 999, marge: 999 });
t('valeurs tA/tR stockées ignorées → recalcul (tA=20, tR=30)', r.tA === 20 && r.tR === 30 && r.marge === 10);
t('marge négative si revente < achat', blLineTotals({ qte: 1, a: 5, r: 3 }).marge === -2);

// ── blTotals : sommes + marge + % ──
const L = [{ nom: 'Sauce', qte: 2, a: 10, r: 15, tva: 5.5 }, { nom: 'Carton', qte: 1, a: 4, r: 5, tva: 20 }]; // multi-TVA
let T = blTotals(L);
t('total_achat = Σ tA (24)', T.total_achat === 24);
t('total_revente = Σ tR (35)', T.total_revente === 35);
t('marge bon = revente − achat (11)', T.marge === 11);
t('marge_pct = marge/revente (31,4%)', T.marge_pct === +(11 / 35 * 100).toFixed(1));
t('blTotals liste vide → 0', blTotals([]).total_revente === 0 && blTotals([]).marge_pct === 0);

// ── validateBLLignes : TVA obligatoire par ligne (le manque d'avant le 28/03) ──
t('bon multi-TVA valide (5,5 et 20) → aucune erreur', validateBLLignes(L).length === 0);
t('ligne sans TVA → erreur', validateBLLignes([{ nom: 'X', qte: 1, a: 1, r: 2 }]).some(e => /TVA/.test(e)));
t('ligne LEGACY (tva absente) refusée à l\'enregistrement', validateBLLignes([{ nom: 'Sauce', qte: 40, a: 4.29, r: 6.44 }]).length > 0);
t('désignation manquante → erreur', validateBLLignes([{ nom: '', qte: 1, a: 1, r: 2, tva: 5.5 }]).some(e => /désignation/.test(e)));
t('quantité 0 → erreur', validateBLLignes([{ nom: 'X', qte: 0, a: 1, r: 2, tva: 5.5 }]).some(e => /quantité/.test(e)));
t('tva = 0 (exonéré) est un choix VALIDE, pas un manque', validateBLLignes([{ nom: 'X', qte: 1, a: 1, r: 2, tva: 0 }]).length === 0);
t('liste vide → erreur', validateBLLignes([]).length > 0);

// ── blFactureIndex / blEditable : bl_ids = source unique, facture annulée exclue ──
const FACTS = [
  { id: 'f1', numero: '2026-001', statut: 'emise', bl_ids: ['bA', 'bB'] },
  { id: 'f2', numero: '2026-002', statut: 'annulee', bl_ids: ['bC'] },   // annulée → ne facture PAS bC
  { id: 'f3', numero: '2026-003', statut: 'paye', bl_ids: ['bB'] },       // bB déjà dans f1 → premier gagne
];
const idx = blFactureIndex(FACTS);
t('bB facturé → non modifiable', blEditable('bB', idx) === false);
t('bB rattaché à la 1re facture (f1/2026-001)', idx.get('bB').numero === '2026-001');
t('bC (facture ANNULÉE) → redevient modifiable', blEditable('bC', idx) === true);
t('bZ (aucune facture) → modifiable', blEditable('bZ', idx) === true);

// « cohérence entre le booléen et le rattachement réel » : le détecteur de dérive.
// Données cohérentes : chaque bon dont facture=true est bien dans un bl_ids (et inversement).
const BLS = [
  { id: 'bA', facture: true }, { id: 'bB', facture: true }, { id: 'bZ', facture: false },
];
const derive = b => idx.has(b.id);
t('drift-detector : booléen == rattachement dérivé (données cohérentes)', BLS.every(b => !!b.facture === derive(b)));
// Données DÉRIVÉES : un bon marqué facture=true mais absent de tout bl_ids → le détecteur le VOIT.
t('drift-detector repère une incohérence (facture=true sans rattachement)', (() => { const bad = { id: 'bZ', facture: true }; return (!!bad.facture) !== derive(bad); })());

console.log(ok ? '\nALL PASSED' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);

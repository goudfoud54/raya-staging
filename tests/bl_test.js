// Bons de livraison — fonctions PURES RÉELLES extraites de facturation/index.html.
// Couvre les cas nommés au chantier : bon multi-TVA · bon facturé non modifiable · cohérence
// booléen↔rattachement réel · totaux recalculés après modification d'une quantité.
const fs = require('fs'), path = require('path');
const h = fs.readFileSync(path.join(__dirname, '..', 'facturation/index.html'), 'utf8');
const from = h.indexOf('// ═══ BL — fonctions PURES');
const to = h.indexOf('// ═══ FIN BL pures');
if (from < 0 || to < 0) throw new Error('bloc de fonctions pures BL introuvable');
// `eur` et `_cleProduit` vivent HORS du bloc BL (respectivement en tête de page et avec la mercuriale)
// mais les fonctions pures BL les appellent depuis v0.10 : sans eux, l'eval du bloc casse sur
// « eur is not defined ». On les extrait à part plutôt que de les recopier — une seconde
// normalisation ou un second format monétaire dériveraient du jour au lendemain.
eval(h.match(/^function eur\(n\)\{[^\n]*$/m)[0]);
eval(h.match(/^function _cleProduit\(nom\)\{[^\n]*$/m)[0]);
Object.assign(global, { eur, _cleProduit });
eval(h.slice(from, to) + ';Object.assign(global,{blLineTotals,blTotals,blFactureIndex,blEditable,validateBLLignes,blSourcePrix,blSourceLabel,blLignesSuspectes,blBonSuspect,blSuspicionTexte});');

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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// v0.10 — LE BON DE LIVRAISON LIT ENFIN LE CATALOGUE, ET REFUSE DE SE TAIRE SUR UNE LIGNE INVERSÉE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Le patron a saisi trois formations à 525 € et obtenu une facture à 0 € avec −1 575 € de marge.
// Le catalogue était JUSTE (achat 0 / revente 525) ; le pré-remplissage ne lisait que les bons passés,
// et ces formations étaient nouvelles. Le formulaire proposait le produit dans sa liste, puis se taisait.
// Les valeurs ci-dessous sont la COPIE EXACTE de la base (org « Groupe Raya », lue le 2026-09-10).
console.log('\n── PRÉ-REMPLISSAGE : dernière livraison du client, puis catalogue ──');
const CATALOGUE = [
  { nom: "21 H FORMATION - Développer l'activité commerciale par les réseaux sociaux  - NEHME AHMAD", prix_achat: 0, prix_revente: 525, tva: 20 },
  { nom: 'Frais de gestion de stagiaire de la formation professionnelle', prix_achat: 0, prix_revente: 1500, tva: 5.5 },
  { nom: 'Sauce Soja', prix_achat: 4.2938, prix_revente: 6.4406, tva: 5.5 },
];
const FORMATION = CATALOGUE[0].nom;

// ── LE CAS RÉEL : produit du catalogue JAMAIS livré → les trois valeurs sont proposées ──
{
  const s = blSourcePrix(FORMATION, {}, CATALOGUE);
  t('CAS RÉEL — une formation jamais livrée reprend le catalogue (achat 0 / revente 525 / TVA 20)',
    !!s && s.a === 0 && s.r === 525 && String(s.tva) === '20' && s.source === 'catalogue');
  t('… et l\'étiquette dit d\'où vient le prix', blSourceLabel(s) === 'repris du catalogue');
}
// ── La dernière livraison du client PRIME sur le catalogue (prix réellement pratiqué avec lui) ──
{
  const prefill = { [_cleProduit('Sauce Soja')]: { a: 4.10, r: 6.20, tva: '5.5', date: '2026-07-12' } };
  const s = blSourcePrix('Sauce Soja', prefill, CATALOGUE);
  t('un produit déjà livré à ce client garde le prix de la dernière livraison, pas celui du catalogue',
    !!s && s.r === 6.20 && s.a === 4.10 && s.source === 'livraison');
  t('… et l\'étiquette donne la date', blSourceLabel(s) === 'repris de la dernière livraison du 12/07');
}
// ── Rapprochement par _cleProduit : les désignations réelles portent des doubles espaces ──
{
  const s = blSourcePrix("21 H FORMATION - Développer l'activité commerciale par les réseaux sociaux - NEHME AHMAD", {}, CATALOGUE);
  t('le rapprochement tolère un espace double (comme en base), là où une égalité stricte échouerait', !!s && s.r === 525);
  t('casse et espaces de bord tolérés aussi', !!blSourcePrix('  sauce soja ', {}, CATALOGUE));
  t('désignation inconnue → aucune proposition', blSourcePrix('Produit qui n\'existe pas', {}, CATALOGUE) === null);
  t('désignation vide → aucune proposition (pas de plantage)', blSourcePrix('', {}, CATALOGUE) === null && blSourcePrix(null, {}, CATALOGUE) === null);
}
// ── UNE SOURCE INEXPLOITABLE EST ÉCARTÉE EN ENTIER (cas DYMA ACADEMY, 10/09, achat 1500 / revente 0) ──
// Sans ce filtre, la ligne inversée déjà en base se re-proposerait à l'identique d'un bon à l'autre.
{
  const nom = 'Frais de gestion de stagiaire de la formation professionnelle';
  const prefill = { [_cleProduit(nom)]: { a: 1500, r: 0, tva: '0', date: '2026-09-10' } };
  const s = blSourcePrix(nom, prefill, CATALOGUE);
  t('CAS DYMA — une dernière livraison sans prix de revente est écartée au profit du catalogue',
    !!s && s.source === 'catalogue' && s.r === 1500);
  t('… et l\'achat aberrant de 1 500 € ne fuit PAS : les deux champs viennent du catalogue (a=0)', s.a === 0);
  t('… le taux vient du catalogue lui aussi (pas le 0 de la ligne inversée)', String(s.tva) === '5.5');
}
// ── Priorité 1 : une valeur saisie à la main n'est jamais écrasée ──
// (Le choix champ par champ appartient à l'appelant ; on vérifie ici la règle telle qu'updateBLLigne
// l'applique — reproduite à l'identique, et verrouillée par un garde-fou structurel plus bas.)
{
  const s = blSourcePrix(FORMATION, {}, CATALOGUE);
  const ligne = { nom: FORMATION, qte: 1, a: 0, r: 490, tva: '' };   // le patron a déjà tapé sa revente
  if (!Number(ligne.a)) ligne.a = s.a;
  if (!Number(ligne.r)) ligne.r = s.r;
  if (ligne.tva === '' || ligne.tva == null) ligne.tva = s.tva;
  t('une revente saisie à la main (490) n\'est PAS écrasée par le catalogue (525)', ligne.r === 490);
  t('… mais les champs laissés vides sont bien complétés (TVA 20)', String(ligne.tva) === '20');
}

console.log('\n── LIGNE MANIFESTEMENT INVERSÉE : on demande, on ne bloque pas ──');
// ── LE CAS RÉEL : 3 × (achat 525 / revente 0) → facture 0 €, marge −1 575 € ──
{
  const inverse = [
    { nom: FORMATION, qte: 1, a: 525, r: 0, tva: 20 },
    { nom: 'Formation 2', qte: 1, a: 525, r: 0, tva: 20 },
    { nom: 'Formation 3', qte: 1, a: 525, r: 0, tva: 20 },
  ];
  const susp = blLignesSuspectes(inverse), bon = blBonSuspect(inverse);
  t('CAS RÉEL — les trois lignes à 525/0 sont signalées', susp.length === 3 && susp.every(s => s.type === 'inversion'));
  t('… et le BON entier l\'est aussi (revente nulle, achat 1 575 €)', !!bon && bon.total_achat === 1575 && bon.total_revente === 0);
  const txt = blSuspicionTexte(susp, bon);
  t('… le message NOMME le soupçon d\'inversion', /les deux colonnes sont-elles inversées/.test(txt));
  t('… il cite les deux montants de la ligne', /se vend 0,00 €/.test(txt) && /coûte 525,00 €/.test(txt));
  t('… il rappelle le total du bon', /ce bon se vend 0,00 € alors qu'il coûte 1 575,00 €/.test(txt.replace(/ | /g, ' ')));
  t('… et il demande, il n\'interdit pas', /Enregistrer quand même \?$/.test(txt));
}
// ── Vente à perte NON nulle : signalée, mais sans accusation d'inversion ──
{
  const perte = [{ nom: 'Geste commercial', qte: 1, a: 100, r: 80, tva: 20 }];
  const susp = blLignesSuspectes(perte);
  t('une ligne à marge négative déclenche la confirmation', susp.length === 1 && susp[0].type === 'perte');
  t('… mais le message n\'accuse PAS une inversion', !/inversées/.test(blSuspicionTexte(susp, null)));
  t('… et le bon n\'est pas signalé au total (la revente n\'est pas nulle)', blBonSuspect(perte) === null);
}
// ── Ce qui ne doit RIEN déclencher ──
{
  t('un bon normal ne déclenche aucune confirmation',
    blSuspicionTexte(blLignesSuspectes(L), blBonSuspect(L)) === '');
  t('une prestation à achat 0 et revente 525 est NORMALE (cas des formations bien saisies)',
    blLignesSuspectes([{ nom: FORMATION, qte: 1, a: 0, r: 525, tva: 20 }]).length === 0);
  t('une ligne entièrement à zéro n\'accuse rien (rien n\'est encore saisi)',
    blLignesSuspectes([{ nom: 'X', qte: 1, a: 0, r: 0, tva: 20 }]).length === 0);
  t('marge nulle (revente = achat) ne déclenche rien', blLignesSuspectes([{ nom: 'X', qte: 1, a: 50, r: 50, tva: 20 }]).length === 0);
  t('liste vide → aucun soupçon, aucun plantage', blLignesSuspectes([]).length === 0 && blBonSuspect([]) === null);
}

console.log('\n── GARDE-FOUS STRUCTURELS : l\'écran lit bien ces fonctions ──');
// Le vrai risque du motif « une fonction jamais appelée » : ces contrôles sont purs et testés, mais
// inutiles si le formulaire ne les appelle pas. On verrouille le câblage.
t('updateBLLigne passe par blSourcePrix (catalogue inclus)', /const pf=blSourcePrix\(v, BL_PREFILL, S\.produits\)/.test(h));
t('… et n\'écrase que les champs vides (priorité à la saisie manuelle)',
  /if\(!Number\(BL_LIGNES\[i\]\.a\)\)[\s\S]{0,60}if\(!Number\(BL_LIGNES\[i\]\.r\)\)/.test(h));
t('saveBL demande confirmation avant d\'enregistrer un bon suspect',
  /blLignesSuspectes\(BL_LIGNES\)[\s\S]{0,200}if\(txt && !confirm\(txt\)\) return;/.test(h));
t('la confirmation est bien un confirm() et non un blocage (return sans enregistrement)',
  !/blLignesSuspectes[\s\S]{0,200}toast\('Refus/.test(h));
t('l\'origine du prix est affichée dans la ligne', /l\._src\?`<div[^`]*↩ \$\{String\(l\._src\)/.test(h));
t('`_src` n\'est jamais enregistré en base (saveBL reconstruit la ligne champ par champ)',
  /const lignes=BL_LIGNES\.map\(l=>\{const t=blLineTotals\(l\);return \{nom:[^}]*\};\}\);/.test(h) &&
  !/_src[^\n]*payload|payload[^\n]*_src/.test(h));
t('le catalogue alimente la liste de saisie ET le pré-remplissage (plus seulement la liste)',
  /Object\.keys\(BL_PREFILL\)[\s\S]{0,80}S\.produits\.map\(p=>p\.nom\)/.test(h) && /S\.produits/.test(h));

console.log(ok ? '\nALL PASSED' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);

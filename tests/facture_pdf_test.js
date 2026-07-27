// Refonte PDF facture — fonctions PURES RÉELLES extraites de facturation/index.html
// (formatage €, contraste/couleur de texte, modèle groupé par livraison + ventilation TVA par taux).
// Le rendu jsPDF lui-même (mise en page, pagination, logo) n'est PAS testable ici : relu, non exécuté.
const fs=require('fs');
const h=fs.readFileSync(require('path').join(__dirname,'..','facturation/index.html'),'utf8');
// Slice contigu : de `const _MOIS=` jusqu'à la fin de factureModel (avant le rendu jsPDF).
const from=h.indexOf('const _MOIS=');
const to=h.indexOf('// ─────── PDF (rendu jsPDF');
if(from<0||to<0) throw new Error('bloc de fonctions pures introuvable');
eval(h.slice(from,to)+';Object.assign(global,{_dateLong,_hexToRgb,_relLum,_contrast,_textColorFor,_fmtTva,_eurPdf,_colorContrastIssue,factureModel,encaisseFacture,statutFacture});');

let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};

// ── Formatage € : PAS d'espace fine insécable (bug « 7/845,13 € ») ──
t('milliers avec espace SIMPLE (0x20), pas U+202F/U+00A0', _eurPdf(7845.13)==='7 845,13 €' && !/[  ]/.test(_eurPdf(7845.13)));
t('grand nombre : 1 234 567,89 €', _eurPdf(1234567.89)==='1 234 567,89 €' && !/[  ]/.test(_eurPdf(1234567.89)));
t('petit nombre : 41,78 €', _eurPdf(41.78)==='41,78 €');
t('null/NaN → 0,00 €', _eurPdf(null)==='0,00 €' && _eurPdf(NaN)==='0,00 €');
t('date longue tz-safe : 2026-06-04 → « 4 juin 2026 »', _dateLong('2026-06-04')==='4 juin 2026');

// ── Contraste : couleur de texte auto selon la luminosité (deux directions) ──
t('texte sur blanc → noir', JSON.stringify(_textColorFor([255,255,255]))==='[17,17,17]');
t('texte sur noir → blanc', JSON.stringify(_textColorFor([255,255,255]).length&&_textColorFor([0,0,0]))==='[255,255,255]');
t('texte sur gris foncé bandeau #3a3a40 → blanc', JSON.stringify(_textColorFor(_hexToRgb('#3a3a40')))==='[255,255,255]');
t('texte sur orange accent #e8622a → blanc', JSON.stringify(_textColorFor(_hexToRgb('#e8622a')))==='[255,255,255]');
t('hex invalide → null', _hexToRgb('nope')===null);
t('hex court #fff → [255,255,255]', JSON.stringify(_hexToRgb('#fff'))==='[255,255,255]');
// Alerte de contraste : couleur trop claire (fond blanc), couleur invalide, couleurs correctes
t('#f2f2f2 (très clair) → alerte « trop claire »', /trop claire/.test(_colorContrastIssue('#f2f2f2')||''));
t('#ffffff (blanc) → alerte', !!_colorContrastIssue('#ffffff'));
t('orange #e8622a → pas d\'alerte (lisible)', _colorContrastIssue('#e8622a')===null);
t('gris foncé #3a3a40 → pas d\'alerte', _colorContrastIssue('#3a3a40')===null);
t('couleur invalide → message d\'erreur', _colorContrastIssue('zzz')==='Couleur invalide');
t('_fmtTva : 5.5 → « 5,5 % » · 20 → « 20 % »', _fmtTva(5.5)==='5,5 %' && _fmtTva(20)==='20 %');

// ── Modèle : groupement par bon de livraison + ventilation TVA par taux (le cœur métier) ──
const produits=[{nom:'A',tva:20},{nom:'B',tva:5.5}]; // C absent du catalogue → taux par défaut
const bls=[
  {id:'y',date_livraison:'2026-06-01',lignes:[{nom:'C',qte:1,r:50,tR:50}]},
  {id:'x',date_livraison:'2026-06-04',lignes:[{nom:'A',qte:2,r:10,tR:20},{nom:'B',qte:1,r:100,tR:100}]},
];
const facture={bl_ids:['x','y'],total_ht:170,total_ttc:182.25}; // TVA stockée 12,25 = calc → se reconcilie
const m=factureModel(facture,bls,produits,{tva_defaut:5.5});
t('2 groupes (un par livraison)', m.groups.length===2);
t('groupes ordonnés par date : 1 juin avant 4 juin', /1 juin/.test(m.groups[0].titre) && /4 juin/.test(m.groups[1].titre));
t('TVA par ligne via catalogue : A=20, B=5,5', m.groups[1].lignes[0].tva===20 && m.groups[1].lignes[1].tva===5.5);
t('produit absent du catalogue → taux par défaut 5,5', m.groups[0].lignes[0].tva===5.5);
// Priorité : taux STOCKÉ sur la ligne (ce qui a été facturé) > catalogue
const m3=factureModel({bl_ids:['z']},[{id:'z',date_livraison:'2026-06-01',lignes:[{nom:'A',qte:1,r:10,tR:10,tva:5.5}]}],[{nom:'A',tva:20}],{});
t('taux stocké sur la ligne (5,5) prioritaire sur le catalogue (20)', m3.groups[0].lignes[0].tva===5.5);
t('ventilation 20% : base 20, TVA 4,00', m.tvaByRate['20'].base===20 && m.tvaByRate['20'].montant===4);
t('ventilation 5,5% : base 150 (100+50), TVA 8,25', m.tvaByRate['5.5'].base===150 && m.tvaByRate['5.5'].montant===8.25);
t('multi-taux : 2 taux distincts', Object.keys(m.tvaByRate).length===2);
t('total ligne TTC via tR : A 2×10 → 20 HT → 24 TTC', m.groups[1].lignes[0].totalTTC===24);
t('tR fait foi pour le total ligne HT', m.groups[1].lignes[0].totalHT===20);
t('Total HT affiché = valeur STOCKÉE (170), pas le calcul', m.totalHT===170);
t('calcHT exposé pour contrôle (=170 ici)', m.calcHT===170);
// Garde-fou : la ventilation par taux ne s'affiche que si elle se reconcilie avec la TVA stockée.
t('ventilation cohérente avec la TVA stockée → tvaReconciles=true', m.tvaReconciles===true);
const mBad=factureModel({bl_ids:['x'],total_ht:170,total_ttc:175},bls,produits,{}); // TVA stockée 5 ≠ calc 12,25
t('ventilation incohérente (catalogue qui a dérivé) → tvaReconciles=false → TVA globale au rendu', mBad.tvaReconciles===false);
t('cas incohérent : tvaStockee exposée pour l\'affichage global', mBad.tvaStockee===5);

// ── Repli : facture saisie à la main (pas de bl_ids) → lignes de factures_lignes ──
const f2={bl_ids:null,_lignes:[{designation:'X',quantite:3,prix_unitaire_ht:10,tva_pct:20,total_ht:30}]};
const m2=factureModel(f2,[],[],{});
t('repli factures_lignes : 1 groupe sans titre', m2.groups.length===1 && m2.groups[0].titre===null);
t('repli : TVA de la ligne = tva_pct (20)', m2.groups[0].lignes[0].tva===20);
t('repli : Total TTC = 36 (30 + 20%)', m2.groups[0].lignes[0].totalTTC===36);
t('repli : totaux calculés en l\'absence de valeurs stockées', m2.totalHT===30 && m2.totalTTC===36);

// ── Encaissement : SOURCE DE VÉRITÉ UNIQUE (bug du double comptage sur 2026-07-002) ──
// Détail seul : on ne compte QUE fact_paiements, jamais + montant_paye.
t('détail seul (règlement unique 8415,03 + cache 8415,03) → 8415,03, PAS 16830,06',
  encaisseFacture({fact_paiements:[{montant:8415.03}],montant_paye:8415.03})===8415.03);
t('détail multi-lignes : 3000 + 2400,03 → 5400,03', encaisseFacture({fact_paiements:[{montant:3000},{montant:2400.03}],montant_paye:5400.03})===5400.03);
// Facture migrée : aucun détail, on retombe sur le cache montant_paye.
t('migrée (0 détail, cache 7950,66) → repli sur 7950,66', encaisseFacture({fact_paiements:[],montant_paye:7950.66})===7950.66);
t('migrée sans propriété fact_paiements → repli sur le cache', encaisseFacture({montant_paye:5400})===5400);
// fact_paiements présent mais VIDE → repli sur le cache (auto-réparation après suppression du dernier règlement).
t('détail présent mais vide → repli sur le cache', encaisseFacture({fact_paiements:[],montant_paye:120})===120);
t('dernier règlement supprimé (cache remis à 0) → 0', encaisseFacture({fact_paiements:[],montant_paye:0})===0);
// Partielle : détail partiel prioritaire même si un vieux cache traîne.
t('partielle : détail 2000 prioritaire (cache ignoré) → 2000', encaisseFacture({fact_paiements:[{montant:2000}],montant_paye:9999})===2000);
t('facture sans encaissement → 0', encaisseFacture({fact_paiements:[],montant_paye:null})===0);

// ── Statut dérivé du même total (cohérence écran ↔ écriture) ──
t('statut : encaissé ≥ TTC → payé', statutFacture(8415.03,8415.03)==='paye');
t('statut : 0 < encaissé < TTC → partiel', statutFacture(8415.03,2000)==='partiel');
t('statut : encaissé 0 → émise', statutFacture(8415.03,0)==='emise');
t('statut : sur-paiement (arrondi) ≥ TTC → payé', statutFacture(100,100.001)==='paye');

// ── Garde-fou anti-régression : la formule fautive n'existe PLUS nulle part dans le module ──
// (le double comptage venait de « …reduce(...) + Number(f.montant_paye||0) » recopié à 5 endroits).
t('aucun site ne rajoute montant_paye au total du détail (single source)',
  (h.match(/\+\s*Number\(\s*f\.montant_paye/g)||[]).length===0);
t('encaisseFacture est bien défini une seule fois', (h.match(/function encaisseFacture\(/g)||[]).length===1);

console.log(ok?'\nALL PASS':'\nSOME FAILED');process.exit(ok?0:1);

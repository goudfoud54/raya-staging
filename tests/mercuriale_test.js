// Mercuriale — fonctions PURES RÉELLES extraites de facturation/index.html (aucun stub du modèle).
// Couvre : marge (dont division par zéro et prix manquant), groupement par catégorie, étanchéité du
// tarif client (jamais de prix d'achat ni de marge), et rapprochement avec le dernier prix livré.
//
// Le point le plus délicat est le rapprochement : il compare une TABLE (produits) à des lignes
// stockées en JSONB (bons_livraison.lignes), avec des désignations qui peuvent différer par la casse
// ou les espaces. Un produit qu'on n'arrive pas à rapprocher NE DOIT PAS être compté comme identique
// — il doit sortir dans `nonRapproches`. C'est la différence entre « prix vérifié » et « prix jamais
// confronté au réel », et c'est le seul chiffre qui protège d'une fausse impression d'exactitude.
//
// Le rendu jsPDF et l'écriture XLSX ne sont PAS testables ici (relus, non exécutés) — mais tout ce
// qu'ils écrivent vient du modèle testé ci-dessous.
const fs=require('fs');
const h=fs.readFileSync(require('path').join(__dirname,'..','facturation/index.html'),'utf8');
// Même slice contigu que facture_pdf_test.js : les fonctions pures vivent avant le rendu jsPDF.
const from=h.indexOf('const _MOIS=');
const to=h.indexOf('// ─────── PDF (rendu jsPDF');
if(from<0||to<0) throw new Error('bloc de fonctions pures introuvable');
eval(h.slice(from,to)+";Object.assign(global,{_cleProduit,dernierPrixLivres,margeUnitaire,ecartPrix,mercurialeModel,mercurialeColonnes,mercurialeFeuille});");
// blLineTotals vit hors du slice (avec le reste de l'écran BL) : on l'extrait à part pour vérifier
// que la mercuriale applique bien LA MÊME convention de marge que l'écran des bons de livraison.
const {extractFn}=require('./extract.js');
eval(extractFn(h,'blLineTotals')+';global.blLineTotals=blLineTotals;');
eval(extractFn(h,'blTotals')+';global.blTotals=blTotals;');

let ok=true;const t=(l,c,d)=>{console.log((c?'PASS':'FAIL')+' · '+l+(c||d===undefined?'':'  → '+d));ok=c&&ok;};

// ══════════ 1. MARGE ══════════
console.log('── 1. Calcul de marge ──');
let m=margeUnitaire(10,12.5);
t('marge simple : 10 → 12,50 = 2,50 (20 % du prix de vente)', m.marge===2.5 && m.marge_pct===20);
t('marge nulle : achat = revente → 0 et 0 %', margeUnitaire(8,8).marge===0 && margeUnitaire(8,8).marge_pct===0);
m=margeUnitaire(12,10);
t('marge NÉGATIVE conservée (vente à perte, il faut la voir)', m.marge===-2 && m.marge_pct===-20);
// Division par zéro et prix manquant : jamais 0, jamais Infinity, jamais NaN.
m=margeUnitaire(5,0);
t('prix de revente = 0 → marge null (pas de division par zéro)', m.marge===null && m.marge_pct===null && m.sansPrixRevente===true);
m=margeUnitaire(5,null);
t('prix de revente absent → marge null + drapeau', m.marge===null && m.marge_pct===null && m.sansPrixRevente===true);
m=margeUnitaire(null,12);
t('prix d’ACHAT absent → marge null, mais PAS « sans prix de revente »', m.marge===null && m.sansPrixRevente===false);
t('aucune valeur ne peut valoir Infinity ou NaN',
  [margeUnitaire(5,0),margeUnitaire(0,0),margeUnitaire(null,null),margeUnitaire(3,0.0001)]
    .every(x=>[x.marge,x.marge_pct].every(v=>v===null||(isFinite(v)&&!isNaN(v)))));
// 4 décimales du catalogue : la marge ne doit pas être pré-arrondie au centime.
m=margeUnitaire(26.15,27.4575);
t('prix à 4 décimales : marge = 1,3075 (non pré-arrondie au centime)', m.marge===1.3075, String(m.marge));

// Même convention que l'écran des bons de livraison (marge rapportée au prix de REVENTE).
const viaBL=blTotals([{qte:1,a:10,r:12.5}]);
t('convention identique à blTotals : marge = revente − achat', viaBL.marge===margeUnitaire(10,12.5).marge);
t('convention identique à blTotals : pourcentage rapporté au prix de revente', viaBL.marge_pct===margeUnitaire(10,12.5).marge_pct);

// ══════════ 2. GROUPEMENT PAR CATÉGORIE ══════════
console.log('── 2. Groupement par catégorie ──');
const PRODUITS=[
  {nom:'Bacon',cat:'Viandes',prix_achat:7.49,prix_revente:7.9125,tva:5.5,grammage:'1',unite:'kg'},
  {nom:'Avocat',cat:'Légumes',prix_achat:2,prix_revente:3,tva:5.5},
  {nom:'Steak',cat:'Viandes',prix_achat:20,prix_revente:27.4575,tva:5.5},
  {nom:'Zucchini',cat:'Légumes',prix_achat:1,prix_revente:2,tva:5.5},
  {nom:'Sac',cat:null,prix_achat:1,prix_revente:2,tva:20},
];
let mod=mercurialeModel(PRODUITS,[],{mode:'interne',date:'2026-07-29'});
t('une catégorie par groupe, sans doublon', mod.groupes.length===3, mod.groupes.map(g=>g.cat).join('|'));
t('catégories par ordre alphabétique', JSON.stringify(mod.groupes.map(g=>g.cat))===JSON.stringify(['Légumes','Sans catégorie','Viandes']));
t('catégorie vide → « Sans catégorie », le produit n’est jamais perdu',
  mod.groupes.find(g=>g.cat==='Sans catégorie').lignes.map(l=>l.nom).join()==='Sac');
t('dans une catégorie, l’ordre reçu (donc celui de l’écran) est conservé',
  mod.groupes.find(g=>g.cat==='Viandes').lignes.map(l=>l.nom).join()==='Bacon,Steak');
t('aucun produit perdu ni dupliqué au groupement',
  mod.groupes.reduce((n,g)=>n+g.lignes.length,0)===PRODUITS.length && mod.nbProduits===PRODUITS.length);
t('nombre de catégories cohérent', mod.nbCategories===3);

// ══════════ 3. TARIF CLIENT — étanchéité ══════════
console.log('── 3. Le tarif client ne contient jamais de prix d’achat ni de marge ──');
const cli=mercurialeModel(PRODUITS,[{date_livraison:'2026-07-01',lignes:[{nom:'Bacon',a:99.99,r:7.9125}]}],{mode:'client'});
const brut=JSON.stringify(cli);
t('aucune CLÉ prix_achat / marge / marge_pct dans tout le modèle client',
  !/"prix_achat"/.test(brut) && !/"marge"/.test(brut) && !/"marge_pct"/.test(brut));
t('aucune VALEUR de prix d’achat ne subsiste (7.49, 20, 2, 1, 99.99)',
  !/[:,]7\.49[,}]/.test(brut) && !/"dernier"/.test(brut) && !/99\.99/.test(brut), brut.slice(0,160));
t('aucune trace du rapprochement (écarts, dernier prix livré) en mode client',
  !/"ecart_achat"/.test(brut) && !/"ecart_revente"/.test(brut) && !/"rapproche"/.test(brut) && cli.controle===null);
t('le tarif client garde bien prix de revente + TVA', /"prix_revente"/.test(brut) && /"tva"/.test(brut));
// Les clés autorisées côté client, énumérées : toute clé nouvelle devra être ajoutée ici sciemment.
// `grammage_unite` est dérivé de grammage + unite (déjà autorisés) : ajouté ici en connaissance de
// cause, après que ce test a signalé son apparition. C'est bien le but de la liste.
const CLES_CLIENT=['nom','cat','grammage','unite','grammage_unite','prix_revente','tva','sansPrixRevente'];
const clesVues=new Set(); cli.groupes.forEach(g=>g.lignes.forEach(l=>Object.keys(l).forEach(k=>clesVues.add(k))));
t('les lignes client ne portent QUE les clés autorisées',
  [...clesVues].every(k=>CLES_CLIENT.includes(k)), [...clesVues].join(','));
// Le mode interne, lui, DOIT les porter (sinon le test ci-dessus passerait pour une raison creuse).
const intBrut=JSON.stringify(mercurialeModel(PRODUITS,[],{mode:'interne'}));
t('contrôle inverse : le mode interne contient bien prix_achat et marge',
  /"prix_achat"/.test(intBrut) && /"marge"/.test(intBrut));
t('mode inconnu ou absent → interne par défaut (jamais de fuite par un mode mal orthographié)',
  mercurialeModel(PRODUITS,[],{mode:'zzz'}).mode==='interne' && mercurialeModel(PRODUITS,[],{}).mode==='interne');

// ══════════ 4. RAPPROCHEMENT AVEC LE DERNIER PRIX LIVRÉ ══════════
console.log('── 4. Détection des écarts avec le dernier prix livré ──');
// Normalisation : casse et espaces uniquement.
t('clé : casse ignorée', _cleProduit('Bacon')===_cleProduit('BACON'));
t('clé : espaces de bord et espaces internes multiples compactés', _cleProduit('  Sauce   Soja  ')==='sauce soja');
t('clé : les accents NE sont PAS neutralisés (normalisation volontairement stricte)', _cleProduit('Pâte')!==_cleProduit('Pate'));
t('clé : null/undefined → chaîne vide, pas de plantage', _cleProduit(null)==='' && _cleProduit(undefined)==='');

// Le plus récent gagne, quel que soit l'ordre des bons en entrée.
const BLS=[
  {date_livraison:'2026-03-01',lignes:[{nom:'Bacon',a:7.0,r:7.5}]},
  {date_livraison:'2026-05-02',lignes:[{nom:'  BACON ',a:7.5,r:7.9125}]},   // plus récent + casse/espaces
  {date_livraison:'2026-04-01',lignes:[{nom:'Avocat',a:2,r:2.5}]},
];
const dp=dernierPrixLivres(BLS);
t('le prix le plus récent l’emporte (et la clé rapproche malgré casse/espaces)',
  dp.get('bacon').r===7.9125 && dp.get('bacon').a===7.5);
t('l’ordre des bons en entrée n’influe pas sur le résultat',
  dernierPrixLivres([...BLS].reverse()).get('bacon').r===7.9125);
t('lignes absentes ou mal formées : ignorées sans planter',
  dernierPrixLivres([{date_livraison:'2026-01-01'},{date_livraison:'2026-01-02',lignes:null},
                     {date_livraison:'2026-01-03',lignes:[{nom:'   '},{nom:null}]}]).size===0);

// Nature de l'écart : arrondi (≤ 1 centime) vs réel.
t('écart nul → aucun signalement', ecartPrix(7.5,7.5)===null);
t('27,4575 au catalogue vs 27,46 livré → ARRONDI (4 décimales contre 2)', ecartPrix(27.4575,27.46).type==='arrondi');
t('7,49 vs 7,50 → arrondi (1 centime pile, inclus)', ecartPrix(7.49,7.5).type==='arrondi');
// La classification se fait sur les valeurs arrondies AU CENTIME (niveau auquel l'argent se facture) :
// 22,8091 se facture 22,81, donc l'écart avec 22,82 est d'un centime — pas d'un changement de prix.
// Sur les valeurs brutes, la différence de 0,0109 aurait basculé « réel » sur la seule 4e décimale.
t('22,8091 vs 22,82 → arrondi (22,81 au centime, soit 1 centime d’écart)', ecartPrix(22.8091,22.82).type==='arrondi', JSON.stringify(ecartPrix(22.8091,22.82)));
t('mais 10,00 vs 10,02 → RÉEL (2 centimes, au-delà du seuil)', ecartPrix(10,10.02).type==='reel');
t('la différence brute reste exposée telle quelle, non arrondie', ecartPrix(22.8091,22.82).diff===-0.0109, String(ecartPrix(22.8091,22.82).diff));
t('8,40 vs 6,69 → écart RÉEL', ecartPrix(8.4,6.69).type==='reel');
t('0 vs 30 → écart réel (et non « pas de prix, pas d’écart »)', ecartPrix(0,30).type==='reel');
t('les DEUX valeurs sont toujours renvoyées, arrondi comme réel',
  ecartPrix(7.49,7.5).catalogue===7.49 && ecartPrix(7.49,7.5).livre===7.5 && ecartPrix(8.4,6.69).catalogue===8.4);

// Le cœur : non rapproché ≠ identique.
const PROD2=[
  {nom:'Bacon',cat:'Viandes',prix_achat:7.5,prix_revente:7.9125,tva:5.5},        // rapproché, identique
  {nom:'Avocat',cat:'Légumes',prix_achat:2,prix_revente:3,tva:5.5},              // rapproché, écart réel (3 vs 2,5)
  {nom:'Tiramisu Bueno',cat:'Desserts',prix_achat:4,prix_revente:6,tva:5.5},     // JAMAIS livré
  {nom:'Steak',cat:'Viandes',prix_achat:26.15,prix_revente:27.4575,tva:5.5},     // rapproché, arrondi
];
const BLS2=[...BLS,{date_livraison:'2026-06-01',lignes:[{nom:'Steak',a:26.15,r:27.46}]}];
const m2=mercurialeModel(PROD2,BLS2,{mode:'interne'});
const ligne=n=>m2.groupes.flatMap(g=>g.lignes).find(l=>l.nom===n);
t('produit jamais livré → rapproche = false et dernier = null (PAS « identique »)',
  ligne('Tiramisu Bueno').rapproche===false && ligne('Tiramisu Bueno').dernier===null
  && ligne('Tiramisu Bueno').ecart_revente===null);
t('le bilan compte explicitement les NON RAPPROCHÉS', m2.controle.nonRapproches===1, JSON.stringify(m2.controle));
t('rapprochés + non rapprochés = total des produits', m2.controle.rapproches+m2.controle.nonRapproches===PROD2.length);
t('un non-rapproché n’est JAMAIS compté dans les écarts',
  m2.controle.ecartsReels===1 && m2.controle.ecartsArrondis===1);
t('écart réel détecté avec les deux valeurs (Avocat : 3 au catalogue, 2,50 livré)',
  ligne('Avocat').ecart_revente.type==='reel' && ligne('Avocat').ecart_revente.catalogue===3 && ligne('Avocat').ecart_revente.livre===2.5);
t('produit identique → aucun écart signalé', ligne('Bacon').ecart_revente===null && ligne('Bacon').ecart_achat===null);
t('écart d’ARRONDI classé comme tel, pas comme un vrai changement de prix',
  ligne('Steak').ecart_revente.type==='arrondi' && m2.controle.ecartsReels===1);
t('la date du dernier prix livré est reportée (une mercuriale sans date ne vaut rien)',
  ligne('Bacon').dernier.date==='2026-05-02');

// Le produit à prix de revente nul : visible, compté, et sans marge fantaisiste.
const m3=mercurialeModel([{nom:'Frais de Livraison',cat:'Divers',prix_achat:0,prix_revente:0,tva:5.5}],
                         [{date_livraison:'2026-05-02',lignes:[{nom:'Frais de Livraison',a:0,r:30}]}],{mode:'interne'});
const fl=m3.groupes[0].lignes[0];
t('produit sans prix de revente : signalé, marge null, et compté au bilan',
  fl.sansPrixRevente===true && fl.marge===null && fl.marge_pct===null && m3.controle.sansPrixRevente===1);
// Le 0 stocké (la base ne distingue pas « gratuit » de « non renseigné ») ne doit pas ressortir
// comme un tarif : sinon il se trie et se moyenne dans le tableur comme un vrai prix.
t('…et son prix de vente ressort à null, pas à 0 (écran, PDF et tableur cohérents)',
  fl.prix_revente===null);
t('…et son écart avec le dernier prix livré reste détecté (0 vs 30)',
  fl.ecart_revente && fl.ecart_revente.type==='reel' && fl.ecart_revente.livre===30);

// Robustesse : catalogue vide, bons vides.
t('catalogue vide → modèle vide mais cohérent, sans plantage',
  mercurialeModel([],[],{mode:'interne'}).nbProduits===0 && mercurialeModel([],[],{mode:'interne'}).groupes.length===0);
t('aucun bon de livraison → tous non rapprochés, aucun écart',
  mercurialeModel(PROD2,[],{mode:'interne'}).controle.nonRapproches===PROD2.length
  && mercurialeModel(PROD2,[],{mode:'interne'}).controle.ecartsReels===0);

// ══════════ 5. COLONNES ET FEUILLE DE CALCUL (partagées PDF ↔ tableur) ══════════
console.log('── 5. Colonnes partagées et feuille de calcul ──');
const colInt=mercurialeColonnes('interne'), colCli=mercurialeColonnes('client');
t('les colonnes internes comportent prix d’achat, marge et marge %',
  colInt.filter(c=>['prix_achat','marge','marge_pct'].includes(c.cle)).length===3);
t('les colonnes CLIENT n’en comportent AUCUNE',
  colCli.every(c=>!['prix_achat','marge','marge_pct'].includes(c.cle)), colCli.map(c=>c.cle).join(','));
t('le tarif client garde désignation, catégorie, grammage, prix de vente et TVA',
  JSON.stringify(colCli.map(c=>c.cle))===JSON.stringify(['nom','cat','grammage_unite','prix_revente','tva']));
t('chaque colonne porte un type de formatage connu',
  colInt.every(c=>['texte','euro','pourcent'].includes(c.type)));

// La feuille : les nombres doivent rester des NOMBRES (sinon : tri alphabétique, pas de calcul).
const feu=mercurialeFeuille(mercurialeModel(PRODUITS,[],{mode:'interne',date:'2026-07-29',organisation:'Groupe Raya'}));
const iNom=colInt.findIndex(c=>c.cle==='nom'), iPV=colInt.findIndex(c=>c.cle==='prix_revente');
const ligneBacon=feu.aoa.find(r=>r&&r[iNom]==='Bacon');
t('la ligne d’en-tête est repérée et porte les titres de colonnes',
  feu.aoa[feu.ligneEntete][0]==='Désignation' && feu.aoa[feu.ligneEntete].length===colInt.length);
t('un prix est un NOMBRE dans la feuille, pas une chaîne « 7,91 € »',
  typeof ligneBacon[iPV]==='number' && ligneBacon[iPV]===7.9125, typeof ligneBacon[iPV]);
t('la marge est un nombre à pleine précision (non pré-arrondie)',
  ligneBacon[colInt.findIndex(c=>c.cle==='marge')]===0.4225);
t('le pourcentage est écrit en NOMBRE (5,3), le « % » relevant du format de cellule',
  typeof ligneBacon[colInt.findIndex(c=>c.cle==='marge_pct')]==='number');
t('la date d’édition figure dans l’en-tête de la feuille', /29 juillet 2026/.test(feu.aoa[1][0]), feu.aoa[1][0]);
t('le nom de l’organisation figure dans le titre', /Groupe Raya/.test(feu.aoa[0][0]), feu.aoa[0][0]);
t('le titre distingue clairement le document interne', /interne/i.test(feu.aoa[0][0]));
t('les bandeaux de catégorie sont repérés pour la mise en forme', feu.lignesCategorie.length===3);
t('une valeur absente donne une cellule VIDE (null), jamais un zéro trompeur',
  mercurialeFeuille(mercurialeModel([{nom:'X',cat:'C',prix_achat:5,prix_revente:0,tva:5.5}],[],{mode:'interne'}))
    .aoa.find(r=>r&&r[iNom]==='X')[colInt.findIndex(c=>c.cle==='marge')]===null);

// Étanchéité jusque dans la feuille : aucun titre ni aucune valeur d'achat côté client.
const feuCli=mercurialeFeuille(mercurialeModel(PRODUITS,[],{mode:'client',date:'2026-07-29'}));
const platCli=JSON.stringify(feuCli.aoa);
t('la feuille CLIENT ne contient ni titre ni valeur de prix d’achat',
  !/achat/i.test(platCli) && !/[Mm]arge/.test(platCli) && !platCli.includes('7.49') && !platCli.includes('26.15'),
  platCli.slice(0,120));
t('le titre de la feuille client ne mentionne pas « interne »', !/interne/i.test(feuCli.aoa[0][0]), feuCli.aoa[0][0]);
t('même nombre de lignes de produits dans les deux modes (seules les colonnes changent)',
  feu.aoa.length===feuCli.aoa.length);

console.log(ok?'\nALL PASS':'\nSOME FAILED');
process.exit(ok?0:1);

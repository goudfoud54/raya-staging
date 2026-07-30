// Voies de recours imprimées au salarié — le délai de contestation annoncé doit être CELUI DU
// SALARIÉ (L.1471-1), jamais celui de l'employeur (L.1332-4).
//
// Contexte : jusqu'à la v6.31 les avertissements et notifications de sanction imprimaient
// « conformément à l'article L. 1332-4, vous disposez d'un délai de deux mois pour le contester ».
// L.1332-4 est le délai de l'EMPLOYEUR pour engager les poursuites ; le délai du SALARIÉ relève de
// L.1471-1 (deux ans pour l'exécution du contrat, douze mois pour la rupture). Le courrier annonçait
// donc au salarié un droit six à douze fois plus court que la réalité, et il lui est remis en main
// propre. Ce harnais garde la correction, sur la fonction RÉELLE extraite d'avertissements/index.html.
const fs = require("fs");
const path = require("path");
const h = fs.readFileSync(path.join(__dirname, "..", "avertissements/index.html"), "utf8");

{ const s = h.indexOf("function appendVoiesDeRecours(");
  if (s < 0) throw new Error("appendVoiesDeRecours introuvable dans avertissements/index.html");
  const e = h.indexOf("\n}", s) + 2;
  eval(h.slice(s, e) + ";global.appendVoiesDeRecours=appendVoiesDeRecours;"); }

let ok = true; const t = (l, c) => { console.log((c ? 'PASS' : 'FAIL') + ' · ' + l); ok = c && ok; };

// Rejoue la fonction réelle avec des helpers de capture (mêmes signatures que le générateur PDF).
function rendu(regime) {
  const out = [];
  const paraRich = (parts) => out.push(parts.map(p => p.text).join(''));
  const B = (x) => ({ text: x, bold: true }), N = (x) => ({ text: x, bold: false });
  appendVoiesDeRecours(paraRich, B, N, regime);
  return out.join('\n');
}
const sanction = rendu('sanction');
const rupture  = rendu('rupture');

// ── 1. L'erreur corrigée ne peut pas revenir par le texte imprimé ──
t('sanction : ne cite PLUS L. 1332-4 (délai de l\'employeur)', !/1332-4/.test(sanction));
t('sanction : n\'annonce PLUS « deux mois » au salarié', !/deux mois/i.test(sanction));
t('rupture : ne cite PLUS L. 1332-4', !/1332-4/.test(rupture));
t('rupture : n\'annonce PLUS « deux mois » au salarié', !/deux mois/i.test(rupture));

// ── 2. Ce qui est annoncé est le bon délai, pour le bon régime ──
t('sanction : annonce « deux ans » (L.1471-1 al.1, exécution du contrat)', /deux ans/i.test(sanction));
t('sanction : cite L. 1471-1', /L\. ?1471-1/.test(sanction));
t('sanction : cite l\'office du conseil de prud\'hommes (L.1333-1 / L.1333-2)', /L\. ?1333-1/.test(sanction) && /L\. ?1333-2/.test(sanction));
t('sanction : nomme le conseil de prud\'hommes', /conseil de prud'hommes/i.test(sanction));
t('rupture : annonce « douze mois » (L.1471-1 al.2, rupture du contrat)', /douze mois/i.test(rupture));
t('rupture : cite L. 1471-1', /L\. ?1471-1/.test(rupture));
t('rupture : n\'annonce PAS « deux ans » (ce serait le régime de la sanction)', !/deux ans/i.test(rupture));
t('rupture : nomme le conseil de prud\'hommes', /conseil de prud'hommes/i.test(rupture));

// ── 3. Les régimes spéciaux sont signalés sans être chiffrés (on ne réinvente pas un nombre faux) ──
const reserve = /salaires.*discrimination|discrimination.*harcèlement/i;
t('sanction : réserve les régimes spéciaux (salaires / discrimination / harcèlement)', reserve.test(sanction));
t('rupture : réserve les régimes spéciaux', reserve.test(rupture));

// ── 4. Garde-fou fichier : L.1332-4 ne subsiste QUE dans l'alerte employeur, jamais dans un courrier ──
// Les lignes de commentaire sont exclues : la documentation de appendVoiesDeRecours cite
// délibérément L.1332-4 pour expliquer l'erreur corrigée. Ce qui compte est le texte IMPRIMÉ.
const lignesCode = h.split('\n').filter(l => !/^\s*\/\//.test(l));
const occ = lignesCode.filter(l => /1332-4/.test(l));
t('L. 1332-4 n\'apparaît plus que dans une seule ligne de code (hors commentaires)', occ.length === 1);
if (occ.length === 1) {
  t('l\'occurrence restante est bien l\'alerte de prescription à l\'employeur (faits > 2 mois)',
    /days>60/.test(occ[0]) && /prescription/i.test(occ[0]));
  t('l\'occurrence restante ne s\'adresse pas au salarié (« vous disposez » / « contester »)',
    !/vous disposez/i.test(occ[0]) && !/contester/i.test(occ[0]));
}

// ── 5. Les trois modèles concernés appellent bien la source unique ──
const appels = [...h.matchAll(/appendVoiesDeRecours\(paraRich,\s*B,\s*N,\s*'(\w+)'\)/g)].map(m => m[1]);
t('avertissement/blâme + notification de sanction appellent le régime « sanction » (2 appels)',
  appels.filter(r => r === 'sanction').length === 2);
t('la lettre de licenciement appelle le régime « rupture » (1 appel)',
  appels.filter(r => r === 'rupture').length === 1);
t('aucun autre régime inattendu', appels.every(r => r === 'sanction' || r === 'rupture'));

// ── 6. La convention de rupture conventionnelle reste hors périmètre (régime distinct, L.1237-13) ──
const iRupt = h.indexOf("else if (kind==='rupture')");
const blocRuptConv = iRupt > 0 ? h.slice(iRupt, iRupt + 2000) : '';
t('rupture conventionnelle : conserve son délai de rétractation de 15 jours (L.1237-13)',
  /L\. ?1237-13/.test(blocRuptConv) && /quinze \(15\) jours calendaires/.test(blocRuptConv));
t('rupture conventionnelle : n\'a pas reçu de mention de contestation par erreur',
  !/appendVoiesDeRecours/.test(blocRuptConv));

console.log(ok ? '\nALL PASS' : '\nSOME FAILED'); process.exit(ok ? 0 : 1);

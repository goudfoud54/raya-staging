// Import du calendrier CFA — lecture VECTORIELLE du PDF.
// Fonctions RÉELLES extraites de salaries/index.html, rejouées sur une extraction pdf.js du
// fichier réel « BTS MCO 26-28.pdf » (tests/fixtures/cfa_bts_mco_26-28.json).
//
// CE QUE CE HARNAIS VERROUILLE
// L'import proposait 174 jours d'école là où le document en annonce 93. Cause : dans ces
// calendriers chaque jour occupe TROIS cases — [numéro][lettre][STATUT] — et la couleur qui
// distingue école/entreprise est dans la TROISIÈME. L'ancien chemin échantillonnait les pixels
// autour du NUMÉRO, donc toujours la première, uniformément grise : il ne pouvait pas
// structurellement faire la différence. On lit désormais les rectangles remplis du PDF.
//
// Le document annonce son propre total. C'est le contrôle qui doit survivre à tout changement de
// méthode de lecture : si le compte ne tombe pas juste, on ne pré-remplit pas en silence.
const fs = require('fs');
const path = require('path');
const { extractFn } = require('./extract.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'salaries', 'index.html'), 'utf8');
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cfa_bts_mco_26-28.json'), 'utf8'));

// Dépendances de cfaVectorAnalyse, extraites telles quelles du module.
const CFA_MONTH_VAR = eval(SRC.match(/const CFA_MONTH_VAR=(\[[^;]+\]);/)[1]);
eval(extractFn(SRC, 'cfaNorm'));
eval(extractFn(SRC, 'cfaParseMonth'));
eval(extractFn(SRC, 'cfaVectorAnalyse'));
eval(extractFn(SRC, 'cfaControleTotal'));

// La fixture est compacte ([str,x,y,w] / [x0,y0,x1,y1,r,g,b]) : on la ré-hydrate au format que
// cfaVectorPage() produit dans le navigateur.
const pages = FIX.pages.map(p => ({
  items: p.items.map(a => ({ str: a[0], x: a[1], y: a[2], w: a[3] })),
  rects: p.rects.map(a => ({ x0: a[0], y0: a[1], x1: a[2], y1: a[3], rgb: [a[4], a[5], a[6]] })),
}));
const BLEU = '131,204,235';   // couleur « école » de ce document (lue dans le PDF, pas devinée)

let ok = true; const t = (l, c) => { console.log((c ? 'PASS' : 'FAIL') + ' · ' + l); ok = c && ok; };

// ══ 1. Le compte tombe sur le total que le document annonce ══════════════════════════════════
const a2627 = cfaVectorAnalyse(pages, '2026-2027');
const ecole2627 = a2627.samples.filter(s => s.rgb.join(',') === BLEU).length;
t('année 2026-2027 : le document annonce bien 93 jours', a2627.annonce && a2627.annonce.jours === 93);
t('année 2026-2027 : 93 jours d\'école reconnus (et pas 174)', ecole2627 === 93);
t('année 2026-2027 : 744 heures annoncées, lues', a2627.annonce && a2627.annonce.heures === 744);

const a2728 = cfaVectorAnalyse(pages, '2027-2028');
const ecole2728 = a2728.samples.filter(s => s.rgb.join(',') === BLEU).length;
t('année 2027-2028 : le document annonce 91 jours', a2728.annonce && a2728.annonce.jours === 91);
t('année 2027-2028 : 91 jours d\'école reconnus', ecole2728 === 91);

// ══ 2. L'année NON demandée n'est jamais comptée ═════════════════════════════════════════════
t('2026-2027 : une seule page retenue', a2627.pagesGardees.length === 1);
t('2026-2027 : la page de l\'année 2 est explicitement ignorée', a2627.pagesIgnorees.length === 1);
t('2026-2027 : le motif d\'exclusion est affichable', /hors de 2026-2027/.test(a2627.pagesIgnorees[0].raison));
t('2026-2027 : aucune date hors de la période',
  a2627.samples.every(s => s.date >= '2026-09-01' && s.date <= '2027-08-31'));
t('2027-2028 : c\'est bien l\'AUTRE page qui est retenue',
  a2728.pagesGardees.length === 1 && a2728.pagesGardees[0].page !== a2627.pagesGardees[0].page);
t('2027-2028 : aucune date hors de la période',
  a2728.samples.every(s => s.date >= '2027-09-01' && s.date <= '2028-08-31'));
t('les deux années ne sont JAMAIS additionnées', ecole2627 + ecole2728 === 184 && ecole2627 !== 184 && ecole2728 !== 184);

// ══ 3. Intégrité de la grille : chaque jour une fois, aucun trou ═════════════════════════════
// L'affectation jour → mois a d'abord été écrite « en-tête le plus proche au-dessus » : elle
// confondait les colonnes voisines et produisait 88 dates en double et 65 jours manquants, tout
// en tombant quand même sur 93 pour l'école. Un bon total ne prouve donc pas une bonne grille.
const compte = d => a2627.samples.reduce((n, s) => n + (s.date === d ? 1 : 0), 0);
t('aucune date en double', new Set(a2627.samples.map(s => s.date)).size === a2627.samples.length);
t('aucun trou dans la plage couverte', (() => {
  const u = a2627.samples.map(s => s.date).sort();
  let manq = 0;
  for (let d = new Date(u[0] + 'T00:00:00'), f = new Date(u[u.length - 1] + 'T00:00:00'); d <= f; d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!compte(k)) manq++;
  }
  return manq === 0;
})());
t('la plage couvre bien septembre → juillet de l\'année demandée',
  a2627.samples.map(s => s.date).sort()[0] === '2026-09-01' &&
  a2627.samples.map(s => s.date).sort().pop() === '2027-07-31');
t('les dates sont valides (jour ≤ dernier jour du mois)',
  a2627.samples.every(s => { const [y, m, d] = s.date.split('-').map(Number); return d <= new Date(y, m, 0).getDate(); }));
t('chaque numéro du document est apparié à une case de statut et à une date valide',
  a2627.numeros === 669 && a2627.apparies === 669);
// Garde-fou testé SUR SON COMPORTEMENT, pas sur la présence d'une chaîne : page fabriquée avec
// deux colonnes de mois mais un seul en-tête → les deux colonnes retombent sur le même mois →
// dates en double → la page doit être REJETÉE, jamais proposée.
t('une grille incohérente fait rejeter la page plutôt que proposer un faux calendrier', (() => {
  const cell = (x, y, w, rgb) => ({ x0: x, y0: y, x1: x + w, y1: y + 16, rgb });
  const faux = [{
    items: [
      { str: 'sept-26', x: 100, y: 500, w: 40 },
      { str: '1', x: 102, y: 400, w: 6 }, { str: '2', x: 102, y: 380, w: 6 },
      { str: '1', x: 302, y: 400, w: 6 }, { str: '2', x: 302, y: 380, w: 6 },
    ],
    rects: [
      cell(100, 396, 17, [217, 217, 217]), cell(120, 396, 65, [131, 204, 235]),
      cell(100, 376, 17, [217, 217, 217]), cell(120, 376, 65, [255, 255, 255]),
      cell(300, 396, 17, [217, 217, 217]), cell(320, 396, 65, [131, 204, 235]),
      cell(300, 376, 17, [217, 217, 217]), cell(320, 376, 65, [255, 255, 255]),
    ],
  }];
  const r = cfaVectorAnalyse(faux, '2026-2027');
  return r.samples.length === 0 && r.pagesGardees.length === 0
      && r.pagesIgnorees.length === 1 && /double/.test(r.pagesIgnorees[0].raison);
})());

// ══ 4. Les libellés éclatés caractère par caractère sont reconnus ════════════════════════════
// Dans le flux brut du PDF le texte est posé lettre par lettre (« j u i n - 27 », « d é c- 26 »).
// pdf.js les réassemble avant de nous les donner, et cfaParseMonth normalise de toute façon
// (accents, casse, espaces intercalaires). On verrouille les deux formes.
t('« juin-27 » reconnu', JSON.stringify(cfaParseMonth('juin-27')) === JSON.stringify({ mi: 5, y: 2027 }));
t('« j u i n - 27 » (espacé) reconnu', JSON.stringify(cfaParseMonth('j u i n - 27')) === JSON.stringify({ mi: 5, y: 2027 }));
t('« d é c- 26 » (espacé + accent) reconnu', JSON.stringify(cfaParseMonth('d é c- 26')) === JSON.stringify({ mi: 11, y: 2026 }));
t('« SEPT - 26 » (majuscules) reconnu', JSON.stringify(cfaParseMonth('SEPT - 26')) === JSON.stringify({ mi: 8, y: 2026 }));
t('« Août 2026 » reconnu', JSON.stringify(cfaParseMonth('Août 2026')) === JSON.stringify({ mi: 7, y: 2026 }));
t('un mot quelconque n\'est pas pris pour un mois', cfaParseMonth('FERIE') === null);
t('les 11 en-têtes de la page 1 sont tous reconnus',
  pages[0].items.filter(i => cfaParseMonth(i.str) && cfaParseMonth(i.str).y != null).length === 11);

// ══ 5. Le contrôle contre le total annoncé ═══════════════════════════════════════════════════
const byDate = {}; a2627.samples.forEach(s => { byDate[s.date] = { cluster: s.rgb.join(',') === BLEU ? 'bleu' : 'autre' }; });
const det = { annonce: a2627.annonce, byDate };
t('bonne couleur désignée → contrôle OK',
  (r => r && r.ok && r.trouve === 93 && r.ecart === 0)(cfaControleTotal(det, { bleu: 'ecole', autre: 'entreprise' })));
t('mauvaise couleur désignée → écart signalé, pas OK',
  (r => r && !r.ok && r.ecart !== 0)(cfaControleTotal(det, { bleu: 'entreprise', autre: 'ecole' })));
t('les jours d\'examen comptent avec l\'école (BTS Blanc est bleu dans ce document)',
  (r => r && r.trouve === 93)(cfaControleTotal(det, { bleu: 'examen', autre: 'entreprise' })));
t('document sans total annoncé → aucun contrôle possible, dit explicitement',
  cfaControleTotal({ annonce: null, byDate }, { bleu: 'ecole' }) === null);
t('l\'écart est chiffré et signé (utilisable dans le message)',
  (r => r.ecart === Object.keys(byDate).length - 93)(cfaControleTotal(det, { bleu: 'ecole', autre: 'ecole' })));

// ══ 6. Garanties de parcours, vérifiées sur la source ═══════════════════════════════════════
// Les deux appels doivent EXISTER et être dans cet ordre. Tester seulement `indexOf(a)<indexOf(b)`
// laissait passer la suppression pure et simple du chemin vectoriel : indexOf renvoie -1, qui est
// bien inférieur à tout. Mutation non détectée au premier banc.
t('le chemin vectoriel est appelé', SRC.indexOf('await cfaFromPdfVector(file,onStep)') > 0);
t('le chemin vectoriel est essayé AVANT l\'échantillonnage de pixels',
  SRC.indexOf('await cfaFromPdfVector(file,onStep)') < SRC.indexOf('await cfaFromPdfText(file,onStep)'));
t('l\'échantillonnage de pixels est CONSERVÉ en secours (PDF sans vecteurs)',
  /const r=await cfaFromPdfText\(file,onStep\)/.test(SRC));
t('l\'OCR reste le dernier recours (PDF scanné)', /cfaPdfToImageData\(file\); return await cfaFromImage/.test(SRC));
// La condition de blocage doit porter sur le RÉSULTAT du contrôle. Vérifier seulement l'ordre des
// instructions laissait passer un `if(false)` : le contrôle restait appelé, dans du code mort.
t('le blocage est conditionné au résultat du contrôle', (() => {
  const f = extractFn(SRC, 'applyCfaClusters');
  return /if\(\s*ctl\s*&&\s*!ctl\.ok\s*\)/.test(f);
})());
t('un écart bloque le pré-remplissage (retour AVANT toute écriture dans ALT.jours)', (() => {
  const f = extractFn(SRC, 'applyCfaClusters');
  const iCtl = f.indexOf('cfaControleTotal'), iRet = f.indexOf('return;', iCtl), iEcrit = f.indexOf('ALT.jours={}');
  return iCtl > 0 && iRet > iCtl && iEcrit > iRet;
})());
t('le message d\'écart montre les DEUX nombres', /annonce <b>\$\{ctl\.annonce\} jours/.test(SRC) && /en compte <b>\$\{ctl\.trouve\}/.test(SRC));
t('le message rappelle que le pinceau reste disponible', /pinceau — il reste disponible/.test(SRC));
t('forcer reste possible, mais explicitement', /applyCfaClusters\(true\)/.test(SRC) && /Pré-remplir quand même/.test(SRC));
t('le pinceau n\'est jamais désactivé par l\'import',
  !/altBrushBar[^\n]*(display:none|disabled)/.test(SRC));
t('l\'absence de total annoncé est signalée, pas traitée comme un succès',
  /n'annonce aucun total/.test(SRC) && /aucun total annoncé à vérifier/.test(SRC));
t('les pages retenues et ignorées sont affichées',
  /page \$\{p\.page\} retenue/.test(SRC) && /page \$\{p\.page\} ignorée/.test(SRC));

console.log(ok ? '\nALL PASS' : '\nSOME FAILED'); process.exit(ok ? 0 : 1);

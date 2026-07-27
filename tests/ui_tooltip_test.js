// Info-bulle partagée (ui.css + ui.js) — moteur de positionnement PUR + garde-fous d'intégration.
// Le rendu visuel (apparence, délai, focus DOM) n'est pas testable ici : il est décrit au patron
// pour validation Safari. Ce qui EST prouvé : le calcul de position (jamais coupé écran/conteneur)
// et le câblage correct des modules (pas de title résiduel, aria-label présent, ui.css+ui.js chargés).
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(ROOT,'ui.js'),'utf8');
// Slice de la fonction pure tipPosition (aucune dépendance DOM) — même technique que les autres harnais.
const a=js.indexOf('function tipPosition('), b=js.indexOf('window.tipPosition');
if(a<0||b<0) throw new Error('tipPosition introuvable dans ui.js');
eval(js.slice(a,b)+';global.tipPosition=tipPosition;');

let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const VW=1200, VH=800, TW=120, TH=28, M=8;
const rect=(left,top,w,h)=>({left,top,right:left+w,bottom:top+h,width:w,height:h});

// ── Positionnement : au-dessus, centré, jamais hors écran ──
let p=tipPosition(rect(500,400,40,28), TW,TH,VW,VH);
t('milieu : centrée sur le bouton (x=460)', p.x===460);
t('milieu : au-dessus du bouton (below=false, y=364)', p.below===false && p.y===364);

// Bouton en fin de ligne, collé au bord droit (le cas des boutons d'action de tableau).
p=tipPosition(rect(1180,400,20,28), TW,TH,VW,VH);
t('bord droit : recalée pour rester dans la fenêtre', p.x===1072);
t('bord droit : bord droit de la bulle À L\'INTÉRIEUR de l\'écran', p.x+TW<=VW-M);

// Bouton collé au bord gauche.
p=tipPosition(rect(2,400,20,28), TW,TH,VW,VH);
t('bord gauche : recalée à la marge (x=8)', p.x===M);

// Bouton tout en haut : pas la place au-dessus → bascule en dessous.
p=tipPosition(rect(500,4,40,28), TW,TH,VW,VH);
t('proche du haut : bascule en dessous (below=true)', p.below===true);
t('proche du haut : y = bas du bouton + marge (40)', p.y===4+28+M);

// Bulle plus large que la fenêtre : calée à gauche, jamais un x négatif.
p=tipPosition(rect(500,400,40,28), 1300,TH,VW,VH);
t('bulle plus large que la fenêtre : calée à gauche (x=8), jamais négatif', p.x===M);

// Bulle plus large que le bouton mais avec de la place : reste centrée.
p=tipPosition(rect(560,400,80,28), 200,TH,VW,VH);
t('bulle large mais place dispo : centrée (x=500)', p.x===500);

// ── Garde-fous d'intégration : câblage des modules ──
const fac=fs.readFileSync(path.join(ROOT,'facturation/index.html'),'utf8');
// Le title natif a été REMPLACÉ (pas ajouté) → pas de double info-bulle sur les navigateurs qui gèrent les deux.
t('facturation : plus aucun attribut title= (remplacé par data-tip)', !/\stitle=/.test(fac));
// Chaque bouton icône-seule garde un nom accessible identique à l'info-bulle.
const tips=[...fac.matchAll(/data-tip="([^"]+)"/g)].map(m=>m[1]);
const labels=new Set([...fac.matchAll(/aria-label="([^"]+)"/g)].map(m=>m[1]));
t('facturation : au moins 8 boutons équipés', tips.length>=8);
t('facturation : chaque data-tip a un aria-label identique', tips.every(x=>labels.has(x)));

// SILENT-FAILURE GUARD : un module qui pose des data-tip SANS charger ui.css+ui.js
// n'afficherait AUCUNE bulle — indistinguable du bug Safari qu'on corrige. On l'interdit mécaniquement.
const dirs=fs.readdirSync(ROOT).filter(d=>{try{return fs.statSync(path.join(ROOT,d)).isDirectory()&&fs.existsSync(path.join(ROOT,d,'index.html'));}catch(e){return false;}});
// Machinerie valide = socle partagé (ui.css+ui.js) OU implémentation locale héritée ([data-tip] en CSS).
// Orphelin = data-tip SANS aucune des deux → aucune bulle ne s'afficherait (échec silencieux). Interdit.
const orphelins=[], legacyLocal=[];
for(const d of dirs){
  const c=fs.readFileSync(path.join(ROOT,d,'index.html'),'utf8');
  if(!c.includes('data-tip=')) continue;
  const shared=c.includes('ui.css') && c.includes('ui.js');
  const local=/\[data-tip\]/.test(c);
  if(!shared && !local) orphelins.push(d);
  else if(!shared && local) legacyLocal.push(d);
}
t('aucun data-tip orphelin sans machinerie de bulle (orphelins : '+(orphelins.join(', ')||'aucun')+')', orphelins.length===0);
// Non bloquant : modules encore sur l'implémentation locale, à migrer vers le socle partagé (reste à faire).
console.log('  ℹ implémentation locale héritée à migrer : '+(legacyLocal.join(', ')||'aucun'));
// Les 3 modules traités doivent bien être câblés.
for(const d of ['facturation','stock','avertissements']){
  const c=fs.readFileSync(path.join(ROOT,d,'index.html'),'utf8');
  t(d+' : charge ui.css + ui.js', c.includes('ui.css') && c.includes('ui.js'));
  t(d+' : a bien des data-tip', c.includes('data-tip='));
}

// ui.js : la bulle est bien pointer-events:none côté CSS ? (garde-fou anti-scintillement)
const css=fs.readFileSync(path.join(ROOT,'ui.css'),'utf8');
t('ui.css : .ui-tip est pointer-events:none (pas d\'interception du curseur)', /pointer-events:\s*none/.test(css));
t('ui.js : retire le title natif à l\'affichage (anti double bulle)', /removeAttribute\('title'\)/.test(js));
t('ui.js : apparition différée ~300 ms', /setTimeout\([^,]+,\s*300\)/.test(js));

console.log(ok?'\nALL PASS':'\nSOME FAILED');process.exit(ok?0:1);

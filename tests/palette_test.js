// Couleurs salariés (salaries/index.html) : génération palette, contraste, unicité, rattrapage. Fonctions RÉELLES.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","salaries/index.html"),"utf8");
// Extraire le bloc « COULEURS SALARIÉS » entier (du marqueur jusqu'à function escH) et l'évaluer.
{ const s=h.indexOf("const COLOR_DEFAULTS="), e=h.indexOf("function escH("); if(s<0||e<0)throw new Error("bloc couleurs introuvable");
  eval(h.slice(s,e)
    +";global.COLOR_DEFAULTS=COLOR_DEFAULTS;global._hexToRgb=_hexToRgb;global._relLum=_relLum;global._contrastRatio=_contrastRatio;"
    +"global.textColorFor=textColorFor;global.isReadableColor=isReadableColor;global._hslToHex=_hslToHex;global.paletteColor=paletteColor;"
    +"global.assignUniqueColor=assignUniqueColor;global.colorNeedsAssign=colorNeedsAssign;global.planColorBackfill=planColorBackfill;"); }

let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const bestText=hex=>{const L=_relLum(hex);return Math.max(_contrastRatio(L,0),_contrastRatio(L,1));};

// ── 1. PALETTE GÉNÉRÉE : 40 couleurs → toutes uniques, lisibles, texte auto AA 4.5:1 ──
const pal=[]; for(let i=0;i<40;i++)pal.push(paletteColor(i,0).toLowerCase());
t('palette 40 : toutes des hex #rrggbb valides', pal.every(c=>/^#[0-9a-f]{6}$/.test(c)));
t('palette 40 : aucune couleur en double', new Set(pal).size===40);
t('palette 40 : toutes lisibles (isReadableColor)', pal.every(isReadableColor));
t('palette 40 : meilleur texte (noir/blanc) atteint AA 4.5:1 partout', pal.every(c=>bestText(c)>=4.5));
t('palette 40 : aucune teinte jaune pur (zone évitée)', pal.every(c=>{const [r,g,b]=_hexToRgb(c);return !(r>200&&g>200&&b<120);}));

// ── 2. CONTRASTE / LISIBILITÉ : cas problématiques réels cités par le patron ──
t('#888888 (gris défaut) → NON lisible comme couleur distincte', COLOR_DEFAULTS.includes('#888888'));
t('#ffff00 (jaune pur) → NON lisible (invisible/terne sur papier)', !isReadableColor('#ffff00'));
t('#ffe699 (jaune très clair) → NON lisible', !isReadableColor('#ffe699'));
t('#fce4d6 (pêche très clair) → NON lisible', !isReadableColor('#fce4d6'));
t('#ffffff (blanc) → NON lisible (invisible sur papier)', !isReadableColor('#ffffff'));
t('une couleur franche (#c0392b rouge) → lisible', isReadableColor('#c0392b'));
t('textColorFor(#111 foncé) = blanc', textColorFor('#111111')==='#ffffff');
t('textColorFor(#f5d76e clair) = noir', textColorFor('#f5d76e')==='#111111');
t('textColorFor : le texte choisi atteint TOUJOURS AA 4.5 sur une couleur lisible', pal.every(c=>{
  const L=_relLum(c), tc=textColorFor(c); return _contrastRatio(L, tc==='#111111'?0:1)>=4.5; }));

// ── 3. RATTRAPAGE : distribution réelle décrite (5 NULL, 10×#888888, 2×#00b050, clairs illisibles) ──
const real=[];
for(let i=0;i<5;i++)real.push({id:'null'+i,couleur:null});
for(let i=0;i<10;i++)real.push({id:'gray'+i,couleur:'#888888'});
real.push({id:'grn1',couleur:'#00b050'},{id:'grn2',couleur:'#00b050'}); // doublon vert (lisible mais partagé)
real.push({id:'yl',couleur:'#ffff00'},{id:'ye',couleur:'#ffe699'},{id:'pk',couleur:'#fce4d6'}); // clairs illisibles
// des couleurs franches, uniques, DÉLIBÉRÉES (ne doivent JAMAIS être touchées)
real.push({id:'ok1',couleur:'#c0392b'},{id:'ok2',couleur:'#2980b9'},{id:'ok3',couleur:'#8e44ad'});
for(let i=real.length;i<30;i++)real.push({id:'x'+i,couleur:null}); // compléter à 30
const plan=planColorBackfill(real.map(s=>({...s})));
const planIds=new Set(plan.map(p=>p.id));
// appliquer le plan → couleur finale de chacun
const finalCol=id=>{const p=plan.find(x=>x.id===id); if(p)return p.to; return real.find(s=>s.id===id).couleur;};
const finals=real.map(s=>finalCol(s.id).toLowerCase());
t('rattrapage : 30 salariés → 0 NULL après application', finals.every(c=>/^#[0-9a-f]{6}$/.test(c)));
t('rattrapage : 30 couleurs finales toutes UNIQUES', new Set(finals).size===30);
t('rattrapage : toutes lisibles après application', finals.every(isReadableColor));
t('rattrapage : les couleurs délibérées uniques+lisibles NE sont PAS touchées', !planIds.has('ok1')&&!planIds.has('ok2')&&!planIds.has('ok3'));
t('rattrapage : le doublon #00b050 → une seule occurrence gardée, l\'autre réattribuée', (planIds.has('grn1')?1:0)+(planIds.has('grn2')?1:0)===1);
t('rattrapage : les 5 NULL sont réattribués', [0,1,2,3,4].every(i=>planIds.has('null'+i)));
t('rattrapage : les clairs illisibles (#ffff00/#ffe699/#fce4d6) sont réattribués', planIds.has('yl')&&planIds.has('ye')&&planIds.has('pk'));

// ── 4. colorNeedsAssign : discriminateur ──
t('colorNeedsAssign(null)=true', colorNeedsAssign(null)===true);
t('colorNeedsAssign(#888888 défaut)=true', colorNeedsAssign('#888888')===true);
t('colorNeedsAssign(#ffe699 illisible)=true', colorNeedsAssign('#ffe699')===true);
t('colorNeedsAssign(#c0392b franche)=false', colorNeedsAssign('#c0392b')===false);

// ── 5. UNICITÉ à grande échelle : 200 salariés vierges → 200 couleurs distinctes ──
const big=[]; for(let i=0;i<200;i++)big.push({id:'b'+i,couleur:null});
const bigPlan=planColorBackfill(big);
t('200 salariés vierges → 200 couleurs distinctes (palette + paliers, jamais de doublon)', new Set(bigPlan.map(p=>p.to.toLowerCase())).size===200);
t('200 : toutes lisibles', bigPlan.every(p=>isReadableColor(p.to)));

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

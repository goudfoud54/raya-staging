const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
function grab(name){const re=new RegExp("(?:async\\s+)?function "+name+"\\s*\\(");const i=h.search(re);if(i<0)throw"no "+name;let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
function gc(n){const m=h.match(new RegExp("const "+n+"\\s*=[^\\n]*"));return m[0].replace(/^const/,'var');}
eval(gc("_pmin")); eval(gc("_pdur"));
eval("global.snackPrioriteOf="+grab("snackPrioriteOf").replace(/^function/,'function')+";");
eval("global.isMultiSnack="+grab("isMultiSnack").replace(/^function/,'function')+";");
eval("global.weekMinutesOf="+grab("weekMinutesOf").replace(/^function/,'function')+";");
eval("global.weekHoursOf="+grab("weekHoursOf").replace(/^function/,'function')+";");
eval("global.hoursOnMorePrioritaryRestos="+grab("hoursOnMorePrioritaryRestos").replace(/^function/,'function')+";");
eval("global.snackPriorityGate="+grab("snackPriorityGate").replace(/^function/,'function')+";");
eval("global.isExp="+"()=>true;");
eval("global.sortCandidates="+grab("sortCandidates").replace(/^function/,'function')+";");
global.salById=id=>SAL[id];
const CAR='car',GC='gc',LOB='lob';
global.S={restos:[{id:CAR,nom:'Carnot'},{id:GC,nom:'Grand Coeur'},{id:LOB,nom:'Lobau'}],creneaux:[],allCreneauxWeek:[],salaries:[]};
function P(...prs){return prs.map((rid,i)=>({priorite:i+1,restaurant_id:rid}));}
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};

// candFor-like : gate then sort. On teste snackPriorityGate directement (le cœur de la règle).
function selectOnGC(ids){ global.SNACK={id:GC}; return snackPriorityGate(ids); }

// Setup helper
function reset(sals, cre){ SAL={}; sals.forEach(s=>SAL[s.id]=s); S.salaries=sals; S.allCreneauxWeek=cre||[]; S.creneaux=(cre||[]).filter(c=>c.restaurant_id===GC); }

// TEST 1 : 1 multi (P1=Carnot,P3=GC, sous min) + 1 mono GC, sur créneau GC → MONO gardé, multi gaté
reset([
  {id:'balde',nom:'BALDE',heures_min:35,est_multi:true,snacks_priorites:P(CAR,LOB,GC)}, // GC = priorité 3
  {id:'mono',nom:'Mono',heures_min:35,snacks_priorites:[{priorite:1,restaurant_id:GC}]}  // GC = priorité 1
],[]);
let g=selectOnGC(['balde','mono']);
console.log('  T1 kept:',g.kept,' gated:',g.gated);
t('multi P3 sous min + mono P1 sur GC → mono gardé, multi gaté (réservé principal)', g.kept.join()==='mono' && g.gated.join()==='balde');

// TEST 2 : mono absent → multi gardé (fallback (a))
reset([{id:'balde',nom:'BALDE',heures_min:35,est_multi:true,snacks_priorites:P(CAR,LOB,GC)}],[]);
g=selectOnGC(['balde']);
t('mono absent (aucun primaire) → multi admis en renfort (condition a)', g.kept.join()==='balde' && g.gated.length===0);

// TEST 3 : multi a atteint min sur Carnot (P1) → éligible sur GC même si un primaire existe
reset([
  {id:'balde',nom:'BALDE',heures_min:35,est_multi:true,snacks_priorites:P(CAR,LOB,GC)},
  {id:'mono',nom:'Mono',heures_min:35,snacks_priorites:[{priorite:1,restaurant_id:GC}]}
], [/* Carnot 35h pour BALDE : 7 jours x 5h */ ...[0,1,2,3,4,5,6].map(i=>({salarie_id:'balde',restaurant_id:CAR,heure_debut:'10:00',heure_fin:'15:00',date:'2026-07-2'+(7+i>9?''+(7+i):''+(7+i))}))]);
g=selectOnGC(['balde','mono']);
console.log('  T3 balde Carnot h:',hoursOnMorePrioritaryRestos(SAL.balde,3),' kept:',g.kept);
t('multi ayant atteint min sur Carnot → ÉLIGIBLE sur GC (condition b)', g.kept.includes('balde'));

// TEST 4 : multi sous min sur Carnot + primaire présent → NON éligible sur GC
reset([
  {id:'balde',nom:'BALDE',heures_min:35,est_multi:true,snacks_priorites:P(CAR,LOB,GC)},
  {id:'mono',nom:'Mono',heures_min:35,snacks_priorites:[{priorite:1,restaurant_id:GC}]}
], [{salarie_id:'balde',restaurant_id:CAR,heure_debut:'10:00',heure_fin:'15:00',date:'2026-07-27'}]); // 5h Carnot < 35
g=selectOnGC(['balde','mono']);
t('multi sous min Carnot + primaire présent → NON éligible GC (gaté)', !g.kept.includes('balde') && g.gated.includes('balde'));

// TEST 5 (RENFORT FALLBACK) : snack secondaire traité en 1er, plus de trous que de primaires → multi admis
// GC a 2 créneaux, 1 seul mono primaire. Après placement du mono sur le 1er, le 2e n'a plus de primaire éligible.
// On simule : pool éligible du 2e créneau = {balde} seul (mono déjà placé → dbl_svc l'exclut) → hasPrimary=false → admis.
reset([
  {id:'balde',nom:'BALDE',heures_min:35,est_multi:true,snacks_priorites:P(CAR,LOB,GC)}
],[]);
g=selectOnGC(['balde']); // pool sans primaire
t('renfort : secondaire traité 1er, plus de primaire éligible → multi admis (pas de trou vide)', g.kept.join()==='balde');

// TEST 6 : scoring — à manque égal, le P1 passe avant le P3 dans sortCandidates
global.SNACK={id:GC};
reset([
  {id:'p1',nom:'P1',heures_min:20,snacks_priorites:[{priorite:1,restaurant_id:GC}]},
  {id:'p3',nom:'P3',heures_min:20,est_multi:true,snacks_priorites:P(CAR,LOB,GC)}
],[]);
const sorted=sortCandidates(['p3','p1'],{shift:{}});
console.log('  T6 sorted:',sorted);
t('scoring : à manque égal, priorité snack domine → P1 avant P3', sorted[0]==='p1');

console.log(ok?'\nALL PASS':'\nSOME FAILED');

const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
function grab(name){const re=new RegExp("function "+name+"\\s*\\(");const i=h.search(re);let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
eval(h.match(/const _pmin\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval(h.match(/const fmtH1\s*=[^\n]*/)[0].replace(/^const/,'var'));
try{eval("global.otherSnackBreakdown="+grab("otherSnackBreakdown").replace(/^function/,'function')+";");}catch(e){}
try{eval("global.isMultiSnack="+grab("isMultiSnack").replace(/^function/,'function')+";");}catch(e){}
eval("global._toMin="+grab("_toMin").replace(/^function/,'function')+";");
try{eval("global.overlaps="+grab("overlaps").replace(/^function/,'function')+";");}catch(e){}
try{eval("global.weekMinutesOf="+grab("weekMinutesOf").replace(/^function/,'function')+";");}catch(e){}
try{eval("global._indispoBlocking="+grab("_indispoBlocking").replace(/^function/,'function')+";");}catch(e){}
eval("global.isMultiSnack="+grab("isMultiSnack").replace(/^function/,'function')+";");
eval("global.weekHoursOf="+grab("weekHoursOf").replace(/^function/,'function')+";");
eval("global.plafondOf="+grab("plafondOf").replace(/^function/,'function')+";");
eval("global.rowHoursCell="+grab("rowHoursCell").replace(/^function/,'function')+";");
global.salById=id=>SAL[id];
global.escP=s=>(''+(s==null?'':s)); // STUB : échappement HTML (pur) — rowHoursCell l'utilise pour le title.
global.SNACK={id:'lobau'};
global.SAL={sarah:{id:'sarah',heures_min:20,heures_max:39,est_multi:true,snacks_priorites:['lobau','gc']},
            bob:{id:'bob',heures_min:35,heures_max:39,est_multi:false}};
global.S={
  // restos requis par otherSnackBreakdown (S.restos.find) depuis f2eb648 (badge cumul multi-snack).
  restos:[{id:'lobau',nom:'Lobau'},{id:'gc',nom:'Grand Cœur'}],
  creneaux:[{salarie_id:'sarah',restaurant_id:'lobau',heure_debut:'10:30',heure_fin:'15:00'},
            {salarie_id:'sarah',restaurant_id:'lobau',heure_debut:'18:00',heure_fin:'22:30'}], // 9h current
  allCreneauxWeek:[]
};
S.allCreneauxWeek=[...S.creneaux,
  {salarie_id:'sarah',restaurant_id:'gc',heure_debut:'10:00',heure_fin:'18:00'},
  {salarie_id:'sarah',restaurant_id:'gc',heure_debut:'10:00',heure_fin:'17:00'},
  {salarie_id:'sarah',restaurant_id:'gc',heure_debut:'11:00',heure_fin:'18:00'}]; // +22 => 31 global
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};

let r=rowHoursCell(SAL.sarah);
console.log('  sarah:',JSON.stringify(r));
t('multi: couleur OK (green) via global 31h', r.color==='var(--ok)');
t('multi: chiffre principal = 9.0h snack courant', /^9\.0h/.test(r.html));
// Libellé COMPACT « Σ Xh » (le suffixe « tous snacks » a été retiré côté produit car il débordait sur petits
// écrans — cf. commentaire rowHoursCell ; le détail par snack est passé en title/tooltip). Assertion recalée.
t('multi: ligne Σ 31h (compact) présente', r.html.includes('Σ 31h</small>'));

// SIMULATE a mutation then recompute: add a Lobau créneau for sarah, both S.creneaux & allCreneauxWeek
S.creneaux.push({salarie_id:'sarah',restaurant_id:'lobau',heure_debut:'10:00',heure_fin:'14:00'}); //+4 => 13 current
S.allCreneauxWeek.push({salarie_id:'sarah',restaurant_id:'lobau',heure_debut:'10:00',heure_fin:'14:00'}); //global 35
r=rowHoursCell(SAL.sarah);
console.log('  sarah after add:',JSON.stringify(r));
t('après ajout: Σ recalculée 35h + couleur toujours OK', r.html.includes('Σ 35h</small>') && r.color==='var(--ok)' && /^13\.0h/.test(r.html));

r=rowHoursCell(SAL.bob);
S.creneaux=S.creneaux.filter(c=>c.salarie_id!=='bob');
r=rowHoursCell(SAL.bob); // bob has no créneaux -> 0h
console.log('  bob:',JSON.stringify(r));
t('mono bob: pas de ligne Σ (aucune ligne tous-snacks pour un mono)', !r.html.includes('Σ'));

console.log(ok?'\nALL PASS':'\nSOME FAILED');

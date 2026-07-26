const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
function grab(name){const re=new RegExp("function "+name+"\\s*\\(");const i=h.search(re);let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
eval(h.match(/const _pmin\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval("global.isMultiSnack="+grab("isMultiSnack").replace(/^function/,'function')+";");
eval("global.hasPonctuelleAbsence="+grab("hasPonctuelleAbsence").replace(/^function/,'function')+";");
eval("global.isSuspended="+grab("isSuspended").replace(/^function/,'function')+";");
eval("global.worksAt="+grab("worksAt").replace(/^function/,'function')+";");
global.onRoster=()=>true;
global.fullName=s=>s.nom;
global.salById=id=>SAL[id];
const fmtDate=d=>{const x=new Date(d);return x.toISOString().slice(0,10);};
global.dateOfDay=i=>new Date(new Date('2026-08-03T00:00:00').getTime()+i*86400000);

// exact consolidated underMin pass (mirror of autoFillMultiWeek tail)
function consolidatedUnderMin(ids){
  const underMin=[];
  const _weekDates=[0,1,2,3,4,5,6].map(i=>fmtDate(dateOfDay(i)));
  const globalHoursAll=sid=>S.allCreneauxWeek.filter(c=>c.salarie_id===sid && c.heure_debut).reduce((a,c)=>a+_pdur(c.heure_debut,c.heure_fin),0)/60;
  S.salaries.filter(s=>onRoster(s) && ids.some(rid=>worksAt(s,rid)) && (s.heures_min||0)>0).forEach(s=>{
    const have=globalHoursAll(s.id), mn=s.heures_min||0;
    if(have >= mn-0.01) return;
    const blocked=_weekDates.filter(d=>hasPonctuelleAbsence(s.id,d)||isSuspended(s.id,d)).length;
    const proratedMin=mn*(7-blocked)/7;
    if(have < proratedMin-0.01) underMin.push({name:fullName(s), have:+have.toFixed(1), min:mn, proratedMin:+proratedMin.toFixed(2)});
  });
  return underMin;
}
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const A='snackA',B='snackB';

// TEST 1 : Sarah multi, 20h sur A + 18h sur B = 38h global >= 35 → PAS listée
global.SAL={sarah:{id:'sarah',nom:'Sarah',heures_min:35,est_multi:true,snacks_priorites:[{restaurant_id:A},{restaurant_id:B}]}};
global.S={dispos:[],miseAPied:[],salaries:[SAL.sarah],
  allCreneauxWeek:[
    // A: 20h  (4 x 5h)
    ...[0,1,2,3].map(i=>({salarie_id:'sarah',restaurant_id:A,date:fmtDate(dateOfDay(i)),heure_debut:'10:00',heure_fin:'15:00'})),
    // B: 18h  (3 x 6h)
    ...[0,1,2].map(i=>({salarie_id:'sarah',restaurant_id:B,date:fmtDate(dateOfDay(i)),heure_debut:'17:00',heure_fin:'23:00'})),
  ]};
let r=consolidatedUnderMin([A,B]);
console.log('  T1 underMin:',JSON.stringify(r));
t('Sarah 20h(A)+18h(B)=38h global ≥35 → NON listée (pas de faux positif inter-snack)', r.length===0);

// TEST 2 : Bob MONO sur B, 22h sur B ≥ 20 min ; snack restauré = A → doit lire 22h global, PAS 0
global.SAL={bob:{id:'bob',nom:'Bob',heures_min:20,est_multi:false,snacks_priorites:[{restaurant_id:B}]}};
S.salaries=[SAL.bob];
S.allCreneauxWeek=[...[0,1,2,3].map(i=>({salarie_id:'bob',restaurant_id:B,date:fmtDate(dateOfDay(i)),heure_debut:'10:00',heure_fin:'15:30'}))]; // 4x5.5=22h
r=consolidatedUnderMin([A,B]);
console.log('  T2 underMin:',JSON.stringify(r));
t('Bob mono sur B 22h ≥20 (snack restauré A) → NON listé (heures globales, pas weekHoursOf)', r.length===0);

// TEST 3 : contrôle — un vrai sous-min doit rester listé (Bob 10h/20, aucune absence)
S.allCreneauxWeek=[...[0].map(i=>({salarie_id:'bob',restaurant_id:B,date:fmtDate(dateOfDay(i)),heure_debut:'10:00',heure_fin:'20:00'}))]; // 10h
r=consolidatedUnderMin([A,B]);
console.log('  T3 underMin:',JSON.stringify(r));
t('Bob 10h/20 sans absence → LISTÉ manque plein', r.length===1 && r[0].have===10 && Math.abs(r[0].proratedMin-20)<0.01);

console.log(ok?'\nALL PASS':'\nSOME FAILED');

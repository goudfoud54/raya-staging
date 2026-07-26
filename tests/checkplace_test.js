const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
function grab(name){const re=new RegExp("(?:async\\s+)?function "+name+"\\s*\\(");const i=h.search(re);if(i<0)throw"no "+name;let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}

// primitives from file
eval(h.match(/function _toMin[\s\S]*?\n}/)[0]);
eval("var _pmin=_toMin;"); // _pmin is used; check file defines it
// find _pmin definition
const pminDef=h.match(/const _pmin\s*=[^\n]*\n|function _pmin[\s\S]*?\n}/);
if(pminDef) eval(pminDef[0].replace(/^const /,'var '));
const pdur=h.match(/const _pdur\s*=[^\n]*/)[0]; eval(pdur.replace(/^const /,'var '));
eval("var _overlap="+grab("_overlap").replace(/^function _overlap/,'function')+";");

// stubs
global.fmtDate=d=>{const x=new Date(d);return x.toISOString().slice(0,10);};
global.salById=id=>SAL[id];
global.onRoster=()=>true;
global.worksAt=()=>true;
global.rolesOf=()=>['cuisine'];
global.isExp=()=>true;
global.altDayType=()=>null;
global.plafondOf=(sal,R)=>Number(sal.heures_max)||48;
global._ruleCtx=()=>RCTX;
const RCTX={ num:(k,d)=>({coupure_min:3,repos_quotidien_h:11,plafond_hebdo:48,amplitude_max:14,jour_off_min:1}[k]??d), raw:()=>null, on:(_,d)=>d };
global.PLACE_RULES={roster:'x',resto:'x',role:'x',exp:'x',indispo:'x',cfa:'x',dbl_svc:'x',inter_snack:'chevauchement',fin_veille_ecole:'x',fin_veille_examen:'x',fin_semaine:'x',fin_weekend:'x',coupure_min:'coupure',amplitude_max:'x',repos_quot:'repos',jour_off_min:'x',fin_2h_pas_matin:'x',plafond:'plafond'};
global._endCapMin=()=>null; // neutralise fin_semaine/weekend pour isoler
global.Math=Math;global.Date=Date;global.Set=Set;

const LOBAU='lobau', GC='grandcoeur';
global.SNACK={id:LOBAU};
global.SAL={ahmad:{id:'ahmad',heures_max:48,est_multi:true,snacks_priorites:[LOBAU,GC]}};
global.S={creneaux:[],allCreneauxWeek:[],dispos:[],restos:[{id:LOBAU,nom:'Raya Lobau'},{id:GC,nom:'Raya Grand Cœur'}]};

try{eval("global.isMultiSnack="+grab("isMultiSnack").replace(/^function/,'function')+";");}catch(e){}
try{eval("global.weekHoursOf="+grab("weekHoursOf").replace(/^function/,'function')+";");}catch(e){}
eval("global._toMin="+grab("_toMin").replace(/^function/,'function')+";");
try{eval("global.overlaps="+grab("overlaps").replace(/^function/,'function')+";");}catch(e){}
try{eval("global.weekMinutesOf="+grab("weekMinutesOf").replace(/^function/,'function')+";");}catch(e){}
try{eval("global._indispoBlocking="+grab("_indispoBlocking").replace(/^function/,'function')+";");}catch(e){}
eval("global.checkPlacement="+grab("checkPlacement").replace(/^function checkPlacement/,'function')+";");

function run(label, otherCre, cand, date, svc, di, opt, expect){
  S.allCreneauxWeek=otherCre.slice();
  S.creneaux=otherCre.filter(c=>c.restaurant_id===SNACK.id);
  const r=checkPlacement('ahmad',cand,date,svc,di,opt||{});
  const got = r===null?'NULL':r.cle;
  const ok = (expect==='NULL') ? (r===null) : (r&&r.cle===expect);
  console.log((ok?'PASS':'FAIL')+' · '+label+' → '+got+(r&&r.label?'  ["'+r.label+'"]':'')+'  (attendu '+expect+')');
  return ok;
}

const MON='2026-08-03', TUE='2026-08-04';
let all=true;
// 1) Ahmad Lundi : GC 10:30-18:00 déjà posé ; on tente Lobau 18:00-00:00 → coupure_min (gap 0)
all &= run('Ahmad Lun Lobau 18:00→00:00 après GC 10:30→18:00',
  [{salarie_id:'ahmad',restaurant_id:GC,date:MON,service:'midi',heure_debut:'10:30',heure_fin:'18:00'}],
  {deb:'18:00',fin:'00:00',role:'cuisine'}, MON,'soir',0,{manual:true},'coupure_min');
// 1b) même cas en auto-fill (manual:false) → doit aussi bloquer (point 2)
all &= run('Ahmad Lun (auto-fill, manual:false)',
  [{salarie_id:'ahmad',restaurant_id:GC,date:MON,service:'midi',heure_debut:'10:30',heure_fin:'18:00'}],
  {deb:'18:00',fin:'00:00',role:'cuisine'}, MON,'soir',0,{manual:false},'coupure_min');
// 2) Accept : Lobau finit 18:00, GC reprise 21:30 même jour → gap 3h30 > 3h → NULL
all &= run('Accept gap 3h30 (Lobau 15:00→18:00, GC 21:30→23:30)',
  [{salarie_id:'ahmad',restaurant_id:GC,date:MON,service:'soir',heure_debut:'21:30',heure_fin:'23:30'}],
  {deb:'15:00',fin:'18:00',role:'cuisine'}, MON,'midi',0,{manual:true},'NULL');
// 3) Cross-day repos : Lobau Lun soir 18:00→00:00, GC Mardi 08:00→14:00 → repos 8h<11h
all &= run('Repos inter-snack: candidate Lobau Lun 18:00→00:00, GC Mar 08:00→14:00',
  [{salarie_id:'ahmad',restaurant_id:GC,date:TUE,service:'midi',heure_debut:'08:00',heure_fin:'14:00'}],
  {deb:'18:00',fin:'00:00',role:'cuisine'}, MON,'soir',0,{manual:true},'repos_quot');
// 3b) Cross-day repos OK : GC Mardi 12:00→18:00 → gap from 00:00 to 12:00 = 12h ≥ 11h → NULL
all &= run('Repos OK cross-day 12h (candidate Lobau Lun 18:00→00:00, GC Mar 12:00→18:00)',
  [{salarie_id:'ahmad',restaurant_id:GC,date:TUE,service:'midi',heure_debut:'12:00',heure_fin:'18:00'}],
  {deb:'18:00',fin:'00:00',role:'cuisine'}, MON,'soir',0,{manual:true},'NULL');
// 4) No other-snack créneaux at all → NULL (mono behaviour untouched)
all &= run('Aucun autre snack → NULL',
  [],
  {deb:'18:00',fin:'00:00',role:'cuisine'}, MON,'soir',0,{manual:true},'NULL');
console.log(all?'\nALL PASS':'\nSOME FAILED');

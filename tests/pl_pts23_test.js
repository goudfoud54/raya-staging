const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installScopeStub();   // EatimeScope.from() délègue au stub sb (cf. plprims.js)
function grab(name){const re=new RegExp("(?:async\\s+)?function "+name+"\\s*\\(");const i=h.search(re);let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
eval(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval(h.match(/const fmtH1\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval(h.match(/const _pmin\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval("global.isMultiSnack="+grab("isMultiSnack").replace(/^function/,'function')+";");
// weekHoursOf délègue à weekMinutesOf depuis 0dee020 (plafond heures_max inter-snack) — on extrait la VRAIE
// weekMinutesOf plutôt que de la réimplémenter, sinon weekHoursOf référence une fonction absente.
eval("global.weekMinutesOf="+grab("weekMinutesOf").replace(/^function/,'function')+";");
eval("global.weekHoursOf="+grab("weekHoursOf").replace(/^function/,'function')+";");
eval("global.plafondOf="+grab("plafondOf").replace(/^function/,'function')+";");
global.salById=id=>SAL[id];
global._ruleCtx=()=>({num:(k,d)=>d});

let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};

// ===== POINT 2 : couleur basée sur weekHoursOf (inter-snack), pas S.creneaux =====
global.SNACK={id:'lobau'};
global.SAL={sarah:{id:'sarah',heures_min:20,heures_max:39,est_multi:true,snacks_priorites:['lobau','gc']}};
// current snack (Lobau) only 9h ; other snack (GC) 22h ; global 31h -> within [20,39] => ok(green)
global.S={
  creneaux:[{salarie_id:'sarah',restaurant_id:'lobau',heure_debut:'10:30',heure_fin:'15:00'},   // 4.5
            {salarie_id:'sarah',restaurant_id:'lobau',heure_debut:'18:00',heure_fin:'22:30'}],   // 4.5 => 9h
  allCreneauxWeek:[]
};
S.allCreneauxWeek=[...S.creneaux,
  {salarie_id:'sarah',restaurant_id:'gc',heure_debut:'10:30',heure_fin:'18:00'},  // 7.5
  {salarie_id:'sarah',restaurant_id:'gc',heure_debut:'10:30',heure_fin:'18:00',date:'x'}, // dummy add? keep simple
];
// replicate the color block exactly
function colorOf(s){
  const totMin=S.creneaux.filter(c=>c.salarie_id===s.id).reduce((a,c)=>a+_pdur(c.heure_debut,c.heure_fin),0);
  const totH=totMin/60;
  const minH=s.heures_min||0, maxH=plafondOf(s);
  const globalH=weekHoursOf(s.id);
  let color='text';
  if(maxH && globalH>maxH)color='bad';
  else if(minH && globalH<minH)color='warn';
  else if(globalH>0)color='ok';
  return {totH, globalH, color, showLine:isMultiSnack(s)};
}
// make GC contribute 22h: 3 GC shifts
S.allCreneauxWeek=[...S.creneaux,
  {salarie_id:'sarah',restaurant_id:'gc',heure_debut:'10:00',heure_fin:'18:00'}, //8
  {salarie_id:'sarah',restaurant_id:'gc',heure_debut:'10:00',heure_fin:'17:00'}, //7
  {salarie_id:'sarah',restaurant_id:'gc',heure_debut:'11:00',heure_fin:'18:00'}, //7
];
let c=colorOf(SAL.sarah);
console.log('  sarah:',JSON.stringify(c));
t('multi-snack Lobau 9h mais global 31h ∈[20,39] → couleur OK (pas warn)', c.color==='ok' && Math.abs(c.totH-9)<0.01 && Math.abs(c.globalH-31)<0.01 && c.showLine===true);

// mono-snack under min -> warn (unchanged), no line
global.SAL.bob={id:'bob',heures_min:35,heures_max:39,est_multi:false};
S.creneaux=[{salarie_id:'bob',restaurant_id:'lobau',heure_debut:'10:00',heure_fin:'18:00'}]; //8h
S.allCreneauxWeek=[...S.creneaux];
c=colorOf(SAL.bob);
console.log('  bob:',JSON.stringify(c));
t('mono-snack 8h/35 → warn, pas de ligne tous-snacks', c.color==='warn' && c.showLine===false && Math.abs(c.globalH-8)<0.01);

// ===== POINT 3 : purge batch + undo =====
global.UNDO=[];global.REDO=[];global._txn=null;
global.updateUndoBtns=()=>{};
eval("global.beginTxn="+grab("beginTxn").replace(/^function/,'function')+";");
eval("global.endTxn="+grab("endTxn").replace(/^function/,'function')+";");
eval("global.recordAction="+grab("recordAction").replace(/^function/,'function')+";");
let DELETED=[], UPSERTED=[];
global.sb={from:()=>({delete:()=>({eq:()=>({eq:()=>({eq:()=>({eq:()=>Promise.resolve({})})}),then:undefined})||Promise.resolve({})}),upsert:(row)=>{UPSERTED.push(row);return Promise.resolve({});}})};
// simpler sb: delete().eq('id',..) returns promise; upsert returns promise
global.sb={from:()=>({
  delete:()=>({eq:(k,v)=>{DELETED.push(v);return Promise.resolve({});}}),
  upsert:(row)=>{UPSERTED.push(row);return Promise.resolve({});}
})};
eval("global.removeCreneau="+grab("removeCreneau").replace(/^function/,'function')+";");
eval("global.applyAction="+grab("applyAction").replace(/^function/,'function')+";");
S.creneaux=[
  {id:'r1',restaurant_id:'lobau',salarie_id:'a',date:'2026-08-03',service:'midi',heure_debut:'10:00',heure_fin:'14:00'},
  {id:'r2',restaurant_id:'lobau',salarie_id:'a',date:'2026-08-03',service:'soir',heure_debut:'18:00',heure_fin:'22:00'},
  {id:'r3',restaurant_id:'lobau',salarie_id:'b',date:'2026-08-04',service:'midi',heure_debut:'10:00',heure_fin:'14:00'},
];
S.allCreneauxWeek=[...S.creneaux];
(async()=>{
  const rows=S.creneaux.slice();
  beginTxn();
  for(const row of rows) await removeCreneau(row);
  endTxn();
  t('purge: 3 créneaux supprimés en base', DELETED.length===3 && DELETED.join(',')==='r1,r2,r3');
  t('purge: S.creneaux vidé', S.creneaux.length===0 && S.allCreneauxWeek.length===0);
  t('purge: UNDO = 1 batch de 3 entrées {before,after:null}', UNDO.length===1 && UNDO[0].length===3 && UNDO[0].every(e=>e.after===null && e.before&&e.before.id));
  // simulate undo: re-upsert each before
  UPSERTED=[];
  for(const a of [...UNDO[0]].reverse()) await applyAction(a,-1);
  t('undo: réinsère les 3 créneaux (upsert before)', UPSERTED.length===3 && UPSERTED.map(u=>u.id).sort().join(',')==='r1,r2,r3');

  console.log(ok?'\nALL PASS':'\nSOME FAILED');
})();

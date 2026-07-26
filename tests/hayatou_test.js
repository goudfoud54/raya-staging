const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
const {extractFn}=require("./extract.js"); const grab=name=>extractFn(h,name);
global._contrainteBlocking=()=>null; global.contrOf=()=>[]; // pas de contrainte perso dans ces scénarios
function gc(n){const m=h.match(new RegExp("const "+n+"\\s*=[^\\n]*"));return m?m[0].replace(/^const/,'var'):null;}
// primitives
for(const n of ['_pmin','_pdur','DEF_TIME','fmtH1']) { const g=gc(n); if(g) eval(g.replace(/^var /,'global.').replace('=', '=')); }
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
// extract solver functions
for(const fn of ['_toMin','overlaps','_indispoBlocking','_endCapMin','_ruleCtx','isMultiSnack','weekMinutesOf','weekHoursOf','snackPrioriteOf','hoursOnMorePrioritaryRestos','snackPriorityGate','sureffBlockedByPriority','sortCandidates','plafondOf','getShifts','hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement','dayJourType','snackTargetSlots','hasEffectifsConfig','removeCreneau','autoFillCore','autoFillMultiWeek']){
  try{ eval("global."+fn+"="+grab(fn).replace(/^(async )?function/,'$1function')+";"); }catch(e){ console.log('MISS',fn,e.message||e); }
}
eval("global."+gc("PLACE_RULES").slice(4).replace(/^/,''));  // PLACE_RULES
// ── in-memory store + sb stub ──
let STORE=[]; let _id=1;
const clone=o=>JSON.parse(JSON.stringify(o));
global.sb={ from(){ return new Q(); } };
class Q{ constructor(){this.op=null;this.payload=null;this.filters={};this._in=null;}
  upsert(p){this.op='upsert';this.payload=p;return this;}
  update(p){this.op='update';this.payload=p;return this;}
  delete(){this.op='delete';return this;}
  select(){return this;} single(){ return Promise.resolve(this._run()); }
  eq(k,v){this.filters[k]=v;return this;} in(k,arr){this._in={k,arr};return this;}
  then(res){ return Promise.resolve(this._run()).then(res); }
  _run(){
    if(this.op==='upsert'){ const p=this.payload; const idx=STORE.findIndex(c=>c.restaurant_id===p.restaurant_id&&c.salarie_id===p.salarie_id&&c.date===p.date&&c.service===p.service);
      let row; if(idx>=0){ row=Object.assign(STORE[idx],p); } else { row=Object.assign({id:'g'+(_id++)},p); STORE.push(row);} return {data:clone(row),error:null}; }
    if(this.op==='update'){ const row=STORE.find(c=>c.id===this.filters.id); if(row)Object.assign(row,this.payload); return {data:row?clone(row):null,error:null}; }
    if(this.op==='delete'){ if(this._in){ STORE=STORE.filter(c=>!this._in.arr.includes(c[this._in.k])); } else { STORE=STORE.filter(c=>c.id!==this.filters.id); } return {data:null,error:null}; }
    return {data:null,error:null};
  }
}
// ── env stubs ──
global.window={performance:{now:()=>Date.now()}};
global.document={getElementById:()=>({value:'',style:{},textContent:'',innerHTML:''}),querySelectorAll:()=>[]};
global.confirm=()=>true; global.setSS=()=>{}; global._yield=()=>Promise.resolve();
global.showAutofillOverlay=()=>{};global.hideAutofillOverlay=()=>{};global.updateAutofillProgress=()=>{};
global.showSolveReport=()=>{};global.showMultiSolveReport=()=>{};global._afMulti=null;global._afTitle=null;
global.beginTxn=()=>{global._txn=[];};global.endTxn=()=>{global._txn=null;};global.recordAction=()=>{};global.updateUndoBtns=()=>{};
global._txn=null; global._autofillRunning=false;
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.MONDAY=new Date('2026-08-03T00:00:00');
global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.onRoster=()=>true; global.altDayType=()=>null; global.roleNom=c=>c; global.fullName=s=>s.nom;
global.salById=id=>SAL[id]; global.rolesOf=id=>SAL[id].roles||[]; global.isExp=(id,cle)=>{const s=SAL[id];return (s.exp||[]).includes(cle);};
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.loadWeek=async()=>{ S.creneaux=STORE.filter(c=>c.restaurant_id===SNACK.id).map(clone); S.allCreneauxWeek=STORE.map(clone); };
// ── SCENARIO Hayatou ──
const A='carnot',B='gc';  // A=P1 de BALDE, B=P3
global.SAL={};
function mk(o){SAL[o.id]=o;return o;}
const sals=[
  mk({id:'balde',nom:'BALDE',roles:['cuisine'],exp:['cuisine'],est_multi:true,heures_min:15,heures_max:45,snacks_priorites:[{priorite:1,restaurant_id:A},{priorite:3,restaurant_id:B}]}),
  mk({id:'bp1',nom:'BPrim1',roles:['cuisine'],exp:['cuisine'],snack_origine_id:B,heures_min:20,heures_max:45,snacks_priorites:[{priorite:1,restaurant_id:B}]}),
  mk({id:'bp2',nom:'BPrim2',roles:['cuisine'],exp:['cuisine'],snack_origine_id:B,heures_min:20,heures_max:45,snacks_priorites:[{priorite:1,restaurant_id:B}]}),
];
// Effectifs : A (Carnot) cuisine midi 1 poste exp★ 10:00-14:00 chaque jour (Lu-Me,Je,Ve...) — seul BALDE peut (aucun A-primary)
// B (GC) cuisine midi 2 postes 10:00-14:00 — bp1/bp2 les remplissent. B a PLUS de slots → traité en 1er.
function effAll(rid,role,nb,vagues){ return [0].map(()=>0), null; }
global.S={restos:[{id:A,nom:'Raya Carnot'},{id:B,nom:'Raya Grand Coeur'}],salaries:sals,orgRoles:[{cle:'cuisine',nom:'Cuisine'}],
  dispos:[], miseAPied:[], regles:[{cle:'sureffectif_minimum',active:true,valeur:'2'}], creneaux:[], allCreneauxWeek:[],
  effectifs:[
    // A cuisine midi 1 poste exp chaque jour-type
    {restaurant_id:A,jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:1,vagues:[{deb:'10:00',fin:'14:00',exp:true}]},
    {restaurant_id:A,jour_type:'Je',service:'midi',role:'cuisine',nb_cible:1,vagues:[{deb:'10:00',fin:'14:00',exp:true}]},
    {restaurant_id:A,jour_type:'Ve',service:'midi',role:'cuisine',nb_cible:1,vagues:[{deb:'10:00',fin:'14:00',exp:true}]},
    // B cuisine midi 2 postes chaque jour-type (plus de slots → B ordonné 1er)
    {restaurant_id:B,jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:2,vagues:[{deb:'10:00',fin:'14:00',exp:false},{deb:'10:00',fin:'14:00',exp:false}]},
    {restaurant_id:B,jour_type:'Je',service:'midi',role:'cuisine',nb_cible:2,vagues:[{deb:'10:00',fin:'14:00',exp:false},{deb:'10:00',fin:'14:00',exp:false}]},
    {restaurant_id:B,jour_type:'Ve',service:'midi',role:'cuisine',nb_cible:2,vagues:[{deb:'10:00',fin:'14:00',exp:false},{deb:'10:00',fin:'14:00',exp:false}]},
    {restaurant_id:B,jour_type:'Sa',service:'midi',role:'cuisine',nb_cible:2,vagues:[{deb:'10:00',fin:'14:00',exp:false},{deb:'10:00',fin:'14:00',exp:false}]},
  ]};
global.SNACK={id:A,nom:'Raya Carnot'};
(async()=>{
  console.log('snackTargetSlots A=',snackTargetSlots(A),' B=',snackTargetSlots(B),'→ ordre traité (desc):', [A,B].sort((x,y)=>snackTargetSlots(y)-snackTargetSlots(x)).join(','));
  await autoFillMultiWeek([A,B]);
  // Analyse du store final
  const baldeCre=STORE.filter(c=>c.salarie_id==='balde');
  const baldeA=baldeCre.filter(c=>c.restaurant_id===A), baldeB=baldeCre.filter(c=>c.restaurant_id===B);
  const baldeBsureff=baldeB.filter(c=>c.sureffectif);
  const hA=baldeA.reduce((a,c)=>a+_pdur(c.heure_debut,c.heure_fin),0)/60;
  const hB=baldeB.reduce((a,c)=>a+_pdur(c.heure_debut,c.heure_fin),0)/60;
  console.log('\nBALDE : Carnot(A/P1)='+hA+'h ('+baldeA.length+' créneaux) · GrandCoeur(B/P3)='+hB+'h ('+baldeB.length+' créneaux, dont '+baldeBsureff.length+' sureff)');
  let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
  t('BALDE est servi sur son P1 Carnot (hA>0)', hA>0);
  t('AUCUN sureffectif de BALDE sur son P3 Grand Cœur', baldeBsureff.length===0);
  t('BALDE atteint son min (15h) globalement', (hA+hB)>=15-0.01);
  console.log(ok?'\nALL PASS — le sureffectif ne vole plus le P1':'\nSOME FAILED');
})();

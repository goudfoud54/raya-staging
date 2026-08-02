// v0.52 — Transfert INTER-snack = opt-in (défaut OFF), dernier recours, signalé. Fonctions RÉELLES.
const fs=require("fs");const {extractFn}=require("./extract.js");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);   // constantes/helpers de fichier (F2H_*, _finAbsM, _restoNom)
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
const grab=n=>extractFn(h,n);
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
for(const fn of ['_toMin','overlaps','_overlap','targetFor','_indispoBlocking','_endCapMin','_ruleCtx','isMultiSnack','weekMinutesOf','weekHoursOf','snackPrioriteOf','hoursOnMorePrioritaryRestos','snackPriorityGate','sureffBlockedByPriority','sortCandidates','plafondOf','getShifts','getCreneau','_creCoversMin','hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement','dayJourType','removeCreneau','autoFillCore','buildPhase3Report','suggestFor','suggestLineHtml','_multiSnackOrg','_snkSuffix']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j;
  for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}
  eval("global.PLACE_RULES="+h.slice(st,j)+";"); }
let STORE=[]; let _id=1; const clone=o=>JSON.parse(JSON.stringify(o));
class Q{ constructor(){this.op=null;this.payload=null;this.filters={};this._in=null;}
  upsert(p){this.op='upsert';this.payload=p;return this;} update(p){this.op='update';this.payload=p;return this;} delete(){this.op='delete';return this;}
  select(){return this;} single(){return Promise.resolve(this._run());} eq(k,v){this.filters[k]=v;return this;} in(k,a){this._in={k,a};return this;} then(r){return Promise.resolve(this._run()).then(r);}
  _run(){ if(this.op==='upsert'){const p=this.payload;const i=STORE.findIndex(c=>c.restaurant_id===p.restaurant_id&&c.salarie_id===p.salarie_id&&c.date===p.date&&c.service===p.service);let row;if(i>=0)row=Object.assign(STORE[i],p);else{row=Object.assign({id:'g'+(_id++)},p);STORE.push(row);}return {data:clone(row),error:null};}
    if(this.op==='update'){const row=STORE.find(c=>c.id===this.filters.id);if(row)Object.assign(row,this.payload);return {data:row?clone(row):null,error:null};}
    if(this.op==='delete'){if(this._in)STORE=STORE.filter(c=>!this._in.a.includes(c[this._in.k]));else STORE=STORE.filter(c=>c.id!==this.filters.id);return {data:null,error:null};} return {data:null,error:null}; } }
global.sb={from(){return new Q();}};
global.window={performance:{now:()=>Date.now()}};
global.document={getElementById:()=>({value:'',style:{},textContent:'',innerHTML:''}),querySelectorAll:()=>[]};
global.setSS=(k,m)=>{if(k==='err')console.error('>>> AUTOFILL ERR:',m);};global._yield=()=>Promise.resolve();global.showAutofillOverlay=()=>{};global.hideAutofillOverlay=()=>{};global.updateAutofillProgress=()=>{};global.showSolveReport=()=>{};global._afMulti=null;
global.beginTxn=()=>{global._txn=[];};global.endTxn=()=>{global._txn=null;};global.recordAction=()=>{};global.updateUndoBtns=()=>{};global._txn=null;global._autofillRunning=false;
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.MONDAY=new Date('2026-08-03T00:00:00'); global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.onRoster=()=>true;global.altDayType=()=>null;global.roleNom=c=>c;global.fullName=s=>s.nom;global.ORG={coef_charges:1.42};global.escP=s=>(''+(s==null?'':s));
global.salById=id=>SAL[id];global.rolesOf=id=>SAL[id].roles||[];global.isExp=(id,c)=>(SAL[id].exp||[]).includes(c);
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.loadWeek=async()=>{S.creneaux=STORE.filter(c=>c.restaurant_id===SNACK.id).map(clone);S.allCreneauxWeek=STORE.map(clone);};
function D(i){return fmtDate(dateOfDay(i));}
function run(scn, cb){
  STORE=scn.store.map(c=>Object.assign({id:'s'+(_id++)},c));
  global.SAL={}; scn.sals.forEach(s=>{ if(!s.snacks_priorites) s.snacks_priorites=[{priorite:1,restaurant_id:scn.snack}]; SAL[s.id]=s; });
  global.SNACK=scn.restos.find(r=>r.id===scn.snack);
  global.S={restos:scn.restos,salaries:scn.sals,orgRoles:[{cle:'cuisine',nom:'Cuisine'}],dispos:scn.dispos||[],miseAPied:[],
    regles:scn.regles||[{cle:'sureffectif_minimum',active:false,valeur:'2'}],effectifs:scn.eff,
    creneaux:STORE.filter(c=>c.restaurant_id===scn.snack).map(clone),allCreneauxWeek:STORE.map(clone)};
  return cb().then(r=>{global._lastP3=r&&r.phase3;return r;});
}
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const dur=(c)=>_pdur(c.heure_debut,c.heure_fin)/60;
const hoursOf=id=>STORE.filter(c=>c.salarie_id===id).reduce((a,c)=>a+dur(c),0);
const GC='GC', LO='LO'; const RESTOS=[{id:GC,nom:'Grand Cœur'},{id:LO,nom:'Lobau'}];
const effFor=(rid,cible)=>[
  {restaurant_id:rid,jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:cible,vagues:[{deb:'10:00',fin:'15:00',exp:false}]},
  {restaurant_id:rid,jour_type:'Je',service:'midi',role:'cuisine',nb_cible:cible,vagues:[{deb:'10:00',fin:'15:00',exp:false}]},
  {restaurant_id:rid,jour_type:'Ve',service:'midi',role:'cuisine',nb_cible:cible,vagues:[{deb:'10:00',fin:'15:00',exp:false}]},
];
// Config Moumouni/Haider : Moumouni multi (P1=GC, P2=Lobau) 15h à GC (manque 5), Haider donneur à Lobau, surplus.
const moumouniScn=(regles)=>({restos:RESTOS,snack:LO,regles,
  sals:[{id:'mou',nom:'Moumouni',roles:['cuisine'],exp:['cuisine'],heures_min:20,heures_max:25,est_multi:true,
           snacks_priorites:[{priorite:1,restaurant_id:GC},{priorite:2,restaurant_id:LO}]},
        {id:'hai',nom:'Haider',roles:['cuisine'],exp:['cuisine'],heures_min:35,heures_max:45,
           snacks_priorites:[{priorite:1,restaurant_id:LO}]}],
  eff:[...effFor(GC,2),
       {restaurant_id:LO,jour_type:'Je',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]},
       {restaurant_id:LO,jour_type:'Ve',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]},
       {restaurant_id:LO,jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]}],
  store:[
    {restaurant_id:GC,salarie_id:'mou',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
    {restaurant_id:GC,salarie_id:'mou',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
    {restaurant_id:GC,salarie_id:'mou',date:D(2),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 15h, manque 5
    {restaurant_id:LO,salarie_id:'hai',date:D(0),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
    {restaurant_id:LO,salarie_id:'hai',date:D(1),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
    {restaurant_id:LO,salarie_id:'hai',date:D(2),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
    {restaurant_id:LO,salarie_id:'hai',date:D(3),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
    {restaurant_id:LO,salarie_id:'hai',date:D(4),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
    {restaurant_id:LO,salarie_id:'hai',date:D(3),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 45h surplus 10
  ]});
const P3ONLY={silent:true,phase3only:true,globalUnfilled:[]};

(async()=>{
  // ═══ TEST 1 — RÉGLAGE DÉSACTIVÉ (DÉFAUT) : cas Moumouni/Haider → AUCUN transfert inter-snack, SUGGESTION ═══
  await run(moumouniScn(undefined),()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY)); // pas de regle transfert_inter_snack → OFF
  const mouLO=STORE.filter(c=>c.salarie_id==='mou'&&c.restaurant_id===LO);
  const sugg=((global._lastP3||{}).suggestList||[]).filter(x=>x.sid==='mou');
  const suggLO=sugg.flatMap(x=>x.cands||[]).some(c=>c.snackId===LO);
  console.log('  T1 Moumouni@Lobau:',mouLO.length,'| total',hoursOf('mou')+'h | suggestions',sugg.length,'| transferH',(global._lastP3||{}).transferH);
  t('T1 défaut OFF → AUCUN créneau créé pour Moumouni à Lobau (pas de déplacement inter-établissement)', mouLO.length===0);
  t('T1b Moumouni reste sous son min (15h < 20h) — laissé au patron', hoursOf('mou')<20-0.01);
  t('T1c aucun transfert inter-snack appliqué', ((global._lastP3||{}).transferList||[]).filter(x=>x.inter).length===0);
  t('T1d Moumouni apparaît en SUGGESTION avec un créneau à Lobau (visible, non appliqué)', sugg.length>=1 && suggLO);

  // ═══ TEST 2 — RÉGLAGE DÉSACTIVÉ : un transfert INTRA-snack reste AUTOMATIQUE (non-régression) ═══
  // Kalifa mono à Lobau, 15h (min 20), donneur Said même snack, surplus. OFF ne doit PAS bloquer l'intra.
  await run({restos:[{id:LO,nom:'Lobau'}],snack:LO,
    sals:[{id:'kal',nom:'Kalifa',roles:['cuisine'],exp:['cuisine'],heures_min:20,heures_max:35},
          {id:'said',nom:'Said',roles:['cuisine'],exp:['cuisine'],heures_min:25,heures_max:45}], // 31h → surplus 6
    eff:[{restaurant_id:LO,jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:2,vagues:[{deb:'10:00',fin:'15:00'}]},
         {restaurant_id:LO,jour_type:'Je',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]},
         {restaurant_id:LO,jour_type:'Ve',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]}],
    store:[
      {restaurant_id:LO,salarie_id:'kal',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:LO,salarie_id:'kal',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:LO,salarie_id:'kal',date:D(2),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 15h
      {restaurant_id:LO,salarie_id:'said',date:D(3),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
      {restaurant_id:LO,salarie_id:'said',date:D(4),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
      {restaurant_id:LO,salarie_id:'said',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:LO,salarie_id:'said',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:LO,salarie_id:'said',date:D(2),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 31h surplus
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY)); // pas de regle inter → OFF
  const kalT=(global._lastP3||{}).transferList||[];
  console.log('  T2 Kalifa',hoursOf('kal')+'h | transferH',(global._lastP3||{}).transferH,'| lignes',JSON.stringify(kalT.map(x=>({inter:x.inter,h:x.h}))));
  t('T2 transfert INTRA-snack appliqué automatiquement même réglage OFF (Kalifa progresse)', (global._lastP3.transferH||0)>0.01);
  t('T2b la ligne de transfert est bien intra (inter=false)', kalT.length>=1 && kalT.every(x=>x.inter===false));

  // ═══ TEST 3 — RÉGLAGE ACTIVÉ : le transfert inter-snack se fait, tagué inter + encart d'avertissement ═══
  await run(moumouniScn([{cle:'transfert_inter_snack',active:true},{cle:'sureffectif_minimum',active:false}]),
    ()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const mouLO3=STORE.filter(c=>c.salarie_id==='mou'&&c.restaurant_id===LO);
  const tl=(global._lastP3||{}).transferList||[];
  console.log('  T3 Moumouni@Lobau:',mouLO3.map(c=>c.date.slice(8)+' '+dur(c)+'h').join(' | '),'| total',hoursOf('mou')+'h | inter lignes',tl.filter(x=>x.inter).length);
  t('T3 réglage ON → Moumouni reçoit un créneau à Lobau (transfert inter-snack)', mouLO3.length>=1);
  t('T3b Moumouni atteint (ou approche) son min 20h', hoursOf('mou')>=20-0.01);
  t('T3c transfert tagué inter=true + snack=Lobau', tl.some(x=>x.inter===true&&x.snackId===LO));
  t('T3d bloc reçu ≥ 3h (pas de fragment)', mouLO3.every(c=>dur(c)>=3-1e-6));
  { global.S={restos:RESTOS}; const rep=buildPhase3Report((global._lastP3||{}),true);
    t('T3e encart d\'avertissement « déplacé(s) vers un autre restaurant » présent', /déplacé\(s\) vers un autre restaurant/.test(rep.interWarn));
    t('T3f ligne inter mentionne « ⚠ à Lobau » + déplacement inter-établissement', /⚠ à Lobau/.test(rep.phase3Section)&&/inter-établissement/.test(rep.phase3Section)); }

  // ═══ TEST 4 — TOUTES LES LIGNES MENTIONNENT LE RESTAURANT quand l'org a plusieurs snacks ═══
  global.S={restos:RESTOS}; // 2 snacks → suffixe restaurant activé
  const rep4=buildPhase3Report({rallongeH:1,sureffH:0,transferH:3,rallongeEur:20,sureffEur:0,
    transferList:[{from:'Said',to:'Kalifa',date:D(1),svc:'midi',h:3,snack:'Grand Cœur',snackId:GC,inter:false}],
    rallongeList:[{name:'Zed',date:D(0),svc:'midi',oldDeb:'11:30',oldFin:'14:30',newDeb:'11:30',newFin:'15:00',h:0.5,snack:'Lobau',snackId:LO}],
    overflowList:[]}, true);
  t('T4 ligne de transfert intra mentionne le restaurant (Grand Cœur)', /reçoit/.test(rep4.phase3Section)&&/Grand Cœur/.test(rep4.phase3Section));
  t('T4b ligne de rallonge mentionne le restaurant (Lobau)', /Zed/.test(rep4.phase3Section)&&/Lobau/.test(rep4.phase3Section));
  const sgHtml=suggestLineHtml(suggestFor('x',[{sid:'x',eur:50,cands:[{jour:'Jeudi',svc:'soir',deb:'18:00',fin:'21:00',cible:2,snack:'Lobau',snackId:LO}]}]));
  t('T4c ligne de suggestion mentionne le restaurant (Lobau)', /Lobau/.test(sgHtml));
  // Gap #1 : ligne de sureffectif (mode auto) doit aussi localiser le restaurant.
  const repSureff=buildPhase3Report({sureffH:4,sureffEur:60,sureffList:[{name:'W',date:D(0),svc:'soir',role:'cuisine',h:4,snack:'Grand Cœur',snackId:GC}]},true);
  t('T4e ligne de sureffectif mentionne le restaurant (Grand Cœur)', /🟡/.test(repSureff.phase3Section)&&/Grand Cœur/.test(repSureff.phase3Section));
  // Gap #2 : suggestFor fusionne par sid SANS écraser deux restaurants au même créneau horaire (clé inclut snackId).
  const sgMerged=suggestFor('y',[
    {sid:'y',eur:50,cands:[{jour:'Jeudi',svc:'midi',deb:'10:00',fin:'15:00',cible:2,snack:'Grand Cœur',snackId:GC}]},
    {sid:'y',eur:40,cands:[{jour:'Jeudi',svc:'midi',deb:'10:00',fin:'15:00',cible:2,snack:'Lobau',snackId:LO}]}]);
  t('T4f suggestFor : deux restaurants au même créneau horaire NE se collapsent PAS (2 candidats)', sgMerged.cands.length===2 && sgMerged.cands.some(c=>c.snackId===GC) && sgMerged.cands.some(c=>c.snackId===LO));
  // Mono-snack : pas de suffixe restaurant (évite le bruit)
  global.S={restos:[{id:LO,nom:'Lobau'}]};
  const repMono=buildPhase3Report({transferH:3,transferList:[{from:'A',to:'B',date:D(1),svc:'midi',h:3,snack:'Lobau',snackId:LO,inter:false}]},true);
  t('T4d mono-snack : la ligne de transfert n\'ajoute PAS le restaurant (redondant)', !/· Lobau/.test(repMono.phase3Section));

  console.log(ok?'\nALL PASS':'\nSOME FAILED');
  process.exit(ok?0:1);
})();

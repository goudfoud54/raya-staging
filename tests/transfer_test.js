// Transfert phase 3 v0.47 — anti-fragmentation (créneau créé ≥ SEG_MIN, défaut 3h), rallonge-first,
// anti-chaîne, plafond dépassement effectif +1, inter/intra-snack. Fonctions RÉELLES extraites.
const fs=require("fs");const {extractFn}=require("./extract.js");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
const grab=n=>extractFn(h,n);
global._contrainteBlocking=()=>null; global.contrOf=()=>[]; // pas de contrainte perso dans ces scénarios
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
for(const fn of ['_toMin','overlaps','_overlap','targetFor','_indispoBlocking','_endCapMin','_ruleCtx','isMultiSnack','weekMinutesOf','weekHoursOf','snackPrioriteOf','hoursOnMorePrioritaryRestos','snackPriorityGate','sureffBlockedByPriority','sortCandidates','plafondOf','getShifts','getCreneau','_creCoversMin','hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement','dayJourType','removeCreneau','autoFillCore','buildPhase3Report','_multiSnackOrg','_snkSuffix']){
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
// run(scn): scn.restos (list), scn.snack (id à traiter), scn.sals, scn.eff (avec restaurant_id), scn.store (avec restaurant_id), scn.dispos, scn.regles
function run(scn, cb){
  STORE=scn.store.map(c=>Object.assign({id:'s'+(_id++)},c));
  global.SAL={}; scn.sals.forEach(s=>{ if(!s.snacks_priorites) s.snacks_priorites=[{priorite:1,restaurant_id:scn.snack}]; SAL[s.id]=s; });
  global.SNACK=scn.restos.find(r=>r.id===scn.snack);
  global.S={restos:scn.restos,salaries:scn.sals,orgRoles:[{cle:'cuisine',nom:'Cuisine'}],dispos:scn.dispos||[],miseAPied:[],
    regles:scn.regles||[{cle:'sureffectif_minimum',active:false,valeur:'2'}],effectifs:scn.eff, // sureffectif OFF : on isole le TRANSFERT (comme le run réel S31, 0 sureffectif)
    creneaux:STORE.filter(c=>c.restaurant_id===scn.snack).map(clone),allCreneauxWeek:STORE.map(clone)};
  return cb().then(r=>{global._lastP3=r&&r.phase3;return r;});
}
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const dur=(c)=>_pdur(c.heure_debut,c.heure_fin)/60;
const hoursOf=id=>STORE.filter(c=>c.salarie_id===id).reduce((a,c)=>a+dur(c),0);
const A='A', B='B'; const RESTOS2=[{id:A,nom:'SnackA'},{id:B,nom:'SnackB'}];
const P3ONLY={silent:true,phase3only:true,globalUnfilled:[]};
// effectifs cuisine génériques (midi Lu-Me + Je + Ve ; soir Lu-Me + Je + Ve)
const effFor=(rid,cible,expSoir)=>[
  {restaurant_id:rid,jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:cible,vagues:[{deb:'10:00',fin:'15:00',exp:false}]},
  {restaurant_id:rid,jour_type:'Je',service:'midi',role:'cuisine',nb_cible:cible,vagues:[{deb:'10:00',fin:'15:00',exp:false}]},
  {restaurant_id:rid,jour_type:'Ve',service:'midi',role:'cuisine',nb_cible:cible,vagues:[{deb:'10:00',fin:'15:00',exp:false}]},
  {restaurant_id:rid,jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:cible,vagues:[{deb:'18:00',fin:'23:00',exp:!!expSoir}]},
  {restaurant_id:rid,jour_type:'Je',service:'soir',role:'cuisine',nb_cible:cible,vagues:[{deb:'18:00',fin:'23:00',exp:!!expSoir}]},
  {restaurant_id:rid,jour_type:'Ve',service:'soir',role:'cuisine',nb_cible:cible,vagues:[{deb:'18:00',fin:'23:00',exp:!!expSoir}]},
];

(async()=>{
  // ═══ TEST 1 — FRAGMENTATION REFUSÉE : manque 0,5h NON rallongeable → PAS de segment 30 min de transfert ═══
  // Hikmat-like : un SEUL créneau (mardi midi 10:00→15:00, plein à l'enveloppe → rallonge impossible), min 5,5h
  // → manque 0,5h. Aucun créneau adjacent à un donneur (extension impossible). Un donneur en gros surplus lundi.
  // gap 0,5h < SEG_MIN(3h) → aucune CRÉATION. Le receveur reste 0,5h sous son min, JAMAIS un créneau < 3h.
  await run({restos:[{id:A,nom:'SnackA'}],snack:A,
    sals:[{id:'don',nom:'Don',roles:['cuisine'],exp:['cuisine'],heures_min:5,heures_max:45},
          {id:'hik',nom:'Hikmat',roles:['cuisine'],exp:['cuisine'],heures_min:5.5,heures_max:20}],
    eff:effFor(A,2,false),
    store:[
      {restaurant_id:A,salarie_id:'don',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:A,salarie_id:'don',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:A,salarie_id:'don',date:D(2),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 15h, surplus 10
      {restaurant_id:A,salarie_id:'hik',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 5h, plein enveloppe, manque 0,5
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const hikCre=STORE.filter(c=>c.salarie_id==='hik');
  const hikFrag=hikCre.filter(c=>dur(c)<3-1e-6);
  console.log('  T1 Hikmat:',hikCre.map(c=>c.date.slice(8)+' '+c.service+' '+dur(c)+'h').join(' | '),'| total',hoursOf('hik')+'h | transferH',(global._lastP3||{}).transferH);
  t('T1 aucun créneau < 3h créé pour le receveur (fragment 30 min REFUSÉ)', hikFrag.length===0);
  t('T1b aucune création de transfert pour combler 0,5h (< seuil) : le receveur garde son unique créneau', hikCre.length===1 && (global._lastP3.transferH||0)<0.01);

  // ═══ TEST 2 — CHAÎNE REFUSÉE + PLAFOND +1 : un poste n'est pas re-découpé par 2 receveurs (jamais 5) ═══
  // cible=3. Lundi midi : A(10-14), Bp(10-14), Don(10:30-18:00, 7,5h surplus). Deux receveurs R1,R2 sous min,
  // sans créneau lundi. R1 crée un bloc ≥3h depuis Don (→ 4 personnes = cible+1). R2 : Don déjà entamé (anti-chaîne)
  // + effectif déjà à cible+1 → refusé. Max 4 personnes, jamais 5 ; overflow signalé.
  await run({restos:[{id:A,nom:'SnackA'}],snack:A,
    sals:[{id:'a',nom:'Aa',roles:['cuisine'],exp:['cuisine'],heures_min:4,heures_max:45},
          {id:'bp',nom:'Bp',roles:['cuisine'],exp:['cuisine'],heures_min:4,heures_max:45},
          {id:'don',nom:'Don',roles:['cuisine'],exp:['cuisine'],heures_min:5,heures_max:45},
          {id:'r1',nom:'R1',roles:['cuisine'],exp:['cuisine'],heures_min:8,heures_max:20},
          {id:'r2',nom:'R2',roles:['cuisine'],exp:['cuisine'],heures_min:8,heures_max:20}],
    eff:effFor(A,3,false),
    store:[
      {restaurant_id:A,salarie_id:'a',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'14:00'},
      {restaurant_id:A,salarie_id:'bp',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'14:00'},
      {restaurant_id:A,salarie_id:'don',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:30',heure_fin:'18:00'}, // 7,5h
      {restaurant_id:A,salarie_id:'don',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // surplus large
      {restaurant_id:A,salarie_id:'don',date:D(2),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      // R1, R2 : rien lundi ; un petit créneau ailleurs pour ne pas être à 0 (mais pas rallongeable jusqu'au min)
      {restaurant_id:A,salarie_id:'r1',date:D(4),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 5h (min 8 → manque 3)
      {restaurant_id:A,salarie_id:'r2',date:D(4),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'23:00'}, // 5h (min 8 → manque 3)
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const monMidi=STORE.filter(c=>c.date===D(0)&&c.service==='midi'&&c.role==='cuisine');
  const nMon=new Set(monMidi.map(c=>c.salarie_id)).size;
  const donMon=STORE.filter(c=>c.salarie_id==='don'&&c.date===D(0)&&c.service==='midi'); // le donneur n'est pas dupliqué
  console.log('  T2 lundi midi:',monMidi.map(c=>c.salarie_id+' '+c.heure_debut.slice(0,5)+'-'+c.heure_fin.slice(0,5)).join(' | '),'| n='+nMon,'| overflow='+JSON.stringify((global._lastP3||{}).overflowList||[]));
  t('T2 effectif lundi midi ≤ cible+1 (=4), jamais 5', nMon<=4);
  t('T2b anti-chaîne : le poste du donneur n\'a pas été découpé en plusieurs morceaux (≤1 résidu donneur)', donMon.length<=1);
  t('T2c aucun créneau lundi midi < 3h (pas de fragment)', monMidi.every(c=>dur(c)>=3-1e-6));
  t('T2d dépassement d\'effectif SIGNALÉ dans overflowList', ((global._lastP3||{}).overflowList||[]).length>=1);

  // ═══ TEST 3 — RALLONGE FINE PRÉSERVÉE (non-régression CRITIQUE) : manque 30 min résolu par rallonge ═══
  // Receveur avec un créneau existant lundi midi 10:00→14:30 (enveloppe 10:00-15:00), manque 0,5h. La règle
  // des 3h NE DOIT PAS bloquer : PASS A rallonge étend à 15:00. Aucun transfert, aucun sureffectif.
  await run({restos:[{id:A,nom:'SnackA'}],snack:A,
    sals:[{id:'r',nom:'R',roles:['cuisine'],exp:['cuisine'],heures_min:20,heures_max:45}],
    eff:effFor(A,1,false),
    store:[
      {restaurant_id:A,salarie_id:'r',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'14:30'}, // 4,5h (rallongeable +0,5)
      {restaurant_id:A,salarie_id:'r',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:A,salarie_id:'r',date:D(2),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:A,salarie_id:'r',date:D(3),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 19,5h total, manque 0,5
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const rMon=STORE.find(c=>c.salarie_id==='r'&&c.date===D(0)&&c.service==='midi');
  console.log('  T3 R lundi midi =',rMon.heure_debut.slice(0,5)+'→'+rMon.heure_fin.slice(0,5),'| total',hoursOf('r')+'h | p3',JSON.stringify((global._lastP3||{})));
  t('T3 rallonge fine de 30 min TOUJOURS appliquée (10:00→15:00) — la règle 3h ne la bloque pas', rMon.heure_fin.slice(0,5)==='15:00');
  t('T3b receveur atteint son min par rallonge (20h), sans transfert ni sureffectif', hoursOf('r')>=20-0.01 && (global._lastP3.transferH||0)<0.01 && (global._lastP3.sureffH||0)<0.01);

  // ═══ TEST 4 — TRANSFERT INTER-SNACK (réglage ON) : multi sous min à son P2, donneur au P2 (Sedimou←Haider) ═══
  // R multi (P1=A, P2=B) sous son min GLOBAL, occupé sur A ; CIBLE au passage de B (worksAt B). Donneur DB à B
  // avec surplus le soir. Réglage transfert_inter_snack ACTIVÉ → R reçoit un bloc ≥3h à B (dernier recours),
  // ligne taguée inter + snack B. (Le cas réglage DÉSACTIVÉ = défaut est couvert par intersnack_test.js.)
  await run({restos:RESTOS2,snack:B,
    regles:[{cle:'transfert_inter_snack',active:true},{cle:'sureffectif_minimum',active:false}],
    sals:[{id:'r',nom:'Rmulti',roles:['cuisine'],exp:['cuisine'],heures_min:20,heures_max:25,est_multi:true,
             snacks_priorites:[{priorite:1,restaurant_id:A},{priorite:2,restaurant_id:B}]},
          {id:'db',nom:'DB',roles:['cuisine'],exp:['cuisine'],heures_min:35,heures_max:45,
             snacks_priorites:[{priorite:1,restaurant_id:B}]}],
    eff:[...effFor(A,2,false),
         {restaurant_id:B,jour_type:'Je',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]},
         {restaurant_id:B,jour_type:'Ve',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]},
         {restaurant_id:B,jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]}],
    store:[ // R : 15h sur A (midis Lu-Me), libre le soir + Je/Ve. DB : 45h à B, soirs 8h (≥6h → carvables), surplus 10
      {restaurant_id:A,salarie_id:'r',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:A,salarie_id:'r',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:A,salarie_id:'r',date:D(2),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 15h, manque 5
      {restaurant_id:B,salarie_id:'db',date:D(0),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
      {restaurant_id:B,salarie_id:'db',date:D(1),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
      {restaurant_id:B,salarie_id:'db',date:D(2),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
      {restaurant_id:B,salarie_id:'db',date:D(3),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
      {restaurant_id:B,salarie_id:'db',date:D(4),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'}, // 40h
      {restaurant_id:B,salarie_id:'db',date:D(3),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 45h (surplus 10)
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const rB=STORE.filter(c=>c.salarie_id==='r'&&c.restaurant_id===B);
  console.log('  T4 R@B:',rB.map(c=>c.date.slice(8)+' '+c.service+' '+c.heure_debut.slice(0,5)+'-'+c.heure_fin.slice(0,5)).join(' | '),'| R total',hoursOf('r')+'h | DB',hoursOf('db')+'h');
  t('T4 R (multi) reçoit ≥1 créneau au snack B (transfert inter-snack AUTORISÉ via réglage)', rB.length>=1);
  t('T4b tous les créneaux reçus par R à B sont ≥ 3h (aucun fragment)', rB.every(c=>dur(c)>=3-1e-6));
  t('T4c R atteint (ou approche) son min global 20h', hoursOf('r')>=20-0.01);
  t('T4d donneur DB reste ≥ son min (35h)', hoursOf('db')>=35-0.01);
  t('T4e transfert tagué inter=true + snack=SnackB dans transferList', ((global._lastP3||{}).transferList||[]).some(x=>x.inter===true&&x.snackId===B));

  // ═══ TEST 5 — TRANSFERT INTRA-SNACK (NDIAYE-like) : mono sous min, donneur même snack, blocs ≥3h ═══
  // R mono à B, 23h (min 28), libre jeudi/vendredi. Donneur Haider-like : soirs 18:00→02:00 (8h) surplus.
  // Création de blocs ≥3h les jours libres → R atteint son min, chaque nouveau créneau ≥3h, donneur ≥ min.
  await run({restos:[{id:B,nom:'SnackB'}],snack:B,
    sals:[{id:'nd',nom:'Ndiaye',roles:['cuisine'],exp:['cuisine'],heures_min:28,heures_max:35},
          {id:'hd',nom:'Haider',roles:['cuisine'],exp:['cuisine'],heures_min:35,heures_max:45}],
    eff:[{restaurant_id:B,jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:1,vagues:[{deb:'10:00',fin:'15:00'}]},
         {restaurant_id:B,jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'00:00'}]},
         {restaurant_id:B,jour_type:'Je',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]},
         {restaurant_id:B,jour_type:'Ve',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]}],
    store:[
      {restaurant_id:B,salarie_id:'nd',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 5
      {restaurant_id:B,salarie_id:'nd',date:D(0),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'}, // 6
      {restaurant_id:B,salarie_id:'nd',date:D(1),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'}, // 6
      {restaurant_id:B,salarie_id:'nd',date:D(2),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'}, // 6 => 23h
      {restaurant_id:B,salarie_id:'hd',date:D(3),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'}, // 8
      {restaurant_id:B,salarie_id:'hd',date:D(4),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'}, // 8
      {restaurant_id:B,salarie_id:'hd',date:D(0),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'}, // 6
      {restaurant_id:B,salarie_id:'hd',date:D(1),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'}, // 6
      {restaurant_id:B,salarie_id:'hd',date:D(2),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'}, // 6 => 34h... add more
      {restaurant_id:B,salarie_id:'hd',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 5
      {restaurant_id:B,salarie_id:'hd',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 5 => 44h (surplus 9)
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const ndNew=STORE.filter(c=>c.salarie_id==='nd'&&![D(0)+'midi',D(0)+'soir',D(1)+'soir',D(2)+'soir'].includes(c.date+c.service));
  console.log('  T5 Ndiaye:',STORE.filter(c=>c.salarie_id==='nd').map(c=>c.date.slice(8)+' '+c.service+' '+dur(c)+'h').join(' | '),'| total',hoursOf('nd')+'h | Haider',hoursOf('hd')+'h');
  t('T5 receveur mono atteint son min 28h par transfert intra-snack', hoursOf('nd')>=28-0.01);
  t('T5b tous les créneaux du receveur sont ≥ 3h (aucun fragment)', STORE.filter(c=>c.salarie_id==='nd').every(c=>dur(c)>=3-1e-6));
  t('T5c donneur Haider reste ≥ son min (35h)', hoursOf('hd')>=35-0.01);

  // ═══ TEST 6 — DONNEUR PROTÉGÉ : résidu < 3h impossible ═══
  // Donneur avec un unique créneau de 5h (créer un bloc 3h laisserait 2h < SEG_MIN → refusé) et 0 surplus ailleurs.
  // Receveur sous min sans créneau ce jour. Aucune création ne doit toucher ce donneur.
  await run({restos:[{id:B,nom:'SnackB'}],snack:B,
    sals:[{id:'don',nom:'Don',roles:['cuisine'],exp:['cuisine'],heures_min:2,heures_max:45},
          {id:'r',nom:'R',roles:['cuisine'],exp:['cuisine'],heures_min:20,heures_max:35}],
    eff:[{restaurant_id:B,jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'23:00'}]}],
    store:[
      {restaurant_id:B,salarie_id:'don',date:D(0),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'23:00'}, // 5h, surplus 3 mais créneau trop court pour créer 3h + résidu 3h
      {restaurant_id:B,salarie_id:'r',date:D(1),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'23:00'},
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const donMon6=STORE.find(c=>c.salarie_id==='don'&&c.date===D(0));
  console.log('  T6 Don lundi soir =',donMon6.heure_debut.slice(0,5)+'→'+donMon6.heure_fin.slice(0,5),'| R lundi?',STORE.some(c=>c.salarie_id==='r'&&c.date===D(0)));
  t('T6 donneur INCHANGÉ (créneau 5h : impossible de créer 3h en gardant ≥3h de résidu)', donMon6.heure_debut.slice(0,5)==='18:00'&&donMon6.heure_fin.slice(0,5)==='23:00');
  t('T6b receveur n\'a PAS reçu de fragment de ce donneur lundi', !STORE.some(c=>c.salarie_id==='r'&&c.date===D(0)&&!c.sureffectif));

  // ═══ TEST 7 — buildPhase3Report (nouvelle signature objet) : sureffectif + dépassement + RALLONGE CHIFFRÉE ═══
  const rep=buildPhase3Report({rallongeH:2,sureffH:8,transferH:3,sureffEur:134,rallongeEur:40,
    sureffList:[{name:'X',date:D(0),svc:'soir',h:4},{name:'Y',date:D(1),svc:'midi',h:4}],
    transferList:[{from:'Don',to:'Rec',date:D(0),svc:'soir',h:3}],
    rallongeList:[{name:'Zed',date:D(0),svc:'midi',oldDeb:'11:30',oldFin:'14:30',newDeb:'11:30',newFin:'15:00',h:0.5}],
    overflowList:[{jour:'Lundi',svc:'midi',role:'Cuisine',snack:'SnackA',cover:4,need:3}]}, true);
  t('T7a sureffWarn : nb + heures + € (134) en haut', /SUREFFECTIF/.test(rep.sureffWarn)&&/8h/.test(rep.sureffWarn)&&/134 €/.test(rep.sureffWarn));
  t('T7b overflowWarn : SUR-COUVERTURE simultanée (4 présents pour 3 requis)', /SUR-COUVERTURE/.test(rep.overflowWarn)&&/4 présents en même temps pour 3 requis/.test(rep.overflowWarn));
  t('T7c phase 3 : transfert + rallonge CHIFFRÉE (€) + sureffectif, coût total en tête', /transfert/.test(rep.phase3Section)&&/rallonge/.test(rep.phase3Section)&&/sureffectif/.test(rep.phase3Section)&&/40 €/.test(rep.phase3Section)&&/174 € chargé ajouté/.test(rep.phase3Section));
  t('T7d détail rallonge ligne par ligne (Zed 11:30→14:30 ⇒ 15:00)', /Zed/.test(rep.phase3Section)&&/14:30 ⇒/.test(rep.phase3Section)&&/15:00/.test(rep.phase3Section));

  // ═══ TEST 8 — DONNÉES RÉELLES S31 : Sedimou/NDIAYE PAS sous leur min PRORATISÉ (2 congés) → non ciblés ═══
  // Réplique la config réelle : NDIAYE 23h (min 28) et Sedimou 14,5h (min 20) ont chacun 2 j de congé payé
  // (Sam+Dim, ponctuel) → min proratisé 20h / 14,3h → déjà atteints. Le transfert doit les LAISSER (à raison).
  const GC='GC';
  await run({restos:[{id:B,nom:'Lobau'},{id:GC,nom:'GrandCoeur'}],snack:B,
    sals:[{id:'hd',nom:'Haider',roles:['cuisine'],exp:['cuisine'],heures_min:35,heures_max:45},
          {id:'nd',nom:'Ndiaye',roles:['cuisine'],exp:['cuisine'],heures_min:28,heures_max:35},
          {id:'sed',nom:'Sedimou',roles:['cuisine'],exp:['cuisine'],heures_min:20,heures_max:25,est_multi:true,
             snacks_priorites:[{priorite:1,restaurant_id:GC},{priorite:2,restaurant_id:B}]}],
    dispos:[{salarie_id:'nd',type:'ponctuelle',statut:'indispo',statut_demande:'validee',date_specifique:D(5)},
            {salarie_id:'nd',type:'ponctuelle',statut:'indispo',statut_demande:'validee',date_specifique:D(6)},
            {salarie_id:'sed',type:'ponctuelle',statut:'indispo',statut_demande:'validee',date_specifique:D(5)},
            {salarie_id:'sed',type:'ponctuelle',statut:'indispo',statut_demande:'validee',date_specifique:D(6)}],
    eff:[{restaurant_id:B,jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:1,vagues:[{deb:'10:00',fin:'15:00'}]},
         {restaurant_id:B,jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'00:00'}]},
         {restaurant_id:B,jour_type:'Je',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]},
         {restaurant_id:B,jour_type:'Ve',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00'}]}],
    store:[ // Haider 45h (surplus 10), NDIAYE 23h, Sedimou 14,5h sur Grand Cœur
      {restaurant_id:B,salarie_id:'hd',date:D(3),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
      {restaurant_id:B,salarie_id:'hd',date:D(4),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
      {restaurant_id:B,salarie_id:'hd',date:D(0),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'},
      {restaurant_id:B,salarie_id:'hd',date:D(1),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'},
      {restaurant_id:B,salarie_id:'hd',date:D(2),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'},
      {restaurant_id:B,salarie_id:'hd',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:B,salarie_id:'hd',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'}, // 45h
      {restaurant_id:B,salarie_id:'nd',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
      {restaurant_id:B,salarie_id:'nd',date:D(0),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'},
      {restaurant_id:B,salarie_id:'nd',date:D(1),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'},
      {restaurant_id:B,salarie_id:'nd',date:D(2),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:00'}, // 23h
      {restaurant_id:GC,salarie_id:'sed',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'14:00'},
      {restaurant_id:GC,salarie_id:'sed',date:D(2),service:'midi',role:'cuisine',heure_debut:'11:00',heure_fin:'14:00'},
      {restaurant_id:GC,salarie_id:'sed',date:D(3),service:'midi',role:'cuisine',heure_debut:'10:30',heure_fin:'14:00'},
      {restaurant_id:GC,salarie_id:'sed',date:D(4),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'14:00'}, // 14,5h
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  console.log('  T8 NDIAYE',hoursOf('nd')+'h Sedimou',hoursOf('sed')+'h Haider',hoursOf('hd')+'h | transferH',(global._lastP3||{}).transferH);
  t('T8 NDIAYE reste 23h (min proratisé 20h atteint : 2 congés) → NON comblé, à raison', Math.abs(hoursOf('nd')-23)<0.01);
  t('T8b Sedimou reste 14,5h (min proratisé 14,3h atteint : 2 congés) → NON comblé, à raison', Math.abs(hoursOf('sed')-14.5)<0.01);
  t('T8c aucun transfert déclenché (personne sous son min proratisé)', ((global._lastP3||{}).transferH||0)<0.01);

  // ═══ TEST 9 — SEUIL PARAMÉTRABLE : duree_creneau_min_h=2 → une création de bloc 2h est autorisée ═══
  // (Au défaut 3h, un manque de 2h ne créerait aucun créneau — cf. logique de T1. Ici la règle abaisse le seuil.)
  await run({restos:[{id:B,nom:'SnackB'}],snack:B,
    regles:[{cle:'duree_creneau_min_h',active:true,valeur:'2'},{cle:'sureffectif_minimum',active:false}],
    sals:[{id:'don',nom:'Don',roles:['cuisine'],exp:['cuisine'],heures_min:5,heures_max:45},
          {id:'r',nom:'R',roles:['cuisine'],exp:['cuisine'],heures_min:7,heures_max:35}],
    eff:[{restaurant_id:B,jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:00',fin:'23:00'}]}],
    store:[
      {restaurant_id:B,salarie_id:'don',date:D(0),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'23:00'},
      {restaurant_id:B,salarie_id:'don',date:D(1),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'23:00'}, // 10h, surplus 5
      {restaurant_id:B,salarie_id:'r',date:D(1),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'23:00'}, // 5h, manque 2 (plein enveloppe → pas rallongeable)
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const rNew9=STORE.filter(c=>c.salarie_id==='r'&&!(c.date===D(1)&&c.service==='soir'));
  console.log('  T9 R:',STORE.filter(c=>c.salarie_id==='r').map(c=>c.date.slice(8)+' '+c.service+' '+dur(c)+'h').join(' | '),'| total',hoursOf('r')+'h');
  t('T9 seuil réglé à 2h → création d\'un bloc de 2h autorisée (le manque de 2h est comblé)', hoursOf('r')>=7-0.01 && rNew9.length>=1 && rNew9.every(c=>dur(c)>=2-1e-6&&dur(c)<3-1e-6));

  console.log(ok?'\nALL PASS':'\nSOME FAILED');
  process.exit(ok?0:1);
})();

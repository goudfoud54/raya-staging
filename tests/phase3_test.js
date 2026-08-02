// ⚠ PORTÉE : ce harnais exerce une RÉPLIQUE locale de la phase 3 (runPhase3 ci-dessous), pilotant le VRAI
// checkPlacement mais RÉIMPLÉMENTANT la distribution (rallonge/sureffectif). Il ne teste donc PAS le vrai
// solveur autoFillCore — celui-ci est couvert par les harnais à extraction réelle (coverage_test,
// transfer_test, suggest_test, undermin*, multi_undermin, intersnack_test, hayatou_test, p3_real_test).
// Valeur de ce fichier : vérifier l'intégration de checkPlacement (repos inter-snack T7, invariant T9) et la
// logique d'enveloppe. À terme, à fusionner dans les harnais réels plutôt qu'à maintenir en parallèle.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);   // constantes/helpers de fichier (F2H_*, _finAbsM, _restoNom)
function grab(name){const re=new RegExp("(?:async\\s+)?function "+name+"\\s*\\(");const i=h.search(re);if(i<0)throw"no "+name;let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
function grabConst(name){const m=h.match(new RegExp("const "+name+"\\s*=[^\\n]*"));return m?m[0].replace(/^const/,'var'):null;}
// primitives
eval(grabConst("_pmin")); eval(grabConst("_pdur")); eval(grabConst("_toMin")||"");
eval(grabConst("fmtH1")); eval(grabConst("DEF_TIME"));
eval("global._toMin="+grab("_toMin").replace(/^function/,'function')+";");
try{eval("global.overlaps="+grab("overlaps").replace(/^function/,'function')+";");}catch(e){}
try{eval("global.weekMinutesOf="+grab("weekMinutesOf").replace(/^function/,'function')+";");}catch(e){}
try{eval("global._indispoBlocking="+grab("_indispoBlocking").replace(/^function/,'function')+";");}catch(e){}
eval("global._overlap="+grab("_overlap").replace(/^function/,'function')+";");
eval("global._endCapMin="+grab("_endCapMin").replace(/^function/,'function')+";");
eval("global._ruleCtx="+grab("_ruleCtx").replace(/^function/,'function')+";");
eval("global.isMultiSnack="+grab("isMultiSnack").replace(/^function/,'function')+";");
eval("global.weekHoursOf="+grab("weekHoursOf").replace(/^function/,'function')+";");
eval("global.plafondOf="+grab("plafondOf").replace(/^function/,'function')+";");
eval("global.getShifts="+grab("getShifts").replace(/^function/,'function')+";");
eval("global.hasIndispo="+grab("hasIndispo").replace(/^function/,'function')+";");
eval("global.isSuspended="+grab("isSuspended").replace(/^function/,'function')+";");
eval("global.checkPlacement="+grab("checkPlacement").replace(/^function/,'function')+";");
// PLACE_RULES
eval("global."+grabConst("PLACE_RULES").slice(4)); // var PLACE_RULES=...
// leaves / stubs
global.fmtDate=d=>{const x=new Date(d);return x.toISOString().slice(0,10);};
global.salById=id=>SAL[id];
global.onRoster=()=>true;
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null; if(a&&a.length)return a.some(x=>x.restaurant_id===rid); return s.snack_origine_id===rid||!!s.est_multi;};
global.rolesOf=id=>SAL[id].roles||['cuisine'];
global.isExp=()=>true;
// STUB : contraintes individuelles (salarie_contraintes) — ces scénarios n'en définissent aucune, donc
// _contrainteBlocking ne bloque jamais et contrOf est vide. Le vrai checkPlacement les appelle depuis 1802eda.
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
global.altDayType=()=>null;
global.dayJourType=i=>{if(i<=2)return 'Lu-Me';if(i===3)return 'Je';if(i===4)return 'Ve';if(i===5)return 'Sa';return 'Di';};
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.roleNom=c=>c;
global.fullName=s=>s.nom;
// rules: no absences by default
function baseRules(extra){ return (extra||[]); }

// ── Phase 3 REPLICA (mirrors the inline autoFillCore code, drives REAL checkPlacement) ──
const absToHHMM=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
const svcEnvelope=(jt,svc)=>{let mn=Infinity,mx=-Infinity;for(const _r of S.orgRoles){for(const v of getShifts(jt,svc,_r.cle)){const d=_pmin(v.deb);if(d==null)continue;let f=_pmin(v.fin);if(f==null)continue;if(f<=d)f+=1440;if(d<mn)mn=d;if(f>mx)mx=f;}}return mn===Infinity?null:{mn,mx};};
const dayIdxOfDate=d=>(new Date(d).getDay()+6)%7;
function runPhase3(dayIndices){
  const rg=_ruleCtx();
  const _txn=[]; // capture undo
  const SUREFF_ON=rg.on('sureffectif_minimum',false);
  const SUREFF_MAX=Math.max(0,Math.round(rg.num('sureffectif_minimum',2)));
  const sureffCount={};
  let rallongeH=0, sureffH=0; const sureffList=[];
  const _wd=dayIndices.map(i=>fmtDate(dateOfDay(i)));
  const updateCreTimes=(row,nd,nf)=>{const before={...row};[S.creneaux,S.allCreneauxWeek].forEach(arr=>{const it=arr.find(c=>c.id===row.id);if(it){it.heure_debut=nd;it.heure_fin=nf;}});_txn.push({before,after:{...row,heure_debut:nd,heure_fin:nf}});return true;};
  const placeCre=(sid,sh,date,svc,extra)=>{const data={id:'g'+(S.creneaux.length+1),restaurant_id:SNACK.id,salarie_id:sid,role:sh.role,date,service:svc,heure_debut:sh.deb,heure_fin:sh.fin,...(extra||{})};S.creneaux.push(data);S.allCreneauxWeek.push(data);_txn.push({before:null,after:data});return data;};
  const targets=[];
  S.salaries.filter(s=>onRoster(s)&&worksAt(s,SNACK.id)&&(s.heures_min||0)>0).forEach(s=>{
    const blocked=_wd.filter(d=>false).length; const proratedMin=(s.heures_min||0);
    const cap=plafondOf(s,rg); const target=Math.min(proratedMin,cap);
    if(weekHoursOf(s.id)<target-0.01) targets.push({sid:s.id,sal:s,target,cap});
  });
  targets.sort((a,b)=>(b.target-weekHoursOf(b.sid))-(a.target-weekHoursOf(a.sid)));
  for(const t of targets){
    const sid=t.sid,cap=t.cap,target=t.target;
    const myCre=S.creneaux.filter(c=>c.salarie_id===sid&&c.restaurant_id===SNACK.id&&c.heure_debut&&c.heure_fin);
    for(const row of myCre){
      if(weekHoursOf(sid)>=target-0.01)break;
      const env=svcEnvelope(dayJourType(dayIdxOfDate(row.date)),row.service); if(!env)continue;
      const di=dayIdxOfDate(row.date);
      let debM=_pmin(row.heure_debut),finM=_pmin(row.heure_fin); if(finM<=debM)finM+=1440;
      const oldDur=(finM-debM)/60; let curDeb=debM,curFin=finM,curDur=oldDur;
      const projected=()=>weekHoursOf(sid)-oldDur+curDur; let step=0;
      while(step++<64 && projected()<target-0.01){
        let moved=false;
        if(curFin+30<=env.mx){const nd=(curFin+30-curDeb)/60,cand={deb:absToHHMM(curDeb),fin:absToHHMM(curFin+30),role:row.role};
          if(weekHoursOf(sid)-oldDur+nd<=cap+1e-6 && checkPlacement(sid,cand,row.date,row.service,di,{rg,excludeSelf:true})===null){curFin+=30;curDur=nd;moved=true;}}
        if(!moved && curDeb-30>=env.mn){const nd=(curFin-(curDeb-30))/60,cand={deb:absToHHMM(curDeb-30),fin:absToHHMM(curFin),role:row.role};
          if(weekHoursOf(sid)-oldDur+nd<=cap+1e-6 && checkPlacement(sid,cand,row.date,row.service,di,{rg,excludeSelf:true})===null){curDeb-=30;curDur=nd;moved=true;}}
        if(!moved)break;
      }
      if(curDur>oldDur+0.001){updateCreTimes(row,absToHHMM(curDeb),absToHHMM(curFin));rallongeH+=(curDur-oldDur);}
    }
    if(SUREFF_ON){
      let placedSureff=true;
      while(placedSureff && weekHoursOf(sid)<target-0.01 && (sureffCount[sid]||0)<SUREFF_MAX){
        placedSureff=false;
        outer:
        for(const di of dayIndices){const date=fmtDate(dateOfDay(di)),jt=dayJourType(di);
          for(const svc of ['midi','soir']){for(const role of rolesOf(sid)){for(const v of getShifts(jt,svc,role)){
            const nd=_pdur(v.deb,v.fin)/60; if(nd<=0)continue;
            if(weekHoursOf(sid)+nd>cap+1e-6)continue;
            if(checkPlacement(sid,{deb:v.deb,fin:v.fin,role},date,svc,di,{rg})!==null)continue;
            placeCre(sid,{deb:v.deb,fin:v.fin,role},date,svc,{sureffectif:true});
            sureffH+=nd;sureffCount[sid]=(sureffCount[sid]||0)+1;sureffList.push({name:fullName(t.sal),date,svc,h:nd});placedSureff=true;break outer;
          }}}
        }
      }
    }
  }
  return {rallongeH,sureffH,sureffList,_txn};
}
global.dateOfDay=i=>new Date(new Date('2026-08-03T00:00:00').getTime()+i*86400000);

let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const LOB='lob';
function reset(rules,creneaux,sal,eff){
  global.S={restos:[{id:LOB,nom:'Raya Lobau'},{id:'gc',nom:'Raya Grand Cœur'}],
    salaries:sal, creneaux:creneaux.slice(), allCreneauxWeek:creneaux.slice(), dispos:[], miseAPied:[],
    regles:rules||[], effectifs:eff, orgRoles:[{cle:'cuisine',nom:'Cuisine'}]};
  global.SNACK={id:LOB,nom:'Raya Lobau'};
  global.SAL={}; sal.forEach(s=>SAL[s.id]=s);
}
// Effectif : Lu-Me midi 1 vague 11:00-14:30 ; soir 1 vague 18:00-23:30 (envelope soir 18:00→23:30)
const EFF=[{restaurant_id:LOB,jour_type:'Lu-Me',service:'midi',role:'cuisine',vagues:[{deb:'11:00',fin:'14:30'}]},
           {restaurant_id:LOB,jour_type:'Lu-Me',service:'soir',role:'cuisine',vagues:[{deb:'18:00',fin:'23:30'}]}];

// TEST 1 : rallonge jusqu'au min, dans l'enveloppe
reset([], [{id:'c1',restaurant_id:LOB,salarie_id:'a',role:'cuisine',date:'2026-08-03',service:'soir',heure_debut:'18:00',heure_fin:'21:00'}],
  [{id:'a',nom:'Alpha',heures_min:5,heures_max:45,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]}], EFF);
let r=runPhase3([0,1,2]);
const c1=S.creneaux.find(c=>c.id==='c1');
console.log('  T1 fin:',c1.heure_fin,' rallongeH:',r.rallongeH.toFixed(1));
t('rallonge 18:00→21:00 (3h) jusqu\'à min 5h → fin 23:00, jamais > enveloppe 23:30', c1.heure_fin==='23:00' && Math.abs(r.rallongeH-2)<0.01);

// TEST 1b : enveloppe stoppe avant le min (min très haut) → s'arrête à 23:30 pile
reset([], [{id:'c1',restaurant_id:LOB,salarie_id:'a',role:'cuisine',date:'2026-08-03',service:'soir',heure_debut:'18:00',heure_fin:'21:00'}],
  [{id:'a',nom:'Alpha',heures_min:40,heures_max:45,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]}], EFF);
r=runPhase3([0,1,2]); const c1b=S.creneaux.find(c=>c.id==='c1');
console.log('  T1b fin:',c1b.heure_fin);
t('enveloppe : s\'arrête à 23:30 (max vague) même si min pas atteint', c1b.heure_fin==='23:30');

// TEST 2 : rallonge bloquée par plafond (heures_max) → stoppe au dernier pas valide
reset([], [{id:'c1',restaurant_id:LOB,salarie_id:'a',role:'cuisine',date:'2026-08-03',service:'soir',heure_debut:'18:00',heure_fin:'21:00'}],
  [{id:'a',nom:'Alpha',heures_min:20,heures_max:4,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]}], EFF);
r=runPhase3([0,1,2]); const c2=S.creneaux.find(c=>c.id==='c1');
console.log('  T2 fin:',c2.heure_fin,'(plafond 4h, déjà 3h → +30min=3.5h ok, +1h=4h ok, +1.5h=4.5>4 stop)');
t('plafond 4h : rallonge s\'arrête à 22:00 (4h pile), pas au-delà', c2.heure_fin==='22:00');

// TEST 3 : salarié DÉJÀ au min → intouché
reset([], [{id:'c1',restaurant_id:LOB,salarie_id:'a',role:'cuisine',date:'2026-08-03',service:'soir',heure_debut:'18:00',heure_fin:'23:00'}],
  [{id:'a',nom:'Alpha',heures_min:5,heures_max:45,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]}], EFF);
r=runPhase3([0,1,2]); const c3=S.creneaux.find(c=>c.id==='c1');
t('salarié au min (5h) → aucune rallonge', c3.heure_fin==='23:00' && r.rallongeH===0 && r.sureffH===0);

// TEST 4 : sureffectif OFF → pas de créneau en plus même si sous min et rallonge insuffisante
reset([], [], // aucun créneau → rallonge impossible
  [{id:'a',nom:'Alpha',heures_min:5,heures_max:45,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]}], EFF);
r=runPhase3([0,1,2]);
t('sureffectif OFF (défaut) → 0 créneau créé', S.creneaux.length===0 && r.sureffH===0 && r.sureffList.length===0);

// TEST 5 : sureffectif ON → crée des créneaux marqués, respecte max=2
reset([{id:'rg1',cle:'sureffectif_minimum',active:true,valeur:'2'}], [],
  [{id:'a',nom:'Alpha',heures_min:40,heures_max:45,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]}], EFF);
r=runPhase3([0,1,2,3,4,5,6]);
console.log('  T5 sureff count:',r.sureffList.length,' all marked:',S.creneaux.every(c=>c.sureffectif));
t('sureffectif ON : ≤2 créneaux, tous marqués sureffectif=true, comptés', r.sureffList.length===2 && S.creneaux.length===2 && S.creneaux.every(c=>c.sureffectif===true) && r.sureffH>0);

// TEST 6 : undo → _txn permet de tout revenir (rallonge before/after)
reset([], [{id:'c1',restaurant_id:LOB,salarie_id:'a',role:'cuisine',date:'2026-08-03',service:'soir',heure_debut:'18:00',heure_fin:'21:00'}],
  [{id:'a',nom:'Alpha',heures_min:5,heures_max:45,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]}], EFF);
r=runPhase3([0,1,2]);
const beforeTimes=r._txn.filter(e=>e.before&&e.after&&e.before.id==='c1').map(e=>e.before.heure_fin);
t('undo : le txn capture le before (21:00) pour restaurer la rallonge', r._txn.length>=1 && beforeTimes.includes('21:00'));

console.log(ok?'\nALL PASS':'\nSOME FAILED');

console.log('\n=== TESTS COMPLÉMENTAIRES ===');
let ok2=true;const t2=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok2=c&&ok2;};

// TEST 7 : rallonge BLOQUÉE par repos 11h INTER-SNACK (flagship f2eb648)
// A a Lobau soir lundi 18:00→21:00 ET Grand Cœur mardi matin 08:00→12:00 (autre snack).
// Repos fin(lun soir)→08:00 mardi doit rester ≥11h → fin ≤ 21:00. Toute rallonge (21:30) → 10.5h < 11h → bloquée.
reset([], [
  {id:'c1',restaurant_id:LOB,salarie_id:'a',role:'cuisine',date:'2026-08-03',service:'soir',heure_debut:'18:00',heure_fin:'21:00'},
  {id:'c2',restaurant_id:'gc',salarie_id:'a',role:'cuisine',date:'2026-08-04',service:'midi',heure_debut:'08:00',heure_fin:'12:00'}
], [{id:'a',nom:'Alpha',heures_min:30,heures_max:45,roles:['cuisine'],est_multi:true,snacks_priorites:[{restaurant_id:LOB},{restaurant_id:'gc'}]}], EFF);
r=runPhase3([0,1,2]);
const c7=S.creneaux.find(c=>c.id==='c1');
console.log('  T7 Lobau soir fin:',c7.heure_fin,'(doit rester 21:00 : repos inter-snack 11h)');
t2('rallonge bloquée par repos 11h inter-snack → reste 21:00 (dernier pas valide)', c7.heure_fin==='21:00' && r.rallongeH===0);

// TEST 8 : scénario TENDU multi-personnes (représentatif S32 : budget ≈ Σ min, marge faible)
// 3 salariés, chacun 1 créneau soir 18:00→21:00 (3h), min 5h. Enveloppe soir 23:30 → chacun peut aller à 5.5h.
// Sans sureffectif : rallonge chacun de 3h À 5h (min) = +2h chacun → 6h au total, 0 sous-min après.
// NB : l'ancienne assertion attendait « +0,5h chacun / +1,5h total » — arithmétique erronée (3h→5h = +2h, pas
// +0,5h ; vestige d'un scénario antérieur). La réplique calcule correctement 6,0h ; constante corrigée.
reset([], [
  {id:'c1',restaurant_id:LOB,salarie_id:'a',role:'cuisine',date:'2026-08-03',service:'soir',heure_debut:'18:00',heure_fin:'21:00'},
  {id:'c2',restaurant_id:LOB,salarie_id:'b',role:'cuisine',date:'2026-08-04',service:'soir',heure_debut:'18:00',heure_fin:'21:00'},
  {id:'c3',restaurant_id:LOB,salarie_id:'c',role:'cuisine',date:'2026-08-05',service:'soir',heure_debut:'18:00',heure_fin:'21:00'}
], [
  {id:'a',nom:'A',heures_min:5,heures_max:45,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]},
  {id:'b',nom:'B',heures_min:5,heures_max:45,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]},
  {id:'c',nom:'C',heures_min:5,heures_max:45,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]}
], EFF);
const before8=S.salaries.filter(s=>weekHoursOf(s.id)<s.heures_min-0.01).length;
r=runPhase3([0,1,2]);
const after8=S.salaries.filter(s=>weekHoursOf(s.id)<s.heures_min-0.01).length;
console.log('  T8 sous-min avant:',before8,' après rallonge:',after8,' rallongeH:',r.rallongeH.toFixed(1));
t2('scénario tendu : 3 sous-min → 0 après rallonge (chacun 3h→5h = +2h, 6h total)', before8===3 && after8===0 && Math.abs(r.rallongeH-6)<0.01);

// TEST 9 : phase 3 ne touche JAMAIS un autre salarié (invariant advisor)
reset([], [
  {id:'c1',restaurant_id:LOB,salarie_id:'a',role:'cuisine',date:'2026-08-03',service:'soir',heure_debut:'18:00',heure_fin:'21:00'},
  {id:'c2',restaurant_id:LOB,salarie_id:'b',role:'cuisine',date:'2026-08-03',service:'midi',heure_debut:'11:00',heure_fin:'14:30'}
], [
  {id:'a',nom:'A',heures_min:20,heures_max:45,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]},
  {id:'b',nom:'B',heures_min:2,heures_max:45,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB}]}
], EFF);
const bMidiBefore=S.creneaux.find(c=>c.id==='c2').heure_fin;
r=runPhase3([0,1,2]);
const bMidiAfter=S.creneaux.find(c=>c.id==='c2').heure_fin;
t2('B (déjà au-dessus min) intouché pendant que A est distribué', bMidiBefore===bMidiAfter);

console.log(ok2?'\nCOMPLÉMENTAIRES ALL PASS':'\nSOME FAILED');

// S1 (sureffectif → suggestions par défaut, classé par cible) + S2 (alerte sur-couverture = simultané).
const fs=require("fs");const {extractFn}=require("./extract.js");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);   // constantes/helpers de fichier (F2H_*, _finAbsM, _restoNom)
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); }
const grab=n=>extractFn(h,n);
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._toMin=global._pmin;
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
for(const fn of ['overlaps','_overlap','targetFor','_indispoBlocking','_endCapMin','_ruleCtx','isMultiSnack','weekMinutesOf','weekHoursOf','snackPrioriteOf','hoursOnMorePrioritaryRestos','snackPriorityGate','sureffBlockedByPriority','sortCandidates','plafondOf','getShifts','getCreneau','_creCoversMin','hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement','dayJourType','removeCreneau','autoFillCore','buildPhase3Report','suggestFor']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j; for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}} eval("global.PLACE_RULES="+h.slice(st,j)+";"); }
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
global.setSS=(k,m)=>{if(k==='err')console.error('>>> ERR:',m);};global._yield=()=>Promise.resolve();global.showAutofillOverlay=()=>{};global.hideAutofillOverlay=()=>{};global.updateAutofillProgress=()=>{};global.showSolveReport=()=>{};global._afMulti=null;
global.beginTxn=()=>{global._txn=[];};global.endTxn=()=>{global._txn=null;};global.recordAction=()=>{};global.updateUndoBtns=()=>{};global._txn=null;global._autofillRunning=false;
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.MONDAY=new Date('2026-08-03T00:00:00'); global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.onRoster=()=>true;global.altDayType=()=>null;global.roleNom=c=>c;global.fullName=s=>s.nom;global.ORG={coef_charges:1.42};global.escP=s=>(''+(s==null?'':s));
global.salById=id=>SAL[id];global.rolesOf=id=>SAL[id].roles||[];global.isExp=(id,c)=>(SAL[id].exp||[]).includes(c);
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.loadWeek=async()=>{S.creneaux=STORE.filter(c=>c.restaurant_id===SNACK.id).map(clone);S.allCreneauxWeek=STORE.map(clone);};
const SNK='snk'; global.SNACK={id:SNK,nom:'Snack'};
const D=i=>fmtDate(dateOfDay(i));
function run(scn, cb){
  STORE=(scn.store||[]).map(c=>Object.assign({id:'s'+(_id++),restaurant_id:SNK},c));
  global.SAL={}; scn.sals.forEach(s=>{s.snacks_priorites=s.snacks_priorites||[{priorite:1,restaurant_id:SNK}];SAL[s.id]=s;});
  global.S={restos:[{id:SNK,nom:'Snack'}],salaries:scn.sals,orgRoles:[{cle:'cuisine',nom:'Cuisine'}],dispos:[],miseAPied:[],contraintes:[],
    regles:scn.regles||[],effectifs:scn.eff.map(e=>({...e,restaurant_id:SNK})),
    creneaux:STORE.filter(c=>c.restaurant_id===SNK).map(clone),allCreneauxWeek:STORE.map(clone)};
  return cb().then(r=>{global._lastRes=r;return r;});
}
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const surf=()=>STORE.filter(c=>c.sureffectif);
// effectifs à cible CROISSANTE : Lu-Me=1, Je=2, Ve=3 (vendredi = jour le plus chargé).
const effRank=[
  {jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:1,vagues:[{deb:'10:00',fin:'14:00'}]},
  {jour_type:'Je',service:'midi',role:'cuisine',nb_cible:2,vagues:[{deb:'10:00',fin:'14:00'},{deb:'10:00',fin:'14:00'}]},
  {jour_type:'Ve',service:'midi',role:'cuisine',nb_cible:3,vagues:[{deb:'10:00',fin:'14:00'},{deb:'10:00',fin:'14:00'},{deb:'10:00',fin:'14:00'}]},
];
const solo=()=>({id:'solo',nom:'Solo',roles:['cuisine'],exp:['cuisine'],heures_min:16,heures_max:35,taux_horaire_brut:12});

(async()=>{
  // ═══ TEST 1 — DÉFAUT (réglage OFF) : aucun sureffectif créé, suggestions produites, classées Ve→Je→Lu ═══
  let res=await run({sals:[solo()], eff:effRank, regles:[{cle:'sureffectif_minimum',active:false}],
    store:[{salarie_id:'solo',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'14:00'}]}, // 4h, min 16 → manque 12
    ()=>autoFillCore([0,1,2,3,4],{silent:true,phase3only:true,globalUnfilled:[]}));
  const sg=(res.phase3.suggestList||[]).find(x=>x.sid==='solo');
  console.log('  T1 sureff=',surf().length,'| suggestions=',sg&&sg.cands.map(c=>c.jour+' ('+c.cible+')').join(', '),'| eur≈',sg&&Math.round(sg.eur));
  t('T1 aucun créneau sureffectif créé (mode défaut = suggestions)', surf().length===0);
  t('T1b Solo apparaît dans les suggestions avec son manque', !!sg && sg.gap>10);
  t('T1c 1re suggestion = Vendredi (cible 3, jour le plus chargé), jamais Lundi (cible 1)', sg.cands[0].jour==='Vendredi');
  t('T1d suggestions ordonnées par cible décroissante', sg.cands.every((c,i,a)=>i===0||a[i-1].cible>=c.cible));
  t('T1e coût estimé fourni (>0)', sg.eur>0);
  t('T1f Solo listé sous son minimum', (res.underMin||[]).some(u=>u.sid==='solo'));

  // ═══ TEST 2 — RÉGLAGE ON : mode auto conservé, mais placé sur le jour le plus chargé (jamais Lundi) ═══
  res=await run({sals:[solo()], eff:effRank, regles:[{cle:'sureffectif_minimum',active:true,valeur:'5'}],
    store:[{salarie_id:'solo',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'14:00'}]},
    ()=>autoFillCore([0,1,2,3,4],{silent:true,phase3only:true,globalUnfilled:[]}));
  const suf=surf();
  console.log('  T2 sureff placés:',suf.map(c=>JOURS[(new Date(c.date).getDay()+6)%7]).join(', '));
  t('T2 mode auto conservé : des créneaux sureffectif SONT créés', suf.length>=1);
  t('T2b le 1er sureffectif est sur Vendredi (cible 3), pas Lundi (cible 1)', suf.some(c=>((new Date(c.date).getDay()+6)%7)===4) && !suf.some(c=>((new Date(c.date).getDay()+6)%7)===0));

  // ═══ TEST 3 — DÉFAUT sans ligne de règle (orgs existantes) : pas d'activation rétroactive → suggestions ═══
  res=await run({sals:[solo()], eff:effRank, regles:[], // aucune règle sureffectif_minimum en base
    store:[{salarie_id:'solo',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'14:00'}]},
    ()=>autoFillCore([0,1,2,3,4],{silent:true,phase3only:true,globalUnfilled:[]}));
  t('T3 défaut = OFF même sans ligne de règle (pas d\'activation rétroactive) → aucun sureffectif', surf().length===0 && (res.phase3.suggestList||[]).length>=1);

  // ═══ TEST 6 — mardi 4 têtes / 3 simultanés max → AUCUNE alerte de sur-couverture ═══
  res=await run({sals:[
      {id:'a',nom:'A',roles:['cuisine'],heures_min:1,heures_max:45},{id:'b',nom:'B',roles:['cuisine'],heures_min:1,heures_max:45},
      {id:'c',nom:'C',roles:['cuisine'],heures_min:1,heures_max:45},{id:'d',nom:'D',roles:['cuisine'],heures_min:1,heures_max:45}],
    eff:[{jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:3,vagues:[{deb:'10:00',fin:'18:00'},{deb:'10:30',fin:'16:00'},{deb:'11:30',fin:'14:00'}]}],
    regles:[{cle:'sureffectif_minimum',active:false}],
    store:[ // relais : max 3 simultanés (11:30-14:00), 4 têtes sur la journée
      {salarie_id:'a',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'14:00'},
      {salarie_id:'b',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:30',heure_fin:'14:00'},
      {salarie_id:'c',date:D(1),service:'midi',role:'cuisine',heure_debut:'11:30',heure_fin:'16:00'},
      {salarie_id:'d',date:D(1),service:'midi',role:'cuisine',heure_debut:'14:00',heure_fin:'18:00'}]},
    ()=>autoFillCore([0,1,2],{silent:true,phase3only:true,globalUnfilled:[]}));
  console.log('  T6 overflowList=',JSON.stringify(res.phase3.overflowList));
  t('T6 4 têtes qui se relaient (max 3 simultanés = cible) → AUCUNE alerte de sur-couverture', (res.phase3.overflowList||[]).length===0);

  // ═══ TEST 7 — 4 présents SIMULTANÉS pour une cible de 3 → alerte déclenchée ═══
  res=await run({sals:[{id:'a',nom:'A',roles:['cuisine'],heures_min:1,heures_max:45}],
    eff:[{jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:3,vagues:[{deb:'11:30',fin:'14:00'},{deb:'11:30',fin:'14:00'},{deb:'11:30',fin:'14:00'}]}],
    regles:[{cle:'sureffectif_minimum',active:false}],
    store:[ // 4 personnes toutes présentes 11:30→14:00 (chevauchement réel), cible 3
      {salarie_id:'a',date:D(1),service:'midi',role:'cuisine',heure_debut:'11:30',heure_fin:'14:00'},
      {salarie_id:'a2',date:D(1),service:'midi',role:'cuisine',heure_debut:'11:30',heure_fin:'14:00'},
      {salarie_id:'a3',date:D(1),service:'midi',role:'cuisine',heure_debut:'11:30',heure_fin:'14:00'},
      {salarie_id:'a4',date:D(1),service:'midi',role:'cuisine',heure_debut:'11:30',heure_fin:'14:00'}]},
    ()=>autoFillCore([0,1,2],{silent:true,phase3only:true,globalUnfilled:[]}));
  const ov=(res.phase3.overflowList||[])[0];
  console.log('  T7 overflowList=',JSON.stringify(res.phase3.overflowList));
  t('T7 4 présents simultanés pour cible 3 → alerte de sur-couverture déclenchée (cover 4 / need 3)', !!ov && ov.cover===4 && ov.need===3);

  // ═══ TEST 8 — FUSION multi-snack : suggestions du même sid sur 2 snacks → 1 entrée, candidats re-triés ═══
  const merged=suggestFor('m',[
    {sid:'m',name:'Multi',gap:5,eur:60,cands:[{jour:'Lundi',svc:'midi',deb:'10:00',fin:'14:00',cible:1}]},
    {sid:'x',name:'Autre',gap:3,eur:200,cands:[{jour:'Mercredi',svc:'midi',deb:'10:00',fin:'14:00',cible:2}]},
    {sid:'m',name:'Multi',gap:5,eur:80,cands:[{jour:'Vendredi',svc:'soir',deb:'18:00',fin:'23:00',cible:3}]}]);
  console.log('  T8 merged=',merged&&merged.cands.map(c=>c.jour+'('+c.cible+')').join(','),'eur',merged&&merged.eur);
  t('T8 multi-snack : candidats des 2 snacks fusionnés sous un seul sid, triés cible desc, € = max des snacks',
    !!merged && merged.cands.length===2 && merged.cands[0].jour==='Vendredi' && merged.eur===80 && !merged.cands.some(c=>c.jour==='Mercredi'));

  console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);
})();

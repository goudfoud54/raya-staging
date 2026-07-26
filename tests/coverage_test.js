// P1 — couverture horaire dure : la rallonge respecte le profil de besoin par demi-heure (bug de coût S31).
const fs=require("fs");const {extractFn}=require("./extract.js");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); }
const grab=n=>extractFn(h,n);
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._toMin=global._pmin;
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
for(const fn of ['overlaps','_overlap','targetFor','_indispoBlocking','_endCapMin','_ruleCtx','isMultiSnack','weekMinutesOf','weekHoursOf','snackPrioriteOf','hoursOnMorePrioritaryRestos','snackPriorityGate','sureffBlockedByPriority','sortCandidates','plafondOf','getShifts','getCreneau','_creCoversMin','hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement','dayJourType','removeCreneau','autoFillCore','buildPhase3Report']){
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
  global.S={restos:[{id:SNK,nom:'Snack'}],salaries:scn.sals,orgRoles:[{cle:'caisse',nom:'Caisse'}],dispos:[],miseAPied:[],contraintes:[],
    regles:[{cle:'sureffectif_minimum',active:false}],effectifs:scn.eff.map(e=>({...e,restaurant_id:SNK})),
    creneaux:STORE.filter(c=>c.restaurant_id===SNK).map(clone),allCreneauxWeek:STORE.map(clone)};
  return cb().then(r=>{global._lastP3=r&&r.phase3;return r;});
}
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const dur=c=>_pdur(c.heure_debut,c.heure_fin)/60;

(async()=>{
  // ═══ UNIT — profil de besoin caisse Lu-Me midi : vagues [10:30→18:00, 11:30→14:30] ═══
  global.S={effectifs:[{restaurant_id:SNK,jour_type:'Lu-Me',service:'midi',role:'caisse',nb_cible:2,vagues:[{deb:'10:30',fin:'18:00',exp:true},{deb:'11:30',fin:'14:30',exp:false}]}],creneaux:[],orgRoles:[{cle:'caisse',nom:'Caisse'}]};
  global.SNACK={id:SNK,nom:'Snack'};
  t('U1 besoin 10:30–11:30 = 1', _needAt('Lu-Me','midi','caisse',_pmin('11:00'))===1);
  t('U2 besoin 11:30–14:30 = 2 (coup de feu)', _needAt('Lu-Me','midi','caisse',_pmin('12:00'))===2 && _needAt('Lu-Me','midi','caisse',_pmin('14:00'))===2);
  t('U3 besoin 14:30–18:00 = 1', _needAt('Lu-Me','midi','caisse',_pmin('15:00'))===1 && _needAt('Lu-Me','midi','caisse',_pmin('17:30'))===1);
  t('U4 besoin après 18:00 = 0', _needAt('Lu-Me','midi','caisse',_pmin('18:00'))===0);

  // ═══ TEST 1 — cas réel S31 : le renfort 11:30→14:30 NE PEUT PAS être rallongé (long poste couvre déjà) ═══
  let res;
  res=await run({sals:[
      {id:'long',nom:'Long',roles:['caisse'],exp:['caisse'],heures_min:20,heures_max:45},
      {id:'ren',nom:'Renfort',roles:['caisse'],exp:['caisse'],heures_min:30,heures_max:45}], // min 30 → très sous son min
    eff:[{jour_type:'Lu-Me',service:'midi',role:'caisse',nb_cible:2,vagues:[{deb:'10:30',fin:'18:00',exp:true},{deb:'11:30',fin:'14:30',exp:false}]}],
    store:[ // sortie des phases 1&2 : long poste + renfort, sur Lu/Ma/Me
      {salarie_id:'long',date:D(0),service:'midi',role:'caisse',heure_debut:'10:30',heure_fin:'18:00'},
      {salarie_id:'long',date:D(1),service:'midi',role:'caisse',heure_debut:'10:30',heure_fin:'18:00'},
      {salarie_id:'long',date:D(2),service:'midi',role:'caisse',heure_debut:'10:30',heure_fin:'18:00'},
      {salarie_id:'ren',date:D(0),service:'midi',role:'caisse',heure_debut:'11:30',heure_fin:'14:30'},
      {salarie_id:'ren',date:D(1),service:'midi',role:'caisse',heure_debut:'11:30',heure_fin:'14:30'},
      {salarie_id:'ren',date:D(2),service:'midi',role:'caisse',heure_debut:'11:30',heure_fin:'14:30'},
    ]},()=>autoFillCore([0,1,2,3,4,5,6],{silent:true,phase3only:true,globalUnfilled:[]}));
  const renCre=STORE.filter(c=>c.salarie_id==='ren');
  const volPerDay=i=>STORE.filter(c=>c.date===D(i)&&c.service==='midi'&&c.role==='caisse').reduce((a,c)=>a+dur(c),0);
  console.log('  T1 Renfort:',renCre.map(c=>c.date.slice(8)+' '+c.heure_debut.slice(0,5)+'-'+c.heure_fin.slice(0,5)).join(' | '),'| vol/j Lun',volPerDay(0),'Mar',volPerDay(1),'Mer',volPerDay(2),'| rallongeH',(_lastP3||{}).rallongeH);
  t('T1 le renfort reste 11:30→14:30 (3h) — jamais rallongé sur une demi-heure déjà couverte', renCre.every(c=>c.heure_debut.slice(0,5)==='11:30'&&c.heure_fin.slice(0,5)==='14:30'));
  t('T1b volume caisse = 10,5h/jour (7,5 + 3), pas 15,5h', [0,1,2].every(i=>Math.abs(volPerDay(i)-10.5)<0.01));
  t('T1c aucune rallonge appliquée (toutes les demi-heures atteignables sont déjà couvertes)', ((_lastP3||{}).rallongeH||0)<0.01);
  const underMin=(res.underMin||[]).find(u=>u.name==='Renfort');
  t('T1d le renfort est LAISSÉ sous son minimum et SIGNALÉ (manque ~21h)', !!underMin && underMin.have<30);

  // ═══ TEST 2 — non-régression : demi-heure SOUS-couverte → la rallonge s'applique toujours ═══
  await run({sals:[{id:'solo',nom:'Solo',roles:['caisse'],exp:['caisse'],heures_min:20,heures_max:45}],
    eff:[{jour_type:'Lu-Me',service:'midi',role:'caisse',nb_cible:1,vagues:[{deb:'10:00',fin:'15:00',exp:false}]}],
    store:[{salarie_id:'solo',date:D(0),service:'midi',role:'caisse',heure_debut:'10:00',heure_fin:'14:00'}]},
    ()=>autoFillCore([0,1,2,3,4,5,6],{silent:true,phase3only:true,globalUnfilled:[]}));
  const solo=STORE.find(c=>c.salarie_id==='solo');
  console.log('  T2 Solo =',solo.heure_debut.slice(0,5)+'→'+solo.heure_fin.slice(0,5));
  t('T2 demi-heure sous-couverte (14:00→14:30, besoin 1 présent 0) → rallonge appliquée à 15:00', solo.heure_fin.slice(0,5)==='15:00');

  // ═══ TEST 3 — après-minuit : pas de faux positif de sur-couverture (soir 18:00→02:00, besoin 1, 1 présent) ═══
  global.S={effectifs:[{restaurant_id:SNK,jour_type:'Lu-Me',service:'soir',role:'caisse',nb_cible:1,vagues:[{deb:'18:00',fin:'02:00',exp:false}]}],
    creneaux:[{salarie_id:'x',date:D(0),service:'soir',role:'caisse',heure_debut:'18:00',heure_fin:'02:00'}],orgRoles:[{cle:'caisse',nom:'Caisse'}]};
  let over=false; for(let hh=_pmin('18:00');hh<_pmin('18:00')+8*60;hh+=30){ if(_coverAt(D(0),'soir','caisse',hh,null)>_needAt('Lu-Me','soir','caisse',hh)) over=true; }
  t('T3 soir après-minuit : AUCUNE sur-couverture détectée (repères horaires cohérents)', over===false);
  t('T3b ajouter un 2e présent sur ce soir SUR-couvrirait (would-overcover=true)', _wouldOvercover(D(0),'soir','caisse','Lu-Me',_pmin('18:00'),_pmin('18:00')+60,[])===true);

  console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);
})();

// S1 bout-en-bout : autoFillCore RÉEL avec une contrainte pas_apres=20:00 (cas ADAM HOJR) →
// aucun créneau du soir finissant après 20:00 n'est GÉNÉRÉ ; le poste reste non comblé (pas d'erreur/boucle).
const fs=require("fs");const {extractFn}=require("./extract.js");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);   // constantes/helpers de fichier (F2H_*, _finAbsM, _restoNom)
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
const grab=n=>extractFn(h,n);
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._toMin=global._pmin;
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
// Bloc contraintes RÉEL (pas de stub) + deps.
{ const start=h.indexOf('function contrOf(sid){'); const end=h.indexOf('function _endCapMin');
  eval(h.slice(start,end)+'\nglobal.contrOf=contrOf;global._dayIndexOf=_dayIndexOf;global._truthyContr=_truthyContr;global._JOURS_IDX=_JOURS_IDX;global._contrainteBlocking=_contrainteBlocking;'); }
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
  global.S={restos:[{id:SNK,nom:'Snack'}],salaries:scn.sals,orgRoles:[{cle:'cuisine',nom:'Cuisine'}],dispos:[],miseAPied:[],contraintes:scn.contraintes||[],
    regles:[{cle:'sureffectif_minimum',active:false}],effectifs:scn.eff.map(e=>({...e,restaurant_id:SNK})),
    creneaux:[],allCreneauxWeek:[]};
  return cb();
}
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const eff=[{jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:1,vagues:[{deb:'10:00',fin:'14:00',exp:false}]},
           {jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:1,vagues:[{deb:'18:00',fin:'23:00',exp:false}]}];
const adam=extra=>({id:'adam',nom:'ADAM',roles:['cuisine'],exp:['cuisine'],heures_min:8,heures_max:35,...extra});

(async()=>{
  // pas_apres=20:00 ACTIVE
  let res;
  await run({sals:[adam()], eff, contraintes:[{salarie_id:'adam',cle:'pas_apres',valeur:'20:00',active:true}]},
    async()=>{ res=await autoFillCore([0,1,2],{silent:true}); });
  const soirs=STORE.filter(c=>c.salarie_id==='adam'&&c.service==='soir');
  const midis=STORE.filter(c=>c.salarie_id==='adam'&&c.service==='midi');
  const soirsTard=soirs.filter(c=>{let e=_pmin(c.heure_fin),d=_pmin(c.heure_debut);if(e<=d)e+=1440;return e>_pmin('20:00');});
  const soirUnfilled=(res.report||[]).filter(r=>r.svc==='soir');
  console.log('  ADAM midis=',midis.length,'soirs=',soirs.length,'| soir non comblés=',soirUnfilled.length);
  t('ADAM placé sur des midis (fin 14:00, conforme)', midis.length>=1);
  t('AUCUN créneau soir finissant après 20:00 généré pour ADAM (contrainte pas_apres)', soirsTard.length===0);
  t('les postes du soir (fin 23:00) restent NON COMBLÉS (pas d\'autre candidat)', soirUnfilled.length>=1);
  t('run terminé proprement (pas d\'erreur/boucle)', !!res && Array.isArray(res.report));

  // Contrôle : contrainte INACTIVE → ADAM peut être placé le soir
  await run({sals:[adam()], eff, contraintes:[{salarie_id:'adam',cle:'pas_apres',valeur:'20:00',active:false}]},
    async()=>{ res=await autoFillCore([0,1,2],{silent:true}); });
  const soirs2=STORE.filter(c=>c.salarie_id==='adam'&&c.service==='soir');
  console.log('  (inactive) ADAM soirs=',soirs2.length);
  t('contrainte active=false ignorée → ADAM PLACÉ le soir (fin 23:00)', soirs2.length>=1);

  console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);
})();

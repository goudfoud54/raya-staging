// v0.58 — BOUTON « ANALYSER LA SEMAINE » : le rapport à la demande dit la MÊME chose que l'auto-fill.
//
// Le rapport n'existait qu'à la fin d'un auto-fill. Dès que le patron corrige la grille à la main, il
// n'avait plus de vue d'ensemble. Le risque, si l'analyse rejouait le souvenir du dernier auto-fill au
// lieu de recalculer, serait pire que pas de rapport : elle mentirait dès la première correction.
//
// Le premier test est le plus important : il garantit que le bouton et l'auto-fill ne racontent pas deux
// histoires différentes. Il est vrai PAR CONSTRUCTION (computeHoles/diagHole sont partagés) — ce harnais
// est là pour que ça le reste. Fonctions RÉELLES extraites de planning/index.html.
const fs=require("fs");const {extractFn}=require("./extract.js");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);   // constantes/helpers de fichier (F2H_*, _finAbsM, _restoNom)
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;global._effStatus=_effStatus;"); } }
const grab=n=>extractFn(h,n);
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
// roleMain est une const fléchée (pas une déclaration de fonction) → extraite par sa ligne.
eval("global.roleMain="+(h.match(/const roleMain\s*=[^\n]*/)[0].replace(/^const roleMain\s*=/,'').replace(/;$/,''))+";");
for(const fn of ['_toMin','overlaps','_overlap','targetFor','_indispoBlocking','_endCapMin','_ruleCtx','isMultiSnack',
                 'weekMinutesOf','weekHoursOf','snackPrioriteOf','hoursOnMorePrioritaryRestos','snackPriorityGate',
                 'sureffBlockedByPriority','sortCandidates','plafondOf','getShifts','getCreneau','_creCoversMin',
                 'hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement','dayJourType','removeCreneau',
                 'autoFillCore','_rosterList','_withSnack','_revalPhrase','_dateFr','revalidateWeek','analyseWeek','buildPhase3Report','suggestFor']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j;
  for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}
  eval("global.PLACE_RULES="+h.slice(st,j)+";"); }

// ── faux Supabase (même mécanique que intersnack_test) ───────────────────────────────────────────
let STORE=[]; let _id=1; const clone=o=>JSON.parse(JSON.stringify(o));
class Q{ constructor(){this.op=null;this.payload=null;this.filters={};this._in=null;}
  upsert(p){this.op='upsert';this.payload=p;return this;} update(p){this.op='update';this.payload=p;return this;} delete(){this.op='delete';return this;}
  select(){return this;} single(){return Promise.resolve(this._run());} eq(k,v){this.filters[k]=v;return this;} in(k,a){this._in={k,a};return this;} then(r){return Promise.resolve(this._run()).then(r);}
  _run(){ if(this.op==='upsert'){const p=this.payload;const i=STORE.findIndex(c=>c.restaurant_id===p.restaurant_id&&c.salarie_id===p.salarie_id&&c.date===p.date&&c.service===p.service);let row;if(i>=0)row=Object.assign(STORE[i],p);else{row=Object.assign({id:'g'+(_id++)},p);STORE.push(row);}return {data:clone(row),error:null};}
    if(this.op==='update'){const row=STORE.find(c=>c.id===this.filters.id);if(row)Object.assign(row,this.payload);return {data:row?clone(row):null,error:null};}
    if(this.op==='delete'){if(this._in)STORE=STORE.filter(c=>!this._in.a.includes(c[this._in.k]));else STORE=STORE.filter(c=>c.id!==this.filters.id);return {data:null,error:null};} return {data:null,error:null}; } }
global.sb={from(){return new Q();}};
global.window={performance:{now:()=>Date.now()}};
global.document={getElementById:()=>({value:'',style:{},textContent:'',innerHTML:''}),querySelectorAll:()=>[],querySelector:()=>null};
global.localStorage={getItem:()=>null,setItem:()=>{}};
global.setSS=(k,m)=>{if(k==='err')console.error('>>> ERR:',m);};
global._yield=()=>Promise.resolve();global.showAutofillOverlay=()=>{};global.hideAutofillOverlay=()=>{};global.updateAutofillProgress=()=>{};global.showSolveReport=()=>{};global._afMulti=null;
global.beginTxn=()=>{global._txn=[];};global.endTxn=()=>{global._txn=null;};global.recordAction=()=>{};global.updateUndoBtns=()=>{};global._txn=null;global._autofillRunning=false;
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.MONDAY=new Date('2026-08-03T00:00:00'); global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.onRoster=()=>true;global.altDayType=()=>null;global.roleNom=c=>c;global.fullName=s=>s.nom;
global.ORG={coef_charges:1.42};global.escP=s=>(''+(s==null?'':s));
global.salById=id=>SAL[id];global.rolesOf=id=>SAL[id].roles||[];global.isExp=(id,c)=>(SAL[id].exp||[]).includes(c);
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.loadWeek=async()=>{S.creneaux=STORE.filter(c=>c.restaurant_id===SNACK.id).map(clone);S.allCreneauxWeek=STORE.map(clone);};
function D(i){return fmtDate(dateOfDay(i));}

const LO='LO', GC='GC'; const RESTOS=[{id:LO,nom:'Raya Lobau'},{id:GC,nom:'Raya Grand Cœur'}];
function setScn(scn){
  STORE=(scn.store||[]).map(c=>Object.assign({id:'s'+(_id++)},c));
  global.SAL={}; scn.sals.forEach(s=>{ if(!s.snacks_priorites) s.snacks_priorites=[{priorite:1,restaurant_id:LO}]; SAL[s.id]=s; });
  global.SNACK=RESTOS.find(r=>r.id===(scn.snack||LO));
  global.S={restos:RESTOS,salaries:scn.sals,orgRoles:[{cle:'cuisine',nom:'cuisine'}],dispos:scn.dispos||[],miseAPied:[],
    regles:scn.regles||[{cle:'sureffectif_minimum',active:false,valeur:'2'},{cle:'transfert_inter_snack',active:false,valeur:''}],
    effectifs:scn.eff,contraintes:[],derogations:scn.derogations||[],
    creneaux:STORE.filter(c=>c.restaurant_id===(scn.snack||LO)).map(clone),allCreneauxWeek:STORE.map(clone)};
}
let ok=true;
const t=(l,c,extra)=>{console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra==null?'':extra)));ok=c&&ok;};
const key=r=>`${r.date}|${r.svc}|${r.roleCle||r.role}|${r.horaire}`;
const sorted=a=>a.slice().sort();

// Effectifs : 2 cuisiniers midi + 2 soir tous les jours → beaucoup plus de postes que de salariés
// disponibles, donc des trous garantis quel que soit le placement.
const eff2=rid=>['Lu-Me','Je','Ve','Sa','Di'].flatMap(jt=>[
  {restaurant_id:rid,jour_type:jt,service:'midi',role:'cuisine',nb_cible:2,vagues:[{deb:'11:00',fin:'15:00',exp:false},{deb:'11:30',fin:'14:30',exp:false}]},
  {restaurant_id:rid,jour_type:jt,service:'soir',role:'cuisine',nb_cible:2,vagues:[{deb:'18:30',fin:'23:30',exp:false},{deb:'19:00',fin:'23:00',exp:false}]},
]);
const SALS=()=>[
  {id:'ana',nom:'Ana',roles:['cuisine'],exp:['cuisine'],heures_min:20,heures_max:39,taux_horaire_brut:12,snacks_priorites:[{priorite:1,restaurant_id:LO}]},
  {id:'bob',nom:'Bob',roles:['cuisine'],exp:['cuisine'],heures_min:20,heures_max:39,taux_horaire_brut:12,snacks_priorites:[{priorite:1,restaurant_id:LO}]},
];

(async()=>{

console.log('── 1. L\'ANALYSE DIT LA MÊME CHOSE QU\'UN AUTO-FILL QUI VIENT DE TOURNER ───────────────');
{ setScn({snack:LO, sals:SALS(), eff:eff2(LO), store:[]});
  const res=await autoFillCore([0,1,2,3,4,5,6],{});
  await loadWeek();
  const ana=analyseWeek({});
  const apresAF=sorted((res.report||[]).map(key));
  const parAnalyse=sorted(ana.postes.map(key));
  t('l\'auto-fill a bien laissé des postes non comblés (sinon le test ne prouverait rien)', apresAF.length>0, apresAF.length);
  t('MÊME ensemble de postes non comblés (auto-fill vs analyse)',
    JSON.stringify(apresAF)===JSON.stringify(parAnalyse),
    '\n      auto-fill : '+JSON.stringify(apresAF)+'\n      analyse   : '+JSON.stringify(parAnalyse));
  // Les MOTIFS sont recalculés sur la grille FINALE : identiques ici (aucune phase 3 active), ce qui
  // vérifie que diagHole est bien la source unique des deux chemins.
  const mAF=sorted((res.report||[]).map(r=>r.cle)), mAN=sorted(ana.postes.map(r=>r.cle));
  t('MÊMES motifs de blocage', JSON.stringify(mAF)===JSON.stringify(mAN), JSON.stringify(mAF)+' vs '+JSON.stringify(mAN));
  t('l\'analyse porte une conclusion en français', /poste\(s\) non comblé|planning complet/.test(ana.conclusion), ana.conclusion);
}

console.log('\n── 2. ELLE RESTE JUSTE APRÈS UNE MODIFICATION MANUELLE ────────────────────────────────');
{ setScn({snack:LO, sals:SALS(), eff:eff2(LO), store:[]});
  await autoFillCore([0,1,2,3,4,5,6],{});
  await loadWeek();
  const avant=analyseWeek({}).postes.length;
  // Le patron supprime un créneau à la main → un trou de plus, et l'analyse doit le voir.
  const victime=S.creneaux.find(c=>c.heure_debut);
  STORE=STORE.filter(c=>c.id!==victime.id);
  await loadWeek();
  const apres=analyseWeek({}).postes.length;
  t('un créneau supprimé à la main → un poste non comblé de plus', apres===avant+1, `avant=${avant} après=${apres}`);
  // …et en ajouter un le fait disparaître.
  STORE.push({id:'manuel1',restaurant_id:LO,salarie_id:victime.salarie_id,date:victime.date,service:victime.service,
              role:'cuisine',heure_debut:victime.heure_debut,heure_fin:victime.heure_fin});
  await loadWeek();
  t('le créneau reposé à la main → le poste redevient comblé', analyseWeek({}).postes.length===avant, analyseWeek({}).postes.length);
}

console.log('\n── 3. ELLE FONCTIONNE SUR UNE SEMAINE JAMAIS AUTO-REMPLIE ─────────────────────────────');
{ // Aucune exécution d'auto-fill : uniquement des créneaux saisis à la main.
  setScn({snack:LO, sals:SALS(), eff:eff2(LO), store:[
    {restaurant_id:LO,salarie_id:'ana',date:D(0),service:'midi',role:'cuisine',heure_debut:'11:00',heure_fin:'15:00'},
  ]});
  const ana=analyseWeek({});
  t('l\'analyse tourne sans auto-fill préalable', Array.isArray(ana.postes));
  t('… et compte les postes restants (2 vagues × 2 services × 7 j = 28, moins 1 posé)', ana.postes.length===27, ana.postes.length);
  t('… Bob, sans aucune heure, est signalé', ana.sansCreneau.some(x=>x.sid==='bob'), JSON.stringify(ana.sansCreneau.map(x=>x.sid)));
  t('… Ana, qui a 4 h, n\'est PAS dans « sans aucun créneau »', !ana.sansCreneau.some(x=>x.sid==='ana'));
  t('… Ana (4 h < 20 h min) est sous son minimum', ana.sousMin.some(x=>x.sid==='ana'), JSON.stringify(ana.sousMin.map(x=>x.sid)));
  t('… le coût de la semaine est calculé (4 h × 12 €)', Math.round(ana.cout.brut)===48, ana.cout.brut);
  t('… le coût chargé applique le coef org (×1,42)', Math.round(ana.cout.charge)===68, ana.cout.charge);
  t('… sans semaine précédente fournie, aucun écart inventé', ana.cout.ecart===null, ana.cout.ecart);
  const a2=analyseWeek({prevCost:40});
  t('… avec la semaine précédente, l\'écart est chiffré (+8 €)', Math.round(a2.cout.ecart)===8, a2.cout.ecart);
}

console.log('\n── 4. LES HEURES D\'UN MULTI-SNACK SONT CUMULÉES (piège récurrent du module) ───────────');
{ // 10 h à Lobau + 20 h à Grand Cœur = 30 h. Minimum 25 h → il N'EST PAS sous son minimum.
  const multi={id:'mul',nom:'Multi',roles:['cuisine'],exp:['cuisine'],heures_min:25,heures_max:39,taux_horaire_brut:12,
               est_multi:true,snacks_priorites:[{priorite:1,restaurant_id:LO},{priorite:2,restaurant_id:GC}]};
  setScn({snack:LO, sals:[multi], eff:[], store:[
    {restaurant_id:LO,salarie_id:'mul',date:D(0),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
    {restaurant_id:LO,salarie_id:'mul',date:D(1),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
    {restaurant_id:GC,salarie_id:'mul',date:D(2),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
    {restaurant_id:GC,salarie_id:'mul',date:D(3),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
    {restaurant_id:GC,salarie_id:'mul',date:D(4),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
    {restaurant_id:GC,salarie_id:'mul',date:D(5),service:'midi',role:'cuisine',heure_debut:'10:00',heure_fin:'15:00'},
  ]});
  const ana=analyseWeek({});
  t('30 h cumulées sur 2 restaurants ≥ 25 h min → PAS sous son minimum', !ana.sousMin.some(x=>x.sid==='mul'), JSON.stringify(ana.sousMin));
  t('… et il n\'est pas compté « sans aucun créneau »', !ana.sansCreneau.some(x=>x.sid==='mul'));
  t('… le coût n\'inclut QUE le restaurant affiché (10 h × 12 € = 120 €)', Math.round(ana.cout.brut)===120, ana.cout.brut);
  // Même salarié, plafond abaissé à 28 h → le dépassement doit être vu sur le TOTAL inter-snack,
  // alors que ses heures locales (10 h) sont très en dessous.
  SAL.mul.heures_max=28; S.salaries[0].heures_max=28;
  const a2=analyseWeek({});
  t('plafond 28 h dépassé par le cumul inter-snack (30 h), pas par le local (10 h)',
    a2.surPlafond.some(x=>x.sid==='mul' && Math.abs(x.ecart-2)<0.01), JSON.stringify(a2.surPlafond));
  t('… la conclusion le mentionne', /au-dessus de leur plafond/.test(a2.conclusion), a2.conclusion);
  // Proche du plafond (≥ 95 %) sans le dépasser : 30 h sur 31 h.
  SAL.mul.heures_max=31; S.salaries[0].heures_max=31;
  const a3=analyseWeek({});
  t('30 h sur un plafond de 31 h → signalé « proche du plafond », pas « au-dessus »',
    a3.prochePlafond.some(x=>x.sid==='mul') && !a3.surPlafond.length, JSON.stringify(a3.prochePlafond));
}

console.log('\n── 5. UNE DÉROGATION POSÉE À LA MAIN APPARAÎT ──────────────────────────────────────────');
{ setScn({snack:LO, sals:SALS(), eff:[], store:[
    {restaurant_id:LO,salarie_id:'ana',date:D(2),service:'soir',role:'cuisine',heure_debut:'18:30',heure_fin:'23:30'},
  ], derogations:[
    {id:'d1',restaurant_id:LO,salarie_id:'ana',date:D(2),service:'soir',regle_cle:'repos_quot',
     regle_label:'repos quotidien < minimum légal',motif:'remplacement urgent'},
    // Ligne de journalisation d'un réglage sous seuil légal (logLegalOverride) : salarie_id NULL.
    // Ce n'est PAS un créneau forcé — elle ne doit pas polluer la liste.
    {id:'d2',restaurant_id:LO,salarie_id:null,date:D(2),service:null,regle_cle:'repos_quotidien_h',
     regle_label:'Réglage sous seuil légal : repos quotidien',motif:'confirmé à 9h'},
    // Dérogation HORS de la semaine affichée → ignorée.
    {id:'d3',restaurant_id:LO,salarie_id:'bob',date:'2026-07-20',service:'midi',regle_cle:'plafond',
     regle_label:'plafond dépassé',motif:'ancienne'},
  ]});
  const ana=analyseWeek({});
  t('la dérogation de la semaine est listée', ana.derogs.length===1, JSON.stringify(ana.derogs.map(d=>d.id)));
  t('… avec le nom du salarié, le jour et la règle enfreinte',
    ana.derogs[0].name==='Ana' && ana.derogs[0].jour==='Mercredi' && /repos quotidien/.test(ana.derogs[0].regle_label), JSON.stringify(ana.derogs[0]));
  t('… et son motif', ana.derogs[0].motif==='remplacement urgent');
  t('la journalisation « réglage sous seuil légal » (salarie_id null) est EXCLUE', !ana.derogs.some(d=>d.id==='d2'));
  t('une dérogation d\'une autre semaine est EXCLUE', !ana.derogs.some(d=>d.id==='d3'));
  t('la conclusion mentionne la dérogation', /1 dérogation/.test(ana.conclusion), ana.conclusion);
  // Les dérogations passées en argument l'emportent sur S.derogations (analyseWeek reste PURE).
  t('opt.derogations est prioritaire sur S.derogations', analyseWeek({derogations:[]}).derogs.length===0);
}

console.log('\n── 6. ÉTAT « RIEN À SIGNALER » ────────────────────────────────────────────────────────');
{ // Un seul salarié, sans minimum ni plafond, aucun effectif cible → rien à reprocher.
  setScn({snack:LO, eff:[], sals:[{id:'zen',nom:'Zen',roles:['cuisine'],exp:['cuisine'],heures_min:0,heures_max:0,
          taux_horaire_brut:12,snacks_priorites:[{priorite:1,restaurant_id:LO}]}], store:[
    {restaurant_id:LO,salarie_id:'zen',date:D(0),service:'midi',role:'cuisine',heure_debut:'11:00',heure_fin:'15:00'},
  ]});
  const ana=analyseWeek({});
  t('aucune anomalie → drapeau « rien à signaler »', ana.rien===true, JSON.stringify(ana.compteurs));
  t('… et la conclusion dit « planning complet »', /planning complet/.test(ana.conclusion), ana.conclusion);
}

console.log(ok?'\nALL PASS':'\nSOME FAILED');
process.exit(ok?0:1);
})();

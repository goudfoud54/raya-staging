// v0.74 — LIMITER LES FERMETURES TARDIVES PAR SALARIÉ ET PAR SEMAINE.
//
// Demande du patron : « mes salariés ne veulent pas faire plus de 2 fermetures à 2 h du matin chacun ».
// Réglage d'organisation (désactivé par défaut) + exception individuelle dans la fiche, appliqués dans
// checkPlacement (source unique : auto-fill, saisie manuelle, rallonge de phase 3, revalidation).
//
// Fonctions RÉELLES extraites de planning/index.html. Le réglage est lu par le VRAI _ruleCtx (→ _regleOf
// → S.regles / RULE_META), pas par un stub : c'est ce qui prouve que la case cochée est lue à l'exécution.
//   §1 frontières horaires des deux côtés de minuit       §6 auto-fill : cocher la case change le résultat
//   §2 règle désactivée / inactive / active (manuel)      §7 rallonge de phase 3 jusqu'à 02:00
//   §3 inter-snack                                        §8 Analyse (revalidation) + dérogation assumée
//   §4 rattachement à la date du créneau (samedi → dim.)  §9 panneau Vérifications
//   §5 exception individuelle de la fiche
const fs=require("fs");const {extractFn}=require("./extract.js");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);   // _regleOf, RULE_META, fermeturesTardives*, contrOf, _revalPhrase…
const grab=n=>extractFn(h,n);
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO");
  if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
// STUB : aucune AUTRE contrainte de fiche dans ces scénarios. La contrainte max_fermetures_tardives n'est
// PAS lue par _contrainteBlocking mais par fermeturesTardivesRegle (vérifié au §5 : pas de double application).
global._contrainteBlocking=()=>null;
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
for(const fn of ['_toMin','overlaps','_overlap','targetFor','_indispoBlocking','_ruleCtx',
                 'isMultiSnack','weekMinutesOf','weekHoursOf','snackPrioriteOf','hoursOnMorePrioritaryRestos',
                 'snackPriorityGate','sureffBlockedByPriority','sortCandidates','plafondOf','getShifts',
                 'getCreneau','_creCoversMin','hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement',
                 'removeCreneau','autoFillCore','explainViolation','revalidateWeek','renderChecks']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); process.exit(1); }
}

// ── Stub d'écriture (identique à releve_test.js) ──────────────────────────────────────────────────
let STORE=[]; let _id=1; const clone=o=>JSON.parse(JSON.stringify(o));
class Q{ constructor(){this.op=null;this.payload=null;this.filters={};this._in=null;}
  upsert(p){this.op='upsert';this.payload=p;return this;} update(p){this.op='update';this.payload=p;return this;} delete(){this.op='delete';return this;}
  select(){return this;} single(){return Promise.resolve(this._run());} eq(k,v){this.filters[k]=v;return this;} in(k,a){this._in={k,a};return this;} then(r){return Promise.resolve(this._run()).then(r);}
  _run(){ if(this.op==='upsert'){const p=this.payload;const i=STORE.findIndex(c=>c.restaurant_id===p.restaurant_id&&c.salarie_id===p.salarie_id&&c.date===p.date&&c.service===p.service);let row;if(i>=0)row=Object.assign(STORE[i],p);else{row=Object.assign({id:'g'+(_id++)},p);STORE.push(row);}return {data:clone(row),error:null};}
    if(this.op==='update'){const row=STORE.find(c=>c.id===this.filters.id);if(row)Object.assign(row,this.payload);return {data:row?clone(row):null,error:null};}
    if(this.op==='delete'){if(this._in)STORE=STORE.filter(c=>!this._in.a.includes(c[this._in.k]));else STORE=STORE.filter(c=>c.id!==this.filters.id);return {data:null,error:null};} return {data:null,error:null}; } }
global.sb={from(){return new Q();}};
global.window={performance:{now:()=>Date.now()}};
let CHECKS_HTML='';
global.document={getElementById:id=>({value:'',style:{},textContent:'',set innerHTML(v){ if(id==='checks') CHECKS_HTML=v; }, get innerHTML(){return '';}}),querySelectorAll:()=>[]};
global.setSS=(k,m)=>{if(k==='err')console.error('>>> AUTOFILL ERR:',m);};global._yield=()=>Promise.resolve();
global.showAutofillOverlay=()=>{};global.hideAutofillOverlay=()=>{};global.updateAutofillProgress=()=>{};global.showSolveReport=()=>{};global._afMulti=null;
global.beginTxn=()=>{global._txn=[];};global.endTxn=()=>{global._txn=null;};global.recordAction=()=>{};global.updateUndoBtns=()=>{};global._txn=null;global._autofillRunning=false;
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.MONDAY=new Date('2026-11-16T00:00:00'); global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.onRoster=()=>true;global.altDayType=()=>null;global.roleNom=c=>c;global.ORG={coef_charges:1.42};global.escP=s=>(''+(s==null?'':s));
global.fullName=s=>[s.prenom,s.nom].filter(Boolean).join(' ')||s.nom; global.nameOf=undefined;
global.salById=id=>SAL[id];global.rolesOf=id=>(SAL[id]&&SAL[id].roles)||[];global.isExp=(id,c)=>((SAL[id]&&SAL[id].exp)||[]).includes(c);
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.loadWeek=async()=>{S.creneaux=STORE.filter(c=>c.restaurant_id===SNACK.id).map(clone);S.allCreneauxWeek=STORE.map(clone);};
const D=i=>fmtDate(dateOfDay(i));          // D(0)=lun. 16/11 … D(5)=sam. 21/11, D(6)=dim. 22/11
const SNK='snk', LOB='lob';
const RESTOS=[{id:SNK,nom:'Raya Grand Coeur'},{id:LOB,nom:'Raya Lobau'}];
const RATT=[{priorite:1,restaurant_id:SNK},{priorite:2,restaurant_id:LOB}];
const sal=(id,extra)=>({id,prenom:id.toUpperCase(),nom:'T',roles:['caisse'],exp:['caisse'],heures_min:0,heures_max:60,snacks_priorites:RATT,...(extra||{})});
// Lignes de réglage telles qu'en base (planning_regles, portée organisation).
const R_ON =(n,seuil)=>[{cle:'fermetures_tardives_max',active:true,valeur:String(n),restaurant_id:null},{cle:'fermeture_tardive_seuil',active:true,valeur:seuil||'02:00',restaurant_id:null}];
const R_OFF=(n)=>[{cle:'fermetures_tardives_max',active:false,valeur:String(n),restaurant_id:null}];
const cre=(sid,rid,date,svc,deb,fin,extra)=>({id:'c'+(_id++),salarie_id:sid,restaurant_id:rid,date,service:svc,role:'caisse',heure_debut:deb,heure_fin:fin,...(extra||{})});
function setS(rows, regles, opt){
  opt=opt||{};
  global.SNACK=RESTOS.find(r=>r.id===(opt.snack||SNK));
  global.S={restos:RESTOS,salaries:Object.values(SAL),orgRoles:opt.orgRoles||[],dispos:[],miseAPied:[],
    contraintes:opt.contraintes||[],derogations:opt.derogs||[],regles:regles||[],effectifs:opt.eff||[],
    creneaux:rows.filter(c=>c.restaurant_id===SNACK.id).map(clone),allCreneauxWeek:rows.map(clone)};
}
const cp=(sid,deb,fin,date,svc,o)=>checkPlacement(sid,{deb,fin,role:'caisse'},date,svc||'soir',(new Date(date+'T00:00:00').getDay()+6)%7,Object.assign({manual:true},o||{}));

let ok=true,n=0;
const t=(l,c,extra)=>{n++;console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra==null?'':extra)));ok=!!c&&ok;};

(async()=>{
// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 1. FRONTIÈRES HORAIRES — des deux côtés de minuit ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
{ const S2=_ftSeuilAbs('02:00'), S23=_ftSeuilAbs('23:00'), S0=_ftSeuilAbs('00:00');
  t('seuil 02:00 = 2 h du MATIN (1560 min absolues)', S2===1560, S2);
  t('seuil 23:00 = le soir même (1380)', S23===1380, S23);
  t('seuil 00:00 = minuit (1440), pas « pas de seuil »', S0===1440, S0);
  const cas=[ // [deb, fin, seuil, attendu, libellé]
    ['19:00','02:00',S2,true ,'19:00 → 02:00 EST une fermeture à 2 h (fin ≤ début ⇒ +1440)'],
    ['11:00','15:00',S2,false,'11:00 → 15:00 n\'en est PAS une, même si 15 > 2'],
    ['18:00','01:59',S2,false,'18:00 → 01:59 : une minute avant le seuil → non'],
    ['19:00','03:00',S2,true ,'19:00 → 03:00 : au-delà du seuil → oui'],
    ['18:00','00:00',S2,false,'18:00 → 00:00 (fermeture à minuit) : non, avec un seuil à 02:00'],
    ['19:00','23:30',S23,true ,'seuil 23:00 : 19:00 → 23:30 compte'],
    ['19:00','02:00',S23,true ,'seuil 23:00 : 19:00 → 02:00 compte aussi'],
    ['11:00','22:59',S23,false,'seuil 23:00 : 11:00 → 22:59 ne compte pas'],
    ['11:00','23:00',S23,true ,'seuil 23:00 : 11:00 → 23:00 COMPTE (inclusif, choix assumé : « finit à 23:00 ou plus tard »)'],
    ['18:00','00:00',S0,true ,'seuil 00:00 : 18:00 → 00:00 compte'],
    ['18:00','23:59',S0,false,'seuil 00:00 : 18:00 → 23:59 ne compte pas'],
  ];
  for(const [d,f,s,att,l] of cas) t(l, estFermetureTardive(d,f,s)===att); }

// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2. RÈGLE DÉSACTIVÉE → AUCUN CHANGEMENT · ACTIVE À 2 × 02:00 → LA 3ᵉ EST REFUSÉE (saisie manuelle) ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
global.SAL={ali:sal('ali'), bob:sal('bob')};
const DEUX=[cre('ali',SNK,D(0),'soir','19:00','02:00'), cre('ali',SNK,D(2),'soir','19:00','02:00')];
setS(DEUX, []);
t('aucune ligne en base (organisation qui n\'a jamais réglé) → 3ᵉ fermeture acceptée', cp('ali','19:00','02:00',D(4))===null);
setS(DEUX, R_OFF(2));
t('règle présente mais DÉCOCHÉE → 3ᵉ fermeture acceptée', cp('ali','19:00','02:00',D(4))===null);
setS(DEUX, R_ON(2));
let v=cp('ali','19:00','02:00',D(4));
t('règle cochée à 2 × 02:00 → 3ᵉ fermeture REFUSÉE (motif fermetures_tardives)', v && v.cle==='fermetures_tardives', v&&v.cle);
let ex=v && explainViolation(v,{shift:{deb:'19:00',fin:'02:00'},date:D(4),svc:'soir'});
console.log('  Motif :', ex&&ex.why); console.log('  Réglage :', ex&&ex.reglage);
t('motif lisible avec les dates : « Déjà 2 fermetures à 02:00 ou plus tard cette semaine (lun. 16, mer. 18) »',
  ex && /^Déjà 2 fermetures à 02:00 ou plus tard cette semaine \(lun\. 16, mer\. 18\)/.test(ex.why), ex&&ex.why);
t('… et pointe vers le réglage « Limiter les fermetures tardives »', ex && /Limiter les fermetures tardives/.test(ex.reglage), ex&&ex.reglage);
t('un service NON tardif le même soir reste accepté (19:00 → 00:00)', cp('ali','19:00','00:00',D(4))===null);
t('un midi reste accepté (11:00 → 15:00)', cp('ali','11:00','15:00',D(4),'midi')===null);
t('un autre salarié sans fermeture n\'est pas concerné', cp('bob','19:00','02:00',D(4))===null);
setS(DEUX, R_ON(3));
t('règle à 3 → la 3ᵉ passe', cp('ali','19:00','02:00',D(4))===null);
setS(DEUX, R_ON(0));
t('règle à 0 (« aucune fermeture tardive ») est respectée, pas remplacée par un défaut', (cp('bob','19:00','02:00',D(4))||{}).cle==='fermetures_tardives');
setS(DEUX, R_ON(2,'23:00'));
t('seuil réglé à 23:00 : un 19:00 → 23:30 devient la 3ᵉ fermeture → refusé', (cp('ali','19:00','23:30',D(4))||{}).cle==='fermetures_tardives');
// Modifier une fermeture EXISTANTE (excludeSelf) ne la compte pas deux fois.
setS(DEUX, R_ON(2));
t('modifier l\'une des 2 fermetures existantes (excludeSelf) reste permis', cp('ali','19:30','02:00',D(2),'soir',{excludeSelf:true})===null);

// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 3. INTER-SNACK — deux fermetures à Lobau + une ici = 3 ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
setS([cre('ali',LOB,D(0),'soir','19:00','02:00'), cre('ali',LOB,D(1),'soir','19:00','02:30')], R_ON(2));
v=cp('ali','19:00','02:00',D(4));
ex=v && explainViolation(v,{shift:{deb:'19:00',fin:'02:00'},date:D(4),svc:'soir'});
t('les 2 fermetures posées à Lobau comptent : la 3ᵉ, à Grand Cœur, est refusée', v && v.cle==='fermetures_tardives', v&&v.cle);
t('… et le motif dit où elles sont (« lun. 16 à Lobau, mar. 17 à Lobau »)', ex && /lun\. 16 à Lobau, mar\. 17 à Lobau/.test(ex.why), ex&&ex.why);
setS([cre('ali',LOB,D(0),'soir','19:00','02:00'), cre('ali',SNK,D(1),'soir','19:00','02:00')], R_ON(2), {snack:LOB});
t('vu depuis Lobau : une à Lobau + une à Grand Cœur → la 3ᵉ à Lobau refusée', (cp('ali','19:00','02:00',D(3))||{}).cle==='fermetures_tardives');

// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 4. SEMAINE — la fermeture compte pour le jour où le service COMMENCE ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
setS([cre('ali',SNK,D(5),'soir','19:00','02:00'), cre('ali',SNK,D(6),'soir','19:00','02:00')], R_ON(2));
v=cp('ali','19:00','02:00',D(4));
t('samedi 19:00 → dim. 02:00 et dimanche 19:00 → lun. 02:00 comptent dans CETTE semaine', v && v.cle==='fermetures_tardives' && v._ft.deja.map(c=>c.date).join()===[D(5),D(6)].join(), v&&JSON.stringify(v._ft.deja.map(c=>c.date)));
t('… listés « sam. 21, dim. 22 »', v && /sam\. 21, dim\. 22/.test(explainViolation(v,{shift:{deb:'19:00',fin:'02:00'}}).why));

// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 5. EXCEPTION INDIVIDUELLE (fiche du salarié) ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
const DEUX_AB=[...DEUX, cre('bob',SNK,D(0),'soir','19:00','02:00'), cre('bob',SNK,D(2),'soir','19:00','02:00')];
const EXC=(sid,val,active)=>({salarie_id:sid,cle:'max_fermetures_tardives',valeur:String(val),active:active!==false});
setS(DEUX_AB, R_ON(2), {contraintes:[EXC('ali',3)]});
t('ali a « 3 » dans sa fiche → sa 3ᵉ fermeture passe', cp('ali','19:00','02:00',D(4))===null);
t('bob (sans exception) reste à 2 → sa 3ᵉ est refusée', (cp('bob','19:00','02:00',D(4))||{}).cle==='fermetures_tardives');
setS(DEUX_AB, [], {contraintes:[EXC('ali',1)]});
v=cp('ali','19:00','02:00',D(4));
t('exception à 1, règle d\'organisation ABSENTE → l\'exception s\'applique quand même (choix assumé)', v && v.cle==='fermetures_tardives' && v._ft.source==='fiche', v&&v.cle);
ex=v && explainViolation(v,{shift:{deb:'19:00',fin:'02:00'}});
t('… le motif le dit (« limite propre à sa fiche ») et renvoie vers la fiche', ex && /limite propre à sa fiche/.test(ex.why) && /^Fiche du salarié/.test(ex.reglage), ex&&(ex.why+' | '+ex.reglage));
t('… et bob n\'est pas concerné (pas de règle d\'organisation)', cp('bob','19:00','02:00',D(4))===null);
setS(DEUX_AB, R_ON(2), {contraintes:[EXC('ali',5,false)]});
t('exception DÉSACTIVÉE dans la fiche → la règle d\'organisation reprend la main', (cp('ali','19:00','02:00',D(4))||{}).cle==='fermetures_tardives');
t('pas de double application : _contrainteBlocking ne lit PAS max_fermetures_tardives', !grab('_contrainteBlocking').includes('max_fermetures_tardives'));

// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 6. AUTO-FILL RÉEL — cocher la case change réellement le résultat ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Un seul salarié, un poste de caisse 19:00 → 02:00 chaque soir du lundi au vendredi. Rien d'autre ne le
// limite (plafond 60 h, aucun plafond d'heure de fin, repos de 17 h entre deux soirs).
const EFF=['Lu-Me','Je','Ve'].map(jt=>({restaurant_id:SNK,jour_type:jt,service:'soir',role:'caisse',nb_cible:1,vagues:[{deb:'19:00',fin:'02:00',exp:false}]}));
async function af(regles){
  STORE=[]; global.SAL={ali:sal('ali',{heures_min:5})};
  setS([], regles, {eff:EFF, orgRoles:[{cle:'caisse',nom:'Caisse'}]});
  S.regles=[...regles,{cle:'sureffectif_minimum',active:false}];
  const res=await autoFillCore([0,1,2,3,4],{silent:true});
  return {late:STORE.filter(c=>c.salarie_id==='ali' && estFermetureTardive(c.heure_debut,c.heure_fin,_ftSeuilAbs('02:00'))), res};
}
{ const A=await af([]), B=await af(R_OFF(2)), C=await af(R_ON(2));
  console.log('  fermetures posées — sans ligne :',A.late.length,'· décochée :',B.late.length,'· cochée à 2 :',C.late.length);
  t('sans réglage en base : 5 fermetures posées (référence)', A.late.length===5, A.late.length);
  t('règle DÉCOCHÉE : résultat IDENTIQUE à « sans réglage »', B.late.length===A.late.length && JSON.stringify(B.late.map(c=>c.date))===JSON.stringify(A.late.map(c=>c.date)));
  t('règle COCHÉE à 2 : l\'auto-fill n\'en pose que 2', C.late.length===2, C.late.length);
  const nc=(C.res.report||[]).filter(r=>r.svc==='soir');
  t('… les 3 autres postes restent NON COMBLÉS (pas d\'autre candidat)', nc.length===3, nc.length);
  t('… avec le motif « fermetures tardives » dans le rapport', nc.length>0 && nc.every(r=>JSON.stringify(r).includes('fermeture')), JSON.stringify(nc[0]||{}).slice(0,300)); }

// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 7. RALLONGE DE PHASE 3 — prolonger jusqu\'à 02:00 crée une fermeture ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// ali est sous son minimum (30 h) ; mercredi il fait 19:00 → 00:00 sur un poste qui va jusqu'à 02:00 :
// la rallonge veut le prolonger. Il a déjà deux fermetures à 02:00 (lundi, mardi).
const EFF_R=[{restaurant_id:SNK,jour_type:'Lu-Me',service:'soir',role:'caisse',nb_cible:1,vagues:[{deb:'19:00',fin:'02:00',exp:false}]}];
async function rall(regles, avecDeux){
  global.SAL={ali:sal('ali',{heures_min:30,heures_max:48})};
  STORE=[...(avecDeux?[cre('ali',SNK,D(0),'soir','19:00','02:00'),cre('ali',SNK,D(1),'soir','19:00','02:00')]:[]),
         cre('ali',SNK,D(2),'soir','19:00','00:00')];
  setS(STORE, regles, {eff:EFF_R, orgRoles:[{cle:'caisse',nom:'Caisse'}]});
  S.regles=[...regles,{cle:'sureffectif_minimum',active:false}];
  const r=await autoFillCore([0,1,2,3,4,5,6],{silent:true,phase3only:true,globalUnfilled:[]});
  return {mer:STORE.find(c=>c.date===D(2)), p3:(r&&r.phase3)||{}};
}
{ const off=await rall([], true), on=await rall(R_ON(2), true), seul=await rall(R_ON(2), false);
  console.log('  mercredi — règle absente :',off.mer.heure_fin,'· règle à 2 :',on.mer.heure_fin,'· règle à 2 sans les 2 fermetures :',seul.mer.heure_fin);
  t('CONTRE-ÉPREUVE règle absente : la rallonge va jusqu\'à 02:00', off.mer.heure_fin.slice(0,5)==='02:00', off.mer.heure_fin);
  t('règle à 2 et déjà 2 fermetures : la rallonge s\'arrête à 01:30 (pas de 3ᵉ fermeture)', on.mer.heure_fin.slice(0,5)==='01:30', on.mer.heure_fin);
  t('… la rallonge a bien eu lieu (00:00 → 01:30), elle n\'est pas gelée', (on.p3.rallongeH||0)>1.4, on.p3.rallongeH);
  t('règle à 2 sans fermeture préalable : la rallonge va jusqu\'à 02:00 (1ʳᵉ fermeture, permise)', seul.mer.heure_fin.slice(0,5)==='02:00', seul.mer.heure_fin); }

// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 8. ANALYSE DE LA SEMAINE — dépassements DÉJÀ POSÉS (avant activation de la règle) ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
global.SAL={ali:sal('ali'), bob:sal('bob')};
const TROIS=[cre('ali',SNK,D(0),'soir','19:00','02:00'), cre('ali',LOB,D(2),'soir','19:00','02:00'), cre('ali',SNK,D(4),'soir','19:00','02:00'),
             cre('ali',SNK,D(6),'midi','11:00','15:00')];   // un midi (non tardif) qui ne doit pas compter
setS(TROIS, R_ON(2));
let rv=revalidateWeek(); let inf=rv.infractions.filter(x=>x.cle==='fermetures_tardives');
console.log('  Analyse :', inf.length?inf[0].why:'—');
t('UNE entrée pour ali (règle hebdomadaire, pas une par créneau)', inf.length===1, JSON.stringify(rv.infractions.map(x=>x.cle)));
t('… qui liste les 3 fermetures, Lobau compris : « lun. 16, mer. 18 à Lobau, ven. 20 » ; maximum 2', inf.length===1 && /3 fermetures à 02:00 ou plus tard cette semaine \(lun\. 16, mer\. 18 à Lobau, ven\. 20\) ; le maximum est de 2/.test(inf[0].why), inf.length?inf[0].why:'');
setS(TROIS, R_OFF(2));
t('règle décochée → rien dans l\'Analyse', revalidateWeek().infractions.filter(x=>x.cle==='fermetures_tardives').length===0);
// Dérogation : le patron a FORCÉ la 3ᵉ (vendredi) avec un motif. La dérogation est posée sur CE créneau,
// mais la revalidation peut tomber d'abord sur celui du lundi.
// Contre-épreuve : une dérogation d'une AUTRE règle sur une autre fermeture n'absout PAS le dépassement.
// (On ne la pose pas sur le lundi : l'entrée y est portée, et une dérogation sur le créneau porteur
// s'applique quelle que soit sa règle — appariement par CRÉNEAU voulu depuis v0.57.)
setS(TROIS, R_ON(2), {derogs:[{salarie_id:'ali',date:D(2),service:'soir',restaurant_id:LOB,motif:'repos',regle_cle:'repos_quot'}]});
rv=revalidateWeek();
t('CONTRE-ÉPREUVE : une dérogation d\'une AUTRE règle sur une autre fermeture ne classe pas le dépassement en « assumé »',
  rv.infractions.filter(x=>x.cle==='fermetures_tardives').length===1, JSON.stringify({inf:rv.infractions.map(x=>x.cle),der:rv.derogees.map(x=>x.cle)}));
for(const jour of [4,0,2]){
  const rid=jour===2?LOB:SNK;
  setS(TROIS, R_ON(2), {derogs:[{salarie_id:'ali',date:D(jour),service:'soir',restaurant_id:rid,motif:'accord du salarié',regle_cle:'fermetures_tardives'}]});
  rv=revalidateWeek();
  t(`dérogation posée sur la fermeture du ${_jourCourt(D(jour))} → classée « écart assumé », pas « non conforme »`,
    rv.infractions.filter(x=>x.cle==='fermetures_tardives').length===0 && rv.derogees.filter(x=>x.cle==='fermetures_tardives').length===1,
    JSON.stringify({inf:rv.infractions.map(x=>x.cle),der:rv.derogees.map(x=>x.cle)}));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 9. PANNEAU VÉRIFICATIONS ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
global.targetFor=()=>({}); global.dayJourType=()=>'Lu-Me'; global.getShifts=()=>[]; global.capCoverageGaps=()=>[]; global._endCapMin=()=>null;
const panneau=(regles,contraintes)=>{ setS(TROIS, regles, {contraintes}); global.CHECKS=[]; renderChecks(); return CHECKS.find(c=>/^Fermetures tardives/.test(c.lbl)); };
let ck=panneau(R_ON(2));
t('règle cochée : ligne « Fermetures tardives (max 2 à 02:00+ / sem.) » en ⚠', ck && !ck.ok && ck.lbl==='Fermetures tardives (max 2 à 02:00+ / sem.)', ck&&ck.lbl);
t('… détail : « ALI T : 3 fermetures à 02:00 ou plus tard (lun. 16, mer. 18 à Lobau, ven. 20) — maximum 2 »',
  ck && ck.details.length===1 && ck.details[0]==='ALI T : 3 fermetures à 02:00 ou plus tard (lun. 16, mer. 18 à Lobau, ven. 20) — maximum 2', ck&&JSON.stringify(ck.details));
t('… et apparaît dans le HTML du panneau', CHECKS_HTML.includes('Fermetures tardives'));
ck=panneau(R_ON(3));
t('règle cochée à 3 : ligne VERTE (rien à signaler)', ck && ck.ok && ck.details.length===0);
ck=panneau(R_OFF(2));
t('règle décochée et aucune exception : pas de ligne (aucun encombrement)', !ck);
ck=panneau([], [EXC('ali',2)]);
t('exception de fiche seule (règle décochée) dépassée : ligne présente, marquée « (fiche) »', ck && !ck.ok && /\(fiche\)$/.test(ck.details[0]||''), ck&&JSON.stringify(ck.details));

console.log(`\n${n} vérifications`); console.log(ok?'ALL PASS':'SOME FAILED'); process.exit(ok?0:1);
})().catch(e=>{ console.error(e); console.log('SOME FAILED'); process.exit(1); });

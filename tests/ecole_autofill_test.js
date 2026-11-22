// v0.75 — JOURS D'ÉCOLE / EXAMEN CFA : AUTO-FILL RÉEL, ANALYSE ET PANNEAU VÉRIFICATIONS.
//
// Complète ecole_heures_test.js (fonctions unitaires) sur les chemins COMPLETS, fonctions RÉELLES extraites
// de planning/index.html, réglages lus par le VRAI _ruleCtx (S.regles / RULE_META) :
//   §1 auto-fill phase 1 : 3 jours d'école + contrat 35 h (plafond 35 h) → il ne pose que 14 h ;
//      contre-épreuve réglage à 0 → l'ancien total, borné par le seul repos hebdo ;
//   §2 phase 3 (rallonge vers le minimum) : la cible tient compte des 21 h d'école ;
//   §3 Analyse de la semaine : dépassement de plafond causé par l'école, motif « dont X h d'école » ;
//   §4 panneau Vérifications : jours off, repos hebdo 35 h, ligne mineurs.
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
global.onRoster=()=>true;global.altDayType=(sid,date)=>((S&&S.altJours)||{})[`${sid}|${date}`]||null;   // même lecture que la page
global.roleNom=c=>c;global.ORG={coef_charges:1.42};global.escP=s=>(''+(s==null?'':s));
global.fullName=s=>[s.prenom,s.nom].filter(Boolean).join(' ')||s.nom; global.nameOf=undefined;
global.salById=id=>SAL[id];global.rolesOf=id=>(SAL[id]&&SAL[id].roles)||[];global.isExp=(id,c)=>((SAL[id]&&SAL[id].exp)||[]).includes(c);
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.loadWeek=async()=>{S.creneaux=STORE.filter(c=>c.restaurant_id===SNACK.id).map(clone);S.allCreneauxWeek=STORE.map(clone);};
const D=i=>fmtDate(dateOfDay(i));          // D(0)=lun. 16/11 … D(6)=dim. 22/11
const SNK='snk';
const RESTOS=[{id:SNK,nom:'Raya Lobau'}];
const sal=(id,extra)=>({id,prenom:id.toUpperCase(),nom:'T',roles:['caisse'],exp:['caisse'],heures_min:0,heures_max:60,snack_origine_id:SNK,...(extra||{})});
const cre=(sid,date,svc,deb,fin)=>({id:'c'+(_id++),salarie_id:sid,restaurant_id:SNK,date,service:svc,role:'caisse',heure_debut:deb,heure_fin:fin});
const ECOLE3={['alt|'+D(0)]:'ecole',['alt|'+D(1)]:'ecole',['alt|'+D(2)]:'ecole'};
const R0=[{cle:'heures_jour_ecole',active:true,valeur:'0',restaurant_id:null}];
function setS(rows, regles, opt){
  opt=opt||{};
  global.SNACK=RESTOS[0];
  global.S={restos:RESTOS,salaries:Object.values(SAL),orgRoles:[{cle:'caisse',nom:'Caisse'}],dispos:[],miseAPied:[],
    contraintes:[],derogations:[],regles:[...(regles||[]),{cle:'sureffectif_minimum',active:false}],effectifs:opt.eff||[],
    altJours:opt.alt||{}, creneaux:rows.filter(c=>c.restaurant_id===SNACK.id).map(clone),allCreneauxWeek:rows.map(clone)};
}
const hOf=sid=>STORE.filter(c=>c.salarie_id===sid).reduce((a,c)=>a+_pdur(c.heure_debut,c.heure_fin),0)/60;
let ok=true,n=0;
const t=(l,c,extra)=>{n++;console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra==null?'':extra)));ok=!!c&&ok;};

(async()=>{
// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 1. AUTO-FILL (phase 1) — 3 jours d\'école + contrat 35 h → 14 h posées ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Un seul candidat, école lun-mar-mer, un poste caisse 11:00 → 18:00 (7 h) chaque jour du jeudi au
// dimanche (4 × 7 = 28 h offertes). Contrat 35 h minimum ET plafond 35 h. Ce qui l'arrête : le PLAFOND
// (weekMinutesOf compte les 21 h d'école), pas un calcul à part.
const EFF=['Je','Ve','Sa','Di'].map(jt=>({restaurant_id:SNK,jour_type:jt,service:'midi',role:'caisse',nb_cible:1,vagues:[{deb:'11:00',fin:'18:00',exp:false}]}));
async function af(regles, alt){
  STORE=[]; global.SAL={alt:sal('alt',{heures_min:35,heures_max:35})};
  setS([], regles, {eff:EFF, alt});
  const res=await autoFillCore([3,4,5,6],{silent:true});
  return {h:hOf('alt'), res, motifs:(res.report||[]).map(r=>JSON.stringify(r))};
}
{ const A=await af([], ECOLE3), B=await af(R0, ECOLE3), C=await af([], {});
  console.log('  heures posées — défaut 7 h :',A.h,'· réglage 0 :',B.h,'· sans école :',C.h);
  t('défaut 7 h : 21 h d\'école + 14 h posées = 35 h → l\'auto-fill pose 14 h (2 postes)', A.h===14, A.h);
  t('… les 2 autres postes restent non comblés pour « plafond »', A.motifs.length===2 && A.motifs.every(m=>/plafond/.test(m)), A.motifs.join(' | ').slice(0,300));
  t('réglage à 0 (ancien calcul des heures) : 21 h posées — 3 postes, le 4ᵉ refusé par le repos hebdo (école = jour travaillé)', B.h===21, B.h);
  t('… le 4ᵉ poste porte le motif « jours de repos »', B.motifs.length===1 && /repos/.test(B.motifs[0]), B.motifs.join(' | ').slice(0,300));
  t('contre-épreuve sans aucun jour d\'école : 28 h posées (4 postes)', C.h===28, C.h); }

// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2. PHASE 3 (rallonge vers le minimum) — la cible tient compte de l\'école ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Jeudi, vendredi, samedi 11:00 → 14:00 déjà posés (9 h) sur des postes qui vont jusqu'à 18:00 (+12 h
// possibles). Minimum 35 h, plafond 48 h. Avec 21 h d'école il manque 5 h ; sans, il en manque 26.
const EFF3=['Je','Ve','Sa'].map(jt=>({restaurant_id:SNK,jour_type:jt,service:'midi',role:'caisse',nb_cible:1,vagues:[{deb:'11:00',fin:'18:00',exp:false}]}));
async function p3(regles, alt){
  global.SAL={alt:sal('alt',{heures_min:35,heures_max:48})};
  STORE=[cre('alt',D(3),'midi','11:00','14:00'),cre('alt',D(4),'midi','11:00','14:00'),cre('alt',D(5),'midi','11:00','14:00')];
  setS(STORE, regles, {eff:EFF3, alt});
  await autoFillCore([0,1,2,3,4,5,6],{silent:true,phase3only:true,globalUnfilled:[]});
  return hOf('alt');
}
{ const A=await p3([], ECOLE3), B=await p3(R0, ECOLE3);
  console.log('  heures après phase 3 — défaut 7 h :',A,'· réglage 0 :',B);
  t('défaut 7 h : la rallonge s\'arrête à 14 h de créneaux (21 + 14 = 35 h = minimum), pas au-delà', A===14, A);
  t('réglage à 0 : la rallonge va jusqu\'au bout des postes (21 h de créneaux), comme avant v0.75', B===21, B); }

// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 3. ANALYSE DE LA SEMAINE — plafond dépassé À CAUSE des heures d\'école ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Planning déjà posé avant v0.75 : 3 jours d'école, 19,5 h de créneaux, plafond 35 h → 40,5 h.
// (Avec 4 jours d'école + 3 jours de service, la revalidation sort d'abord « jours de repos » : un
// créneau ne porte qu'UN motif, le premier rencontré — cf. §4a pour ce cas.)
global.SAL={alt:sal('alt',{heures_min:35,heures_max:35})};
const POSE=[cre('alt',D(4),'midi','11:00','18:00'),cre('alt',D(5),'soir','18:00','00:30'),cre('alt',D(6),'soir','18:00','00:00')];
const ECOLE4={...ECOLE3,['alt|'+D(3)]:'ecole'};
setS(POSE, [], {alt:ECOLE3});
let rv=revalidateWeek(); let inf=rv.infractions.filter(x=>x.cle==='plafond');
console.log('  Analyse :', inf.length?inf[0].why:'—');
t('UNE entrée plafond pour l\'alternant', inf.length===1, JSON.stringify(rv.infractions.map(x=>x.cle)));
t('… « totalise 40,5 h … dont 21 h d\'école CFA … plafond de 35 h »', inf.length===1 && /totalise 40,5 h cette semaine/.test(inf[0].why) && /dont 21 h d'école CFA/.test(inf[0].why) && /plafond de 35 h/.test(inf[0].why), inf.length?inf[0].why:'');
setS(POSE, R0, {alt:ECOLE3});
t('réglage à 0 : plus de dépassement (19,5 h)', revalidateWeek().infractions.filter(x=>x.cle==='plafond').length===0);

// ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 4. PANNEAU VÉRIFICATIONS ──');
// ═════════════════════════════════════════════════════════════════════════════════════════════════
global.targetFor=()=>({}); global.dayJourType=()=>'Lu-Me'; global.getShifts=()=>[]; global.capCoverageGaps=()=>[]; global._endCapMin=()=>null;
const panneau=(rows, regles, alt)=>{ setS(rows, regles, {alt}); S.orgRoles=[]; /* pas de couverture de postes ici */ global.CHECKS=[]; renderChecks(); return CHECKS; };
const find=(ck,re)=>ck.find(c=>re.test(c.lbl));
// 4a. Jours off : 4 jours d'école + 3 jours de service = 7 jours travaillés, zéro repos.
let ck=panneau(POSE, [], ECOLE4);
let off=find(ck,/jour\(s\) off/);
t('4 j d\'école + 3 j de service : « ≥ 1 jour(s) off » en ⚠, « dont 4 d\'école CFA »', off && !off.ok && /7 jours travaillés.*dont 4 d'école CFA/.test(off.details[0]||''), off&&JSON.stringify(off.details));
ck=panneau(POSE, [], {});
off=find(ck,/jour\(s\) off/);
t('contrôle négatif : sans école, 3 jours travaillés → vert', off && off.ok, off&&JSON.stringify(off.details));
// 4b. Repos hebdo 35 h : sam. 18:00 → 00:30 puis école lun.-mar. Sans l'école, le plus long repos va du
// dim. 00:30 à la fin de semaine (47,5 h) ; avec l'école (supposée 08:00 → 16:00), il tombe à 31,5 h.
const R35=[cre('alt',D(5),'soir','18:00','00:30')];
const ECOLE_LM={['alt|'+D(0)]:'ecole',['alt|'+D(1)]:'ecole'};
ck=panneau(R35, [], {}); let rp=find(ck,/Repos hebdomadaire/);
t('contrôle négatif : un seul créneau samedi, pas d\'école → repos hebdo vert', rp && rp.ok, rp&&JSON.stringify(rp.details));
// Fenêtre lundi 00:00 → dimanche 24:00 : école lun. 08-16, mar. 08-16, sam. 18:00 → dim. 00:30.
// Plus long repos = mar. 16:00 → sam. 18:00 = 98 h : conforme. On place l'école mer.-jeu.-ven. pour couper.
const ECOLE_MJV={['alt|'+D(2)]:'ecole',['alt|'+D(3)]:'ecole',['alt|'+D(4)]:'ecole'};
const R35b=[cre('alt',D(0),'soir','18:00','23:00'),cre('alt',D(5),'soir','18:00','00:30')];
ck=panneau(R35b, [], {}); rp=find(ck,/Repos hebdomadaire/);
t('sans école : lun. soir puis sam. soir → plus long repos ≥ 35 h, vert', rp && rp.ok, rp&&JSON.stringify(rp.details));
ck=panneau(R35b, [], ECOLE_MJV); rp=find(ck,/Repos hebdomadaire/);
t('avec école mer.-jeu.-ven. (08:00 → 16:00 supposé) : plus long repos < 35 h → ⚠, l\'hypothèse horaire est écrite', rp && !rp.ok && /jour\(s\) d'école CFA/.test(rp.details[0]||'') && /08:00→16:00/.test(rp.details[0]||''), rp&&JSON.stringify(rp.details));
// 4c. Ligne mineurs : absente sans mineur, ⚠ avec un mineur de nuit.
ck=panneau(R35b, [], {});
t('aucun mineur : pas de ligne « Mineurs » (pas de faux vert)', !find(ck,/^Mineurs/));
global.SAL={alt:sal('alt',{heures_min:0,heures_max:40,date_naissance:'2009-06-01'})};
ck=panneau(R35b, [], {}); let mn=find(ck,/^Mineurs/);
t('mineur avec fin à 23:00 et 00:30 : ligne « Mineurs » en ⚠, 2 créneaux de nuit', mn && !mn.ok && mn.details.filter(d=>/travail de nuit/.test(d)).length===2, mn&&JSON.stringify(mn.details));
ck=panneau([cre('alt',D(0),'midi','11:00','15:00')], [], {}); mn=find(ck,/^Mineurs/);
t('mineur conforme : ligne verte', mn && mn.ok, mn&&JSON.stringify(mn.details));

global.SAL={alt:sal('alt',{heures_min:0,heures_max:40,date_naissance:'2026-08-17'})};
ck=panneau(R35b, [], {}); mn=find(ck,/^Mineurs/);
t('date de naissance invraisemblable : AUCUN refus de nuit, mais ligne ⚠ « à corriger dans sa fiche »', mn && !mn.ok && mn.details.length===1 && /invraisemblable \(2026-08-17\)/.test(mn.details[0]), mn&&JSON.stringify(mn.details));
console.log(`\n${n} vérifications`); console.log(ok?'ALL PASS':'SOME FAILED'); process.exit(ok?0:1);
})().catch(e=>{ console.error(e); console.log('SOME FAILED'); process.exit(1); });

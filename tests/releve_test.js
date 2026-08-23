// v0.66 — PAS DE RELÈVE EN PLEIN SERVICE.
//
// Constat du patron sur un planning généré : « un salarié quitte à 21h et un autre arrive à 21h, faut
// plus qu'il fasse ça pour gratter des heures ». À Lobau, l'auto-fill avait découpé le service du soir
// en 18:00→21:00 puis 21:00→00:00 et mobilisé DEUX personnes (Youcef ARBOUZE et DE TAVERNIER Mathéo)
// sur un seul poste de caisse — si bien qu'il ne restait plus personne en caisse à Carnot le même soir.
// L'auto-fill signalait un poste non comblé qu'il avait lui-même provoqué.
//
// C'est la TROISIÈME forme du même défaut (transfert de 30 min strictes ; créneaux créés trop courts →
// règle des 3 h ; aujourd'hui une relève dont les DEUX morceaux dépassent 3 h, que la règle précédente
// ne rattrape donc pas). La cause commune : le solveur fait coïncider des totaux d'heures sans juger si
// le découpage est tenable en salle. D'où une règle sur le POINT DE COUPE, pas sur la durée des morceaux.
//
// Les postes utilisés ci-dessous sont la COPIE EXACTE de la production (planning_effectifs, org
// « Groupe Raya », lus le 2026-08-09 — mêmes lignes que postes_bornes_test.js).
const fs=require("fs");const {extractFn}=require("./extract.js");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);   // jonctionService, releveInterdite, relevesOf, horsPosteOf…
const grab=n=>extractFn(h,n);
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO");
  if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
global._contrainteBlocking=()=>null; global.contrOf=()=>[];   // aucune contrainte perso dans ces scénarios
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
for(const fn of ['_toMin','overlaps','_overlap','targetFor','_indispoBlocking','_endCapMin','_ruleCtx',
                 'isMultiSnack','weekMinutesOf','weekHoursOf','snackPrioriteOf','hoursOnMorePrioritaryRestos',
                 'snackPriorityGate','sureffBlockedByPriority','sortCandidates','plafondOf','getShifts',
                 'getCreneau','_creCoversMin','hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement',
                 'dayJourType','removeCreneau','autoFillCore','explainViolation','revalidateWeek']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j;
  for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}
  eval("global.PLACE_RULES="+h.slice(st,j)+";"); }

// ── Stub d'écriture (identique à transfer_test.js) ────────────────────────────────────────────────
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
global.setSS=(k,m)=>{if(k==='err')console.error('>>> AUTOFILL ERR:',m);};global._yield=()=>Promise.resolve();
global.showAutofillOverlay=()=>{};global.hideAutofillOverlay=()=>{};global.updateAutofillProgress=()=>{};global.showSolveReport=()=>{};global._afMulti=null;
global.beginTxn=()=>{global._txn=[];};global.endTxn=()=>{global._txn=null;};global.recordAction=()=>{};global.updateUndoBtns=()=>{};global._txn=null;global._autofillRunning=false;
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.MONDAY=new Date('2026-08-03T00:00:00'); global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.onRoster=()=>true;global.altDayType=()=>null;global.roleNom=c=>c;global.ORG={coef_charges:1.42};global.escP=s=>(''+(s==null?'':s));
global.fullName=s=>[s.prenom,s.nom].filter(Boolean).join(' ')||s.nom;
global.salById=id=>SAL[id];global.rolesOf=id=>SAL[id].roles||[];global.isExp=(id,c)=>(SAL[id].exp||[]).includes(c);
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.loadWeek=async()=>{S.creneaux=STORE.filter(c=>c.restaurant_id===SNACK.id).map(clone);S.allCreneauxWeek=STORE.map(clone);};
const D=i=>fmtDate(dateOfDay(i));
const dur=c=>_pdur(c.heure_debut,c.heure_fin)/60;
const hoursOf=id=>STORE.filter(c=>c.salarie_id===id).reduce((a,c)=>a+dur(c),0);
const P3ONLY={silent:true,phase3only:true,globalUnfilled:[]};
function run(scn, cb){
  STORE=scn.store.map(c=>Object.assign({id:'s'+(_id++)},c));
  global.SAL={}; scn.sals.forEach(s=>{ if(!s.snacks_priorites) s.snacks_priorites=[{priorite:1,restaurant_id:scn.snack}]; SAL[s.id]=s; });
  global.SNACK=scn.restos.find(r=>r.id===scn.snack);
  global.S={restos:scn.restos,salaries:scn.sals,orgRoles:scn.roles||[{cle:'caisse',nom:'Caisse'}],
    dispos:[],miseAPied:[],contraintes:[],derogations:scn.derogations||[],
    regles:scn.regles||[{cle:'sureffectif_minimum',active:false,valeur:'2'}],effectifs:scn.eff,
    creneaux:STORE.filter(c=>c.restaurant_id===scn.snack).map(clone),allCreneauxWeek:STORE.map(clone)};
  return cb().then(r=>{global._lastP3=r&&r.phase3;return r;});
}
// Neutralise la règle → rejoue EXACTEMENT le comportement d'avant v0.66. Un seul interrupteur : les deux
// garde-fous (transfert et rallonge) passent par releveInterdite.
const VRAI_RELEVE=global.releveInterdite;
const sansRegle=async fn=>{ global.releveInterdite=()=>false; try{ return await fn(); } finally { global.releveInterdite=VRAI_RELEVE; } };

let ok=true,n=0;
const t=(l,c,extra)=>{n++;console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra==null?'':extra)));ok=c&&ok;};
const HH=m=>`${String(Math.floor((m%1440)/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 1. LA FRONTIÈRE MIDI↔SOIR EST DÉDUITE DES POSTES, JAMAIS CODÉE EN DUR ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Question posée par le patron : « chez moi les postes du midi vont jusqu'à 18h et ceux du soir démarrent
// à 17h — les deux se CHEVAUCHENT. Comment la frontière est-elle déterminée ? »
// Réponse retenue : l'intervalle borné par la FIN du midi et le DÉBUT du soir, pris dans un sens ou dans
// l'autre. Services qui se chevauchent → la frontière EST le chevauchement. Services disjoints → c'est
// le creux entre les deux. Une seule formule couvre les deux cas.
const jonc=(midi,soir,role)=>{
  global.SNACK={id:'x'};
  global.S={effectifs:[
    ...(midi?[{restaurant_id:'x',jour_type:'Lu-Me',service:'midi',role:role||'caisse',nb_cible:1,vagues:midi}]:[]),
    ...(soir?[{restaurant_id:'x',jour_type:'Lu-Me',service:'soir',role:role||'caisse',nb_cible:1,vagues:soir}]:[])]};
  return jonctionService('Lu-Me',role||'caisse');
};
{ const j=jonc([{deb:'11:00',fin:'18:00'}],[{deb:'17:00',fin:'00:00'}]);
  t('services qui SE CHEVAUCHENT (midi→18:00, soir 17:00→) : la frontière est le chevauchement 17:00–18:00',
    j && j.lo===17*60 && j.hi===18*60, JSON.stringify(j)); }
{ const j=jonc([{deb:'11:00',fin:'14:30'}],[{deb:'18:30',fin:'23:30'}]);
  t('services DISJOINTS (midi→14:30, soir 18:30→) : la frontière est le creux 14:30–18:30',
    j && j.lo===870 && j.hi===1110, JSON.stringify(j)); }
{ const j=jonc([{deb:'11:00',fin:'15:00'}],[{deb:'15:00',fin:'23:00'}]);
  t('services JOINTIFS : la frontière se réduit au point exact 15:00',
    j && j.lo===900 && j.hi===900, JSON.stringify(j)); }
{ const j=jonc(null,[{deb:'18:00',fin:'00:00'}]);
  t('rôle présent SUR UN SEUL service : aucune frontière (null) → aucune coupure interne permise',
    j===null, JSON.stringify(j)); }
// La leçon de posteEnvelope en v0.63 : la frontière se calcule PAR RÔLE. La caisse peut fermer le midi
// bien avant la cuisine ; emprunter la borne de l'autre rôle donnerait une frontière fausse.
{ global.SNACK={id:'x'};
  global.S={effectifs:[
    {restaurant_id:'x',jour_type:'Lu-Me',service:'midi',role:'caisse', nb_cible:1,vagues:[{deb:'11:00',fin:'14:30'}]},
    {restaurant_id:'x',jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:1,vagues:[{deb:'11:00',fin:'18:00'}]},
    {restaurant_id:'x',jour_type:'Lu-Me',service:'soir',role:'caisse', nb_cible:1,vagues:[{deb:'18:30',fin:'23:30'}]},
    {restaurant_id:'x',jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:1,vagues:[{deb:'17:00',fin:'23:30'}]}]};
  const jc=jonctionService('Lu-Me','caisse'), jk=jonctionService('Lu-Me','cuisine');
  t('la frontière est calculée PAR RÔLE (caisse 14:30–18:30 ≠ cuisine 17:00–18:00)',
    jc.lo===870&&jc.hi===1110 && jk.lo===1020&&jk.hi===1080, JSON.stringify({caisse:jc,cuisine:jk})); }

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2. LE PRÉDICAT : OÙ UNE COUPURE EST PERMISE, OÙ ELLE NE L\'EST PAS ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LES POSTES RÉELS DE LOBAU, DIMANCHE SOIR, CAISSE (production, copie exacte) : c'est la configuration
// exacte dans laquelle le patron a constaté le découpage 18:00→21:00 / 21:00→00:00.
global.SNACK={id:'lob'};
global.S={effectifs:[{restaurant_id:'lob',jour_type:'Di',service:'soir',role:'caisse',nb_cible:2,
  vagues:[{deb:'18:00',fin:'00:00',exp:true},{deb:'19:00',fin:'22:30',exp:false}]}]};
t('LE CAS DU PATRON — couper le soir de Lobau à 21:00 est INTERDIT (ni frontière, ni jointure de postes)',
  releveInterdite('Di','caisse',21*60)===true);
t('… couper à 22:30 (fin du renfort, mais début d\'aucun poste) est INTERDIT aussi',
  releveInterdite('Di','caisse',22*60+30)===true);
t('… et ce rôle n\'a pas de midi ce jour-là : aucune frontière, donc aucune coupure interne',
  jonctionService('Di','caisse')===null);

// Deux vagues QUI SE RELAIENT : le restaurateur a lui-même demandé une relève à 21:00 → on ne la lui
// interdit pas. C'est la différence entre « le solveur invente une coupure » et « la coupure est réglée ».
global.S={effectifs:[{restaurant_id:'lob',jour_type:'Di',service:'soir',role:'caisse',nb_cible:2,
  vagues:[{deb:'18:00',fin:'21:00'},{deb:'21:00',fin:'00:00'}]}]};
t('deux postes CONFIGURÉS qui se relaient à 21:00 → la relève de 21:00 est PERMISE (elle est voulue)',
  releveInterdite('Di','caisse',21*60)===false);
t('… mais elle ne DÉRIVE pas : 21:30 reste interdit (une relève réglée reste où elle est réglée)',
  releveInterdite('Di','caisse',21*60+30)===true);

// Frontière midi↔soir : le cas « créneau long 10:00→23:00 » cité par le patron.
global.S={effectifs:[
  {restaurant_id:'lob',jour_type:'Lu-Me',service:'midi',role:'caisse',nb_cible:1,vagues:[{deb:'10:00',fin:'15:00'}]},
  {restaurant_id:'lob',jour_type:'Lu-Me',service:'soir',role:'caisse',nb_cible:1,vagues:[{deb:'18:00',fin:'23:00'}]}]};
t('coupure à 15:00 (fin du midi) : PERMISE — c\'est la frontière', releveInterdite('Lu-Me','caisse',15*60)===false);
t('coupure à 18:00 (début du soir) : PERMISE — c\'est la frontière', releveInterdite('Lu-Me','caisse',18*60)===false);
t('coupure à 16:30 (dans le creux entre les deux services) : PERMISE', releveInterdite('Lu-Me','caisse',16*60+30)===false);
t('coupure à 12:00 (plein service du midi) : INTERDITE', releveInterdite('Lu-Me','caisse',12*60)===true);
t('coupure à 21:00 (plein service du soir) : INTERDITE', releveInterdite('Lu-Me','caisse',21*60)===true);
// Sans poste configuré, il n'y a rien à quoi comparer : on ne juge pas (même posture que horsPosteOf).
global.S={effectifs:[]};
t('aucun poste configuré → aucun jugement (pas de faux positif sur une org non réglée)',
  releveInterdite('Lu-Me','caisse',21*60)===false);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 3. LE CAS DU PATRON, DE BOUT EN BOUT : AVANT / APRÈS SUR LE VRAI AUTO-FILL ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Lobau, dimanche soir, poste de caisse réel 18:00→00:00. Youcef le tient en entier. Mathéo est sous son
// minimum. AVANT v0.66 la phase 3 lui taillait 3 h dans le créneau de Youcef → deux personnes sur un
// poste, et plus personne de libre pour Carnot. APRÈS, le créneau de Youcef reste entier.
const LOB='lob', CAR='car';
const RESTOS=[{id:LOB,nom:'Raya Lobau'},{id:CAR,nom:'Raya Carnot'}];
const EFF_LOB_DI=[{restaurant_id:LOB,jour_type:'Di',service:'soir',role:'caisse',nb_cible:2,
  vagues:[{deb:'18:00',fin:'00:00',exp:true},{deb:'19:00',fin:'22:30',exp:false}]}];
const scnPatron=()=>({restos:RESTOS,snack:LOB,eff:EFF_LOB_DI,
  sals:[{id:'you',prenom:'Youcef',nom:'ARBOUZE',roles:['caisse'],exp:['caisse'],heures_min:6,heures_max:48},
        {id:'mat',prenom:'Mathéo',nom:'DE TAVERNIER',roles:['caisse'],exp:['caisse'],heures_min:9,heures_max:35}],
  store:[
    {restaurant_id:LOB,salarie_id:'you',date:D(6),service:'soir',role:'caisse',heure_debut:'18:00',heure_fin:'00:00'}, // 6h
    {restaurant_id:LOB,salarie_id:'you',date:D(5),service:'soir',role:'caisse',heure_debut:'18:00',heure_fin:'00:00'}, // 6h → 12h, surplus 6
    {restaurant_id:LOB,salarie_id:'mat',date:D(5),service:'soir',role:'caisse',heure_debut:'18:00',heure_fin:'00:00'}, // 6h, min 9 → manque 3
  ]});
// Samedi non configuré → aucun poste → aucune coupe possible ce jour-là : seul le dimanche est en jeu.
await_(async()=>{
  await sansRegle(()=>run(scnPatron(),()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY)));
  const matDiAvant=STORE.filter(c=>c.salarie_id==='mat'&&c.date===D(6));
  const youDiAvant=STORE.find(c=>c.salarie_id==='you'&&c.date===D(6));
  console.log('  AVANT (règle neutralisée) — Youcef dim :',youDiAvant?`${youDiAvant.heure_debut.slice(0,5)}→${youDiAvant.heure_fin.slice(0,5)}`:'—',
              '| Mathéo dim :',matDiAvant.map(c=>`${c.heure_debut.slice(0,5)}→${c.heure_fin.slice(0,5)}`).join(', ')||'—');
  t('AVANT — l\'auto-fill produisait bien la relève : Youcef 18:00→21:00 puis Mathéo 21:00→00:00',
    youDiAvant && youDiAvant.heure_fin.slice(0,5)==='21:00' && matDiAvant.length===1
    && matDiAvant[0].heure_debut.slice(0,5)==='21:00' && matDiAvant[0].heure_fin.slice(0,5)==='00:00',
    JSON.stringify({you:youDiAvant&&youDiAvant.heure_fin,mat:matDiAvant.map(c=>c.heure_debut+'→'+c.heure_fin)}));
  t('AVANT — les DEUX morceaux faisaient ≥ 3 h : la règle des 3 h ne pouvait pas l\'attraper',
    matDiAvant.length===1 && dur(matDiAvant[0])>=3-1e-9 && dur(youDiAvant)>=3-1e-9);

  await run(scnPatron(),()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const matDi=STORE.filter(c=>c.salarie_id==='mat'&&c.date===D(6));
  const youDi=STORE.find(c=>c.salarie_id==='you'&&c.date===D(6));
  console.log('  APRÈS (règle active)     — Youcef dim :',youDi?`${youDi.heure_debut.slice(0,5)}→${youDi.heure_fin.slice(0,5)}`:'—',
              '| Mathéo dim :',matDi.map(c=>`${c.heure_debut.slice(0,5)}→${c.heure_fin.slice(0,5)}`).join(', ')||'—',
              '| Mathéo total',hoursOf('mat')+'h (min 9)');
  t('APRÈS — le créneau de Youcef reste ENTIER (18:00→00:00), le poste n\'est pas coupé',
    !!youDi && youDi.heure_debut.slice(0,5)==='18:00' && youDi.heure_fin.slice(0,5)==='00:00',
    youDi&&(youDi.heure_debut+'→'+youDi.heure_fin));
  t('APRÈS — Mathéo n\'est PAS placé le dimanche soir à Lobau : il reste libre pour Carnot',
    matDi.length===0, JSON.stringify(matDi.map(c=>c.heure_debut+'→'+c.heure_fin)));
  t('APRÈS — Mathéo reste sous son minimum, et c\'est le résultat VOULU (mieux vaut ne pas combler)',
    hoursOf('mat')<9-0.01, hoursOf('mat')+'h');
  t('APRÈS — aucune heure n\'a été distribuée par transfert ce dimanche',
    ((global._lastP3||{}).transferH||0)<1e-9, String((global._lastP3||{}).transferH));

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n── 4. LA JONCTION MIDI↔SOIR RESTE COUPABLE : LE CRÉNEAU LONG 10:00→23:00 ──');
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // Le patron : « un créneau long qui couvre les deux services — 10h→23h — peut légitimement être coupé
  // à 15h ou à 18h ». Ici midi 10:00→15:00 et soir 18:00→23:00 → frontière 15:00–18:00.
  const EFF_JONC=[
    {restaurant_id:LOB,jour_type:'Lu-Me',service:'midi',role:'caisse',nb_cible:2,vagues:[{deb:'10:00',fin:'15:00'}]},
    {restaurant_id:LOB,jour_type:'Lu-Me',service:'soir',role:'caisse',nb_cible:2,vagues:[{deb:'18:00',fin:'23:00'}]}];
  await run({restos:RESTOS,snack:LOB,eff:EFF_JONC,
    sals:[{id:'don',prenom:'Donneur',nom:'D',roles:['caisse'],exp:['caisse'],heures_min:8,heures_max:48},
          {id:'rec',prenom:'Receveur',nom:'R',roles:['caisse'],exp:['caisse'],heures_min:5,heures_max:35}],
    store:[
      // UN SEUL créneau qui couvre le midi ET le soir (10:00→23:00 = 13h). Le donneur a 5h de surplus.
      {restaurant_id:LOB,salarie_id:'don',date:D(0),service:'midi',role:'caisse',heure_debut:'10:00',heure_fin:'23:00'},
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const recNew=STORE.filter(c=>c.salarie_id==='rec');
  const donApres=STORE.find(c=>c.salarie_id==='don'&&c.date===D(0));
  console.log('  Donneur :',donApres?`${donApres.heure_debut.slice(0,5)}→${donApres.heure_fin.slice(0,5)}`:'—',
              '| Receveur :',recNew.map(c=>`${c.heure_debut.slice(0,5)}→${c.heure_fin.slice(0,5)}`).join(', ')||'—');
  t('le créneau long 10:00→23:00 EST scindé (la règle ne bloque pas tout)', recNew.length>=1,
    JSON.stringify(recNew.map(c=>c.heure_debut+'→'+c.heure_fin)));
  { const coupe=recNew.length? (recNew[0].heure_debut.slice(0,5)==='10:00' ? _pmin(recNew[0].heure_fin) : _pmin(recNew[0].heure_debut)) : null;
    t('… et la coupe tombe bien DANS la frontière midi↔soir (15:00–18:00)',
      coupe!=null && coupe>=15*60 && coupe<=18*60, coupe==null?'aucune coupe':HH(coupe)); }

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n── 5. LA RALLONGE (AJUSTEMENT DE BORNES) NE FABRIQUE PAS DE RELÈVE NON PLUS ──');
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // Demande explicite du patron : « cela vaut pour toutes les phases qui redistribuent des heures —
  // transfert entre salariés comme ajustement de bornes ». Ici A finit à 20:30 et B commence à 21:00 :
  // rallonger A de 30 min refermerait le trou en le collant à B → une relève à 21:00, en plein service.
  // Le besoin retombe à 1 après 21:00 (deuxième poste 18:00→21:00) : c'est ce qui ARRÊTE la rallonge
  // pile sur la borne de B — le cas où la position FINALE est bien une relève, et non un simple passage.
  const EFF_RALL=[{restaurant_id:LOB,jour_type:'Lu-Me',service:'soir',role:'caisse',nb_cible:2,
                   vagues:[{deb:'18:00',fin:'21:00'},{deb:'18:00',fin:'00:00'}]}];
  await run({restos:RESTOS,snack:LOB,eff:EFF_RALL,
    sals:[{id:'a',prenom:'A',nom:'A',roles:['caisse'],exp:['caisse'],heures_min:20,heures_max:35},
          {id:'b',prenom:'B',nom:'B',roles:['caisse'],exp:['caisse'],heures_min:1,heures_max:35}],
    store:[
      {restaurant_id:LOB,salarie_id:'a',date:D(0),service:'soir',role:'caisse',heure_debut:'18:00',heure_fin:'20:30'},
      {restaurant_id:LOB,salarie_id:'b',date:D(0),service:'soir',role:'caisse',heure_debut:'21:00',heure_fin:'00:00'},
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const aApres=STORE.find(c=>c.salarie_id==='a'&&c.date===D(0));
  console.log('  A après rallonge :',`${aApres.heure_debut.slice(0,5)}→${aApres.heure_fin.slice(0,5)}`,'| B : 21:00→00:00');
  t('la rallonge ne vient PAS buter sur l\'arrivée d\'un collègue (A ne finit pas à 21:00)',
    aApres.heure_fin.slice(0,5)!=='21:00', aApres.heure_debut+'→'+aApres.heure_fin);

  // CONTRE-ÉPREUVE — la règle ne doit pas geler les rallonges saines. Même trou de 30 min, mais le besoin
  // reste à 2 jusqu'à minuit : A traverse la borne de B et finit par le CHEVAUCHER. À l'arrivée personne
  // ne se relaie (les deux sont là ensemble) → la rallonge doit passer. Si on jugeait chaque PAS au lieu
  // de la position finale, ce cas serait refusé à tort.
  const EFF_RALL_OK=[{restaurant_id:LOB,jour_type:'Lu-Me',service:'soir',role:'caisse',nb_cible:2,
                      vagues:[{deb:'18:00',fin:'00:00'},{deb:'18:00',fin:'00:00'}]}];
  await run({restos:RESTOS,snack:LOB,eff:EFF_RALL_OK,
    sals:[{id:'a',prenom:'A',nom:'A',roles:['caisse'],exp:['caisse'],heures_min:20,heures_max:35},
          {id:'b',prenom:'B',nom:'B',roles:['caisse'],exp:['caisse'],heures_min:1,heures_max:35}],
    store:[
      {restaurant_id:LOB,salarie_id:'a',date:D(0),service:'soir',role:'caisse',heure_debut:'18:00',heure_fin:'20:30'},
      {restaurant_id:LOB,salarie_id:'b',date:D(0),service:'soir',role:'caisse',heure_debut:'21:00',heure_fin:'00:00'},
    ]},()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const aOk=STORE.find(c=>c.salarie_id==='a'&&c.date===D(0));
  console.log('  Contre-épreuve — A :',`${aOk.heure_debut.slice(0,5)}→${aOk.heure_fin.slice(0,5)}`);
  t('CONTRE-ÉPREUVE : une rallonge qui TRAVERSE la borne et chevauche le collègue reste autorisée',
    _pmin(aOk.heure_fin)===0 || _pmin(aOk.heure_fin)>21*60, aOk.heure_debut+'→'+aOk.heure_fin);

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n── 6. LA REVALIDATION REMONTE LES RELÈVES DÉJÀ EN PLACE ──');
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // Le patron a corrigé ses plannings à la main : les créneaux fautifs ne sont plus en base. Mais une
  // relève posée par une ancienne version resterait invisible à jamais sans cette passe.
  const reval=(rows,rid)=>{
    global.SNACK=RESTOS.find(r=>r.id===(rid||LOB));
    global.S={restos:RESTOS,salaries:Object.values(SAL),orgRoles:[{cle:'caisse',nom:'Caisse'}],
      dispos:[],miseAPied:[],contraintes:[],regles:[],derogations:global._derogs||[],effectifs:EFF_LOB_DI,
      creneaux:rows.filter(c=>c.restaurant_id===(rid||LOB)),allCreneauxWeek:rows.slice()};
    return revalidateWeek();
  };
  const RATTACHE=[{priorite:1,restaurant_id:LOB},{priorite:2,restaurant_id:CAR}];
  global.SAL={you:{id:'you',prenom:'Youcef',nom:'ARBOUZE',roles:['caisse'],exp:['caisse'],heures_max:48,snacks_priorites:RATTACHE},
              mat:{id:'mat',prenom:'Mathéo',nom:'DE TAVERNIER',roles:['caisse'],exp:['caisse'],heures_max:48,snacks_priorites:RATTACHE}};
  const RELEVE_EN_BASE=[
    {id:'x1',restaurant_id:LOB,salarie_id:'you',date:D(6),service:'soir',role:'caisse',heure_debut:'18:00',heure_fin:'21:00'},
    {id:'x2',restaurant_id:LOB,salarie_id:'mat',date:D(6),service:'soir',role:'caisse',heure_debut:'21:00',heure_fin:'00:00'}];
  global._derogs=[];
  { const rv=reval(RELEVE_EN_BASE);
    const inf=rv.infractions.filter(x=>x.cle==='releve');
    console.log('  Infraction :',inf.length?inf[0].why:'—');
    t('la revalidation remonte la relève 18:00→21:00 / 21:00→00:00', inf.length===1,
      JSON.stringify(rv.infractions.map(x=>x.cle)));
    t('… avec une phrase qui NOMME les deux salariés et l\'heure de la relève',
      inf.length===1 && /ARBOUZE/.test(inf[0].why) && /TAVERNIER/.test(inf[0].why) && /21:00/.test(inf[0].why),
      inf.length?inf[0].why:'');
    t('… et qui dit qu\'aucune coupure interne n\'est légitime pour ce rôle ce jour-là',
      inf.length===1 && /aucune coupure interne/.test(inf[0].why), inf.length?inf[0].why:'');
    t('UNE SEULE entrée pour la paire (pas une par créneau)',
      rv.infractions.filter(x=>x.cle==='releve').length===1); }
  // Le même planning, mais avec la relève DÉCLARÉE dans les postes → plus rien à signaler.
  { const gardeEff=EFF_LOB_DI[0].vagues;
    EFF_LOB_DI[0].vagues=[{deb:'18:00',fin:'21:00'},{deb:'21:00',fin:'00:00'}];
    const rv=reval(RELEVE_EN_BASE);
    t('relève DÉCLARÉE dans les postes → aucune infraction (on ne reproche pas un réglage assumé)',
      rv.infractions.filter(x=>x.cle==='releve').length===0, JSON.stringify(rv.infractions.map(x=>x.cle)));
    EFF_LOB_DI[0].vagues=gardeEff; }
  // Une relève assumée par une DÉROGATION posée sur l'un OU l'autre des deux créneaux.
  { global._derogs=[{salarie_id:'mat',date:D(6),service:'soir',restaurant_id:LOB,motif:'remplacement en urgence'}];
    const rv=reval(RELEVE_EN_BASE);
    t('une dérogation posée sur l\'un des deux créneaux classe la relève en « assumée »',
      rv.infractions.filter(x=>x.cle==='releve').length===0 && rv.derogees.filter(x=>x.cle==='releve').length===1,
      JSON.stringify({inf:rv.infractions.map(x=>x.cle),der:rv.derogees.map(x=>x.cle)}));
    global._derogs=[]; }
  // Balayage INTER-RESTAURANT : la relève de Lobau doit être vue depuis l'écran de Carnot.
  { const rv=reval(RELEVE_EN_BASE, CAR);
    t('la relève de Lobau est vue depuis l\'écran de Carnot (balayage tous restaurants)',
      rv.infractions.filter(x=>x.cle==='releve').length===1,
      JSON.stringify(rv.infractions.map(x=>x.cle+'@'+x.restaurant))); }
  // Deux personnes qui se CHEVAUCHENT ne se relaient pas — c'est un renfort, pas une relève.
  { const rv=reval([
      {id:'y1',restaurant_id:LOB,salarie_id:'you',date:D(6),service:'soir',role:'caisse',heure_debut:'18:00',heure_fin:'00:00'},
      {id:'y2',restaurant_id:LOB,salarie_id:'mat',date:D(6),service:'soir',role:'caisse',heure_debut:'19:00',heure_fin:'22:30'}]);
    t('deux présences qui se CHEVAUCHENT (renfort du coup de feu) ne sont pas une relève',
      rv.infractions.filter(x=>x.cle==='releve').length===0, JSON.stringify(rv.infractions.map(x=>x.cle))); }

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n── 7. SIGNALER, PAS BLOQUER : LA SAISIE MANUELLE RESTE LIBRE ──');
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // Le patron doit pouvoir organiser une relève EXCEPTIONNELLE (un remplacement en urgence). La règle
  // n'est donc délibérément PAS une règle de checkPlacement — même posture que le hors-poste.
  { global.SNACK=RESTOS[0];
    global.S={restos:RESTOS,salaries:Object.values(SAL),orgRoles:[{cle:'caisse',nom:'Caisse'}],
      dispos:[],miseAPied:[],contraintes:[],regles:[],derogations:[],effectifs:EFF_LOB_DI,
      creneaux:[RELEVE_EN_BASE[0]],allCreneauxWeek:[RELEVE_EN_BASE[0]]};
    const v=checkPlacement('mat',{deb:'21:00',fin:'00:00',role:'caisse'},D(6),'soir',6,{manual:true,rg:_ruleCtx()});
    t('poser À LA MAIN le créneau 21:00→00:00 qui crée la relève n\'est PAS refusé',
      v===null, JSON.stringify(v));
    t('la règle n\'est pas dans checkPlacement (aucune clé « releve » renvoyée par le moteur de placement)',
      !/cle:'releve'/.test(h.slice(h.indexOf('function checkPlacement'), h.indexOf('function checkPlacement')+14000))); }
  t('« releve » est bien cartographiée dans PLACE_RULES (le rapport sait la nommer)',
    PLACE_RULES.releve==='relève en plein service', PLACE_RULES.releve);

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n── 8. AVANT / APRÈS SUR UNE SEMAINE ENTIÈRE (postes réels Grand Cœur + Lobau) ──');
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // Postes RÉELS de production (samedi + dimanche, les deux jours réellement configurés chez ce patron
  // pour ces rôles). Trois salariés : deux donneurs au-dessus de leur minimum, un receveur en dessous.
  // On rejoue la MÊME semaine deux fois — règle neutralisée (= v0.65), puis règle active — et on
  // explique chaque différence.
  const GC='gc';
  const RESTOS3=[{id:GC,nom:'Raya Grand Coeur'},{id:LOB,nom:'Raya Lobau'}];
  const EFF_REEL=[
    {restaurant_id:GC, jour_type:'Di',service:'soir',role:'cuisine',nb_cible:4,vagues:[
      {deb:'17:00',fin:'00:30',exp:true},{deb:'17:30',fin:'23:00',exp:true},
      {deb:'18:00',fin:'00:00',exp:false},{deb:'19:00',fin:'00:00',exp:false}]},
    {restaurant_id:GC, jour_type:'Sa',service:'soir',role:'cuisine',nb_cible:4,vagues:[
      {deb:'18:00',fin:'00:30',exp:true},{deb:'18:00',fin:'02:00',exp:true},
      {deb:'18:30',fin:'23:00',exp:false},{deb:'19:00',fin:'02:00',exp:false}]},
    {restaurant_id:LOB,jour_type:'Di',service:'soir',role:'cuisine',nb_cible:3,vagues:[
      {deb:'17:00',fin:'00:30',exp:true},{deb:'18:30',fin:'22:30',exp:false},{deb:'19:00',fin:'23:30',exp:false}]},
  ];
  const scnSemaine=()=>({restos:RESTOS3,snack:GC,eff:EFF_REEL,roles:[{cle:'cuisine',nom:'Cuisine'}],
    sals:[{id:'d1',prenom:'Donneur',nom:'Un',  roles:['cuisine'],exp:['cuisine'],heures_min:10,heures_max:48},
          {id:'d2',prenom:'Donneur',nom:'Deux',roles:['cuisine'],exp:['cuisine'],heures_min:10,heures_max:48},
          {id:'r1',prenom:'Receveur',nom:'Un', roles:['cuisine'],exp:['cuisine'],heures_min:20,heures_max:35}],
    store:[
      {restaurant_id:GC,salarie_id:'d1',date:D(5),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'},
      {restaurant_id:GC,salarie_id:'d1',date:D(6),service:'soir',role:'cuisine',heure_debut:'17:00',heure_fin:'00:30'},
      {restaurant_id:GC,salarie_id:'d2',date:D(5),service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'00:30'},
      {restaurant_id:GC,salarie_id:'d2',date:D(6),service:'soir',role:'cuisine',heure_debut:'17:30',heure_fin:'23:00'},
      {restaurant_id:GC,salarie_id:'r1',date:D(6),service:'soir',role:'cuisine',heure_debut:'19:00',heure_fin:'00:00'},
    ]});
  const snapshot=()=>STORE.filter(c=>c.heure_debut).map(c=>`${c.salarie_id}|${c.date}|${c.service}|${c.heure_debut.slice(0,5)}→${c.heure_fin.slice(0,5)}`).sort();
  await sansRegle(()=>run(scnSemaine(),()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY)));
  avantRows=STORE.map(clone);
  const avant=snapshot(), avantH=hoursOf('r1'), avantP3=Object.assign({},global._lastP3);
  await run(scnSemaine(),()=>autoFillCore([0,1,2,3,4,5,6],P3ONLY));
  const apres=snapshot(), apresH=hoursOf('r1'), apresP3=Object.assign({},global._lastP3);
  const seulAvant=avant.filter(x=>!apres.includes(x)), seulApres=apres.filter(x=>!avant.includes(x));
  console.log('  AVANT — receveur',avantH+'h · transfert',(avantP3.transferH||0)+'h · rallonge',(avantP3.rallongeH||0)+'h');
  console.log('  APRÈS — receveur',apresH+'h · transfert',(apresP3.transferH||0)+'h · rallonge',(apresP3.rallongeH||0)+'h');
  console.log('  Lignes SEULEMENT avant :'); seulAvant.forEach(x=>console.log('    −',x));
  console.log('  Lignes SEULEMENT après :'); seulApres.forEach(x=>console.log('    +',x));
  t('la semaine DIFFÈRE entre avant et après (la règle mord réellement sur des postes réels)',
    seulAvant.length>0||seulApres.length>0, `avant seul ${seulAvant.length} · après seul ${seulApres.length}`);
  t('APRÈS — moins d\'heures distribuées par transfert (effet annoncé)',
    (apresP3.transferH||0) < (avantP3.transferH||0)+1e-9, `${avantP3.transferH} → ${apresP3.transferH}`);
  t('APRÈS — le receveur a MOINS d\'heures : il reste sous son minimum, et c\'est voulu',
    apresH<=avantH+1e-9 && apresH<20-0.01, `${avantH}h → ${apresH}h (min 20h)`);
  // Le juge de paix : compter les relèves illégitimes de chaque semaine avec la MÊME fonction que la
  // revalidation. Avant → il y en a. Après → il n'y en a plus. C'est l'énoncé complet du chantier.
  const relAvant=relevesOf(avantRows), relApres=relevesOf(STORE.slice());
  console.log('  Relèves illégitimes — avant :',relAvant.length,'· après :',relApres.length);
  relAvant.forEach(r=>console.log(`    · ${r.date} ${r.role} — ${salById(r.partant.salarie_id).nom} part à ${HH(r.T)}, ${salById(r.arrivant.salarie_id).nom} arrive`));
  t('AVANT — la semaine contenait au moins une relève illégitime', relAvant.length>0, String(relAvant.length));
  t('APRÈS — plus aucune relève illégitime dans la semaine générée', relApres.length===0,
    JSON.stringify(relApres.map(r=>r.date+' '+HH(r.T))));

  console.log('\n'+(ok?'ALL PASS':'SOME FAILED')+`  (${n} vérifications)`);
  process.exit(ok?0:1);
});
let avantRows=[];
// Petit enrobage : le corps du harnais est asynchrone, mais doit rester lisible de haut en bas.
function await_(fn){ fn().catch(e=>{ console.error(e); process.exit(1); }); }

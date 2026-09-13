// v0.68 — LA RÉPARATION PAR DÉPLACEMENT DOIT VOIR LES AUTRES SNACKS.
//
// Constat du patron : l'auto-fill annonce 8 postes non comblés, dont plusieurs soirs à Carnot (« aucun
// candidat conforme »), alors que la solution tient en une phrase :
//     « Si on met Mathéo à la place de Youcef à Lobau, on peut placer Youcef à Carnot le soir. »
//
// Le mécanisme EXISTAIT et faisait exactement ce raisonnement (phase 2, réparation en chaîne prof. 1).
// Il était bridé par son vivier : le tableau local `placed`, qui ne contenait que les créneaux du snack
// EN COURS, posés pendant CETTE exécution. Le créneau de Youcef à Lobau — celui qu'il faut libérer —
// était invisible depuis Carnot.
//
// Ce harnais pilote le VRAI autoFillCore extrait du fichier (jamais une réplique) et vérifie :
//   1. le cas du patron : le trou de Carnot est comblé en libérant quelqu'un de Lobau ;
//   2. l'A/B : avec l'ancien vivier (snack courant seulement), le même scénario échoue ;
//   3. aucune infraction créée — ni sur le créneau déplacé, ni sur son remplacement (revalidateWeek) ;
//   4. un créneau saisi à la main n'est PAS déplacé, et l'enchaînement est dit en suggestion ;
//   5. le réglage `reparation_inter_snack` gouverne bien l'exécution, sans faire taire la suggestion ;
//   6. la chaîne apparaît en clair dans le rapport (buildChainReport, texte réel) ;
//   7. le budget de temps tient sur une semaine complète à trois restaurants ;
//   8. les garde-fous du vivier : sureffectif exclu, dates hors périmètre exclues, salarié sorti exclu ;
//   9. la substitution est À L'IDENTIQUE (mêmes bornes) — c'est ce qui rend la règle de relève et la
//      durée minimale de créneau sans objet ici. Le jour où Y ne reprendrait qu'une PARTIE du créneau,
//      ce test tombe, et c'est voulu.
const fs=require("fs");const {extractFn}=require("./extract.js");
const P=require("./plprims.js");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
P.installPlanningPrims(h);   // planRepair, movablePool, _simRemove, _chainRow, _AF, computeHoles…
const grab=n=>extractFn(h,n);
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO");
  if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
eval("global.CHAIN_RAISON="+P.grabObj(h,"CHAIN_RAISON")+";");
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
for(const fn of ['_toMin','overlaps','_overlap','targetFor','_indispoBlocking','_endCapMin','_ruleCtx',
                 'isMultiSnack','weekMinutesOf','weekHoursOf','snackPrioriteOf','hoursOnMorePrioritaryRestos',
                 'snackPriorityGate','sureffBlockedByPriority','sortCandidates','plafondOf','getShifts',
                 'getCreneau','_creCoversMin','hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement',
                 'dayJourType','removeCreneau','autoFillCore','explainViolation','revalidateWeek',
                 'buildChainReport','buildLegalWarn']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j;
  for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}
  eval("global.PLACE_RULES="+h.slice(st,j)+";"); }

// ── Stub d'écriture (même base que releve_test.js / transfer_test.js) ─────────────────────────────
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
global.MONDAY=new Date('2026-09-14T00:00:00'); global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.onRoster=s=>!!(s&&s.actif!==false);global.altDayType=()=>null;global.roleNom=c=>({caisse:'Caisse',cuisine:'Cuisine'}[c]||c);
global.ORG={coef_charges:1.42};global.escP=s=>(''+(s==null?'':s));global.escJS=s=>(''+(s==null?'':s));
global.fullName=s=>[s.prenom,s.nom].filter(Boolean).join(' ')||s.nom;
global.salById=id=>SAL[id];global.rolesOf=id=>(SAL[id]&&SAL[id].roles)||[];global.isExp=(id,c)=>((SAL[id]||{}).exp||[]).includes(c);
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.loadWeek=async()=>{S.creneaux=STORE.filter(c=>c.restaurant_id===SNACK.id).map(clone);S.allCreneauxWeek=STORE.map(clone);};

let ok=true,n=0;
const t=(l,c,extra)=>{n++;console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra==null?'':extra)));ok=c&&ok;};
const D=i=>fmtDate(dateOfDay(i));
const rowsOf=(rid,date,svc)=>STORE.filter(c=>c.restaurant_id===rid&&c.date===date&&c.service===svc);
const who=(rid,date,svc)=>rowsOf(rid,date,svc).map(c=>SAL[c.salarie_id].nom).sort().join('+');

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LE SCÉNARIO DU PATRON, réduit à son squelette : deux restaurants, un soir, un poste de caisse chacun.
//   Lobau  soir caisse 18:00→00:00 — DÉJÀ tenu par Youcef (multi Lobau+Carnot), posé par l'auto-fill.
//   Carnot soir caisse 18:00→00:00 — VIDE. Seul Youcef sait tenir la caisse à Carnot.
//   Mathéo : mono-Lobau, caisse. Il peut tenir Lobau, jamais Carnot (worksAt).
// L'enchaînement attendu : Youcef → Carnot, Mathéo → Lobau. Deux postes tenus au lieu d'un.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const LOB='r-lobau', CAR='r-carnot';
const RESTOS=[{id:LOB,nom:'Raya Lobau'},{id:CAR,nom:'Raya Carnot'}];
const SOIR=[{deb:'18:00',fin:'00:00'}];
function scnPatron(o){
  o=o||{};
  return {
    restos:RESTOS, snack:CAR, roles:[{cle:'caisse',nom:'Caisse'}],
    sals:[
      {id:'youcef',nom:'ARBOUZE',prenom:'Youcef',roles:['caisse'],exp:['caisse'],heures_min:0,heures_max:48,taux_horaire_brut:13,
       est_multi:true, snacks_priorites:[{restaurant_id:LOB,priorite:1},{restaurant_id:CAR,priorite:1}]},
      {id:'matheo',nom:'DE TAVERNIER',prenom:'Mathéo',roles:['caisse'],exp:['caisse'],heures_min:0,heures_max:48,taux_horaire_brut:12,
       snacks_priorites:[{restaurant_id:LOB,priorite:1}]},
    ],
    eff:[{restaurant_id:LOB,jour_type:'Lu-Me',service:'soir',role:'caisse',nb_cible:1,vagues:SOIR},
         {restaurant_id:CAR,jour_type:'Lu-Me',service:'soir',role:'caisse',nb_cible:1,vagues:SOIR}],
    // Youcef est DÉJÀ à Lobau ce lundi soir. `origine` pilote ce que la réparation a le droit d'en faire.
    store:[{restaurant_id:LOB,salarie_id:'youcef',role:'caisse',date:D(0),service:'soir',
            heure_debut:'18:00',heure_fin:'00:00', ...(o.origine!==undefined?{origine:o.origine}:{}),
            ...(o.sureffectif?{sureffectif:true}:{})}],
    regles:o.regles||[{cle:'sureffectif_minimum',active:false,valeur:'2'}],
  };
}
function setup(scn){
  STORE=scn.store.map(c=>Object.assign({id:'s'+(_id++)},c));
  global.SAL={}; scn.sals.forEach(s=>{SAL[s.id]=s;});
  global.SNACK=scn.restos.find(r=>r.id===scn.snack);
  global.S={restos:scn.restos,salaries:scn.sals,orgRoles:scn.roles,
    dispos:scn.dispos||[],miseAPied:[],contraintes:[],derogations:[],
    regles:scn.regles,effectifs:scn.eff,
    creneaux:STORE.filter(c=>c.restaurant_id===scn.snack).map(clone),allCreneauxWeek:STORE.map(clone)};
  _AF.posed.clear(); _AF.origineCol=false;
}
const SILENT={silent:true};
// Marque les créneaux de départ comme « posés par la génération en cours » (tier 1, sans migration).
const marquerPoses=()=>STORE.forEach(c=>_AF.posed.add(c.id));

// ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 1. LE CAS DU PATRON : LE TROU DE CARNOT EST COMBLÉ EN LIBÉRANT QUELQU\'UN DE LOBAU ──');
// ══════════════════════════════════════════════════════════════════════════════════════════════════
let R=null;
(async()=>{

setup(scnPatron()); marquerPoses();
R=await autoFillCore([0],SILENT);
t('Carnot lundi soir est comblé', who(CAR,D(0),'soir')==='ARBOUZE', who(CAR,D(0),'soir')||'(vide)');
t('… et Lobau n\'est pas laissé à découvert', who(LOB,D(0),'soir')==='DE TAVERNIER', who(LOB,D(0),'soir')||'(vide)');
t('… soit exactement 1 personne par restaurant', rowsOf(CAR,D(0),'soir').length===1 && rowsOf(LOB,D(0),'soir').length===1,
  `Carnot ${rowsOf(CAR,D(0),'soir').length} · Lobau ${rowsOf(LOB,D(0),'soir').length}`);
t('aucun poste n\'est déclaré non comblé', (R.report||[]).length===0, JSON.stringify((R.report||[]).map(r=>r.detail)));
t('la réparation est comptée comme UNE chaîne', (R.chain.list||[]).length===1, (R.chain.list||[]).length);
t('… et rien n\'est resté en suggestion', (R.chain.suggest||[]).length===0, JSON.stringify(R.chain.suggest));

console.log('\n   ── contenu de la chaîne ──');
const C=R.chain.list[0];
t('elle nomme celui qui part', C.xNom==='Youcef ARBOUZE', C.xNom);
t('elle nomme celui qui reprend', C.yNom==='Mathéo DE TAVERNIER', C.yNom);
t('elle nomme le restaurant d\'origine', C.fromSnack==='Lobau', C.fromSnack);
t('elle donne l\'horaire repris', C.fromHoraire==='18:00→00:00', C.fromHoraire);
t('elle est marquée inter-établissement', C.inter===true);
t('les heures AJOUTÉES sont celles du poste comblé, pas davantage', Math.abs(C.hLen-6)<0.01 && Math.abs(C.pLen-6)<0.01,
  `poste ${C.hLen}h · repris ${C.pLen}h`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2. A/B : AVEC L\'ANCIEN VIVIER (SNACK COURANT SEULEMENT), LE MÊME CAS ÉCHOUE ──');
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// On ne réécrit pas l'ancien code : on RESTREINT le vivier comme il l'était en v0.67 (snack courant),
// et on rejoue le VRAI autoFillCore. Si ce test passait aussi, c'est que le correctif ne servait à rien.
const VRAI_POOL=global.movablePool;
setup(scnPatron()); marquerPoses();
global.movablePool=(dates,posed)=>VRAI_POOL(dates,posed).filter(p=>p.row.restaurant_id===SNACK.id);
const RAvant=await autoFillCore([0],SILENT);
global.movablePool=VRAI_POOL;
t('AVANT — Carnot reste vide', rowsOf(CAR,D(0),'soir').length===0, who(CAR,D(0),'soir'));
t('AVANT — le poste est signalé non comblé', (RAvant.report||[]).length===1, (RAvant.report||[]).length);
t('AVANT — aucune réparation', (RAvant.chain.list||[]).length===0);
t('APRÈS — la différence est bien de 1 poste comblé', (RAvant.report||[]).length-(R.report||[]).length===1);

// ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 3. AUCUNE INFRACTION CRÉÉE — NI SUR LE DÉPLACÉ, NI SUR SON REMPLAÇANT ──');
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// On rejoue la REVALIDATION complète (le même checkPlacement, dans le contexte de chaque restaurant)
// sur le planning produit. C'est le contrôle qui compte : une réparation ne doit jamais résoudre un
// problème ici en en créant un ailleurs.
setup(scnPatron()); marquerPoses();
await autoFillCore([0],SILENT);
await loadWeek();
{ const rev=revalidateWeek();
  t('revalidation : 0 infraction sur la semaine produite', rev.infractions.length===0,
    JSON.stringify(rev.infractions.map(i=>i.phrase||i.cle))); }

// Contre-épreuve : le remplaçant Y est bel et bien filtré par checkPlacement. Mathéo devient indisponible
// ce lundi → plus personne ne peut reprendre Lobau → la chaîne ne doit PAS se faire (on ne dégarnit pas
// Lobau pour garnir Carnot).
setup(Object.assign(scnPatron(),{dispos:[{salarie_id:'matheo',statut:'indispo',statut_demande:'validee',
  type:'ponctuelle',date_specifique:D(0)}]})); marquerPoses();
{ const R2=await autoFillCore([0],SILENT);
  t('sans remplaçant valide, AUCUN déplacement n\'est fait', (R2.chain.list||[]).length===0);
  t('… Youcef reste à Lobau', who(LOB,D(0),'soir')==='ARBOUZE', who(LOB,D(0),'soir'));
  t('… et Carnot est honnêtement signalé non comblé', (R2.report||[]).length===1); }

// Contre-épreuve 2 : X lui-même doit passer checkPlacement sur le trou. Youcef est déclaré indisponible
// à Carnot ce soir-là → libérer Lobau ne sert à rien, donc on ne le libère pas.
setup(Object.assign(scnPatron(),{dispos:[{salarie_id:'youcef',statut:'indispo',statut_demande:'validee',
  type:'ponctuelle',date_specifique:D(0),heure_debut:'18:00',heure_fin:'23:00'}]})); marquerPoses();
{ const R3=await autoFillCore([0],SILENT);
  t('si X ne peut pas tenir le trou, sa place n\'est pas libérée pour rien', (R3.chain.list||[]).length===0);
  t('… et son créneau d\'origine est intact', who(LOB,D(0),'soir')==='ARBOUZE', who(LOB,D(0),'soir')); }

// ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 4. UN CRÉNEAU SAISI À LA MAIN N\'EST PAS DÉPLACÉ — ET ON LE DIT ──');
// ══════════════════════════════════════════════════════════════════════════════════════════════════
setup(scnPatron({origine:'manuel'}));   // pas de marquerPoses() : ce créneau n'a pas été posé par nous
_AF.origineCol=true;
{ const RM=await autoFillCore([0],SILENT);
  t('le créneau manuel n\'est PAS déplacé', who(LOB,D(0),'soir')==='ARBOUZE', who(LOB,D(0),'soir'));
  t('… Carnot reste donc vide', rowsOf(CAR,D(0),'soir').length===0);
  t('… mais l\'enchaînement est SIGNALÉ (jamais taire une solution)', (RM.chain.suggest||[]).length===1,
    JSON.stringify(RM.chain.suggest));
  t('… avec le bon motif', (RM.chain.suggest[0]||{}).raison==='manuel', (RM.chain.suggest[0]||{}).raison);
  t('… et rien n\'a été exécuté', (RM.chain.list||[]).length===0); }

// LE TEST QUI DISTINGUE UNE PROTECTION D'UNE DÉSACTIVATION : le MÊME scénario avec origine='auto' doit,
// lui, réparer. Sans ce contre-test, un garde-fou qui bloque tout passerait pour un succès.
setup(scnPatron({origine:'auto'}));
_AF.origineCol=true;
{ const RA=await autoFillCore([0],SILENT);
  t('CONTRE-TEST — le même créneau marqué « auto » est bien déplacé', (RA.chain.list||[]).length===1,
    JSON.stringify(RA.chain.suggest));
  t('… Carnot comblé', who(CAR,D(0),'soir')==='ARBOUZE', who(CAR,D(0),'soir')); }

// Origine INCONNUE (lignes antérieures à la migration) : traitée comme manuelle — on ne déplace pas ce
// dont on ne sait pas d'où ça vient. C'est ce qui rend la migration facultative sans risque.
setup(scnPatron());     // aucune colonne origine, aucun marquage
_AF.origineCol=false;
{ const RI=await autoFillCore([0],SILENT);
  t('origine inconnue → non déplacée', (RI.chain.list||[]).length===0);
  t('… mais suggérée, avec le motif « inconnu »', (RI.chain.suggest[0]||{}).raison==='inconnu',
    JSON.stringify(RI.chain.suggest)); }

// ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 5. LE RÉGLAGE « réparation entre restaurants » GOUVERNE L\'EXÉCUTION, PAS LA VISIBILITÉ ──');
// ══════════════════════════════════════════════════════════════════════════════════════════════════
setup(scnPatron({regles:[{cle:'sureffectif_minimum',active:false,valeur:'2'},
                         {cle:'reparation_inter_snack',active:false}]})); marquerPoses();
{ const RO=await autoFillCore([0],SILENT);
  t('réglage DÉCOCHÉ — aucun déplacement entre restaurants', (RO.chain.list||[]).length===0);
  t('… Youcef reste à Lobau', who(LOB,D(0),'soir')==='ARBOUZE', who(LOB,D(0),'soir'));
  t('… l\'enchaînement reste PROPOSÉ (le réglage ne doit pas cacher la solution)', (RO.chain.suggest||[]).length===1);
  t('… avec le motif « réglage »', (RO.chain.suggest[0]||{}).raison==='reglage', (RO.chain.suggest[0]||{}).raison); }

// Le maître-interrupteur coupe tout, y compris la suggestion : décocher la réparation, c'est dire
// « ne me propose rien de tel ».
setup(scnPatron({regles:[{cle:'sureffectif_minimum',active:false,valeur:'2'},
                         {cle:'autofill_reparation',active:false}]})); marquerPoses();
{ const RX=await autoFillCore([0],SILENT);
  t('réparation coupée — ni exécution ni suggestion', (RX.chain.list||[]).length===0 && (RX.chain.suggest||[]).length===0);
  t('… et le poste est signalé non comblé', (RX.report||[]).length===1); }

// Défaut du code == défaut affiché dans l'écran Réglages (le contrôle générique vit dans
// reglages_defauts_test.js ; ici on vérifie que les deux clés sont bien DÉCRITES et à ON).
t('« reparation_inter_snack » est décrit dans RULE_META', !!RULE_META.reparation_inter_snack);
t('… avec une aide en français qui dit quoi en faire',
  (RULE_META.reparation_inter_snack.help||'').length>80);
t('… et il est ACTIVÉ par défaut', _virtualRegle('reparation_inter_snack').active===true);
t('« autofill_reparation » est désormais visible dans l\'écran Réglages', !!RULE_META.autofill_reparation);
t('… et activé par défaut', _virtualRegle('autofill_reparation').active===true);

// ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 6. LA CHAÎNE S\'EXPLIQUE — TEXTE RÉEL DU RAPPORT ──');
// ══════════════════════════════════════════════════════════════════════════════════════════════════
setup(scnPatron()); marquerPoses();
{ const RR=await autoFillCore([0],SILENT);
  const {chainSection, chainWarn}=buildChainReport(RR.chain, true);
  const txt=chainSection.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  t('le rapport contient une section « réparations »', chainSection.length>0);
  t('… qui nomme le restaurant et le service comblés', /Carnot · Lundi soir · Caisse/.test(txt), txt.slice(0,120));
  t('… qui dit QUI est déplacé et D\'OÙ', /déplaçant Youcef ARBOUZE depuis Lobau/.test(txt), txt);
  t('… qui dit QUI reprend sa place', /Mathéo DE TAVERNIER reprend son créneau à Lobau \(18:00→00:00\)/.test(txt), txt);
  // Le CHIFFRAGE. X échange 6 h contre 6 h (delta nul) ; Y gagne 6 h à 12 €/h × 1,42 = 102 € chargé.
  // C'est le vrai coût de la réparation : les heures du poste comblé, au taux de qui les fait.
  t('… qui chiffre les heures ajoutées', /\+6h/.test(txt), txt);
  t('… et le coût chargé, au taux du remplaçant (6 h × 12 € × 1,42)', /≈ \+102 € chargé/.test(txt), txt);
  t('aucun encart « votre accord requis » quand tout a été exécuté', chainWarn==='');
  // La phrase du rapport ne doit pas être une seconde mise en forme : suggestion et exécution partagent
  // _chainRow. On vérifie que la suggestion parle des mêmes personnes, dans la même section.
  const {chainWarn:w2}=buildChainReport({list:[],suggest:[Object.assign({},RR.chain.list[0],{exec:false,raison:'manuel'})]}, true);
  t('la suggestion emploie le même vocabulaire', /Youcef ARBOUZE/.test(w2)&&/Mathéo DE TAVERNIER/.test(w2));
  t('… et donne le motif exact', w2.includes(CHAIN_RAISON.manuel)); }

// ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 7. LE BUDGET DE TEMPS TIENT SUR UNE SEMAINE COMPLÈTE À TROIS RESTAURANTS ──');
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 3 restaurants × 7 jours × 2 services × 2 rôles × 2 vagues = 168 postes pour 13 salariés dont 7 multi :
// la demande dépasse largement la capacité, donc BEAUCOUP de trous restent ouverts après la phase 1 —
// et chacun déclenche une recherche de réparation sur le vivier de la SEMAINE ENTIÈRE, tous restaurants.
// C'est LE scénario où un solveur naïf exploserait, et le seul qui mesure vraiment le coût du vivier
// élargi. Un scénario où tout se place en phase 1 ne prouverait rien : d'où le contrôle de non-vacuité.
{ const R3S=['r-a','r-b','r-c'], NOMS={'r-a':'Raya A','r-b':'Raya B','r-c':'Raya C'};
  const sals=[];
  for(let i=0;i<13;i++){
    const multi=i<7;
    sals.push({id:'s'+i,nom:'SAL'+i,prenom:'P'+i,roles:['caisse','cuisine'],exp:['caisse','cuisine'],
      heures_min:0,heures_max:48,taux_horaire_brut:12+i*0.1,est_multi:multi,
      snacks_priorites: multi ? R3S.map((r,k)=>({restaurant_id:r,priorite:k+1}))
                              : [{restaurant_id:R3S[i%3],priorite:1}]});
  }
  const VAGUES={midi:[{deb:'11:00',fin:'14:30'},{deb:'11:30',fin:'15:00'}],
                soir:[{deb:'18:00',fin:'23:00'},{deb:'18:30',fin:'23:30'}]};
  const eff=[];
  for(const rid of R3S) for(const jt of ['Lu-Me','Je','Ve','Sa','Di']) for(const svc of ['midi','soir']) for(const role of ['caisse','cuisine'])
    eff.push({restaurant_id:rid,jour_type:jt,service:svc,role,nb_cible:2,vagues:VAGUES[svc]});
  STORE=[]; global.SAL={}; sals.forEach(s=>SAL[s.id]=s);
  global.SNACK={id:'r-a',nom:'Raya A'};
  global.S={restos:R3S.map(id=>({id,nom:NOMS[id]})),salaries:sals,orgRoles:[{cle:'caisse',nom:'Caisse'},{cle:'cuisine',nom:'Cuisine'}],
    dispos:[],miseAPied:[],contraintes:[],derogations:[],regles:[{cle:'sureffectif_minimum',active:false,valeur:'2'}],
    effectifs:eff,creneaux:[],allCreneauxWeek:[]};
  _AF.posed.clear(); _AF.origineCol=false;
  const t0=Date.now(); const tot={list:0,sugg:0,budget:0,report:0};
  for(const rid of R3S){
    SNACK=S.restos.find(r=>r.id===rid);
    await loadWeek();
    const r=await autoFillCore([0,1,2,3,4,5,6],SILENT);
    tot.list+=(r.chain.list||[]).length; tot.sugg+=(r.chain.suggest||[]).length;
    tot.budget+=r.chain.budget||0; tot.report+=(r.report||[]).length;
  }
  const dt=Date.now()-t0;
  console.log(`   3 restaurants · ${STORE.length} créneaux posés · ${tot.list} réparation(s) · ${tot.report} poste(s) non comblé(s) · ${dt} ms`);
  // NON-VACUITÉ : sans trous ouverts, la phase 2 ne s'exécuterait jamais et ce « test de budget »
  // mesurerait le temps de la phase 1. Un total juste ne prouve pas un détail juste.
  t('le scénario exerce RÉELLEMENT la réparation (des trous restent ouverts après la phase 1)',
    tot.report+tot.list>=20, `${tot.report} non comblés + ${tot.list} réparés`);
  t('la génération complète tient largement sous le budget (8 s / snack)', dt<8000, dt+' ms');
  t('aucun trou n\'a été abandonné faute de temps', tot.budget===0, tot.budget);
  t('le planning produit est conforme (revalidation, 0 infraction)', (()=>{
    SNACK=S.restos[0]; const rev=revalidateWeek(); return rev.infractions.length===0;
  })());
  t('… et aucun créneau ne se retrouve en double sur une même case',
    (()=>{const k=new Set(); for(const c of STORE){const key=[c.restaurant_id,c.salarie_id,c.date,c.service].join('|'); if(k.has(key))return false; k.add(key);} return true;})());
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 8. LES GARDE-FOUS DU VIVIER ──');
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// (a) Un créneau en SUREFFECTIF n'est pas recomblé : ce serait offrir à Y des heures au-delà de la cible
//     alors que le sureffectif automatique est décoché. On peut déplacer X, on ne « rachète » pas sa place.
setup(scnPatron({sureffectif:true})); marquerPoses();
{ const RS=await autoFillCore([0],SILENT);
  t('un créneau en sureffectif n\'entre pas dans le vivier', (RS.chain.list||[]).length===0 && (RS.chain.suggest||[]).length===0); }

// (b) Périmètre de dates : un auto-fill d'UNE journée ne doit pas réorganiser les autres jours de la
//     semaine — le plafond hebdomadaire suffirait sinon à justifier d'aller chercher n'importe où.
setup(scnPatron()); marquerPoses();
{ const pool0=movablePool([D(0)],_AF.posed), pool1=movablePool([D(1)],_AF.posed);
  t('le vivier ne contient que les dates traitées', pool0.length===1 && pool1.length===0, `${pool0.length} / ${pool1.length}`); }

// (c) Salarié sorti de l'effectif : jamais candidat au déplacement.
setup(scnPatron()); marquerPoses();
SAL.youcef.actif=false;
{ const pool=movablePool([D(0)],_AF.posed);
  t('un salarié hors effectif n\'est pas déplaçable', pool.length===0, pool.length); }
SAL.youcef.actif=true;

// (c bis) UN RESTAURANT MIS EN PAUSE. S.restos est chargé avec .eq('actif',true) ; S.allCreneauxWeek,
//     lui, est borné par EatimeScope qui ne filtre PAS sur `actif`. Les créneaux d'un restaurant en
//     pause arrivent donc dans la semaine SANS que son restaurant soit dans S.restos. Deux dégâts, tous
//     deux corrigés ici :
//       1. _withSnack laissait alors un contexte MIXTE (SNACK sur le restaurant affiché, S.creneaux sur
//          l'autre) → checkPlacement jugeait « worksAt » pour le mauvais site et laissait passer un
//          salarié non affecté ;
//       2. la réparation allait réorganiser un établissement fermé.
setup(scnPatron()); marquerPoses();
{ // le contexte doit être ENTIER, même pour un restaurant absent de S.restos
  const vu=_withSnack('r-inconnu',()=>({id:SNACK.id, cre:S.creneaux.length}));
  t('_withSnack — contexte entier même pour un restaurant hors S.restos', vu.id==='r-inconnu', vu.id);
  t('… et le contexte est restauré après coup', SNACK.id===CAR, SNACK.id); }
{ // Lobau mis en pause : disparaît de S.restos, mais ses créneaux restent dans allCreneauxWeek
  const scn=scnPatron(); setup(scn); marquerPoses();
  S.restos=S.restos.filter(r=>r.id!==CAR? r.id!==LOB : true);   // on retire Lobau, on garde Carnot
  const pool=movablePool([D(0)],_AF.posed);
  t('un restaurant en pause n\'entre pas dans le vivier', pool.length===0, pool.length);
  const RP=await autoFillCore([0],SILENT);
  t('… aucun déplacement n\'y est exécuté', (RP.chain.list||[]).length===0);
  t('… et personne n\'y est écrit', !STORE.some(c=>c.restaurant_id===LOB&&c.salarie_id==='matheo'),
    JSON.stringify(STORE.filter(c=>c.restaurant_id===LOB).map(c=>c.salarie_id))); }

// (d) origineOf : la table de vérité, isolée.
{ const posed=new Set(['x1']);
  t('origineOf — posé pendant la génération → « genere »', origineOf({id:'x1'},posed)==='genere');
  t('origineOf — colonne « auto » → « genere »', origineOf({id:'z',origine:'auto'},posed)==='genere');
  t('origineOf — colonne « manuel » → « manuel »', origineOf({id:'z',origine:'manuel'},posed)==='manuel');
  t('origineOf — rien du tout → « inconnu »', origineOf({id:'z'},posed)==='inconnu'); }

// (e) _simRemove restaure l'état MÊME si le calcul jette — sans ça, une exception laisserait S amputé
//     et l'écriture suivante irait au mauvais endroit (même exigence que _withSnack).
setup(scnPatron());
{ const avant=S.allCreneauxWeek.length, avantCur=S.creneaux.length;
  let jete=false;
  try{ _simRemove(S.allCreneauxWeek[0],()=>{ throw new Error('boum'); }); }catch(e){ jete=true; }
  t('_simRemove — l\'exception remonte', jete);
  t('… et S est restauré à l\'identique', S.allCreneauxWeek.length===avant && S.creneaux.length===avantCur,
    `${S.allCreneauxWeek.length}/${avant} · ${S.creneaux.length}/${avantCur}`);
  const dedans=_simRemove(S.allCreneauxWeek[0],()=>S.allCreneauxWeek.length);
  t('… et pendant l\'appel, le créneau est bien absent', dedans===avant-1, dedans); }

// ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 8bis. QUI EST DÉPLACÉ : LE MOINS EN MANQUE D\'HEURES, JAMAIS CELUI QUI EN A BESOIN ──');
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// C'est le critère de tri hérité de la phase 2 d'origine, et il porte une décision de gestion : on
// déshabille en priorité quelqu'un qui a déjà ses heures. CONSÉQUENCE ASSUMÉE : celui qu'on déplace peut
// TERMINER AVEC MOINS D'HEURES si le poste comblé est plus court que le créneau qu'il laisse. C'est
// voulu — la phase 3 repasse ensuite pour le recompléter — mais ce doit être un choix, pas un hasard.
// Deux candidats capables de combler le trou : l'un largement au-dessus de son minimum, l'autre en
// dessous. Le moteur doit prendre le premier.
// Lobau tient DEUX personnes le soir ; Youcef et Nadia y sont tous les deux, donc tous deux bloqués
// pour Carnot. Un seul peut être libéré (Mathéo ne peut reprendre qu'une place). Le moteur doit choisir
// Youcef (déjà à son minimum), pas Nadia (à 6 h pour un minimum de 35).
{ const scn=scnPatron();
  scn.sals[0].heures_min=6;                       // Youcef : déjà à ses heures (6 h posées, min 6)
  scn.sals.push({id:'nadia',nom:'BENALI',prenom:'Nadia',roles:['caisse'],exp:['caisse'],
    heures_min:35,heures_max:48,taux_horaire_brut:12,        // Nadia : très en manque
    est_multi:true, snacks_priorites:[{restaurant_id:LOB,priorite:1},{restaurant_id:CAR,priorite:1}]});
  scn.store.push({restaurant_id:LOB,salarie_id:'nadia',role:'caisse',date:D(0),service:'soir',
    heure_debut:'18:00',heure_fin:'00:00'});
  scn.eff=scn.eff.map(e=>e.restaurant_id===LOB
    ? {...e, nb_cible:2, vagues:[{deb:'18:00',fin:'00:00'},{deb:'18:00',fin:'00:00'}]} : e);
  setup(scn); marquerPoses();
  const RN=await autoFillCore([0],SILENT);
  t('un déplacement a bien lieu', (RN.chain.list||[]).length===1, JSON.stringify(RN.report.map(r=>r.detail)));
  t('c\'est Youcef (à ses heures) qui est déplacé, pas Nadia (en manque)',
    (RN.chain.list[0]||{}).xNom==='Youcef ARBOUZE', (RN.chain.list[0]||{}).xNom);
  t('… et Nadia reste à Lobau', STORE.some(c=>c.restaurant_id===LOB&&c.salarie_id==='nadia')); }

// ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 9. LA SUBSTITUTION EST À L\'IDENTIQUE (ce qui rend relève et durée minimale sans objet) ──');
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Y reprend EXACTEMENT les bornes de X : aucune nouvelle frontière n'apparaît, donc releveInterdite n'a
// rien à juger et la règle des 3 h (qui ne vise que les créneaux CRÉÉS avec de nouvelles bornes) ne
// s'applique pas. Ce test tombe le jour où l'on autoriserait Y à ne reprendre qu'une PARTIE du créneau.
setup(scnPatron()); marquerPoses();
{ const RQ=await autoFillCore([0],SILENT);
  const repris=STORE.find(c=>c.restaurant_id===LOB&&c.salarie_id==='matheo');
  t('le remplaçant reprend les bornes exactes du créneau libéré',
    repris && repris.heure_debut==='18:00' && repris.heure_fin==='00:00',
    repris?`${repris.heure_debut}→${repris.heure_fin}`:'(absent)');
  t('… et le rôle exact', repris && repris.role==='caisse', repris&&repris.role);
  t('… aucune relève en plein service n\'apparaît dans la semaine produite',
    (()=>{ SNACK=S.restos.find(r=>r.id===LOB); return relevesOf(STORE).length===0; })(),
    JSON.stringify(relevesOf(STORE))); }

// ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 10. GARDE-FOUS STRUCTURELS (une règle jamais appelée serait sans effet) ──');
// ══════════════════════════════════════════════════════════════════════════════════════════════════
t('autoFillCore appelle bien planRepair', /planRepair\(h,\{/.test(h));
t('… avec le vivier SEMAINE ENTIÈRE (movablePool), pas un tableau local',
  /pool:movablePool\(_dates,_AF\.posed\)/.test(h));
t('… et le tableau `placed` a bien disparu de la phase 2', !/movedList|placed\.slice\(\)/.test(h));
t('placeCre alimente le vivier des créneaux posés', /_AF\.posed\.add\(data\.id\)/.test(h));
t('placeCre n\'injecte JAMAIS un créneau d\'un autre restaurant dans la grille affichée',
  /if\(data\.restaurant_id===SNACK\.id\) S\.creneaux\.push\(data\)/.test(h));
t('la saisie manuelle est estampillée « manuel »', (h.match(/origine:'manuel'/g)||[]).length>=2,
  (h.match(/origine:'manuel'/g)||[]).length);
t('la colonne `origine` n\'est écrite que si elle existe', !/origine:'auto'/.test(h.replace(/_AF\.origineCol\?\{origine:'auto'\}:\{\}/g,'')));
t('le rapport mono affiche la section réparations', /\$\{chainWarn\}.*\$\{chainSection\}/s.test(h.slice(h.indexOf('function showSolveReport'))));
t('le rapport multi agrège les chaînes de TOUS les snacks', /chain&&r\.chain\.list/.test(h));
t('la chaîne est conservée dès l\'étape A du multi (phase3 y est écrasé)', /chain:res\.chain\|\|\{\}/.test(h));
t('la recherche ne fait AUCUNE écriture : planRepair n\'appelle ni placeCre ni removeCre',
  (()=>{const src=extractFn(h,'planRepair'); return !/placeCre|removeCre|EatimeScope/.test(src);})());
t('… et le remplaçant est cherché DANS le contexte du restaurant donneur',
  (()=>{const src=extractFn(h,'planRepair'); return /_withSnack\(moved\.restaurant_id, *\(\)=>\{[\s\S]*sortCandidates/.test(src);})());

console.log('\n'+(ok?'ALL PASS':'SOME FAILED')+`  (${n} vérifications)`);
process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});

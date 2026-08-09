// v0.64 — L'AUTO-FILL SE BORNE AUX POSTES DÉFINIS, ET LES 7 JOURS ONT UN PLAFOND D'HEURE DE FIN.
//
// Constat de départ du patron : « l'auto-fill place des créneaux jusqu'à 02:00 le dimanche, alors que
// mes postes du dimanche s'arrêtent au plus tard à 00:30 ».
//
// ⚠ LE PREMIER BLOC PORTE SUR LE DIMANCHE — c'est le jour que le code oubliait.
// Avant v0.64, _endCapMin ne connaissait que deux règles : fin_semaine (lun→jeu) et fin_weekend
// (ven+sam). Le dimanche n'appartenait à AUCUNE des deux : la fonction renvoyait null, checkPlacement
// ne plafonnait rien, et le panneau « Heure de fin max (jour) » sortait sur `if(!cap) return;` — donc
// affichait un vert rassurant là où il n'y avait aucun contrôle.
//
// Les postes et les valeurs de règles ci-dessous sont la COPIE EXACTE de ce qui a été lu en base
// (production, org « Groupe Raya », 2026-08-09).
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);
const {extractFn}=require("./extract.js");
const grab=n=>extractFn(h,n);

eval("global._pdur="+(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const _pdur\s*=/,'').replace(/;$/,''))+";");
eval("global._truthyContr="+(h.match(/const _truthyContr\s*=[^\n]*/)[0].replace(/^const _truthyContr\s*=/,'').replace(/;$/,''))+";");
{ const i=h.indexOf("const _JOURS_IDX"); if(i>=0) eval("global._JOURS_IDX="+h.slice(h.indexOf("{",i),h.indexOf("\n",i))+";"); }
// Profil de besoin horaire (_needAt / _coverAt / _wouldOvercover) : bloc contigu du fichier réel.
{ const s=h.indexOf("function _needAt"), e=h.indexOf("// ===== UNDO");
  if(s>=0&&e>s) eval(h.slice(s,e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); }
for(const fn of ['_toMin','overlaps','_overlap','_dayIndexOf','contrOf','isMultiSnack','weekMinutesOf',
                 'weekHoursOf','plafondOf','_indispoBlocking','_contrainteBlocking','checkPlacement',
                 'revalidateWeek']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}

global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.MONDAY=new Date('2026-08-03T00:00:00'); global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.escP=s=>(''+(s==null?'':s));
global.onRoster=()=>true; global.worksAt=()=>true; global.isExp=()=>true;
global.rolesOf=()=>['cuisine','caisse'];
global.altDayType=()=>null; global.hasIndispo=()=>null;
global.hasPonctuelleAbsence=()=>false; global.isSuspended=()=>false;
global.salById=id=>SAL[id];
global.fullName=s=>[s.prenom,s.nom].filter(Boolean).join(' ')||s.nom;
global.plafondOf=(sal)=>Number(sal.heures_max)||48;

let ok=true, n=0;
const t=(l,c,extra)=>{n++;console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra==null?'':extra)));ok=c&&ok;};

// ── POSTES RÉELS (planning_effectifs, service du soir) ───────────────────────────────────────────
// Grand Cœur dimanche — exactement ceux que le patron a cités dans sa demande.
const GC='gc', LOB='lob';
const EFF=[
  {restaurant_id:GC, jour_type:'Di', service:'soir', role:'cuisine', nb_cible:4, vagues:[
    {deb:'17:00',fin:'00:30',exp:true},{deb:'17:30',fin:'23:00',exp:true},
    {deb:'18:00',fin:'00:00',exp:false},{deb:'19:00',fin:'00:00',exp:false}]},
  {restaurant_id:GC, jour_type:'Di', service:'soir', role:'caisse', nb_cible:3, vagues:[
    {deb:'17:00',fin:'00:00',exp:true},{deb:'18:30',fin:'22:00',exp:false},
    {deb:'19:00',fin:'23:30',exp:true}]},
  // Samedi au même endroit : les postes vont RÉELLEMENT jusqu'à 02:00 — c'est légitime.
  {restaurant_id:GC, jour_type:'Sa', service:'soir', role:'cuisine', nb_cible:4, vagues:[
    {deb:'18:00',fin:'00:30',exp:true},{deb:'18:00',fin:'02:00',exp:true},
    {deb:'18:30',fin:'23:00',exp:false},{deb:'19:00',fin:'02:00',exp:false}]},
  {restaurant_id:GC, jour_type:'Sa', service:'soir', role:'caisse', nb_cible:3, vagues:[
    {deb:'18:00',fin:'00:00',exp:true},{deb:'18:30',fin:'23:00',exp:false},
    {deb:'19:00',fin:'02:00',exp:true}]},
  // Lobau dimanche : la caisse ouvre PLUS TARD et ferme PLUS TÔT que la cuisine → c'est le cas qui
  // démontre la fuite inter-rôles de l'ancienne enveloppe « tous rôles confondus ».
  {restaurant_id:LOB, jour_type:'Di', service:'soir', role:'cuisine', nb_cible:3, vagues:[
    {deb:'17:00',fin:'00:30',exp:true},{deb:'18:30',fin:'22:30',exp:false},{deb:'19:00',fin:'23:30',exp:false}]},
  {restaurant_id:LOB, jour_type:'Di', service:'soir', role:'caisse', nb_cible:2, vagues:[
    {deb:'18:00',fin:'00:00',exp:true},{deb:'19:00',fin:'22:30',exp:false}]},
];
const RESTOS=[{id:GC,nom:'Raya Grand Coeur'},{id:LOB,nom:'Raya Lobau'}];
const SAL={s1:{id:'s1',prenom:'Diaddie',nom:'SY',heures_max:48,heures_min:35}};
global.SAL=SAL;

let RAW={};
global._ruleCtx=()=>({num:(k,d)=>d, on:(k,d)=>d,
  // Reproduit _regleOf : ligne réelle si elle existe, sinon ligne VIRTUELLE (marquée _virtuel),
  // exactement comme en production quand aucune ligne n'est en base pour cette clé.
  raw:(k)=>RAW[k]||{cle:k,_virtuel:true,active:true,valeur:''}});
// rid = restaurant AFFICHÉ (SNACK). S.creneaux ne contient que les siens, S.allCreneauxWeek tous —
// c'est exactement la découpe de production, et c'est elle qui rend les règles inter-snack testables.
function setState(cre,rid){
  const r=rid||GC;
  global.SNACK=RESTOS.find(x=>x.id===r);
  global.S={restos:RESTOS, salaries:Object.values(SAL), orgRoles:[{cle:'cuisine'},{cle:'caisse'}],
            dispos:[], miseAPied:[], contraintes:[], regles:[], derogations:[], effectifs:EFF,
            creneaux:(cre||[]).filter(c=>c.restaurant_id===r), allCreneauxWeek:(cre||[]).slice()};
}
setState([]);
const rg=()=>_ruleCtx();
const DI=6, SA=5, JE=3, LU=0;               // indices de jour (0=lundi … 6=dimanche)
const dDi=fmtDate(dateOfDay(DI)), dSa=fmtDate(dateOfDay(SA));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 1. LE DIMANCHE — le jour qu\'aucune règle ne couvrait ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
t('les 7 jours sont rattachés à une règle de plafond (aucun jour hors modèle)',
  [0,1,2,3,4,5,6].every(di=>!!FIN_CLE_OF_JT[dayJourType(di)]),
  [0,1,2,3,4,5,6].map(di=>di+':'+FIN_CLE_OF_JT[dayJourType(di)]).join(' '));
t('le dimanche est rattaché à fin_di', FIN_CLE_OF_JT['Di']==='fin_di', FIN_CLE_OF_JT['Di']);
t('le dimanche n\'a AUCUNE ancienne règle en repli (c\'est bien le jour oublié)',
  FIN_LEGACY_OF_JT['Di']===null, String(FIN_LEGACY_OF_JT['Di']));

RAW={};
t('sans valeur, le dimanche est signalé « non renseigné » et non passé sous silence',
  _endCapState(rg(),DI).etat==='non_renseigne', JSON.stringify(_endCapState(rg(),DI)));
t('capCoverageGaps liste le dimanche quand il n\'est pas plafonné',
  capCoverageGaps(rg()).some(g=>g.jt==='Di'), JSON.stringify(capCoverageGaps(rg()).map(g=>g.jt)));

RAW={fin_di:{cle:'fin_di',active:true,valeur:'00:30'}};
t('avec fin_di=00:30, le plafond du dimanche vaut 24:30 en minutes absolues',
  _endCapMin(rg(),DI) && _endCapMin(rg(),DI).capM===1470, JSON.stringify(_endCapMin(rg(),DI)));
t('le dimanche ne figure plus dans les jours non couverts',
  !capCoverageGaps(rg()).some(g=>g.jt==='Di'), JSON.stringify(capCoverageGaps(rg()).map(g=>g.jt)));

// Saisie MANUELLE au-delà du plafond du dimanche → refus (c'était accepté sans un mot avant v0.64).
setState([]);
{ const v=checkPlacement('s1',{deb:'18:00',fin:'02:00',role:'cuisine'},dDi,'soir',DI,{rg:rg(),manual:true});
  t('saisie manuelle dimanche 18:00→02:00 : REFUSÉE (plafond 00:30)',
    !!v && v.cle==='fin_di', JSON.stringify(v));
  const v2=checkPlacement('s1',{deb:'18:00',fin:'00:30',role:'cuisine'},dDi,'soir',DI,{rg:rg(),manual:true});
  t('saisie manuelle dimanche 18:00→00:30 : ACCEPTÉE (pile au plafond)', v2===null, JSON.stringify(v2));
}
// La phrase de refus doit nommer le jour et l'heure — pas seulement « fin trop tardive ».
{ const v=checkPlacement('s1',{deb:'18:00',fin:'02:00',role:'cuisine'},dDi,'soir',DI,{rg:rg(),manual:true});
  const e=explainViolation(v,{shift:{deb:'18:00',fin:'02:00',role:'cuisine'},date:dDi,svc:'soir'});
  t('le refus cite le fait déclencheur (02:00), le jour et le plafond',
    /02:00/.test(e.why) && /dimanche/i.test(e.why) && /00:30/.test(e.why), e.why);
  t('le refus renvoie vers le réglage fin_di', e.reglage===RULE_META.fin_di.lbl || /dimanche/i.test(e.reglage||''), e.reglage);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2. « 00:00 » VAUT MINUIT, ET NON « PAS DE PLAFOND » ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Avant v0.64, _endCapMin faisait `if(!val || val==='00:00') return null;` et finRuleInput relisait
// '00:00' comme « jamais configurée » : un plafond à minuit — l'heure de fermeture la plus courante —
// était littéralement IMPOSSIBLE à enregistrer, et la valeur disparaissait de l'écran après saisie.
RAW={fin_di:{cle:'fin_di',active:true,valeur:'00:00'}};
t('fin_di=00:00 est un plafond ACTIF', _endCapState(rg(),DI).etat==='actif', JSON.stringify(_endCapState(rg(),DI)));
t('fin_di=00:00 vaut minuit (1440 min), pas « aucun plafond »',
  _endCapMin(rg(),DI) && _endCapMin(rg(),DI).capM===1440, JSON.stringify(_endCapMin(rg(),DI)));
setState([]);
t('dimanche 18:00→00:30 est REFUSÉ quand le plafond est minuit',
  !!checkPlacement('s1',{deb:'18:00',fin:'00:30',role:'cuisine'},dDi,'soir',DI,{rg:rg(),manual:true}));
t('dimanche 18:00→00:00 est ACCEPTÉ (pile minuit)',
  checkPlacement('s1',{deb:'18:00',fin:'00:00',role:'cuisine'},dDi,'soir',DI,{rg:rg(),manual:true})===null);

RAW={fin_di:{cle:'fin_di',active:false,valeur:'00:30'}};
t('une règle décochée est signalée « désactivée », pas confondue avec « non renseignée »',
  _endCapState(rg(),DI).etat==='desactive', JSON.stringify(_endCapState(rg(),DI)));
RAW={fin_di:{cle:'fin_di',active:true,valeur:''}};
t('une valeur vide = aucun plafond, et c\'est dit', _endCapState(rg(),DI).etat==='non_renseigne');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 3. LES RÉGLAGES ACTUELS CONTINUENT DE S\'APPLIQUER AUX JOURS QU\'ILS COUVRAIENT ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Repli tant que la migration v6.35 n'est pas appliquée. VALEURS RÉELLES lues en base :
//   fin_semaine = '00:00' (active)  ·  fin_weekend = '02:00' (active)
RAW={fin_semaine:{cle:'fin_semaine',active:true,valeur:'00:00'},
     fin_weekend:{cle:'fin_weekend',active:true,valeur:'02:00'}};
t('repli : vendredi reste plafonné à 02:00 (ex-fin_weekend)',
  _endCapMin(rg(),4) && _endCapMin(rg(),4).capM===1560, JSON.stringify(_endCapMin(rg(),4)));
t('repli : samedi reste plafonné à 02:00 (ex-fin_weekend)',
  _endCapMin(rg(),SA) && _endCapMin(rg(),SA).capM===1560, JSON.stringify(_endCapMin(rg(),SA)));
// fin_semaine='00:00' voulait dire « jamais configurée » dans l'ANCIENNE interface : le relire comme
// minuit inventerait une contrainte que le patron n'a jamais posée.
t('repli : lundi reste SANS plafond (00:00 hérité = « non renseigné », pas minuit)',
  _endCapMin(rg(),LU)===null, JSON.stringify(_endCapState(rg(),LU)));
t('repli : jeudi reste SANS plafond (même valeur héritée)', _endCapMin(rg(),JE)===null);
t('repli : le dimanche reste non couvert — aucune ancienne règle ne le mentionnait',
  _endCapMin(rg(),DI)===null);
t('les jours non couverts sont listés : lun→mer, jeudi, dimanche',
  ['Lu-Me','Je','Di'].every(j=>capCoverageGaps(rg()).some(g=>g.jt===j)) && capCoverageGaps(rg()).length===3,
  JSON.stringify(capCoverageGaps(rg()).map(g=>g.jt)));

// La nouvelle clé l'emporte sur l'ancienne dès qu'elle existe en base.
RAW={fin_semaine:{cle:'fin_semaine',active:true,valeur:'00:00'},
     fin_weekend:{cle:'fin_weekend',active:true,valeur:'02:00'},
     fin_sa:{cle:'fin_sa',active:true,valeur:'01:00'}};
t('après migration, fin_sa l\'emporte sur l\'ancienne fin_weekend',
  _endCapMin(rg(),SA).capM===1500 && _endCapMin(rg(),SA).cle==='fin_sa', JSON.stringify(_endCapMin(rg(),SA)));
t('les jours non migrés continuent de suivre l\'ancienne règle',
  _endCapMin(rg(),4).capM===1560, JSON.stringify(_endCapMin(rg(),4)));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 4. BORNES DES POSTES — PAR RÔLE, PAS « TOUS RÔLES CONFONDUS » ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
setState([]);
global.SNACK=RESTOS[0];   // Grand Cœur
t('Grand Cœur · dimanche · cuisine : postes 17:00 → 00:30',
  JSON.stringify(posteEnvelope('Di','soir','cuisine'))==='{"mn":1020,"mx":1470}',
  JSON.stringify(posteEnvelope('Di','soir','cuisine')));
t('Grand Cœur · dimanche · caisse : postes 17:00 → 00:00 (et NON 00:30, emprunté à la cuisine)',
  JSON.stringify(posteEnvelope('Di','soir','caisse'))==='{"mn":1020,"mx":1440}',
  JSON.stringify(posteEnvelope('Di','soir','caisse')));
global.SNACK=RESTOS[1];   // Lobau
t('Lobau · dimanche · caisse : ouvre à 18:00 (et NON 17:00, emprunté à la cuisine)',
  posteEnvelope('Di','soir','caisse').mn===1080, JSON.stringify(posteEnvelope('Di','soir','caisse')));
t('Lobau · dimanche · cuisine : ouvre bien à 17:00', posteEnvelope('Di','soir','cuisine').mn===1020);
global.SNACK=RESTOS[0];
t('aucun poste défini pour un rôle → null (aucune heure ne peut être inventée)',
  posteEnvelope('Di','midi','cuisine')===null, JSON.stringify(posteEnvelope('Di','midi','cuisine')));
t('samedi : les postes vont RÉELLEMENT jusqu\'à 02:00 — 02:00 y est légitime',
  posteEnvelope('Sa','soir','cuisine').mx===1560, JSON.stringify(posteEnvelope('Sa','soir','cuisine')));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 5. L\'AUTO-FILL NE SORT PAS DES POSTES (rallonge, phase 3) ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Réplique de la boucle de RALLONGE (PASS A) telle qu'elle est dans autoFillCore, paramétrée par la
// fonction d'enveloppe pour pouvoir rejouer l'ANCIEN comportement et le NOUVEAU sur les mêmes données.
const absToHHMM=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
// Ancienne enveloppe : min/max sur TOUS les rôles du service (le comportement d'avant v0.64).
const envAllRoles=(jt,svc)=>{let mn=Infinity,mx=-Infinity;
  for(const r of S.orgRoles){ const e=posteEnvelope(jt,svc,r.cle); if(!e)continue;
    if(e.mn<mn)mn=e.mn; if(e.mx>mx)mx=e.mx; }
  return mn===Infinity?null:{mn,mx};};
function rallonge(sid,target,cap,envFn){
  const out=[];
  const myCre=S.creneaux.filter(c=>c.salarie_id===sid && c.restaurant_id===SNACK.id && c.heure_debut && c.heure_fin);
  for(const row of myCre){
    const di=(new Date(row.date).getDay()+6)%7, jt=dayJourType(di);
    const env=envFn(jt,row.service,row.role); if(!env) continue;
    let debM=_pmin(row.heure_debut), finM=_pmin(row.heure_fin); if(finM<=debM)finM+=1440;
    const oldDur=(finM-debM)/60; let curDeb=debM, curFin=finM, curDur=oldDur;
    const projected=()=>weekHoursOf(sid)-oldDur+curDur;
    let step=0;
    while(step++<64 && projected()<target-0.01){
      let moved=false;
      if(curFin+30<=env.mx && !_wouldOvercover(row.date,row.service,row.role,jt,curFin,curFin+30,[sid])){
        const nd=(curFin+30-curDeb)/60, cand={deb:absToHHMM(curDeb),fin:absToHHMM(curFin+30),role:row.role};
        if(weekHoursOf(sid)-oldDur+nd<=cap+1e-6 && checkPlacement(sid,cand,row.date,row.service,di,{rg:rg(),excludeSelf:true})===null){ curFin+=30; curDur=nd; moved=true; }
      }
      if(!moved && curDeb-30>=env.mn && !_wouldOvercover(row.date,row.service,row.role,jt,curDeb-30,curDeb,[sid])){
        const nd=(curFin-(curDeb-30))/60, cand={deb:absToHHMM(curDeb-30),fin:absToHHMM(curFin),role:row.role};
        if(weekHoursOf(sid)-oldDur+nd<=cap+1e-6 && checkPlacement(sid,cand,row.date,row.service,di,{rg:rg(),excludeSelf:true})===null){ curDeb-=30; curDur=nd; moved=true; }
      }
      if(!moved) break;
    }
    // Écriture, comme en production (un seul write par créneau)
    row.heure_debut=absToHHMM(curDeb); row.heure_fin=absToHHMM(curFin);
    out.push({date:row.date,svc:row.service,role:row.role,deb:row.heure_debut,fin:row.heure_fin,
              debM:curDeb,finM:curFin,gain:curDur-oldDur});
  }
  return out;
}

// LE CAS RÉEL DU DIMANCHE : un salarié loin de son minimum, seul sur le service → la rallonge est
// libre de pousser. Sans plafond de jour (état réel de la base AVANT correction), c'est UNIQUEMENT
// la borne des postes qui doit l'arrêter.
RAW={};   // aucun plafond de fin nulle part : on isole l'effet des postes
{
  setState([{id:'c1',salarie_id:'s1',restaurant_id:GC,date:dDi,service:'soir',role:'cuisine',heure_debut:'19:00',heure_fin:'22:00'}]);
  const res=rallonge('s1',40,48,posteEnvelope);
  const c=res[0];
  t('dimanche : la rallonge s\'arrête à 00:30, la fin du poste le plus tardif',
    c.finM===1470, JSON.stringify(c));
  t('dimanche : RIEN à 02:00 — le cas signalé par le patron', c.fin!=='02:00' && c.finM<1560, c.fin);
  t('dimanche : le début ne remonte pas avant 17:00 (ouverture du poste le plus matinal)',
    c.debM>=1020, JSON.stringify(c));
}
// Symétrique sur le DÉBUT : un créneau tardif ne doit pas être avancé avant l'ouverture du poste.
{
  setState([{id:'c1',salarie_id:'s1',restaurant_id:GC,date:dDi,service:'soir',role:'caisse',heure_debut:'21:00',heure_fin:'23:00'}]);
  const res=rallonge('s1',40,48,posteEnvelope);
  const c=res[0];
  t('caisse dimanche : le début ne descend pas sous 17:00', c.debM>=1020, JSON.stringify(c));
  t('caisse dimanche : la fin ne dépasse pas 00:00 (borne du rôle CAISSE)', c.finM<=1440, JSON.stringify(c));
}
// Samedi : les postes vont à 02:00 → la rallonge a le droit d'y aller. Le correctif ne doit pas
// retirer des heures RÉELLEMENT demandées.
{
  setState([{id:'c1',salarie_id:'s1',restaurant_id:GC,date:dSa,service:'soir',role:'cuisine',heure_debut:'19:00',heure_fin:'22:00'}]);
  const res=rallonge('s1',40,48,posteEnvelope);
  t('samedi : la rallonge peut aller jusqu\'à 02:00, car les postes le demandent',
    res[0].finM===1560, JSON.stringify(res[0]));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 6. AVANT / APRÈS SUR LES MÊMES DONNÉES ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// RÉSULTAT À ÉNONCER TEL QUEL : le passage aux bornes PAR RÔLE ne change AUCUN horaire produit.
// La borne « tous rôles » était fausse, mais elle n'a jamais fuité, parce qu'un SECOND garde-fou
// l'arrêtait avant : _wouldOvercover refuse toute demi-heure où le besoin du RÔLE est nul, ce qui est
// le cas partout hors de ses propres postes. Deux mécanismes garantissaient donc la même chose, dont
// un seul était exact — exactement le motif « deux fonctions qui écrivent le même rendu » de CLAUDE.md.
// Le correctif rend la borne juste par elle-même ; il ne corrige aucun horaire existant.
{
  const mk=()=>[{id:'c1',salarie_id:'s1',restaurant_id:LOB,date:dDi,service:'soir',role:'caisse',heure_debut:'20:00',heure_fin:'22:00'}];
  setState(mk(),LOB);
  const bornesAvant=envAllRoles('Di','soir','caisse'), bornesApres=posteEnvelope('Di','soir','caisse');
  const avant=rallonge('s1',40,48,envAllRoles)[0];
  setState(mk(),LOB);
  const apres=rallonge('s1',40,48,posteEnvelope)[0];
  console.log('   Lobau · dimanche · CAISSE 20:00→22:00, salarié à 2h pour 40h de cible');
  console.log('     bornes AVANT (tous rôles) : '+_hhmm(bornesAvant.mn)+'–'+_hhmm(bornesAvant.mx)+'   → placement '+avant.deb+'→'+avant.fin);
  console.log('     bornes APRÈS (du rôle)    : '+_hhmm(bornesApres.mn)+'–'+_hhmm(bornesApres.mx)+'   → placement '+apres.deb+'→'+apres.fin);
  t('la borne DÉCLARÉE change bien : elle n\'emprunte plus les horaires de la cuisine',
    bornesAvant.mn===1020 && bornesAvant.mx===1470 && bornesApres.mn===1080 && bornesApres.mx===1440,
    JSON.stringify({avant:bornesAvant,apres:bornesApres}));
  t('le PLACEMENT produit est IDENTIQUE avant et après — aucun horaire n\'est modifié',
    avant.deb===apres.deb && avant.fin===apres.fin, `${avant.deb}→${avant.fin} vs ${apres.deb}→${apres.fin}`);
  t('et il tenait déjà dans les bornes du rôle : la fuite était théorique, jamais réalisée',
    avant.debM>=bornesApres.mn && avant.finM<=bornesApres.mx, `${avant.deb}→${avant.fin}`);
  global.SNACK=RESTOS[0];
}
// La raison, isolée : hors des postes de SON rôle, le besoin est nul, donc toute extension est refusée
// comme sur-couverture. C'est ce qui rendait l'ancienne borne inoffensive — et ce sur quoi il ne faut
// plus compter seul.
{
  setState([],LOB);
  t('hors des postes du rôle, le besoin est nul (17:30 pour la caisse à Lobau)',
    _needAt('Di','soir','caisse',1050)===0);
  t('donc l\'extension y est refusée pour sur-couverture, quelle que soit la borne',
    _wouldOvercover(dDi,'soir','caisse','Di',1050,1080,['s1'])===true);
  t('dans les postes du rôle, le besoin est réel et l\'extension redevient possible',
    _needAt('Di','soir','caisse',1080)===1 && _wouldOvercover(dDi,'soir','caisse','Di',1080,1110,['s1'])===false);
  global.SNACK=RESTOS[0];
}
// Là où les deux rôles partagent les mêmes bornes, rien ne change non plus.
{
  const mk=()=>[{id:'c1',salarie_id:'s1',restaurant_id:GC,date:dSa,service:'soir',role:'cuisine',heure_debut:'19:00',heure_fin:'22:00'}];
  setState(mk()); const avant=rallonge('s1',40,48,envAllRoles)[0];
  setState(mk()); const apres=rallonge('s1',40,48,posteEnvelope)[0];
  t('aucun écart quand les bornes du rôle coïncident avec l\'enveloppe globale',
    avant.deb===apres.deb && avant.fin===apres.fin, `${avant.deb}→${avant.fin} vs ${apres.deb}→${apres.fin}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 7. REVALIDATION — les créneaux DÉJÀ POSÉS hors de leurs postes ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
setState([]);
const hp=(rid,date,svc,role,deb,fin)=>horsPosteOf({salarie_id:'s1',restaurant_id:rid,date,service:svc,role,heure_debut:deb,heure_fin:fin});
t('créneau dans les bornes : conforme', hp(GC,dDi,'soir','cuisine','18:00','00:30')===null);
t('fin au-delà du poste : signalée du côté « fin »',
  (hp(GC,dDi,'soir','cuisine','18:00','02:00')||{}).cote==='fin', JSON.stringify(hp(GC,dDi,'soir','cuisine','18:00','02:00')));
t('début avant le poste : signalé du côté « début »',
  (hp(GC,dDi,'soir','cuisine','16:00','23:00')||{}).cote==='debut', JSON.stringify(hp(GC,dDi,'soir','cuisine','16:00','23:00')));
t('l\'écart est chiffré (16:00 pour un poste ouvrant à 17:00 → 60 min)',
  hp(GC,dDi,'soir','cuisine','16:00','23:00').ecart===60);
t('caisse : 00:30 dépasse SON poste (00:00) même si la cuisine va jusqu\'à 00:30',
  (hp(GC,dDi,'soir','caisse','18:00','00:30')||{}).cote==='fin', JSON.stringify(hp(GC,dDi,'soir','caisse','18:00','00:30')));
t('aucun poste défini pour ce rôle ce jour-là → aucun constat (rien à quoi comparer)',
  hp(GC,dDi,'midi','cuisine','11:00','15:00')===null);
// Cas réels relevés en base (les 4 dépassements de la production, tous sur le DÉBUT).
t('cas réel Grand Cœur · dimanche 14/06 · cuisine 16:00→00:00 : début 60 min trop tôt',
  hp(GC,dDi,'soir','cuisine','16:00','00:00').ecart===60);
// La phrase doit nommer les postes, pas seulement dire « hors poste ».
{ const v={cle:'hors_poste',label:PLACE_RULES.hors_poste,_poste:hp(GC,dDi,'soir','cuisine','18:00','02:00')};
  const e=explainViolation(v,{shift:{deb:'18:00',fin:'02:00',role:'cuisine'},date:dDi,svc:'soir'});
  t('la phrase cite l\'heure du créneau et la fin du poste le plus tardif',
    /02:00/.test(e.why) && /00:30/.test(e.why), e.why);
  t('elle renvoie vers l\'éditeur de postes', /postes/i.test(e.source||e.reglage||''), JSON.stringify({s:e.source,r:e.reglage}));
}
// revalidateWeek doit remonter le hors-poste EN PLUS des règles de checkPlacement.
{
  RAW={};
  setState([{id:'c1',salarie_id:'s1',restaurant_id:GC,date:dDi,service:'soir',role:'cuisine',heure_debut:'18:00',heure_fin:'02:00'}]);
  global.S.derogations=[];
  const rv=revalidateWeek();
  t('revalidateWeek remonte le créneau hors poste',
    rv.infractions.some(i=>i.cle==='hors_poste'), JSON.stringify(rv.infractions.map(i=>i.cle)));
  const inf=rv.infractions.find(i=>i.cle==='hors_poste');
  t('l\'infraction nomme le restaurant et l\'horaire', inf && inf.horaire==='18:00→02:00' && /Grand/.test(inf.restaurant),
    JSON.stringify(inf&&{r:inf.restaurant,h:inf.horaire}));
  // Une dérogation posée sur ce créneau le fait basculer en « assumé ».
  global.S.derogations=[{salarie_id:'s1',date:dDi,service:'soir',restaurant_id:GC,motif:'renfort exceptionnel'}];
  const rv2=revalidateWeek();
  t('une dérogation assumée sort le hors-poste des infractions',
    !rv2.infractions.some(i=>i.cle==='hors_poste') && rv2.derogees.some(i=>i.cle==='hors_poste'),
    JSON.stringify({inf:rv2.infractions.map(i=>i.cle),der:rv2.derogees.map(i=>i.cle)}));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 8. VERROUS SUR LE CODE SOURCE ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Le code est relu SANS ses commentaires : plusieurs d'entre eux citent volontairement les motifs
// interdits pour expliquer la correction, et feraient échouer une recherche naïve.
const code=h.replace(/\/\*[\s\S]*?\*\//g,'').split('\n').map(l=>l.replace(/(^|[^:'"\\])\/\/.*$/,'$1')).join('\n');
t('l\'ancienne enveloppe « tous rôles » (svcEnvelope) n\'existe plus dans le code',
  !/svcEnvelope/.test(code));
t('la rallonge est bornée par posteEnvelope avec le RÔLE du créneau',
  /posteEnvelope\(\s*jt\s*,\s*row\.service\s*,\s*row\.role\s*\)/.test(code));
t('_endCapMin ne traite plus \'00:00\' comme une sentinelle « pas de plafond »',
  !/val\s*===\s*'00:00'\s*\)\s*return null/.test(code));
// La CRÉATION (phases 1&2 et sureffectif) pose les postes VERBATIM : un créneau créé ne peut pas
// déborder puisqu'il EST le poste. Ce verrou empêche qu'une évolution y substitue un horaire calculé.
t('le sureffectif crée un créneau aux bornes EXACTES du poste (deb/fin de la vague)',
  /for\(const v of getShifts\(jt,svc,role\)\)[\s\S]{0,400}\{deb:v\.deb,\s*fin:v\.fin,\s*role\}/.test(code));
t('les 5 règles de plafond par jour-type sont déclarées dans RULE_META',
  ['fin_lu_me','fin_je','fin_ve','fin_sa','fin_di'].every(k=>!!RULE_META[k]));
t('chacune porte le jour-type qu\'elle couvre (finJour), sans table parallèle à maintenir',
  Object.values(FIN_CLE_OF_JT).every(cle=>RULE_META[cle] && RULE_META[cle].finJour),
  JSON.stringify(Object.values(FIN_CLE_OF_JT).map(c=>[c,RULE_META[c]&&RULE_META[c].finJour])));
t('les jour-types de FIN_CLE_OF_JT couvrent exactement JOUR_TYPES',
  JSON.stringify(Object.keys(FIN_CLE_OF_JT).sort())===JSON.stringify(JOUR_TYPES.slice().sort()));
t('le panneau de vérification ne sort plus en silence quand un jour n\'a pas de plafond',
  /capCoverageGaps\(_rc\)/.test(code));
// UNE SEULE logique d'infractions : la modale « Analyser la semaine », le bandeau de non-conformité,
// l'avertissement de publication et celui de l'export PDF doivent tous lire revalidateWeek(). Sans ce
// verrou, un créneau hors poste pourrait apparaître dans le bandeau pendant que la modale — celle que
// le patron ouvre — annonce « tout va bien ».
t('analyseWeek compte les infractions depuis revalidateWeek (source unique)',
  /const reval=revalidateWeek\(\);/.test(code) && /infractions:reval\.infractions\.length/.test(code));
t('le bandeau, la publication et l\'export PDF lisent la même source',
  (code.match(/revalidateWeek\(\)/g)||[]).length>=4,
  String((code.match(/revalidateWeek\(\)/g)||[]).length)+' appels');
// Le moteur ne doit plus dépendre des horaires d'ouverture du restaurant (les 4 champs sont vides).
t('le moteur ne lit plus SNACK.fermeture_semaine / fermeture_weekend',
  !/SNACK\.fermeture_(semaine|weekend)/.test(code));
t('la suggestion de plafond est tirée des POSTES', /function suggestionFin[\s\S]{0,400}posteEnvelope/.test(code));
// Les anciennes clés ne doivent plus être éditables (deux champs pour un même plafond = l'un des deux
// serait modifié sans effet).
t('fin_semaine / fin_weekend sont marquées obsolètes et retirées de l\'écran Réglages',
  RULE_META.fin_semaine.deprecated===true && RULE_META.fin_weekend.deprecated===true
  && /deprecated/.test(code));

console.log('\n'+(ok?'✅':'❌')+' postes_bornes_test — '+n+' vérifications');
process.exit(ok?0:1);

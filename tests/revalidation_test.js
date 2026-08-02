// v0.61 — REVALIDATION : rejouer les règles sur le planning DÉJÀ POSÉ.
//
// Cas réel qui a motivé ce harnais : Youcef ARBOUZE, semaine du 3 au 9 août 2026, SEPT jours sur sept
// répartis sur trois restaurants. La règle jour_off_min était active (valeur 1) et RIEN ne l'a signalé —
// ni à la saisie (les créneaux datent d'avant que la règle ne devienne inter-snack), ni dans le rapport
// d'analyse (qui ne regardait que la couverture, les minimums, les dérogations et le coût).
// C'est le salarié lui-même qui a prévenu le patron.
//
// Les données ci-dessous sont la COPIE EXACTE de ce qui a été lu en base.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);
const {extractFn}=require("./extract.js");
const grab=n=>extractFn(h,n);

eval("global._pmin="+(h.match(/const _pmin\s*=[^\n]*/)[0].replace(/^const _pmin\s*=/,'').replace(/;$/,''))+";");
eval("global._pdur="+(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const _pdur\s*=/,'').replace(/;$/,''))+";");
eval("global._truthyContr="+(h.match(/const _truthyContr\s*=[^\n]*/)[0].replace(/^const _truthyContr\s*=/,'').replace(/;$/,''))+";");
{ const i=h.indexOf("const _JOURS_IDX"); if(i>=0) eval("global._JOURS_IDX="+h.slice(h.indexOf("{",i),h.indexOf("\n",i))+";"); }
for(const fn of ['_toMin','overlaps','_overlap','_dayIndexOf','contrOf','isMultiSnack','weekMinutesOf','weekHoursOf',
                 'plafondOf','_indispoBlocking','_contrainteBlocking','checkPlacement','_endCapMin',
                 'revalidateWeek','conformiteBanner','pdfConformiteWarn']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j;
  for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}
  eval("global.PLACE_RULES="+h.slice(st,j)+";"); }

global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.MONDAY=new Date('2026-08-03T00:00:00'); global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.escP=s=>(''+(s==null?'':s));
global.onRoster=()=>true; global.worksAt=()=>true; global.rolesOf=()=>['cuisine']; global.isExp=()=>true;
global.altDayType=()=>null; global.hasIndispo=()=>null;
global.plafondOf=(sal)=>Number(sal.heures_max)||48;
global.salById=id=>SAL[id];
global.fullName=s=>[s.prenom,s.nom].filter(Boolean).join(' ')||s.nom;

const CAR='car', GC='gc', LOB='lob';
const RESTOS=[{id:CAR,nom:'Raya Carnot'},{id:GC,nom:'Raya Grand Coeur'},{id:LOB,nom:'Raya Lobau'}];
let RULES={coupure_min:3,repos_quotidien_h:11,amplitude_max:12,jour_off_min:1,plafond_hebdo:48};
let RULES_ON={}, RAW={};
global._ruleCtx=()=>({ num:(k,d)=>(RULES[k]!=null?RULES[k]:d), raw:(k)=>(RAW[k]||null), on:(k,d)=>(RULES_ON[k]!=null?RULES_ON[k]:d) });

const D=i=>fmtDate(dateOfDay(i));
let _n=1;
const cre=(rid,di,svc,deb,fin,sid)=>({id:'c'+(_n++),salarie_id:sid||'youcef',restaurant_id:rid,date:D(di),service:svc,role:'cuisine',heure_debut:deb,heure_fin:fin});
function setState(rows, sals, derogations){
  global.SAL={}; (sals||[{id:'youcef',prenom:'Youcef',nom:'ARBOUZE',heures_max:48,est_multi:true,
                          snacks_priorites:[{restaurant_id:CAR},{restaurant_id:GC},{restaurant_id:LOB}]}])
                .forEach(s=>SAL[s.id]=s);
  global.SNACK=RESTOS[0];   // restaurant AFFICHÉ — la revalidation doit couvrir les autres quand même
  global.S={restos:RESTOS, salaries:Object.values(SAL), orgRoles:[{cle:'cuisine',nom:'cuisine'}],
            dispos:[], miseAPied:[], contraintes:[], regles:[], derogations:derogations||[],
            creneaux:rows.filter(c=>c.restaurant_id===CAR), allCreneauxWeek:rows.slice()};
}
let ok=true;
const t=(l,c,extra)=>{console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra==null?'':extra)));ok=c&&ok;};

// ── LE PLANNING RÉEL DE YOUCEF (copie de la base) ────────────────────────────────────────────────
const YOUCEF=()=>[
  cre(CAR,0,'soir','18:00','00:00'),                                  // lundi 3
  cre(CAR,1,'soir','18:00','00:00'),                                  // mardi 4
  cre(GC ,2,'soir','18:30','23:30'),                                  // mercredi 5
  cre(GC ,3,'midi','11:30','14:30'), cre(GC,3,'soir','18:30','02:00'),// jeudi 6
  cre(LOB,4,'soir','19:00','22:30'),                                  // vendredi 7
  cre(CAR,5,'midi','10:30','15:00'), cre(GC,5,'soir','18:30','23:00'),// samedi 8
  cre(CAR,6,'soir','18:00','00:00'),                                  // dimanche 9
];

console.log('── 1. LE CAS RÉEL : Youcef, 7 jours sur 7, 3 restaurants ─────────────────────────────');
{ setState(YOUCEF());
  const r=revalidateWeek();
  t('l\'infraction est DÉTECTÉE (elle ne l\'était pas du tout avant)', r.infractions.length>0, r.infractions.length);
  t('… c\'est bien le repos hebdomadaire', r.infractions[0] && r.infractions[0].cle==='jour_off_min', r.infractions[0]&&r.infractions[0].cle);
  const w=(r.infractions[0]||{}).why||'';
  t('… la phrase nomme le salarié', /Youcef ARBOUZE/.test(w), w);
  t('… donne le nombre de jours travaillés (7)', /travaille 7 jours/.test(w), w);
  t('… borne la semaine (lundi 3 → dimanche 9)', /lundi 3/.test(w)&&/dimanche 9/.test(w), w);
  t('… cite les TROIS restaurants', /Carnot/.test(w)&&/Grand Coeur/.test(w)&&/Lobau/.test(w), w);
  t('… et rappelle le maximum (6)', /maximum est de 6/.test(w), w);
  // ⚠ L'assertion la plus importante du harnais : la règle se déclenche depuis CHACUN des 9 créneaux.
  // Sans dédoublonnage, le patron lirait neuf fois la même infraction et n'y croirait plus.
  t('DÉDOUBLONNAGE : une seule ligne, pas neuf', r.infractions.filter(x=>x.cle==='jour_off_min').length===1,
    r.infractions.filter(x=>x.cle==='jour_off_min').length);
  t('… et aucune n\'est classée « assumée » (aucune dérogation posée)', r.derogees.length===0, r.derogees.length);
  // Le bandeau d'ouverture, celui qui aurait évité que le salarié ait à le signaler lui-même.
  const b=conformiteBanner(r);
  t('un bandeau est produit à l\'ouverture', !!b && b.n===r.infractions.length, JSON.stringify(b));
  t('… il nomme le salarié concerné', b && /Youcef ARBOUZE/.test(b.texte), b&&b.texte);
}

console.log('\n── 2. UNE INFRACTION CAUSÉE PAR UN CRÉNEAU DANS UN AUTRE RESTAURANT ──────────────────');
{ // Deux jours travaillés seulement (donc pas de repos hebdo en cause) : Grand Cœur 10:00→18:00 puis
  // Lobau 18:00→23:00 le même jour. Enchaînement sans coupure — invisible tant qu'on ne regarde qu'un site.
  const rows=[cre(GC,0,'midi','10:00','18:00'), cre(LOB,0,'soir','18:00','23:00')];
  setState(rows);
  const r=revalidateWeek();
  t('l\'infraction inter-restaurant est détectée', r.infractions.length===1, JSON.stringify(r.infractions.map(x=>x.cle)));
  t('… c\'est la coupure minimale', r.infractions[0].cle==='coupure_min', r.infractions[0].cle);
  t('… détectée alors que le restaurant AFFICHÉ est Carnot (aucun des deux)', SNACK.id===CAR);
  t('… la ligne nomme le restaurant du créneau fautif', /Grand Coeur|Lobau/.test(r.infractions[0].restaurant), r.infractions[0].restaurant);
  t('DÉDOUBLONNAGE : la règle se déclenche des deux côtés → une seule ligne', r.infractions.length===1);
  // Le contexte d'affichage doit être rendu intact : sinon la prochaine saisie écrirait au mauvais endroit.
  t('le restaurant affiché est restauré après la revalidation', SNACK.id===CAR, SNACK.id);
  t('… et S.creneaux aussi (créneaux de Carnot : aucun ici)', S.creneaux.length===0, S.creneaux.length);
}

console.log('\n── 3. UNE DÉROGATION ASSUMÉE EST CLASSÉE À PART ──────────────────────────────────────');
{ const rows=[cre(GC,0,'midi','10:00','18:00'), cre(LOB,0,'soir','18:00','23:00')];
  // Dérogation posée sur le créneau de Lobau, en connaissance de cause, avec motif.
  setState(rows, null, [{id:'d1',salarie_id:'youcef',date:D(0),service:'soir',restaurant_id:LOB,
                         regle_cle:'coupure_min',regle_label:'coupure midi↔soir insuffisante',motif:'remplacement urgent'}]);
  const r=revalidateWeek();
  t('elle ne compte PAS comme infraction non vue', r.infractions.length===0, JSON.stringify(r.infractions.map(x=>x.cle)));
  t('… elle est listée dans les écarts assumés', r.derogees.length===1, r.derogees.length);
  t('… avec le motif saisi', r.derogees[0].derog && /remplacement urgent/.test(r.derogees[0].derog.motif), JSON.stringify(r.derogees[0].derog));
  t('… le bandeau d\'ouverture ne se déclenche pas pour un écart assumé', conformiteBanner(r)===null);
  // Appariement sur le CRÉNEAU, pas sur la règle : depuis v0.57 la règle qui se déclenche peut avoir
  // changé. Une dérogation posée pour une autre règle couvre quand même ce créneau.
  setState(rows, null, [{id:'d2',salarie_id:'youcef',date:D(0),service:'soir',restaurant_id:LOB,
                         regle_cle:'repos_quot',regle_label:'repos quotidien < minimum légal',motif:'accord salarié'}]);
  const r2=revalidateWeek();
  t('une dérogation posée pour une AUTRE règle couvre quand même le créneau', r2.infractions.length===0 && r2.derogees.length===1,
    `infractions=${r2.infractions.length} assumés=${r2.derogees.length}`);
  t('… et la règle réellement enfreinte reste affichée', r2.derogees[0].label && /coupure/i.test(r2.derogees[0].label), r2.derogees[0].label);
}

console.log('\n── 4. UN PLANNING CONFORME NE PRODUIT AUCUNE ALERTE ──────────────────────────────────');
{ // 4 jours espacés, un seul restaurant, rien qui accroche.
  setState([cre(CAR,0,'soir','18:00','23:00'), cre(CAR,1,'soir','18:00','23:00'),
            cre(CAR,3,'soir','18:00','23:00'), cre(CAR,4,'soir','18:00','23:00')]);
  const r=revalidateWeek();
  t('aucune infraction', r.infractions.length===0, JSON.stringify(r.infractions.map(x=>x.name+':'+x.cle)));
  t('aucun écart assumé', r.derogees.length===0);
  t('aucun bandeau à l\'ouverture', conformiteBanner(r)===null);
  t('aucun avertissement avant export PDF', pdfConformiteWarn(r,[CAR])===null);
}

console.log('\n── 5. L\'ALERTE SUIT LE RÉGLAGE ──────────────────────────────────────────────────────');
{ setState(YOUCEF());
  t('jour_off_min=1 → infraction', revalidateWeek().infractions.length===1);
  RULES.jour_off_min=0;   // aucun jour de repos exigé → 7 jours deviennent tolérés
  t('jour_off_min=0 → plus d\'infraction (l\'alerte suit la VALEUR du réglage)',
    revalidateWeek().infractions.length===0, JSON.stringify(revalidateWeek().infractions.map(x=>x.cle)));
  RULES.jour_off_min=2;   // deux jours de repos exigés → toujours en infraction
  t('jour_off_min=2 → infraction (le maximum annoncé suit le réglage)', (()=>{const r=revalidateWeek();
    return r.infractions.length===1 && /maximum est de 5/.test(r.infractions[0].why);})(),
    (revalidateWeek().infractions[0]||{}).why);
  RULES.jour_off_min=1;
  // Une règle DÉSACTIVABLE (case à cocher) : décochée, plus rien ne doit remonter.
  // Reprise à 12:30 après une fin à 01:00 = 11h30 de repos, donc AU-DESSUS du minimum légal : sans cette
  // précaution c'est repos_quot qui sortirait en premier et le cas ne testerait pas la bonne règle.
  setState([cre(CAR,0,'soir','18:00','01:00'), cre(GC,1,'midi','12:30','15:00')]);
  t('fin_2h_pas_matin active → infraction', revalidateWeek().infractions.some(x=>x.cle==='fin_2h_pas_matin'),
    JSON.stringify(revalidateWeek().infractions.map(x=>x.cle)));
  RULES_ON.fin_2h_pas_matin=false;
  t('règle décochée → l\'infraction disparaît', !revalidateWeek().infractions.some(x=>x.cle==='fin_2h_pas_matin'),
    JSON.stringify(revalidateWeek().infractions.map(x=>x.cle)));
  RULES_ON={};
}

console.log('\n── 6. AVERTISSEMENT AVANT EXPORT PDF (le planning part à l\'équipe) ───────────────────');
{ setState(YOUCEF());
  const r=revalidateWeek();
  const w=pdfConformiteWarn(r,[CAR,GC,LOB]);
  t('un avertissement est produit', !!w, w);
  t('… il chiffre les créneaux non conformes', /1 créneau\(x\) NON CONFORME/.test(w||''), w);
  t('… il nomme le salarié et la règle', /Youcef ARBOUZE/.test(w||'')&&/repos hebdo/i.test(w||''), w);
  t('… il rappelle l\'enjeu pour l\'employeur', /responsabilité/.test(w||''), w);
  // L'infraction est portée par un créneau de Carnot : exporter Lobau seul ne doit pas alerter…
  const infra=r.infractions[0];
  const autre=RESTOS.map(x=>x.id).find(x=>x!==infra.restaurantId);
  t('exporter un restaurant NON concerné n\'alerte pas', pdfConformiteWarn(r,[autre])===null, autre+' vs '+infra.restaurantId);
  t('… mais exporter le restaurant concerné alerte', !!pdfConformiteWarn(r,[infra.restaurantId]));
}

console.log('\n── 7. LE CONTEXTE D\'AFFICHAGE EST TOUJOURS RESTAURÉ ──────────────────────────────────');
{ // _withSnack bascule SNACK/S.creneaux le temps d'un appel. Si une exception laissait la grille
  // pointée sur le mauvais restaurant, la saisie suivante écrirait au mauvais endroit — corruption
  // silencieuse. Le try/finally doit tenir même quand la fonction appelée jette.
  eval("global._withSnack="+grab('_withSnack')+";");
  setState(YOUCEF());
  const avant=SNACK.id, avantCre=S.creneaux;
  try{ _withSnack(GC, ()=>{ throw new Error('boum'); }); }catch(e){}
  t('SNACK est restauré même si l\'appel jette', SNACK.id===avant, SNACK.id);
  t('S.creneaux est restauré par IDENTITÉ (même tableau)', S.creneaux===avantCre);
  const vu=_withSnack(GC, ()=>SNACK.id);
  t('… et pendant l\'appel, le contexte est bien celui demandé', vu===GC, vu);
  t('… puis rendu ensuite', SNACK.id===avant);
}

console.log(ok?'\nALL PASS':'\nSOME FAILED');
process.exit(ok?0:1);

// v0.75 — JOURS D'ÉCOLE / EXAMEN CFA = TEMPS DE TRAVAIL.
//
// Bug signalé par le patron (capture du 22/11/2026) : un alternant avec 3 jours d'école affichait 19,5 h
// « sur 28–40 h » ; l'auto-fill le voyait loin de son minimum et posait des services sur ses 4 autres
// jours — zéro jour de repos, et un total réel (19,5 + 3 × 7 = 40,5 h) au-delà de son contrat.
// Art. L6222-24 C. trav. : le temps passé au CFA est compris dans l'horaire de travail.
//
// Ce harnais vérifie, sur les fonctions RÉELLES extraites de planning/index.html :
//   1. ecoleMinutesOf : jours école + examen × réglage (défaut 7 h), lundi→dimanche SEULEMENT
//      (S.altJours contient aussi le lundi suivant pour la règle « veille »), réglage décoché → 0 ;
//   2. weekMinutesOf les inclut → plafond dur de checkPlacement ;
//   3. jour_off_min : un jour d'école compte comme jour travaillé, même réglage décoché ;
//   4. rowHoursCell : chiffre principal = créneaux + école, ligne « 🎓 dont », pas de fausse ligne Σ ;
//   5. réglage à 0 → ancien comportement (0 n'est PAS relu comme « invalide → 7 h ») ;
//   6. CFA + fermeture le même jour : refusé, et PAR QUELLE règle ;
//   7. jeunes travailleurs : nuit, 8 h / jour école comprise, 35 h / semaine école comprise, âge à la date.
// Chaque cas a son contrôle négatif. Auto-fill réel et panneau Vérifications : ecole_autofill_test.js.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);
const {extractFn}=require("./extract.js");
const grab=n=>extractFn(h,n);
eval("global._pmin="+(h.match(/const _pmin\s*=[^\n]*/)[0].replace(/^const _pmin\s*=/,'').replace(/;$/,''))+";");
eval("global._pdur="+(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const _pdur\s*=/,'').replace(/;$/,''))+";");
eval("global.fmtH1="+(h.match(/const fmtH1\s*=[^\n]*/)[0].replace(/^const fmtH1\s*=/,'').replace(/;$/,''))+";");
eval("global._truthyContr="+(h.match(/const _truthyContr\s*=[^\n]*/)[0].replace(/^const _truthyContr\s*=/,'').replace(/;$/,''))+";");
{ const i=h.indexOf("const _JOURS_IDX"); if(i>=0) eval("global._JOURS_IDX="+h.slice(h.indexOf("{",i),h.indexOf("\n",i))+";"); }
for(const fn of ['_toMin','overlaps','_overlap','_dayIndexOf','isMultiSnack','weekMinutesOf','weekHoursOf','otherSnackBreakdown',
                 '_indispoBlocking','_contrainteBlocking','checkPlacement','rowHoursCell','explainViolation','_creTxt']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j;
  for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}
  eval("global.PLACE_RULES="+h.slice(st,j)+";"); }

global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.MONDAY=new Date('2026-11-16T00:00:00');
global.dateOfDay=i=>{const d=new Date(MONDAY);d.setDate(d.getDate()+i);return d;};
global.onRoster=()=>true; global.worksAt=()=>true; global.rolesOf=()=>['cuisine']; global.isExp=()=>true;
global.altDayType=(sid,date)=>(S.altJours||{})[`${sid}|${date}`]||null;   // même lecture que la page
global._endCapMin=()=>null;
global.salById=id=>SAL[id]; global.escP=s=>(''+(s==null?'':s));
global.plafondOf=(sal)=>Number(sal.heures_max)||48;
const LOBAU='lobau';
global.SNACK={id:LOBAU,nom:'Raya Lobau'};
global.SAL={alt:{id:'alt',heures_min:28,heures_max:40}};
// _ruleCtx RÉEL (lit S.regles via _regleOf / RULE_META) : prouve que le défaut affiché = défaut appliqué.
eval("global._ruleCtx="+grab("_ruleCtx")+";");

const D=i=>fmtDate(dateOfDay(i));
const cre=(i,svc,deb,fin)=>({salarie_id:'alt',restaurant_id:LOBAU,date:D(i),service:svc,heure_debut:deb,heure_fin:fin});
// Semaine de la capture : école lun-mar-mer, services jeu 11:00-18:00 (7h), sam 18:00-00:30 (6,5h), dim 18:00-00:00 (6h) = 19,5h.
const ALT={ ['alt|'+D(0)]:'ecole', ['alt|'+D(1)]:'ecole', ['alt|'+D(2)]:'ecole', ['alt|'+D(7)]:'ecole' /* lundi SUIVANT */ };
const CRE=[cre(3,'midi','11:00','18:00'), cre(5,'soir','18:00','00:30'), cre(6,'soir','18:00','00:00')];
function setS(over){ global.S=Object.assign({creneaux:CRE.slice(), allCreneauxWeek:CRE.slice(), altJours:Object.assign({},ALT),
  regles:[], dispos:[], miseAPied:[], contraintes:[], restos:[{id:LOBAU,nom:'Raya Lobau'}]}, over||{}); }

let ok=true; const t=(l,c,x)=>{console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+x));ok=c&&ok;};

console.log('── 1. ecoleMinutesOf ───────────────────────────────────────────────────────────────');
setS();
t('RULE_META déclare heures_jour_ecole (visible dans Réglages) avec défaut 7', RULE_META.heures_jour_ecole && RULE_META.heures_jour_ecole.defVal==='7');
t('3 jours d\'école × 7 h = 21 h (le lundi SUIVANT n\'est pas compté)', ecoleMinutesOf('alt')===21*60, ecoleMinutesOf('alt')/60);
S.altJours['alt|'+D(3)]='examen';
t('un examen compte aussi (4 j → 28 h)', ecoleMinutesOf('alt')===28*60, ecoleMinutesOf('alt')/60);
S.altJours['alt|'+D(4)]='entreprise'; S.altJours['alt|'+D(5)]='vacances';
t('« entreprise » / « vacances » ne comptent PAS', ecoleMinutesOf('alt')===28*60, ecoleMinutesOf('alt')/60);
setS({regles:[{cle:'heures_jour_ecole',restaurant_id:null,active:true,valeur:'8'}]});
t('réglage à 8 h → 24 h', ecoleMinutesOf('alt')===24*60, ecoleMinutesOf('alt')/60);
setS({regles:[{cle:'heures_jour_ecole',restaurant_id:null,active:false,valeur:'7'}]});
t('réglage décoché → 0 h (ancien comportement)', ecoleMinutesOf('alt')===0, ecoleMinutesOf('alt'));
setS({altJours:{}});
t('salarié sans calendrier d\'alternance → 0', ecoleMinutesOf('alt')===0);

console.log('── 2. total hebdo (weekMinutesOf) ──────────────────────────────────────────────────');
setS();
t('total = 19,5 h de créneaux + 21 h d\'école = 40,5 h', Math.abs(weekHoursOf('alt')-40.5)<1e-9, weekHoursOf('alt'));

console.log('── 3. checkPlacement : plafond et repos hebdo ──────────────────────────────────────');
// Vendredi libre. Plafond 40 h : 40,5 h déjà → tout créneau refusé pour plafond… sauf que le repos hebdo
// bloque avant (6 jours occupés). On isole chaque règle.
setS({regles:[{cle:'jour_off_min',restaurant_id:null,active:true,valeur:'1'}]});
let r=checkPlacement('alt',{deb:'11:00',fin:'15:00',role:'cuisine'},D(4),'midi',4,{manual:true});
t('vendredi refusé : école (3 j) + 3 j de service = 6 j → le 7ᵉ supprimerait le repos', r&&r.cle==='jour_off_min', r&&r.cle);
t('… et le motif cite les jours d\'école', r&&r._off&&r._off.ecole===3, JSON.stringify(r&&r._off));
setS({regles:[{cle:'heures_jour_ecole',restaurant_id:null,active:false,valeur:'7'},{cle:'jour_off_min',restaurant_id:null,active:true,valeur:'1'}]});
r=checkPlacement('alt',{deb:'11:00',fin:'15:00',role:'cuisine'},D(4),'midi',4,{manual:true});
t('réglage heures décoché : le jour d\'école reste un jour TRAVAILLÉ (repos hebdo toujours tenu)', r&&r.cle==='jour_off_min', r&&r.cle);
// Contrôle négatif : sans école, le vendredi passe.
setS({altJours:{}, regles:[{cle:'jour_off_min',restaurant_id:null,active:true,valeur:'1'}]});
r=checkPlacement('alt',{deb:'11:00',fin:'15:00',role:'cuisine'},D(4),'midi',4,{manual:true});
t('contrôle négatif : sans école, vendredi accepté', r===null, r&&r.cle);
// Plafond : 2 jours d'école seulement (repos OK), plafond 30 h.
SAL.alt.heures_max=30;
setS({altJours:{['alt|'+D(0)]:'ecole',['alt|'+D(1)]:'ecole'}});   // 19,5 + 14 = 33,5 h > 30
r=checkPlacement('alt',{deb:'11:00',fin:'14:00',role:'cuisine'},D(2),'midi',2,{manual:true});
t('plafond : 19,5 h + 14 h d\'école ≥ 30 h → refus plafond', r&&r.cle==='plafond', r&&r.cle);
setS({altJours:{}});
r=checkPlacement('alt',{deb:'11:00',fin:'14:00',role:'cuisine'},D(2),'midi',2,{manual:true});
t('contrôle négatif : sans école, 19,5 + 3 h ≤ 30 h → accepté', r===null, r&&r.cle);
SAL.alt.heures_max=40;

console.log('── 4. colonne Heures (rowHoursCell) ────────────────────────────────────────────────');
setS();
let rh=rowHoursCell(SAL.alt);
t('chiffre principal 40,5 h (créneaux + école)', /^40\.5h/.test(rh.html), rh.html);
t('ligne « 🎓 dont 21h école »', rh.html.includes('🎓 dont 21h école'), rh.html);
t('pas de fausse ligne Σ (aucune heure dans un autre restaurant)', !rh.html.includes('Σ'), rh.html);
t('couleur rouge : 40,5 h > plafond 40 h', rh.color==='var(--bad)', rh.color);
t('info-bulle explique les heures d\'école', /Dont 21 h d'école/.test(rh.tip), rh.tip);
setS({altJours:{}});
rh=rowHoursCell(SAL.alt);
t('contrôle négatif : sans école, 19,5 h orange (sous 28 h), pas de ligne 🎓', /^19\.5h/.test(rh.html) && !rh.html.includes('🎓') && rh.color==='var(--warn)', rh.html+' '+rh.color);


console.log('── 5. réglage à 0 = ancien comportement ───────────────────────────────────────────');
setS({regles:[{cle:'heures_jour_ecole',restaurant_id:null,active:true,valeur:'0'}]});
t('valeur 0 → 0 h d\'école (et non 7 h : _ruleCtx().num relirait 0 comme invalide)', ecoleMinutesOf('alt')===0, ecoleMinutesOf('alt')/60);
t('… total = 19,5 h, comme avant v0.75', Math.abs(weekHoursOf('alt')-19.5)<1e-9, weekHoursOf('alt'));
rh=rowHoursCell(SAL.alt);
t('… colonne Heures : 19,5 h, pas de ligne 🎓', /^19\.5h/.test(rh.html) && !rh.html.includes('🎓'), rh.html);
setS({regles:[{cle:'heures_jour_ecole',restaurant_id:null,active:true,valeur:'6,5'}]});
t('valeur « 6,5 » (virgule) → 3 × 6,5 = 19,5 h', ecoleMinutesOf('alt')===19.5*60, ecoleMinutesOf('alt')/60);
setS({regles:[{cle:'heures_jour_ecole',restaurant_id:null,active:true,valeur:'abc'}]});
t('valeur illisible → défaut 7 h (21 h)', ecoleMinutesOf('alt')===21*60, ecoleMinutesOf('alt')/60);
setS({regles:[{cle:'heures_jour_ecole',restaurant_id:null,active:true,valeur:'0'},{cle:'jour_off_min',restaurant_id:null,active:true,valeur:'1'}]});
r=checkPlacement('alt',{deb:'11:00',fin:'15:00',role:'cuisine'},D(4),'midi',4,{manual:true});
t('valeur 0 : le jour d\'école reste un jour TRAVAILLÉ (vendredi refusé pour repos hebdo)', r&&r.cle==='jour_off_min', r&&r.cle);

console.log('── 6. CFA + fermeture le MÊME jour ─────────────────────────────────────────────────');
setS();
r=checkPlacement('alt',{deb:'19:00',fin:'02:00',role:'cuisine'},D(0),'soir',0,{manual:true});
t('lundi (école) + 19:00 → 02:00 : refusé par la règle « cfa » (aucun service un jour d\'école)', r&&r.cle==='cfa', r&&r.cle);
r=checkPlacement('alt',{deb:'19:00',fin:'02:00',role:'cuisine'},D(0),'soir',0,{manual:true,excludeSelf:true});
t('… idem en revalidation (excludeSelf)', r&&r.cle==='cfa', r&&r.cle);
// Veille d'école : fin après 22:00 refusée (règle existante, défaut 22:00) — y compris une fin après minuit.
setS({altJours:{['alt|'+D(4)]:'ecole'}, creneaux:[], allCreneauxWeek:[]});
r=checkPlacement('alt',{deb:'19:00',fin:'02:00',role:'cuisine'},D(3),'soir',3,{manual:true});
t('jeudi 19:00 → 02:00 la veille d\'un vendredi d\'école : refusé (fin_veille_ecole)', r&&r.cle==='fin_veille_ecole', r&&r.cle);
r=checkPlacement('alt',{deb:'15:00',fin:'22:00',role:'cuisine'},D(3),'soir',3,{manual:true});
t('… jeudi 15:00 → 22:00 accepté (seuil 22:00 inclus)', r===null, r&&r.cle);

console.log('── 7. jeunes travailleurs (< 18 ans) ───────────────────────────────────────────────');
// Âge à la date du créneau. Semaine du 16/11/2026.
t('né le 18/11/2008 : mineur le mardi 17/11, majeur le mercredi 18/11 (jour de ses 18 ans)',
  !!mineurAuJour({date_naissance:'2008-11-18'},'2026-11-17') && mineurAuJour({date_naissance:'2008-11-18'},'2026-11-18')===null);
t('né le 10/02/2011 (15 ans) : moins de 16 ans', (mineurAuJour({date_naissance:'2011-02-10'},'2026-11-17')||{}).moins16===true);
t('sans date de naissance, case « Mineur » cochée → mineur (supposé 16-17 ans)', (mineurAuJour({est_mineur:true},'2026-11-17')||{}).source==='case');
t('date de naissance d\'un majeur + case cochée → la DATE fait foi (la case ne se décoche jamais seule à 18 ans)', mineurAuJour({est_mineur:true,date_naissance:'2005-01-01'},'2026-11-17')===null);
t('sans date ni case → non mineur (inconnu : aucun contrôle — signalé dans le rapport)', mineurAuJour({},'2026-11-17')===null);
// Nuit
SAL.min={id:'min',heures_min:0,heures_max:40,date_naissance:'2009-06-01'};   // 17 ans
SAL.maj={id:'maj',heures_min:0,heures_max:40,date_naissance:'2000-06-01'};
setS({creneaux:[], allCreneauxWeek:[], altJours:{}});
const cpx=(sid,deb,fin,i,svc)=>checkPlacement(sid,{deb,fin,role:'cuisine'},D(i),svc||'soir',i,{manual:true});
r=cpx('min','17:00','22:30',3); t('mineur 17:00 → 22:30 : refusé (nuit dès 22:00)', r&&r.cle==='mineur_nuit', r&&r.cle);
r=cpx('min','19:00','02:00',3); t('mineur 19:00 → 02:00 : refusé (nuit)', r&&r.cle==='mineur_nuit', r&&r.cle);
r=cpx('min','16:00','22:00',3); t('mineur 16:00 → 22:00 : accepté (finit pile à 22:00)', r===null, r&&r.cle);
r=cpx('min','05:30','11:00',3,'midi'); t('mineur 05:30 → 11:00 : refusé (nuit jusqu\'à 06:00)', r&&r.cle==='mineur_nuit', r&&r.cle);
r=cpx('maj','17:00','22:30',3); t('contrôle négatif : majeur 17:00 → 22:30 accepté', r===null, r&&r.cle);
SAL.m15={id:'m15',heures_min:0,heures_max:40,date_naissance:'2011-02-10'};
r=cpx('m15','15:00','20:30',3); t('moins de 16 ans 15:00 → 20:30 : refusé (nuit dès 20:00)', r&&r.cle==='mineur_nuit', r&&r.cle);
let ex=explainViolation(cpx('min','17:00','22:30',3),{shift:{deb:'17:00',fin:'22:30'}});
t('motif lisible : âge, plage, articles, dérogation inspecteur', ex && /17 ans/.test(ex.why) && /L3163-1/.test(ex.why) && /23:30/.test(ex.why), ex&&ex.why);
// 8 h par jour (jour SANS école) — midi 08:00 → 13:00 (5 h) déjà posé.
const M5=[{salarie_id:'min',restaurant_id:LOBAU,date:D(3),service:'midi',heure_debut:'08:00',heure_fin:'13:00'}];
const M5maj=M5.map(c=>({...c,salarie_id:'maj'}));
setS({creneaux:M5.concat(M5maj), allCreneauxWeek:M5.concat(M5maj), altJours:{}});
r=cpx('min','16:00','20:00',3); t('mineur 5 h + 4 h le même jour = 9 h : refusé (8 h max)', r&&r.cle==='mineur_jour', r&&r.cle);
r=cpx('min','16:00','19:00',3); t('mineur 5 h + 3 h = 8 h pile : accepté', r===null, r&&r.cle);
r=cpx('maj','16:00','20:00',3); t('contrôle négatif : majeur 5 h + 4 h accepté', r===null, r&&r.cle);
// Inter-snack : les 5 h sont dans un AUTRE restaurant.
setS({creneaux:[], allCreneauxWeek:M5.map(c=>({...c,restaurant_id:'gc'})), altJours:{}, restos:[{id:LOBAU,nom:'Raya Lobau'},{id:'gc',nom:'Raya Grand Coeur'}]});
r=cpx('min','16:00','20:00',3); t('8 h / jour INTER-SNACK : 5 h à Grand Cœur + 4 h ici → refusé', r&&r.cle==='mineur_jour', r&&r.cle);
// École 7 h + 2 h de service : la règle « cfa » refuse d'abord ; on prouve AUSSI que l'école entre
// dans la durée du jour, en neutralisant le blocage absolu (comme si le CFA n'était qu'une demi-journée).
setS({creneaux:[], allCreneauxWeek:[], altJours:{['min|'+D(3)]:'ecole'}});
r=cpx('min','18:00','20:00',3); t('mineur, jeudi d\'école (7 h) + 18:00 → 20:00 : refusé — par « cfa », règle placée avant', r&&r.cle==='cfa', r&&r.cle);
t('… ecoleMinutesDuJour = 7 h ce jour-là, 0 le lendemain', ecoleMinutesDuJour('min',D(3))===420 && ecoleMinutesDuJour('min',D(4))===0);
{ const _ad=global.altDayType; global.altDayType=()=>null;   // blocage « cfa » neutralisé, S.altJours intact
  r=cpx('min','18:00','20:00',3); t('… sans le blocage « cfa » : 7 h d\'école + 2 h = 9 h → refusé par « mineur_jour »', r&&r.cle==='mineur_jour' && r._min.ecole===7, r&&JSON.stringify(r._min&&{e:r._min.ecole,d:r._min.deja}));
  r=cpx('maj','18:00','20:00',3); t('… contrôle négatif : majeur dans la même situation → accepté', r===null, r&&r.cle);
  global.altDayType=_ad; }
// 35 h / semaine, école comprise : 19,5 h de créneaux + 2 jours d'école (14 h) = 33,5 h ; +3 h → 36,5 h.
const W=CRE.map(c=>({...c,salarie_id:'min'})), Wmaj=CRE.map(c=>({...c,salarie_id:'maj'}));
setS({creneaux:W.concat(Wmaj), allCreneauxWeek:W.concat(Wmaj), altJours:{['min|'+D(0)]:'ecole',['min|'+D(1)]:'ecole',['maj|'+D(0)]:'ecole',['maj|'+D(1)]:'ecole'}});
r=cpx('min','11:00','14:00',2,'midi'); t('mineur 33,5 h (dont 14 h d\'école) + 3 h : refusé (35 h max), plafond de fiche 40 h', r&&r.cle==='mineur_semaine', r&&r.cle);
ex=explainViolation(r,{shift:{deb:'11:00',fin:'14:00'}}); t('… le motif cite l\'école et L3162-1', ex && /dont 14 h d'école/.test(ex.why) && /L3162-1/.test(ex.why), ex&&ex.why);
r=cpx('min','11:00','12:30',2,'midi'); t('mineur 33,5 h + 1,5 h = 35 h pile : accepté', r===null, r&&r.cle);
r=cpx('maj','11:00','14:00',2,'midi'); t('contrôle négatif : majeur (plafond 40 h) 33,5 + 3 h accepté', r===null, r&&r.cle);

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

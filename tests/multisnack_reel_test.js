// v0.73 — MULTI-SNACK SELON LA RÉALITÉ, PAS SELON LA FICHE.
//
// Le défaut corrigé : weekMinutesOf choisissait sa source selon isMultiSnack (la FICHE). Un salarié
// déclaré « mono » mais posé dans un autre snack (Samya : fiche Grand Cœur seul, 10 h à Carnot le 16/11)
// ne voyait compter que les heures du snack affiché — plafond hebdo, minimum, couleur de la colonne
// Heures, phase 3. Même piège que « les règles temporelles doivent être inter-snack » (CLAUDE.md).
//
// Ce harnais prouve, sur les VRAIES fonctions extraites de planning/index.html :
//   A. fiche mono + 10 h ailleurs → ligne Σ affichée, cumul = local + 10 h ;
//   B. plafond : refusé quand local + ailleurs dépasse, alors que le local seul passe — avec la
//      CONTRE-PREUVE sur l'ancien weekMinutesOf (copie verbatim de v0.72, ci-dessous) qui, lui, laissait passer ;
//   C. vrai mono-snack : aucun changement (ancien = nouveau, pas de Σ, pas d'alerte) ;
//   D. vraies données de la semaine du 16/11 (tests/multisnack_reel.json) : l'alerte
//      « snack absent de la fiche » apparaît pour Samya dans le panneau Vérifications (renderChecks réel).
const fs=require("fs");
const path=require("path");
const h=fs.readFileSync(path.join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);
const {extractFn}=require("./extract.js");
const grab=n=>extractFn(h,n);

eval("global._pmin="+(h.match(/const _pmin\s*=[^\n]*/)[0].replace(/^const _pmin\s*=/,'').replace(/;$/,''))+";");
eval("global._pdur="+(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const _pdur\s*=/,'').replace(/;$/,''))+";");
eval("global._truthyContr="+(h.match(/const _truthyContr\s*=[^\n]*/)[0].replace(/^const _truthyContr\s*=/,'').replace(/;$/,''))+";");
{ const i=h.indexOf("const _JOURS_IDX"); if(i>=0) eval("global._JOURS_IDX="+h.slice(h.indexOf("{",i),h.indexOf("\n",i))+";"); }
for(const fn of ['_toMin','overlaps','_overlap','_dayIndexOf','contrOf','isMultiSnack','weekMinutesOf','weekHoursOf',
                 'otherSnackHoursOf','otherSnackBreakdown','worksAt','plafondOf','rowHoursCell',
                 '_indispoBlocking','_contrainteBlocking','checkPlacement','renderChecks']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); process.exit(1); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j;
  for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}
  eval("global.PLACE_RULES="+h.slice(st,j)+";"); }

// ── ANCIEN weekMinutesOf (v0.72), copié VERBATIM depuis git — artefact de CONTRE-PREUVE uniquement ──
// Ne jamais le réutiliser : c'est précisément le code fautif (bifurcation sur la fiche).
function weekMinutesOf_OLD(sid, ex){
  const s=salById(sid);
  const src=(s&&isMultiSnack(s))?S.allCreneauxWeek:S.creneaux;
  return src.filter(c=>c.salarie_id===sid && c.heure_debut
      && !(ex && ex.excludeSelf && c.date===ex.date && c.service===ex.svc && c.restaurant_id===ex.restaurant_id))
    .reduce((a,c)=>a+_pdur(c.heure_debut,c.heure_fin),0);
}
const NEW_weekMinutesOf=global.weekMinutesOf;
// Garde-fou : la copie « ancienne » doit bien différer du code actuel, sinon la contre-preuve ne prouve rien.
if(grab('weekMinutesOf').includes('isMultiSnack')){ console.log('FAIL · weekMinutesOf bifurque encore sur isMultiSnack'); process.exit(1); }

// ── décor minimal ────────────────────────────────────────────────────────────────────────────────
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.onRoster=()=>true; global.rolesOf=()=>['caisse']; global.isExp=()=>true;
global.altDayType=()=>null; global._endCapMin=()=>null;   // neutralise les plafonds d'heure de fin pour isoler le plafond hebdo
global.salById=id=>SAL[id];
global.escP=s=>(''+(s==null?'':s));   // STUB : échappement HTML — sans effet sur les assertions
let RULES={coupure_min:3,repos_quotidien_h:11,amplitude_max:12,jour_off_min:1,plafond_hebdo:48};
global._ruleCtx=()=>({ num:(k,d)=>(RULES[k]!=null?RULES[k]:d), raw:()=>null, on:(k,d)=>d });

let ok=true;
const t=(l,c,extra)=>{ console.log((c?'PASS':'FAIL')+' · '+l+(extra?'  '+extra:'')); ok=!!c&&ok; };

// ═══ A. Fiche MONO + 10 h dans un autre snack ═════════════════════════════════════════════════════
console.log('── A. fiche mono, 10 h ailleurs : Σ et cumul ───────────────────────────────────────');
const GC='gc', CAR='carnot';
global.SAL={
  sam:{id:'sam',nom:'Sam',heures_min:35,heures_max:45,est_multi:false,snacks_priorites:[{priorite:1,restaurant_id:GC}]},
  bob:{id:'bob',nom:'Bob',heures_min:35,heures_max:45,est_multi:false,snacks_priorites:[{priorite:1,restaurant_id:GC}]},
};
const cr=(sid,rid,date,svc,deb,fin)=>({salarie_id:sid,restaurant_id:rid,date,service:svc,heure_debut:deb,heure_fin:fin,role:'caisse'});
function setWeek(all){
  global.S={allCreneauxWeek:all.slice(), creneaux:all.filter(c=>c.restaurant_id===SNACK.id),
    dispos:[], miseAPied:[], contraintes:[], salaries:Object.values(SAL), orgRoles:[],
    restos:[{id:GC,nom:'Raya Grand Coeur'},{id:CAR,nom:'Raya Carnot'}]};
}
global.SNACK={id:GC,nom:'Raya Grand Coeur'};
// Sam : 28 h à Grand Cœur (4 soirs de 7 h) + 10 h à Carnot (lundi 11→15 et 18→00).
const SAM_WEEK=[
  cr('sam',CAR,'2026-11-16','midi','11:00','15:00'), cr('sam',CAR,'2026-11-16','soir','18:00','00:00'),
  cr('sam',GC,'2026-11-19','soir','17:00','00:00'), cr('sam',GC,'2026-11-20','soir','17:00','00:00'),
  cr('sam',GC,'2026-11-21','soir','17:00','00:00'), cr('sam',GC,'2026-11-22','soir','17:00','00:00'),
];
setWeek(SAM_WEEK);
t('A1 cumul hebdo = local 28 h + ailleurs 10 h = 38 h', Math.abs(weekHoursOf('sam')-38)<1e-6, `(${weekHoursOf('sam')} h)`);
t('A1bis contre-preuve : l\'ancien code ne comptait que 28 h', Math.abs(weekMinutesOf_OLD('sam')/60-28)<1e-6, `(${weekMinutesOf_OLD('sam')/60} h)`);
let rh=rowHoursCell(SAL.sam);
t('A2 ligne Σ 38h affichée bien que la fiche soit mono', rh.html.includes('Σ 38h</small>'), JSON.stringify(rh.html));
t('A3 chiffre principal = 28 h (snack affiché)', /^28\.0h/.test(rh.html));
t('A4 couleur verte (38 h ∈ [35,45]) — avant : orange (28 h < 35)', rh.color==='var(--ok)', rh.color);
t('A5 info-bulle « tous restaurants confondus »', /28 h ici · 38 h au total/.test(rh.tip), JSON.stringify(rh.tip.split('\n')[1]));

// ═══ B. Plafond hebdo : local seul passe, local + ailleurs dépasse ════════════════════════════════
console.log('── B. plafond hebdo inter-snack (contre-preuve ancien code) ─────────────────────────');
// Sam : plafond 45 h, déjà 38 h. Nouveau créneau GC mercredi 10:00→18:00 (8 h) → 46 h > 45 h.
// Local seul : 28 + 8 = 36 h ≤ 45 h → l'ancien code laissait passer.
const candB={deb:'10:00',fin:'18:00',role:'caisse'};
setWeek(SAM_WEEK);
let r=checkPlacement('sam',candB,'2026-11-18','midi',2,{manual:true});
t('B1 nouveau code : refus plafond (38 + 8 = 46 > 45)', r && r.cle==='plafond', r?r.cle+' '+JSON.stringify(r._plaf):'NULL');
t('B2 le motif dit « tous restaurants confondus » (_plaf.multi)', r && r._plaf && r._plaf.multi===true);
global.weekMinutesOf=weekMinutesOf_OLD;
r=checkPlacement('sam',candB,'2026-11-18','midi',2,{manual:true});
t('B3 CONTRE-PREUVE ancien code : le même créneau passait (local 36 h)', r===null, r?r.cle:'NULL');
global.weekMinutesOf=NEW_weekMinutesOf;
// Contrôle négatif : sans les heures de Carnot, le même créneau passe avec le nouveau code.
setWeek(SAM_WEEK.filter(c=>c.restaurant_id===GC));
r=checkPlacement('sam',candB,'2026-11-18','midi',2,{manual:true});
t('B4 contrôle négatif : sans Carnot (28 + 8 = 36 h), le nouveau code accepte', r===null, r?r.cle:'NULL');

// ═══ C. Vrai mono-snack : aucun changement ════════════════════════════════════════════════════════
console.log('── C. vrai mono-snack : comportement identique ─────────────────────────────────────');
const BOB_WEEK=[cr('bob',GC,'2026-11-16','midi','10:00','18:00'), cr('bob',GC,'2026-11-17','midi','10:00','18:00'),
                cr('bob',GC,'2026-11-18','soir','18:00','00:00')];
setWeek(BOB_WEEK);
t('C1 ancien = nouveau (22 h)', NEW_weekMinutesOf('bob')===weekMinutesOf_OLD('bob') && NEW_weekMinutesOf('bob')===22*60);
rh=rowHoursCell(SAL.bob);
t('C2 pas de ligne Σ', !rh.html.includes('Σ'), rh.html);
t('C3 info-bulle mono inchangée (« 22 h cette semaine »)', /22 h cette semaine/.test(rh.tip));
t('C4 aucune alerte « snack absent de la fiche »', snacksHorsFiche(SAL.bob).length===0);
t('C5 estMultiDeFait = false', estMultiDeFait(SAL.bob)===false);
// Multi DÉCLARÉ mais sans heure ailleurs cette semaine : plus de Σ (elle répétait le chiffre principal).
SAL.dec={id:'dec',heures_min:20,heures_max:45,est_multi:true,snacks_priorites:[{priorite:1,restaurant_id:GC},{priorite:2,restaurant_id:CAR}]};
setWeek([cr('dec',GC,'2026-11-16','midi','10:00','18:00')]);
rh=rowHoursCell(SAL.dec);
t('C6 multi déclaré sans heure ailleurs : pas de Σ (identique au chiffre principal)', !rh.html.includes('Σ'), rh.html);
t('C7 multi déclaré : aucune alerte fiche (Carnot est dans sa fiche)', snacksHorsFiche(SAL.dec).length===0);
delete SAL.dec;

// ═══ D. VRAIES DONNÉES — semaine du 16/11/2026 ════════════════════════════════════════════════════
console.log('── D. vraies données, semaine du 16/11 ─────────────────────────────────────────────');
const P=JSON.parse(fs.readFileSync(path.join(__dirname,'multisnack_reel.json'),'utf8'));
const RID=Object.fromEntries(P.restos.map(x=>[x.nom,x.id]));
global.SAL=Object.fromEntries(P.sal.map(s=>[s.id,s]));
const SAMYA=P.sal.find(s=>s.nom==='Samya'), KOUY=P.sal.find(s=>s.nom==='KOUYATE'), SEB=P.sal.find(s=>s.nom==='SEBILLE');
const ALL=P.cre.map(([salarie_id,restaurant_id,date,service,heure_debut,heure_fin,role])=>({salarie_id,restaurant_id,date,service,heure_debut,heure_fin,role}));
// Structure du jeu (pas seulement l'agrégat) : unicité (salarié, resto, date, service) et semaine complète.
const keys=new Set(ALL.map(c=>`${c.salarie_id}|${c.restaurant_id}|${c.date}|${c.service}`));
t('D0 fixture : aucune ligne en double, toutes les dates dans la semaine du 16/11',
  keys.size===ALL.length && ALL.every(c=>c.date>='2026-11-16' && c.date<='2026-11-22'));

global.MONDAY=new Date(P.monday+'T00:00:00');
global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.nameOf=undefined;
let CHECKS_HTML='';
global.document={getElementById:id=>({set innerHTML(v){ if(id==='checks') CHECKS_HTML=v; }, get innerHTML(){return CHECKS_HTML;}})};
// Décor de renderChecks : aucun rôle configuré → les contrôles d'effectif/couverture sont vides (hors sujet ici).
global.targetFor=()=>({}); global.dayJourType=()=>'semaine'; global.getShifts=()=>[];
global.capCoverageGaps=()=>[]; global.JOUR_TYPE_LABELS={};
function panneau(snackNom){
  global.SNACK={id:RID[snackNom], nom:snackNom};
  global.S={allCreneauxWeek:ALL.slice(), creneaux:ALL.filter(c=>c.restaurant_id===SNACK.id), salaries:P.sal,
            dispos:[], miseAPied:[], contraintes:[], orgRoles:[], restos:P.restos};
  global.CHECKS=[];
  renderChecks();
  return CHECKS;
}
panneau('Raya Grand Coeur');
const sf=snacksHorsFiche(SAMYA);
t('D1 snacksHorsFiche(Samya) = Carnot, 10 h', sf.length===1 && sf[0].nom==='Carnot' && Math.abs(sf[0].h-10)<1e-6, JSON.stringify(sf));
for(const snack of ['Raya Grand Coeur','Raya Carnot']){
  const ch=panneau(snack);
  const al=ch.find(c=>c.lbl==='Snack absent de la fiche');
  t(`D2 panneau ${snack} : alerte présente pour Samya`,
    al && !al.ok && al.details.some(d=>d==="Samya travaille à Carnot (10 h cette semaine), qui n'est pas dans sa fiche"),
    al?JSON.stringify(al.details):'(pas de ligne)');
  t(`D3 panneau ${snack} : l'alerte s'affiche dans le HTML du panneau`, CHECKS_HTML.includes('Snack absent de la fiche'));
}
{ const ch=panneau('Raya Lobau');
  t('D4 panneau Lobau : pas d\'alerte (KOUYATE et SEBILLE n\'ont travaillé qu\'à Lobau cette semaine)', !ch.find(c=>c.lbl==='Snack absent de la fiche')); }
{ panneau('Raya Grand Coeur');
  const rhS=rowHoursCell(SAMYA);
  t('D5 Samya sur Grand Cœur : 28 h ici, Σ 38h', /^28\.0h/.test(rhS.html) && rhS.html.includes('Σ 38h</small>'), rhS.html);
  t('D6 Samya : couleur verte (38 h ∈ [35,45]) au lieu d\'orange', rhS.color==='var(--ok)');
  t('D7 Samya : ancien code 28 h, nouveau 38 h', weekMinutesOf_OLD(SAMYA.id)===28*60 && NEW_weekMinutesOf(SAMYA.id)===38*60);
  const ch=CHECKS.find(c=>c.lbl==='Plafond heures hebdo');
  t('D8 Samya (38 h) sous son plafond 45 h : pas dans « Plafond heures hebdo »', ch && !ch.details.some(d=>d.startsWith('Samya')));
  const mn=CHECKS.find(c=>c.lbl==='Minimum heures hebdo');
  t('D9 Samya (38 h ≥ 35 h) n\'apparaît plus sous son minimum', mn && !mn.details.some(d=>d.startsWith('Samya')), JSON.stringify(mn&&mn.details)); }
{ // Sur Carnot, Samya n'est PAS rattachée (fiche) : avant v0.73 elle échappait à tous les contrôles du
  // panneau. Preuve qu'elle est désormais contrôlée, et sur 38 h : avec un minimum fictif de 40 h elle
  // doit apparaître à 38,0 h (et non 10,0 h, ni être absente).
  const vrai=SAMYA.heures_min; SAMYA.heures_min=40;
  panneau('Raya Carnot');
  const mn=CHECKS.find(c=>c.lbl==='Minimum heures hebdo');
  t('D10 panneau Carnot : Samya (hors fiche) contrôlée sur son total réel 38 h', mn && mn.details.some(d=>d.startsWith('Samya : 38.0h < 40h')), JSON.stringify(mn&&mn.details));
  SAMYA.heures_min=vrai; }
{ panneau('Raya Lobau');
  for(const s of [KOUY,SEB]){
    t(`D11 vrai mono ${s.nom} : ancien = nouveau (${NEW_weekMinutesOf(s.id)/60} h), pas de Σ, multi de fait = non`,
      NEW_weekMinutesOf(s.id)===weekMinutesOf_OLD(s.id) && !rowHoursCell(s).html.includes('Σ') && !estMultiDeFait(s));
  } }
t('D12 Samya : multi-snack de fait (« · multi-snack » dans les rapports)', estMultiDeFait(SAMYA)===true);

console.log(ok?'\nALL PASS':'\nSOME FAILED');
process.exit(ok?0:1);

// v0.57 — « DIRE POURQUOI » : le refus énonce la RÈGLE, son RÉGLAGE et le FAIT qui la déclenche.
//
// Le patron a été bloqué sans savoir par quelle règle, et a cru que c'était le repos quotidien alors que
// ses 11 h étaient respectées. Un message qui ne nomme que la règle ne permet pas de trancher entre
// « la règle a raison » et « l'app se trompe ». Ce harnais verrouille les trois exigences :
//   1. explainViolation() énonce le fait déclencheur, avec le RESTAURANT quand il diffère de l'affiché ;
//   2. il pointe le bon réglage (ou la bonne fiche quand ce n'est pas un réglage du planning) ;
//   3. les info-bulles des badges de couleur et des cases « pris ailleurs » disent la même chose.
//
// Les objets de refus ne sont PAS fabriqués à la main : ils sortent du vrai checkPlacement, sur des
// scénarios réels. Un payload oublié dans une règle ferait donc échouer ce harnais, pas passer.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);   // constantes/helpers de fichier (F2H_*, _finAbsM, _restoNom)
const {extractFn}=require("./extract.js");
const grab=n=>extractFn(h,n);

// ── objets const multi-lignes (RULE_META, RULE_SETTING_OF…) : extraction par équilibrage d'accolades ──
// Les COMMENTAIRES doivent être sautés avant les chaînes : ces objets sont largement commentés en
// français, et une apostrophe de « qu'elles » ouvrirait une fausse chaîne qui désynchronise le comptage.
function grabObj(name){
  const i=h.indexOf("const "+name+"="); if(i<0) throw new Error("objet introuvable : "+name);
  let d=0, j=h.indexOf("{",i), st=j;
  for(;j<h.length;j++){ const c=h[j], n=h[j+1];
    if(c==='/'&&n==='/'){ j=h.indexOf("\n",j); if(j<0)j=h.length; continue; }
    if(c==='/'&&n==='*'){ j=h.indexOf("*/",j+2)+1; continue; }
    if(c==='"'||c==="'"||c==='`'){ const q=c; j++; while(j<h.length&&h[j]!==q){ if(h[j]==='\\')j++; j++; } continue; }
    if(c==='{')d++; else if(c==='}'){ d--; if(d===0){ j++; break; } } }
  return h.slice(st,j);
}
for(const o of ['RULE_META','RULE_SETTING_OF','RULE_SOURCE_OF','PLACE_RULES','LEGAL_LIMITS'])
  eval("global."+o+"="+grabObj(o)+";");
eval("global._pdur="+(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const _pdur\s*=/,'').replace(/;$/,''))+";");
eval("global._truthyContr="+(h.match(/const _truthyContr\s*=[^\n]*/)[0].replace(/^const _truthyContr\s*=/,'').replace(/;$/,''))+";");
eval("global.DEF_TIME="+(h.match(/const DEF_TIME\s*=[^\n]*/)[0].replace(/^const DEF_TIME\s*=/,'').replace(/;$/,''))+";");
eval("global._fh="+(h.match(/const _fh\s*=[^\n]*/)[0].replace(/^const _fh\s*=/,'').replace(/;$/,''))+";");
for(const fn of ['_toMin','overlaps','_overlap','_dayIndexOf','contrOf','isMultiSnack','weekMinutesOf','weekHoursOf',
                 'plafondOf','otherSnackBreakdown','_indispoBlocking','_contrainteBlocking','checkPlacement',
                 '_jourDe','_creTxt','_absTxt','explainViolation','violationText','_effStatus','_effBadgeTip',
                 '_hoursCellTip','rowHoursCell','describeConflict','conflictTip','otherSnackBusy','_needAt','_coverAt']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}

global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.escP=s=>(''+(s==null?'':s));
global.onRoster=()=>true; global.worksAt=()=>true; global.rolesOf=()=>['cuisine']; global.isExp=()=>true;
global.altDayType=()=>null; global._endCapMin=()=>null;
global.salById=id=>SAL[id];
global.hasIndispo=(sid,date)=>(S.dispos||[]).find(d=>d.salarie_id===sid && d.date_specifique===date)||null;

const LOBAU='lobau', GC='grandcoeur';
global.SNACK={id:LOBAU,nom:'Raya Lobau'};
global.SAL={ahmad:{id:'ahmad',prenom:'Ahmad',nom:'B.',heures_min:20,heures_max:48,est_multi:true,
                   snacks_priorites:[{restaurant_id:LOBAU},{restaurant_id:GC}]}};
let RULES={coupure_min:3,repos_quotidien_h:11,amplitude_max:12,jour_off_min:1,plafond_hebdo:48};
global._ruleCtx=()=>({num:(k,d)=>(RULES[k]!=null?RULES[k]:d), raw:()=>null, on:(k,d)=>d});

const D=i=>fmtDate(new Date(new Date('2026-08-03T00:00:00').getTime()+i*86400000));
const MON=D(0), TUE=D(1);
const at=(rid,date,svc,deb,fin)=>({salarie_id:'ahmad',restaurant_id:rid,date,service:svc,heure_debut:deb,heure_fin:fin});
function setState(cre, contraintes, dispos){
  global.S={creneaux:cre.filter(c=>c.restaurant_id===LOBAU), allCreneauxWeek:cre.slice(), dispos:dispos||[],
            miseAPied:[], contraintes:contraintes||[], restos:[{id:LOBAU,nom:'Raya Lobau'},{id:GC,nom:'Raya Grand Cœur'}]};
}
let ok=true;
const t=(l,c,extra)=>{console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra||'')));ok=c&&ok;};
// Refuse le placement puis renvoie l'explication produite.
function explainOf(cre, cand, date, svc, di, contraintes, dispos){
  setState(cre, contraintes, dispos);
  const v=checkPlacement('ahmad',cand,date,svc,di,{manual:true});
  if(!v) return {cle:'NULL', why:'', reglage:'', v:null};
  const e=explainViolation(v,{shift:cand,date,svc});
  return {cle:v.cle, why:e.why, reglage:e.reglage, v};
}

console.log('── le refus nomme le FAIT déclencheur et le RESTAURANT concerné ───────────────────────');
// 1. Le cas du patron : fermeture après minuit dans un AUTRE snack → le message doit citer l'heure ET Lobau…
//    (ici l'autre snack est Grand Cœur, le snack affiché étant Lobau).
{ const r=explainOf([at(GC,MON,'soir','18:00','00:30')], {deb:'12:00',fin:'15:00',role:'cuisine'}, TUE,'midi',1);
  t('fin_2h_pas_matin : la règle est bien celle-là', r.cle==='fin_2h_pas_matin', r.cle);
  t('… le message cite l\'heure de fin (00:30)', /00:30/.test(r.why), r.why);
  t('… le message cite le restaurant concerné (Grand Cœur)', /Grand Cœur/.test(r.why), r.why);
  t('… le message cite le jour de la donnée déclenchante (Lundi)', /Lundi/.test(r.why), r.why);
  t('… il pointe le réglage correspondant', /Réglages du planning/.test(r.reglage||'') && /fermeture APRÈS MINUIT/i.test(r.reglage||''), r.reglage);
  t('… et NE renvoie PAS au repos quotidien (la confusion à éviter)', !/repos quotidien/i.test(r.reglage||''), r.reglage); }

// 2. Repos quotidien : le message doit donner les heures RÉELLES et le seuil réglé — c'est ce qui manquait
//    pour distinguer cette règle de la précédente.
{ const r=explainOf([at(GC,MON,'soir','18:00','00:00')], {deb:'08:00',fin:'12:00',role:'cuisine'}, TUE,'midi',1);
  t('repos_quot : règle correcte', r.cle==='repos_quot', r.cle);
  t('… le message donne le repos réel (8 h) et le minimum réglé (11 h)', /8\s*h/.test(r.why)&&/11\s*h/.test(r.why), r.why);
  t('… il nomme le restaurant de l\'autre créneau', /Grand Cœur/.test(r.why), r.why);
  t('… il pointe « Durée du repos quotidien »', /Durée du repos quotidien/.test(r.reglage||''), r.reglage); }

// 3. Coupure : durée réelle + seuil.
{ const r=explainOf([at(GC,MON,'midi','10:00','18:00')], {deb:'19:00',fin:'23:00',role:'cuisine'}, MON,'soir',0);
  t('coupure_min : règle correcte', r.cle==='coupure_min', r.cle);
  t('… le message donne la coupure réelle (1 h) et le minimum (3 h)', /1\s*h/.test(r.why)&&/3\s*h/.test(r.why), r.why);
  t('… il pointe « Coupure minimum entre midi et soir »', /Coupure minimum/.test(r.reglage||''), r.reglage); }

// 4. Amplitude : bornes du bloc + total + maximum.
{ RULES.coupure_min=0;
  const r=explainOf([at(GC,MON,'midi','10:00','18:00')], {deb:'18:00',fin:'23:00',role:'cuisine'}, MON,'soir',0);
  RULES.coupure_min=3;
  t('amplitude_max : règle correcte', r.cle==='amplitude_max', r.cle);
  t('… le message donne les bornes (10:00 → 23:00) et le total (13 h)', /10:00/.test(r.why)&&/23:00/.test(r.why)&&/13\s*h/.test(r.why), r.why);
  t('… il signale que l\'autre bloc est dans un autre restaurant', /Grand Cœur/.test(r.why), r.why); }

// 5. Jours de repos : le compte doit inclure les autres snacks, et le dire.
{ const six=[0,1,2].map(i=>at(GC,D(i),'midi','11:00','15:00')).concat([3,4,5].map(i=>at(LOBAU,D(i),'midi','11:00','15:00')));
  const r=explainOf(six, {deb:'11:00',fin:'15:00',role:'cuisine'}, D(6),'midi',6);
  t('jour_off_min : règle correcte', r.cle==='jour_off_min', r.cle);
  t('… le message donne les jours déjà travaillés (6) et le minimum de repos (1)', /6 jour/.test(r.why)&&/1 exig/.test(r.why), r.why);
  t('… il précise combien viennent d\'un autre restaurant', /3 dans un autre restaurant/.test(r.why), r.why); }

// 6. Plafond : heures déjà posées (inter-snack), ajout, total, plafond.
{ const gc45=[0,1,2,3,4].map(i=>at(GC,D(i),'midi','09:00','18:00'));
  const r=explainOf(gc45, {deb:'11:00',fin:'15:00',role:'cuisine'}, D(5),'midi',5);
  t('plafond : règle correcte', r.cle==='plafond', r.cle);
  t('… le message donne 45 h déjà posées, +4 h, = 49 h pour 48 h', /45/.test(r.why)&&/4 h/.test(r.why)&&/49/.test(r.why)&&/48/.test(r.why), r.why);
  t('… il précise « tous restaurants confondus » (salarié multi-snack)', /tous restaurants confondus/.test(r.why), r.why); }

// 7. Chevauchement inter-snack : quel créneau, quel snack.
{ const r=explainOf([at(GC,MON,'midi','11:00','15:00')], {deb:'14:00',fin:'18:00',role:'cuisine'}, MON,'midi',0);
  t('inter_snack : règle correcte', r.cle==='inter_snack', r.cle);
  t('… le message cite le créneau concurrent et son restaurant', /11:00→15:00/.test(r.why)&&/Grand Cœur/.test(r.why), r.why); }

// 8. Indisponibilité : laquelle, quand.
{ const r=explainOf([], {deb:'11:00',fin:'15:00',role:'cuisine'}, MON,'midi',0, null,
    [{salarie_id:'ahmad',date_specifique:MON,type:'ponctuelle',statut:'indispo',statut_demande:'validee',motif:'rendez-vous médical'}]);
  t('indispo : règle correcte', r.cle==='indispo', r.cle);
  t('… le message donne le motif saisi', /rendez-vous médical/.test(r.why), r.why);
  t('… il renvoie aux disponibilités, pas aux réglages du planning', /Disponibilités/.test(r.reglage||''), r.reglage); }

// 9. Contrainte individuelle : le message renvoie à la FICHE, pas aux réglages du planning.
{ const r=explainOf([at(GC,MON,'midi','11:00','15:00')], {deb:'19:00',fin:'23:00',role:'cuisine'}, MON,'soir',0,
    [{salarie_id:'ahmad',cle:'pas_de_coupure',valeur:'true',active:true}]);
  t('c_pas_coupure : règle correcte', r.cle==='c_pas_coupure', r.cle);
  t('… le message dit le fait déclencheur', /déjà sur le midi/.test(r.why), r.why);
  t('… il renvoie à la fiche du salarié', /Fiche du salarié/.test(r.reglage||''), r.reglage); }

console.log('\n── chaque règle a une entrée de réglage/source (aucune ne reste muette) ────────────────');
{ const manquantes=Object.keys(PLACE_RULES).filter(c=>!(c in RULE_SETTING_OF) && !(c in RULE_SOURCE_OF));
  // reserve_principal n'est pas une règle de checkPlacement (motif de rapport phase 3) → toléré.
  const reste=manquantes.filter(c=>c!=='reserve_principal');
  t('toute cle de PLACE_RULES est cartographiée (manquantes : '+(reste.join(', ')||'aucune')+')', reste.length===0);
  const mauvaises=Object.entries(RULE_SETTING_OF).filter(([,k])=>k!=null && !RULE_META[k]).map(([c])=>c);
  t('tout réglage pointé existe bien dans RULE_META (invalides : '+(mauvaises.join(', ')||'aucun')+')', mauvaises.length===0); }

console.log('\n── info-bulles des badges de couleur (point 3) ─────────────────────────────────────────');
{ const over =_effBadgeTip('Cuisine',{peak:3,under:false,over:true, worstO:{hh:12*60+30,need:2,cov:3}},3,2);
  const under=_effBadgeTip('Cuisine',{peak:1,under:true, over:false,worstU:{hh:12*60,need:2,cov:1}},1,2);
  const okk  =_effBadgeTip('Cuisine',{peak:2,under:false,over:false},2,2);
  t('badge ROUGE : dit sur-couverture, l\'heure, le réel et le requis', /Sur-couverture/.test(over)&&/12:30/.test(over)&&/3 personne/.test(over)&&/2 requise/.test(over), over);
  t('badge ORANGE : dit sous-couverture, l\'heure, le réel et le requis', /Sous-couverture/.test(under)&&/12:00/.test(under)&&/1 personne/.test(under)&&/2 requise/.test(under), under);
  t('badge VERT : dit que l\'effectif est conforme', /conforme/.test(okk), okk);
  t('badge rouge/orange : indique où corriger', /Réglages du planning/.test(over)&&/Réglages du planning/.test(under)); }

{ // colonne Heures : rouge au-dessus du plafond · orange sous le minimum
  const sMulti={id:'ahmad',heures_min:20,heures_max:48,est_multi:true,snacks_priorites:[{restaurant_id:LOBAU},{restaurant_id:GC}]};
  const sMono ={id:'x',heures_min:35,heures_max:39,est_multi:false};
  const rouge =_hoursCellTip(sMono, 42, 42, 35, 39);
  const orange=_hoursCellTip(sMulti, 5, 12, 20, 48);
  const vert  =_hoursCellTip(sMono, 36, 36, 35, 39);
  t('colonne Heures ROUGE : dit le dépassement chiffré', /plafond/i.test(rouge)&&/3 h/.test(rouge), rouge);
  t('colonne Heures ORANGE : dit ce qui manque', /minimum/i.test(orange)&&/8 h/.test(orange), orange);
  t('colonne Heures multi-snack : dit « tous restaurants confondus »', /tous restaurants confondus/.test(orange), orange);
  t('colonne Heures VERTE : état clair', /Dans les clous/.test(vert), vert); }

{ setState([at(GC,MON,'midi','11:00','15:00'), at(LOBAU,MON,'midi','14:00','18:00')]);
  const tip=conflictTip('ahmad',MON);
  t('cellule ROUGE : dit avec quel restaurant et quels horaires', /Grand Cœur/.test(tip)&&/11:00→15:00/.test(tip), tip);
  t('cellule ROUGE : dit quoi faire', /Décale|retire/i.test(tip), tip); }

console.log('\n── marque « déjà pris ailleurs » sur les cases vides (point 4) ─────────────────────────');
// Service midi ici = 11:00→14:30 (DEF_TIME).
{ setState([at(GC,MON,'midi','11:00','15:00')]);
  const b=otherSnackBusy('ahmad',MON,'midi');
  t('recouvrement TOTAL du service → état « full »', b.state==='full', b.state);
  t('… l\'info-bulle nomme le restaurant et les horaires', /Grand Cœur/.test(b.tip)&&/11:00→15:00/.test(b.tip), b.tip);
  t('… elle dit qu\'il ne reste aucune plage libre', /Aucune plage libre/.test(b.tip), b.tip);
  t('… et rappelle que ce n\'est PAS un blocage', /pas un blocage/.test(b.tip), b.tip); }
{ // Le cas explicitement demandé : pris ailleurs 18:00→20:00 alors que le soir ici va de 18:30 à 23:30.
  setState([at(GC,MON,'soir','18:00','20:00')]);
  const b=otherSnackBusy('ahmad',MON,'soir');
  t('recouvrement PARTIEL → état « part » (et non « full »)', b.state==='part', b.state);
  t('… l\'info-bulle chiffre la part prise (1,5 h sur 5 h)', /1,5 h prise/.test(b.tip)&&/sur 5 h/.test(b.tip), b.tip);
  t('… elle dit qu\'il reste de la place', /reste de la place/.test(b.tip), b.tip); }
{ setState([at(GC,MON,'midi','11:00','14:00')]);
  const b=otherSnackBusy('ahmad',MON,'soir');
  t('aucun recouvrement du service soir → état « none » (pas de marque)', b.state==='none', b.state);
  t('… et aucune info-bulle', b.tip==='', b.tip); }
{ // Créneau sur le snack COURANT : ce n'est pas « ailleurs », rien ne doit être marqué.
  setState([at(LOBAU,MON,'midi','11:00','15:00')]);
  t('un créneau du snack affiché ne compte pas comme « pris ailleurs »', otherSnackBusy('ahmad',MON,'midi').state==='none'); }
{ // Deux snacks qui se suivent : l'union des segments doit couvrir tout le service (pas de double compte).
  setState([at(GC,MON,'midi','11:00','13:00'), at('troisieme',MON,'midi','13:00','15:00')]);
  const b=otherSnackBusy('ahmad',MON,'midi');
  t('deux restaurants qui se suivent → union correcte → « full »', b.state==='full', b.state+' cov='+b.covered); }

console.log(ok?'\nALL PASS':'\nSOME FAILED');
process.exit(ok?0:1);

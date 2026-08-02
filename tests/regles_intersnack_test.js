// v0.57 — VERROU INTER-SNACK des règles TEMPORELLES de checkPlacement.
//
// Pourquoi ce harnais : CLAUDE.md documente le même défaut répété quatre fois — « le réflexe naturel est
// de lire S.creneaux (snack courant) ; c'est faux pour un salarié multi-snack ». Repos quotidien, coupure
// et plafond ont été convertis un par un, au fil des bugs. fin_2h_pas_matin, amplitude_max et jour_off_min
// ne l'avaient jamais été.
//
// PRINCIPE DU HARNAIS : pour CHAQUE règle temporelle, la donnée qui déclenche le refus est posée dans un
// AUTRE restaurant que celui affiché. Une règle qui ne lirait que S.creneaux rendrait NULL → FAIL.
// Chaque cas a son contrôle négatif (la même donnée, mais sous le seuil → doit passer), sinon on ne
// prouverait que « ça bloque toujours ».
//
// Fonctions RÉELLES extraites de planning/index.html — aucune réimplémentation.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);   // constantes/helpers de fichier (F2H_*, _finAbsM, _restoNom)
const {extractFn}=require("./extract.js");
const grab=n=>extractFn(h,n);

// ── primitives de fichier (mêmes définitions que la page) ────────────────────────────────────────
eval("global._pmin="+(h.match(/const _pmin\s*=[^\n]*/)[0].replace(/^const _pmin\s*=/,'').replace(/;$/,''))+";");
eval("global._pdur="+(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const _pdur\s*=/,'').replace(/;$/,''))+";");
eval("global._truthyContr="+(h.match(/const _truthyContr\s*=[^\n]*/)[0].replace(/^const _truthyContr\s*=/,'').replace(/;$/,''))+";");
{ const i=h.indexOf("const _JOURS_IDX"); if(i>=0) eval("global._JOURS_IDX="+h.slice(h.indexOf("{",i),h.indexOf("\n",i))+";"); }
for(const fn of ['_toMin','overlaps','_overlap','_dayIndexOf','contrOf','isMultiSnack','weekMinutesOf','_indispoBlocking','_contrainteBlocking','checkPlacement']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j;
  for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}
  eval("global.PLACE_RULES="+h.slice(st,j)+";"); }

// ── décor minimal ────────────────────────────────────────────────────────────────────────────────
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.onRoster=()=>true; global.worksAt=()=>true; global.rolesOf=()=>['cuisine']; global.isExp=()=>true;
global.altDayType=()=>null; global._endCapMin=()=>null;   // neutralise fin_semaine/weekend pour isoler
global.plafondOf=(sal)=>Number(sal.heures_max)||48;
global.salById=id=>SAL[id];

const LOBAU='lobau', GC='grandcoeur';
global.SNACK={id:LOBAU};
global.SAL={ahmad:{id:'ahmad',heures_max:48,est_multi:true,snacks_priorites:[{restaurant_id:LOBAU},{restaurant_id:GC}]}};
// Réglages par défaut du test : coupure 3h · repos 11h · amplitude 12h · 1 jour de repos mini.
let RULES={coupure_min:3,repos_quotidien_h:11,amplitude_max:12,jour_off_min:1};
let RULES_ON={};
// RAW : lignes de réglage à valeur (fin_matin_seuil…). null = absent de la base → le code retombe sur
// son défaut, ce qui est justement le cas à couvrir pour une organisation qui n'a jamais réglé la règle.
let RAW={};
global._ruleCtx=()=>({ num:(k,d)=>(RULES[k]!=null?RULES[k]:d), raw:(k)=>(RAW[k]||null), on:(k,d)=>(RULES_ON[k]!=null?RULES_ON[k]:d) });

// Lundi 2026-08-03 → dimanche 2026-08-09
const D=i=>fmtDate(new Date(new Date('2026-08-03T00:00:00').getTime()+i*86400000));
const MON=D(0), TUE=D(1);
// créneau d'un autre snack (GC) / du snack courant (Lobau)
const at=(rid,date,svc,deb,fin)=>({salarie_id:'ahmad',restaurant_id:rid,date,service:svc,heure_debut:deb,heure_fin:fin});

let ok=true;
function run(label, cre, cand, date, svc, di, expect, contraintes){
  global.S={creneaux:cre.filter(c=>c.restaurant_id===LOBAU), allCreneauxWeek:cre.slice(), dispos:[], miseAPied:[],
            contraintes:contraintes||[], restos:[{id:LOBAU,nom:'Raya Lobau'},{id:GC,nom:'Raya Grand Cœur'}]};
  const r=checkPlacement('ahmad',cand,date,svc,di,{manual:true});
  const got=r===null?'NULL':r.cle;
  const good = expect==='NULL' ? r===null : got===expect;
  console.log((good?'PASS':'FAIL')+' · '+label+' → '+got+(r&&r.label?'  ["'+r.label+'"]':'')+'  (attendu '+expect+')');
  ok=good&&ok; return good;
}

console.log('── fin_2h_pas_matin : la fermeture déclenchante est dans un AUTRE snack ───────────────');
// ⚠ Tous les cas de cette section reprennent le lendemain à 12:00 (et non 11:00) : après une fermeture
// à 01:00 cela laisse 11h de repos, donc AU NIVEAU du minimum légal. Sans cette précaution le refus
// viendrait de repos_quot et le harnais ne prouverait rien sur fin_2h_pas_matin. C'est exactement la
// confusion du patron : les deux règles se cumulent, mais ce sont bien deux règles distinctes.
// A. Fermeture 01:00 à Grand Cœur lundi → le midi de mardi à Lobau doit être refusé.
//    C'est le cas signalé par le patron : avant v0.57 la règle ne lisait que S.creneaux → passait.
run('Ferme 01:00 à GC lundi → midi mardi à Lobau refusé (repos 11h pourtant OK)',
  [at(GC,MON,'soir','18:00','01:00')], {deb:'12:00',fin:'15:00',role:'cuisine'}, TUE,'midi',1,'fin_2h_pas_matin');
// B. Sens inverse (symétrie) : le matin du lendemain est déjà posé AILLEURS, on pose la fermeture ici.
run('Midi mardi déjà posé à GC → fermeture 01:00 lundi à Lobau refusée',
  [at(GC,TUE,'midi','12:00','15:00')], {deb:'18:00',fin:'01:00',role:'cuisine'}, MON,'soir',0,'fin_2h_pas_matin');
// C. Le LIBELLÉ midi/soir de l'autre snack ne doit pas compter : un site dont la vague « midi » va de
//    16:00 à 01:00 ferme bien après minuit. Filtrer sur service==='soir' raterait ce cas.
run('Vague étiquetée « midi » à GC mais 16:00→01:00 → midi mardi refusé (libellé ignoré)',
  [at(GC,MON,'midi','16:00','01:00')], {deb:'12:00',fin:'15:00',role:'cuisine'}, TUE,'midi',1,'fin_2h_pas_matin');
// D. Contrôle négatif : fermeture à 23:30 (avant minuit) → autorisé.
run('Contrôle — ferme 23:30 à GC lundi → midi mardi autorisé',
  [at(GC,MON,'soir','18:00','23:30')], {deb:'12:00',fin:'15:00',role:'cuisine'}, TUE,'midi',1,'NULL');
// E. Contrôle négatif : la reprise à 15:00 n'est pas un « matin » (seuil F2H_MATIN_MIN).
run('Contrôle — ferme 01:00 à GC lundi → reprise 15:00 mardi autorisée',
  [at(GC,MON,'soir','18:00','01:00')], {deb:'15:00',fin:'20:00',role:'cuisine'}, TUE,'midi',1,'NULL');
// F. Non-régression MONO-snack : le même refus quand tout est sur le snack courant.
run('Mono — ferme 01:00 à Lobau lundi → midi mardi à Lobau refusé',
  [at(LOBAU,MON,'soir','18:00','01:00')], {deb:'12:00',fin:'15:00',role:'cuisine'}, TUE,'midi',1,'fin_2h_pas_matin');

console.log('\n── seuil RÉGLABLE de la fermeture tardive (fin_matin_seuil, défaut 00:30) ─────────────');
// Le patron ferme à minuit : en l'état d'avant, presque toutes ses fermetures interdisaient le lendemain
// midi alors que le repos légal était largement tenu. Le seuil par défaut est désormais 00:30, et le
// déclencheur est une fin STRICTEMENT postérieure.
run('Fermeture à MINUIT PILE → autorisé (c\'est la fermeture normale d\'un snack)',
  [at(GC,MON,'soir','18:00','00:00')], {deb:'12:00',fin:'15:00',role:'cuisine'}, TUE,'midi',1,'NULL');
run('Fermeture PILE au seuil (00:30) → autorisé (« postérieure à », pas « à partir de »)',
  [at(GC,MON,'soir','18:00','00:30')], {deb:'12:00',fin:'15:00',role:'cuisine'}, TUE,'midi',1,'NULL');
run('Une minute après le seuil (00:31) → refusé',
  [at(GC,MON,'soir','18:00','00:31')], {deb:'12:00',fin:'15:00',role:'cuisine'}, TUE,'midi',1,'fin_2h_pas_matin');
// Un établissement qui ferme à 2 h règle le seuil à sa main.
RAW.fin_matin_seuil={cle:'fin_matin_seuil',valeur:'02:00',active:true};
run('Seuil réglé à 02:00 — fermeture à 01:00 → autorisée',
  [at(GC,MON,'soir','18:00','01:00')], {deb:'12:00',fin:'15:00',role:'cuisine'}, TUE,'midi',1,'NULL');
// ⚠ Plus la fermeture est tardive, plus la reprise doit être tardive pour que les 11 h de repos soient
// TENUES — sinon c'est repos_quot qui sort en premier et on ne teste plus la bonne règle. La reprise
// reste sous 15:00, donc toujours un « matin » au sens de F2H_MATIN_MIN.
run('Seuil réglé à 02:00 — fermeture à 02:30, reprise 14:00 (repos 11h30) → refusée',
  [at(GC,MON,'soir','18:00','02:30')], {deb:'14:00',fin:'16:00',role:'cuisine'}, TUE,'midi',1,'fin_2h_pas_matin');
// Aucun plafond haut caché : avant v0.59 la règle s'arrêtait à 03:00 en dur. Avec un seuil réglable,
// ce plafond aurait fait un piège — régler 02:00 et voir une fin à 03:30 passer sans rien dire.
run('Seuil réglé à 02:00 — fermeture à 03:30, reprise 14:30 (repos 11h) → refusée (pas de plafond caché à 03:00)',
  [at(GC,MON,'soir','18:00','03:30')], {deb:'14:30',fin:'16:30',role:'cuisine'}, TUE,'midi',1,'fin_2h_pas_matin');
RAW={};
// La case à cocher continue de commander : décochée, plus aucun blocage quel que soit le seuil.
RULES_ON.fin_2h_pas_matin=false;
run('Règle décochée → même une fermeture à 02:00 n\'interdit plus le matin',
  [at(GC,MON,'soir','18:00','02:00')], {deb:'14:00',fin:'16:00',role:'cuisine'}, TUE,'midi',1,'NULL');
RULES_ON={};

console.log('\n── amplitude_max : les deux blocs sont sur des snacks DIFFÉRENTS ──────────────────────');
// G. GC 10:00→18:00 puis Lobau 18:00→23:00 = 13h consécutives > 12h.
//    ⚠ La coupure inter-snack (gap 0 < 3h) est évaluée AVANT l'amplitude et sort en premier : c'est
//    voulu, le motif doit être le même qu'en mono (cf. cas I). On mesure donc l'amplitude seule en
//    desserrant la coupure à 0 pour ce cas précis.
RULES.coupure_min=0;
run('GC 10:00→18:00 + Lobau 18:00→23:00 = 13h consécutives > 12h → amplitude_max',
  [at(GC,MON,'midi','10:00','18:00')], {deb:'18:00',fin:'23:00',role:'cuisine'}, MON,'soir',0,'amplitude_max');
// H. Contrôle négatif : même journée, mais 11h consécutives ≤ 12h.
run('Contrôle — GC 12:00→18:00 + Lobau 18:00→23:00 = 11h ≤ 12h → autorisé',
  [at(GC,MON,'midi','12:00','18:00')], {deb:'18:00',fin:'23:00',role:'cuisine'}, MON,'soir',0,'NULL');
RULES.coupure_min=3;
// I. Cohérence du motif : coupure rétablie, la MÊME journée renvoie coupure_min — et le mono aussi.
run('Motif identique inter-snack — GC 10:00→18:00 + Lobau 18:00→23:00 → coupure_min',
  [at(GC,MON,'midi','10:00','18:00')], {deb:'18:00',fin:'23:00',role:'cuisine'}, MON,'soir',0,'coupure_min');
run('Motif identique mono — Lobau 10:00→18:00 + Lobau 18:00→23:00 → coupure_min',
  [at(LOBAU,MON,'midi','10:00','18:00')], {deb:'18:00',fin:'23:00',role:'cuisine'}, MON,'soir',0,'coupure_min');

console.log('\n── jour_off_min : les jours travaillés sont répartis sur PLUSIEURS snacks ─────────────');
// J. 3 jours à GC (lun-mer) + 3 jours à Lobau (jeu-sam) = 6 jours. Le 7e (dimanche) laisserait 0 repos.
const six=[at(GC,D(0),'midi','11:00','15:00'),at(GC,D(1),'midi','11:00','15:00'),at(GC,D(2),'midi','11:00','15:00'),
           at(LOBAU,D(3),'midi','11:00','15:00'),at(LOBAU,D(4),'midi','11:00','15:00'),at(LOBAU,D(5),'midi','11:00','15:00')];
run('6 jours déjà travaillés (3 à GC + 3 à Lobau) → le 7e est refusé',
  six, {deb:'11:00',fin:'15:00',role:'cuisine'}, D(6),'midi',6,'jour_off_min');
// K. Contrôle négatif : 5 jours seulement → le 6e passe (1 jour de repos préservé).
run('Contrôle — 5 jours travaillés (3 à GC + 2 à Lobau) → le 6e est autorisé',
  six.slice(0,5), {deb:'11:00',fin:'15:00',role:'cuisine'}, D(5),'midi',5,'NULL');
// L. Deux jours de repos exigés : 5 jours posés → le 6e est refusé.
RULES.jour_off_min=2;
run('jour_off_min=2 — 5 jours travaillés sur 2 snacks → le 6e est refusé',
  six.slice(0,5), {deb:'11:00',fin:'15:00',role:'cuisine'}, D(5),'midi',5,'jour_off_min');
RULES.jour_off_min=1;

console.log('\n── règles déjà inter-snack : non-régression ───────────────────────────────────────────');
// M. repos quotidien — fermeture 00:00 à GC, reprise 08:00 le lendemain à Lobau = 8h < 11h.
run('repos_quot — GC ferme 00:00 lundi, Lobau ouvre 08:00 mardi (8h < 11h)',
  [at(GC,MON,'soir','18:00','00:00')], {deb:'08:00',fin:'12:00',role:'cuisine'}, TUE,'midi',1,'repos_quot');
// N. chevauchement horaire réel entre deux snacks.
run('inter_snack — GC 11:00→15:00 lundi, Lobau 14:00→18:00 le même jour',
  [at(GC,MON,'midi','11:00','15:00')], {deb:'14:00',fin:'18:00',role:'cuisine'}, MON,'midi',0,'inter_snack');
// O. plafond hebdo — 45h déjà posées à GC, +4h à Lobau = 49h > 48h.
const gc45=[0,1,2,3,4].map(i=>at(GC,D(i),'midi','09:00','18:00'));   // 5 × 9h = 45h
run('plafond — 45h posées à GC + 4h à Lobau = 49h > 48h',
  gc45, {deb:'11:00',fin:'15:00',role:'cuisine'}, D(5),'midi',5,'plafond');

console.log('\n── contraintes individuelles : la donnée déclenchante est dans un autre snack ─────────');
// P. « pas de coupure » : le midi est à GC, on tente le soir à Lobau.
run('contrainte pas_de_coupure — midi à GC, soir à Lobau le même jour',
  [at(GC,MON,'midi','11:00','15:00')], {deb:'19:00',fin:'23:00',role:'cuisine'}, MON,'soir',0,'c_pas_coupure',
  [{salarie_id:'ahmad',cle:'pas_de_coupure',valeur:'true',active:true}]);
// Q. « max 2 soirs / semaine » : les deux soirs déjà posés sont à GC.
run('contrainte max_soirs_semaine=2 — les 2 soirs déjà posés sont à GC',
  [at(GC,D(0),'soir','19:00','23:00'),at(GC,D(1),'soir','19:00','23:00')],
  {deb:'19:00',fin:'23:00',role:'cuisine'}, D(3),'soir',3,'c_max_soirs',
  [{salarie_id:'ahmad',cle:'max_soirs_semaine',valeur:'2',active:true}]);

console.log(ok?'\nALL PASS':'\nSOME FAILED');
process.exit(ok?0:1);

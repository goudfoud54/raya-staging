// v0.59 — RÉGLAGES SANS LIGNE EN BASE : l'écran doit les montrer, et le moteur appliquer LA MÊME valeur.
//
// Un réglage n'existant pas dans planning_regles était purement INVISIBLE dans l'écran Réglages, alors
// que le code l'interrogeait avec un défaut. C'était déjà le cas de `transfert_inter_snack`, que le
// rapport d'auto-fill invitait pourtant à décocher — introuvable pour le client. Depuis v0.59 une ligne
// VIRTUELLE (défauts de RULE_META) est affichée et créée en base au premier changement.
//
// Le risque introduit est la DÉRIVE : que le défaut affiché à l'écran diffère du défaut appliqué par le
// moteur. Le premier test le rend impossible en relisant les deux dans le fichier réel.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);   // RULE_META, _virtualRegle, _regleOf, F2H_SEUIL_DEF…
const {extractFn}=require("./extract.js");
for(const fn of ['_ruleCtx']){ try{ eval("global."+fn+"="+extractFn(h,fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); } }

let ok=true;
const t=(l,c,extra)=>{console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra==null?'':extra)));ok=c&&ok;};
const LOBAU='resto-lobau', GC='resto-gc';
global.SNACK={id:LOBAU,nom:'Raya Lobau'};   // restaurant AFFICHÉ : décide quelle exception s'applique
global.S={regles:[]};

console.log('── le défaut AFFICHÉ est le défaut APPLIQUÉ ────────────────────────────────────────────');
// Tous les appels `.on('cle', défaut)` du fichier réel : si la clé est décrite dans RULE_META, la ligne
// virtuelle DOIT porter le même état actif. Sinon l'écran montrerait une case cochée pendant que le
// moteur applique « décoché » — le piège « interface configurable jamais lue à l'exécution ».
{ const appels=[...h.matchAll(/\.on\('([a-z_0-9]+)',(true|false)\)/g)]
    .map(m=>({cle:m[1], def:m[2]==='true'}));
  const uniques=[...new Map(appels.map(a=>[a.cle,a])).values()];
  t('des appels .on() ont bien été trouvés dans le fichier', uniques.length>=6, uniques.length);
  const derives=[];
  for(const a of uniques){
    const v=_virtualRegle(a.cle);
    if(!v) continue;                       // clé hors RULE_META : l'appelant garde son propre défaut
    if(v.active!==a.def) derives.push(`${a.cle} : code=${a.def} / écran=${v.active}`);
  }
  t('aucune dérive entre le défaut du code et celui de RULE_META (' + (derives.join(' · ')||'aucune') + ')', derives.length===0);
  // Les clés absentes de RULE_META restent au défaut de l'appelant (pas de ligne virtuelle inventée).
  const horsMeta=uniques.filter(a=>!_virtualRegle(a.cle)).map(a=>a.cle);
  t('les clés hors RULE_META n\'ont pas de ligne virtuelle (' + (horsMeta.join(', ')||'aucune') + ')',
    horsMeta.every(c=>_virtualRegle(c)===null));
}
// Le seuil de la fermeture tardive est lu à DEUX endroits : le défaut du code (F2H_SEUIL_DEF, utilisé
// quand la ligne est absente) et defVal (affiché dans l'écran). Ils doivent être identiques.
t('fin_matin_seuil : defVal de l\'écran == F2H_SEUIL_DEF du moteur',
  RULE_META.fin_matin_seuil.defVal===F2H_SEUIL_DEF, RULE_META.fin_matin_seuil.defVal+' vs '+F2H_SEUIL_DEF);
t('… et vaut bien 00:30 (minuit pile ne déclenche rien)', F2H_SEUIL_DEF==='00:30', F2H_SEUIL_DEF);

console.log('\n── ligne virtuelle vs ligne réelle ─────────────────────────────────────────────────────');
global.S={regles:[]};
t('base VIDE — le seuil est quand même lisible', _ruleCtx().raw('fin_matin_seuil').valeur==='00:30');
t('base VIDE — sureffectif_minimum reste DÉSACTIVÉ (pas d\'activation rétroactive)',
  _ruleCtx().on('sureffectif_minimum',false)===false);
t('base VIDE — transfert_inter_snack reste DÉSACTIVÉ', _ruleCtx().on('transfert_inter_snack',false)===false);
t('base VIDE — fin_2h_pas_matin reste ACTIVÉE', _ruleCtx().on('fin_2h_pas_matin',true)===true);
t('base VIDE — une clé inconnue garde le défaut de l\'appelant',
  _ruleCtx().on('autofill_reparation',true)===true && _ruleCtx().on('cle_inexistante',false)===false);
t('base VIDE — _regleOf renvoie une ligne virtuelle sans id', (()=>{const r=_regleOf('fin_matin_seuil');return r&&r.id===null&&r._virtuel===true;})());
t('base VIDE — une clé hors RULE_META ne fabrique rien', _regleOf('cle_inexistante')===undefined||_regleOf('cle_inexistante')===null);

// Une vraie ligne en base l'emporte TOUJOURS sur le défaut.
global.S={regles:[{id:'r1',cle:'fin_matin_seuil',valeur:'02:00',active:true},
                  {id:'r2',cle:'sureffectif_minimum',valeur:'2',active:true}]};
t('ligne en base — le seuil réglé l\'emporte (02:00)', _ruleCtx().raw('fin_matin_seuil').valeur==='02:00');
t('ligne en base — sureffectif activé par le patron l\'emporte', _ruleCtx().on('sureffectif_minimum',false)===true);
t('ligne en base — _regleOf renvoie la ligne réelle (avec son id)', _regleOf('fin_matin_seuil').id==='r1');
t('ligne en base — les autres clés restent virtuelles', _regleOf('transfert_inter_snack')._virtuel===true);

console.log('\n── précédence : exception du restaurant > valeur par défaut de l\'organisation ──────────');
// Modèle v6.33 : restaurant_id NULL = défaut de l'organisation · renseigné = exception d'un restaurant.
// Sans arbitrage explicite, c'est l'ordre de retour de la base qui trancherait — et un client tenant une
// brasserie et un fast-food ne pourrait pas leur donner des règles différentes.
global.S={regles:[
  {id:'org', cle:'coupure_min', valeur:'3', active:true, restaurant_id:null},   // défaut organisation
  {id:'lob', cle:'coupure_min', valeur:'1', active:true, restaurant_id:LOBAU},  // exception Lobau
  {id:'gc',  cle:'coupure_min', valeur:'9', active:true, restaurant_id:GC},     // exception Grand Cœur
]};
t('sur Lobau, l\'exception de Lobau l\'emporte (1 h, pas 3 ni 9)', _ruleCtx().num('coupure_min',3)===1, _ruleCtx().num('coupure_min',3));
global.SNACK={id:GC,nom:'Raya Grand Cœur'};
t('sur Grand Cœur, c\'est SON exception qui s\'applique (9 h)', _ruleCtx().num('coupure_min',3)===9, _ruleCtx().num('coupure_min',3));
global.SNACK={id:'resto-sans-exception'};
t('sur un restaurant sans exception, retour au défaut de l\'organisation (3 h)', _ruleCtx().num('coupure_min',3)===3, _ruleCtx().num('coupure_min',3));
t('… et _regleOf renvoie bien la ligne « défaut organisation »', _regleOf('coupure_min').id==='org');
// Une exception peut aussi DÉSACTIVER une règle sur un seul site.
global.SNACK={id:LOBAU};
global.S={regles:[{id:'org',cle:'fin_2h_pas_matin',active:true,valeur:'true',restaurant_id:null},
                  {id:'lob',cle:'fin_2h_pas_matin',active:false,valeur:'true',restaurant_id:LOBAU}]};
t('une exception peut désactiver la règle sur un seul restaurant', _ruleCtx().on('fin_2h_pas_matin',true)===false);
global.SNACK={id:GC};
t('… sans affecter les autres', _ruleCtx().on('fin_2h_pas_matin',true)===true);
global.SNACK={id:LOBAU,nom:'Raya Lobau'};

console.log('\n── ce que l\'écran Réglages doit lister ────────────────────────────────────────────────');
// L'écran construit sa liste depuis Object.keys(RULE_META) ∪ les clés en base. On vérifie ici que les
// deux réglages qui étaient introuvables sont bien décrits et résolubles, base vide comprise.
global.S={regles:[]};
for(const cle of ['fin_matin_seuil','transfert_inter_snack']){
  t(`« ${cle} » est décrit dans RULE_META`, !!RULE_META[cle], Object.keys(RULE_META).join(','));
  t(`… et donne une ligne affichable même sans ligne en base`, !!_regleOf(cle));
  t(`… avec un libellé en français`, typeof RULE_META[cle].lbl==='string' && RULE_META[cle].lbl.length>10, RULE_META[cle].lbl);
  t(`… et une aide qui explique quoi en faire`, typeof RULE_META[cle].help==='string' && RULE_META[cle].help.length>40);
}
// Une clé présente en base mais inconnue du code doit rester visible (on ne masque jamais un réglage
// existant : le patron l'a peut-être réglé, et le faire disparaître serait un échec silencieux).
global.S={regles:[{id:'x',cle:'regle_ancienne',valeur:'7',active:true}]};
{ const cles=[...new Set([...Object.keys(RULE_META), ...S.regles.map(r=>r.cle)])];
  t('une règle en base inconnue de RULE_META reste listée', cles.includes('regle_ancienne')); }

console.log(ok?'\nALL PASS':'\nSOME FAILED');
process.exit(ok?0:1);

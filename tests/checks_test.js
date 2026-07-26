const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
function grab(name){const re=new RegExp("(?:async\\s+)?function "+name+"\\s*\\(");const i=h.search(re);if(i<0)throw"no "+name;let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
function gc(n){const m=h.match(new RegExp("const "+n+"\\s*=[^\\n]*"));return m?m[0].replace(/^const/,'var'):null;}
eval(gc("_pmin"));
global.fmtDate=d=>{const x=new Date(d);return x.toISOString().slice(0,10);};
global.MONDAY=new Date('2026-08-03T00:00:00');
eval("global.onRoster="+grab("onRoster").replace(/^function/,'function')+";");
eval("global.getShifts="+grab("getShifts").replace(/^function/,'function')+";");
eval("global.expUncoveredPosts="+grab("expUncoveredPosts").replace(/^function/,'function')+";");
eval("global._creCoversMin="+grab("_creCoversMin").replace(/^function/,'function')+";");
eval(gc("roleNiveau")); eval(gc("isExp"));
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.dayJourType=i=>{if(i<=2)return 'Lu-Me';if(i===3)return 'Je';if(i===4)return 'Ve';if(i===5)return 'Sa';return 'Di';};
const GC='gc';
global.SNACK={id:GC};
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};

// ===== BUG 1 : salariés sortis exclus de `list` =====
global.S={roles:[],
  salaries:[
    {id:'active',nom:'Active',heures_min:35,actif:true,snack_origine_id:GC},
    {id:'riad',nom:'RIAD',heures_min:35,actif:false,date_sortie:'2026-07-13',snack_origine_id:GC},   // sorti avant S32
    {id:'alamin',nom:'ALAMIN',heures_min:35,actif:false,date_sortie:'2026-06-15',snack_origine_id:GC} // sorti avant S32
  ], effectifs:[], orgRoles:[]};
const listOld=S.salaries.filter(s=>worksAt(s,SNACK.id));                 // ancien (bug)
const listNew=S.salaries.filter(s=>onRoster(s)&&worksAt(s,SNACK.id));    // corrigé
console.log('  BUG1 old:',listOld.map(s=>s.nom).join(','),' | new:',listNew.map(s=>s.nom).join(','));
t('sortis (RIAD, ALAMIN) exclus de la liste checks (min/plafond/off)', listNew.length===1 && listNew[0].id==='active' && !listNew.some(s=>s.id==='riad'||s.id==='alamin'));
t('ancien code (sans onRoster) les incluait bien (reproduit le bug)', listOld.length===3);

// ===== BUG 2 : matching exp tolérant à la rallonge =====
// Effectif jeudi (Je) midi caisse : 1 vague EXP requise 10:30→18:00
global.S.effectifs=[{restaurant_id:GC,jour_type:'Je',service:'midi',role:'caisse',vagues:[{deb:'10:30',fin:'18:00',exp:true}]}];
// Cali : expérimentée caisse (salarie_roles niveau experimente)
global.S.roles=[{salarie_id:'cali',role:'caisse',niveau:'experimente'}];
// (Je = index 3)
const jt='Je', svc='midi', role='caisse';
// Cas A : Cali placée 10:00→18:00 (rallonge phase 3 : début avancé) → couvre le poste 10:30
let assigned=[{salarie_id:'cali',role:'caisse',heure_debut:'10:00',heure_fin:'18:00'}];
let unc=expUncoveredPosts(assigned,jt,svc,role);
console.log('  BUG2-A uncovered:',unc.length);
t('Cali 10:00→18:00 (rallongée) COUVRE le poste exp 10:30 → 0 non-couvert (bug corrigé)', unc.length===0);
// Cas B : Cali placée pile 10:30→18:00 (non-régression égalité)
assigned=[{salarie_id:'cali',role:'caisse',heure_debut:'10:30',heure_fin:'18:00'}];
t('Cali 10:30→18:00 (pile) → toujours couvert', expUncoveredPosts(assigned,jt,svc,role).length===0);
// Cas C : poste exp tenu par un NON-expérimenté → toujours signalé (régression préservée)
global.S.roles=[{salarie_id:'bob',role:'caisse',niveau:'nouveau'}];
assigned=[{salarie_id:'bob',role:'caisse',heure_debut:'10:00',heure_fin:'18:00'}];
unc=expUncoveredPosts(assigned,jt,svc,role);
const held=assigned.some(x=>_creCoversMin(x,_pmin('10:30')));
console.log('  BUG2-C uncovered:',unc.length,' heldByNonExp:',held);
t('poste exp tenu par un NON-exp → signalé (1 non couvert, tenu par non-exp)', unc.length===1 && held===true);
// Cas D : poste exp VACANT (personne) → signalé, non tenu
t('poste exp vacant → signalé, pas « tenu par non-exp »', expUncoveredPosts([],jt,svc,role).length===1 && !([].some(x=>_creCoversMin(x,630))));
// Cas E : 2 postes exp à 10:30, 1 seul expérimenté présent (couvre) → 1 non couvert (glouton : 1 exp = 1 poste)
global.S.effectifs=[{restaurant_id:GC,jour_type:'Je',service:'midi',role:'caisse',vagues:[{deb:'10:30',fin:'18:00',exp:true},{deb:'10:30',fin:'18:00',exp:true}]}];
global.S.roles=[{salarie_id:'cali',role:'caisse',niveau:'experimente'}];
assigned=[{salarie_id:'cali',role:'caisse',heure_debut:'10:00',heure_fin:'18:00'}];
unc=expUncoveredPosts(assigned,jt,svc,role);
console.log('  BUG2-E uncovered:',unc.length);
t('2 postes exp, 1 exp présent → 1 seul couvert (glouton) → 1 restant signalé', unc.length===1);

console.log(ok?'\nALL PASS':'\nSOME FAILED');

// AUDIT LECTURE SEULE — ce que la réparation par déplacement (v0.68) change sur la SEMAINE RÉELLE.
//
// Le patron demandait : « Comparer l'auto-fill avant et après sur la semaine réelle : combien de postes
// en moins, combien d'heures en plus, et à qui. C'est ce tableau qui dira si la réparation est un gain
// ou une agitation. »
//
// MÉTHODE. On rejoue le VRAI autoFillCore, extrait du fichier réel (jamais une réplique), sur la
// configuration RÉELLE de l'organisation « Groupe Raya » : 3 restaurants, leurs postes, leurs salariés
// avec rôles / priorités / minimums / plafonds, les indisponibilités, les jours d'école CFA, les mises à
// pied et les réglages tels qu'ils sont en base. Deux passes sur EXACTEMENT les mêmes données :
//
//   AVANT — le vivier de la réparation est restreint au snack courant (comportement v0.67) ;
//   APRÈS — le vivier est la semaine entière, tous restaurants (v0.68).
//
// Le solveur est déterministe (ordre MRV puis tri déterministe des candidats, cf. autoFillMultiWeek) :
// à données identiques, l'écart observé est bien imputable au seul changement de vivier.
//
// AUCUNE ÉCRITURE. La base n'est jamais touchée : le stub d'écriture est en mémoire, comme les harnais.
//
// LE JEU DE DONNÉES N'EST PAS VERSIONNÉ (salariés réels, indisponibilités, procédures disciplinaires).
// Pour le régénérer, exécuter en LECTURE SEULE sur ynnqvtfayrdteqtgxeuk la requête décrite plus bas et
// enregistrer le JSON obtenu, puis :
//     node scripts/audit_reparation_prod.js [chemin/vers/prod_week.json] [AAAA-MM-JJ du lundi]
//
// Requête (une seule, renvoie l'objet complet) :
//   select json_build_object(
//     'restos',   (… restaurants: id, nom …),
//     'orgRoles', (… org_roles actifs: cle, nom, ordre …),
//     'sal',      (… salaries: id, nom, prenom, actif, date_sortie, heures_min, heures_max,
//                    plafond_heures, taux_horaire_brut, coef_charges_perso, est_multi,
//                    snack_origine_id, snacks_priorites, est_alternant …),
//     'roles',    (… salarie_roles: salarie_id, role, niveau …),
//     'eff',      (… planning_effectifs: restaurant_id, jour_type, service, role, nb_cible,
//                    nb_experimentes, vagues …),
//     'regles',   (… planning_regles: id, cle, valeur, active, restaurant_id …),
//     'dispos',   (… salarie_dispos …),
//     'contraintes', (… salarie_contraintes …),
//     'cre',      (… planning_creneaux de la semaine …),
//     'alt',      (… alternance_jours de la semaine …),
//     'mad',      (… disciplinary_actions avec mise_a_pied_debut …)
//   );
const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const h=fs.readFileSync(path.join(ROOT,'planning/index.html'),'utf8');
const P=require(path.join(ROOT,'tests/plprims.js'));
P.installPlanningPrims(h);
const {extractFn}=require(path.join(ROOT,'tests/extract.js'));

const SRC=process.argv[2]||'/tmp/prod_week.json';
const LUNDI=process.argv[3]||'2026-09-14';
if(!fs.existsSync(SRC)){
  console.error(`\nJeu de données absent : ${SRC}\n\nIl n'est pas versionné (données de salariés réels). Voir l'en-tête de ce fichier pour le régénérer.\n`);
  process.exit(2);
}
const D=JSON.parse(fs.readFileSync(SRC,'utf8'));

// ── Environnement d'exécution (même socle que tests/reparation_test.js) ──────────────────────────
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO");
  eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); }
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
for(const fn of ['_toMin','overlaps','_overlap','targetFor','_indispoBlocking','_endCapMin','_ruleCtx',
                 'isMultiSnack','weekMinutesOf','weekHoursOf','snackPrioriteOf','hoursOnMorePrioritaryRestos',
                 'snackPriorityGate','sureffBlockedByPriority','sortCandidates','plafondOf','getShifts',
                 'getCreneau','_creCoversMin','hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement',
                 'dayJourType','removeCreneau','autoFillCore','explainViolation','revalidateWeek',
                 '_contrainteBlocking','contrOf','snackTargetSlots']){
  try{ eval("global."+fn+"="+extractFn(h,fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j;
  for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}
  eval("global.PLACE_RULES="+h.slice(st,j)+";"); }
{ const m=h.match(/const _JOURS_IDX=[\s\S]*?const _truthyContr=[^\n]*/);
  if(m) eval(m[0].replace(/const /g,'var ')+';global._JOURS_IDX=_JOURS_IDX;global._truthyContr=_truthyContr;'); }

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
let _ERRS=0;
global.setSS=(k,m)=>{if(k==='err'){_ERRS++;console.error('>>> ERR:',m);}};global._yield=()=>Promise.resolve();
global.showAutofillOverlay=()=>{};global.hideAutofillOverlay=()=>{};global.updateAutofillProgress=()=>{};global.showSolveReport=()=>{};global._afMulti=null;
global.beginTxn=()=>{global._txn=[];};global.endTxn=()=>{global._txn=null;};global.recordAction=()=>{};global.updateUndoBtns=()=>{};global._txn=null;global._autofillRunning=false;
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.MONDAY=new Date(LUNDI+'T00:00:00'); global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.ORG={coef_charges:1.42};
global.escP=s=>(''+(s==null?'':s));global.escJS=s=>(''+(s==null?'':s));
global.fullName=s=>[s.prenom,s.nom].filter(Boolean).join(' ')||s.nom||'?';
const SAL={}; (D.sal||[]).forEach(s=>SAL[s.id]=s);
global.salById=id=>SAL[id];
const ROLES={}; (D.roles||[]).forEach(r=>{ (ROLES[r.salarie_id]=ROLES[r.salarie_id]||[]).push(r); });
global.rolesOf=id=>[...new Set((ROLES[id]||[]).map(r=>r.role))];
global.isExp=(id,cle)=>((ROLES[id]||[]).find(r=>r.role===cle)||{}).niveau==='experimente';
global.roleNom=c=>((D.orgRoles||[]).find(r=>r.cle===c)||{}).nom||c;
global.onRoster=s=>{ if(!s||s.actif===false) return false;
  if(s.date_sortie && s.date_sortie < fmtDate(MONDAY)) return false; return true; };
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.altDayType=(sid,date)=>((D.alt||[]).find(a=>a.salarie_id===sid&&a.date===date)||{}).type||null;
global.loadWeek=async()=>{S.creneaux=STORE.filter(c=>c.restaurant_id===SNACK.id).map(clone);S.allCreneauxWeek=STORE.map(clone);};

const WEEK=[0,1,2,3,4,5,6].map(i=>fmtDate(dateOfDay(i)));
const RESTOS=D.restos||[];

// Séquence de traitement IDENTIQUE à autoFillMultiWeek : le plus contraint d'abord (déterministe).
// Calculé UNE FOIS, avant toute génération : snackTargetSlots lit S.effectifs, et l'appeler au milieu
// d'une boucle écraserait le S de la génération en cours (l'erreur a été faite, et elle est silencieuse
// — autoFillCore avale l'exception et rend un bilan à zéro qui ressemble à « rien à faire »).
global.S={effectifs:D.eff||[]};
const ORDRE=RESTOS.map(r=>r.id).slice().sort((a,b)=>snackTargetSlots(b)-snackTargetSlots(a));

// Une génération complète dans l'ordre réel. `restreint` rejoue le vivier v0.67 (snack courant).
// `depart` : [] = semaine vide (comparaison à configuration égale) · D.cre = la semaine TELLE QU'ELLE
// EST aujourd'hui, ce que le patron obtiendrait en cliquant maintenant.
async function generer(restreint, depart){
  STORE=(depart||[]).map(c=>clone(c)); _id=1;
  global.S={restos:RESTOS,salaries:D.sal||[],orgRoles:D.orgRoles||[],
    dispos:D.dispos||[],miseAPied:D.mad||[],contraintes:D.contraintes||[],derogations:[],
    regles:D.regles||[],effectifs:D.eff||[],creneaux:[],allCreneauxWeek:STORE.map(clone)};
  global.SNACK=RESTOS[0];
  _AF.posed.clear(); _AF.origineCol=false;
  const VRAI=global.movablePool;
  if(restreint) global.movablePool=(dates,posed)=>VRAI(dates,posed).filter(p=>p.row.restaurant_id===SNACK.id);
  const bilan={postes:[], chaines:[], suggList:[], sugg:0, budget:0};
  try{
    for(const rid of ORDRE){
      global.SNACK=RESTOS.find(r=>r.id===rid);
      await loadWeek();
      const r=await autoFillCore([0,1,2,3,4,5,6],{silent:true, distribute:false})||{};
      (r.report||[]).forEach(x=>bilan.postes.push({...x,snack:SNACK.nom}));
      ((r.chain||{}).list||[]).forEach(c=>bilan.chaines.push(c));
      bilan.sugg+=((r.chain||{}).suggest||[]).length;
      ((r.chain||{}).suggest||[]).forEach(c=>bilan.suggList.push(c));
      bilan.budget+=(r.chain||{}).budget||0;
    }
  } finally { global.movablePool=VRAI; }
  bilan.store=STORE.map(clone);
  return bilan;
}

const heuresPar=store=>{ const m={}; for(const c of store){ if(!c.heure_debut||!c.heure_fin)continue;
  m[c.salarie_id]=(m[c.salarie_id]||0)+_pdur(c.heure_debut,c.heure_fin)/60; } return m; };
const coutDe=store=>store.reduce((a,c)=>{ const s=SAL[c.salarie_id]||{};
  const cp=Number(s.coef_charges_perso), coef=(isFinite(cp)&&cp>0)?cp:1.42;
  return a+(_pdur(c.heure_debut,c.heure_fin)/60)*(Number(s.taux_horaire_brut)||0)*coef; },0);
const fh=x=>(Math.round(x*10)/10).toString().replace('.',',');

(async()=>{
  console.log(`\nAUTO-FILL AVANT / APRÈS — org « Groupe Raya », semaine du ${LUNDI}`);
  console.log(`${RESTOS.length} restaurants · ${(D.sal||[]).filter(onRoster).length} salariés sur l'effectif · ${(D.eff||[]).length} lignes d'effectif · ${(D.dispos||[]).length} disponibilités\n`);

  const t0=Date.now(); const AV=await generer(true, []);  const tAv=Date.now()-t0;
  const t1=Date.now(); const AP=await generer(false, []); const tAp=Date.now()-t1;
  // Un bilan à zéro ressemble à « rien à faire » alors qu'il peut vouloir dire « tout a planté ».
  if(_ERRS){ console.error(`\n⛔ ${_ERRS} erreur(s) pendant la génération — les chiffres ci-dessous ne veulent rien dire.\n`); process.exit(1); }
  if(!AP.store.length){ console.error('\n⛔ Aucun créneau produit : configuration ou jeu de données incomplet.\n'); process.exit(1); }

  const hAv=heuresPar(AV.store), hAp=heuresPar(AP.store);
  const cAv=coutDe(AV.store), cAp=coutDe(AP.store);
  const totAv=Object.values(hAv).reduce((a,b)=>a+b,0), totAp=Object.values(hAp).reduce((a,b)=>a+b,0);

  console.log('┌──────────────────────────────┬───────────┬───────────┬──────────┐');
  console.log('│                              │   AVANT   │   APRÈS   │   écart  │');
  console.log('├──────────────────────────────┼───────────┼───────────┼──────────┤');
  const L=(l,a,b,f)=>console.log('│ '+l.padEnd(28)+' │ '+String(f?f(a):a).padStart(9)+' │ '+String(f?f(b):b).padStart(9)+' │ '+String(f?f(b-a):(b-a>0?'+':'')+(b-a)).padStart(8)+' │');
  L('postes non comblés', AV.postes.length, AP.postes.length);
  L('créneaux posés', AV.store.length, AP.store.length);
  L('heures totales', totAv, totAp, x=>fh(x)+' h');
  L('coût chargé', cAv, cAp, x=>Math.round(x)+' €');
  L('réparations exécutées', AV.chaines.length, AP.chaines.length);
  L('enchaînements suggérés', AV.sugg, AP.sugg);
  L('trous non cherchés (budget)', AV.budget, AP.budget);
  L('durée de génération', tAv, tAp, x=>x+' ms');
  console.log('└──────────────────────────────┴───────────┴───────────┴──────────┘\n');

  if(AP.chaines.length){
    console.log('LES DÉPLACEMENTS, UN PAR UN :');
    AP.chaines.forEach(c=>console.log(`  • ${String(c.snack).replace('Raya ','')} · ${c.jour} ${c.svc} · ${c.role} ${c.horaire}\n`
      +`      ← ${c.xNom} vient de ${c.fromSnack} (${c.fromJour} ${c.fromSvc} ${c.fromHoraire})\n`
      +`      → ${c.yNom} reprend sa place`));
    console.log('');
  }

  const noms=[...new Set([...Object.keys(hAv),...Object.keys(hAp)])];
  const bouge=noms.map(id=>({id, nom:fullName(SAL[id]||{}), av:hAv[id]||0, ap:hAp[id]||0}))
                  .filter(x=>Math.abs(x.ap-x.av)>0.01)
                  .sort((a,b)=>(b.ap-b.av)-(a.ap-a.av));
  if(bouge.length){
    console.log('QUI GAGNE / QUI PERD DES HEURES :');
    bouge.forEach(x=>{ const s=SAL[x.id]||{};
      const min=Number(s.heures_min)||0, max=Number(s.heures_max||s.plafond_heures)||48;
      const d=x.ap-x.av;
      console.log(`  ${(d>0?'+':'')+fh(d)} h  ${x.nom.padEnd(26)} ${fh(x.av)} h → ${fh(x.ap)} h   (min ${min} h · plafond ${max} h)${x.ap>max+0.01?'   ⚠ AU-DESSUS DU PLAFOND':''}`);
    });
    console.log('');
  } else console.log('Aucun salarié ne change d\'heures.\n');

  // Le contrôle qui compte : le planning produit APRÈS est-il conforme ? On rejoue la revalidation
  // complète (le même checkPlacement, dans le contexte de chaque restaurant).
  STORE=AP.store.map(clone);
  global.S={restos:RESTOS,salaries:D.sal||[],orgRoles:D.orgRoles||[],dispos:D.dispos||[],miseAPied:D.mad||[],
    contraintes:D.contraintes||[],derogations:[],regles:D.regles||[],effectifs:D.eff||[],
    creneaux:[],allCreneauxWeek:STORE.map(clone)};
  global.SNACK=RESTOS[0];
  const rev=revalidateWeek();
  console.log(`CONFORMITÉ DU PLANNING PRODUIT (APRÈS) : ${rev.infractions.length} infraction(s)`);
  rev.infractions.slice(0,15).forEach(i=>console.log(`   ⛔ ${i.phrase||i.detail||i.cle}`));
  if(rev.infractions.length>15) console.log(`   … et ${rev.infractions.length-15} autres`);

  // Doublons de case : un total juste ne prouve pas un détail juste.
  const k=new Set(); let dbl=0;
  for(const c of AP.store){ const key=[c.restaurant_id,c.salarie_id,c.date,c.service].join('|'); if(k.has(key))dbl++; k.add(key); }
  console.log(`Doublons (même restaurant / salarié / jour / service) : ${dbl}`);

  // ── HONNÊTETÉ SUR LES € ────────────────────────────────────────────────────────────────────────
  const sansTaux=(D.sal||[]).filter(s=>onRoster(s) && !(Number(s.taux_horaire_brut)>0));
  if(sansTaux.length) console.log(`\n⚠ ${sansTaux.length} salarié(s) sur l'effectif n'ont AUCUN taux horaire en base : `
    +`tout chiffrage en € ci-dessus (et dans l'application) les compte à 0 €. Ce n'est pas « gratuit », c'est « inconnu ».`);

  // ── LA SEMAINE TELLE QU'ELLE EST ───────────────────────────────────────────────────────────────
  // La comparaison ci-dessus part d'une semaine VIDE : c'est la seule façon de comparer deux solveurs
  // à configuration égale. Mais ce n'est pas ce que le patron obtiendra en cliquant 🎲 aujourd'hui :
  // sa semaine contient déjà des créneaux, dont l'origine est INCONNUE (antérieurs à la colonne). Ils
  // ne seront donc pas déplacés — seulement proposés. C'est le chiffre qui le concerne vraiment.
  const REEL=await generer(false, D.cre||[]);
  console.log(`\n\nSUR LA SEMAINE TELLE QU'ELLE EST (${(D.cre||[]).length} créneaux déjà en base, origine inconnue) :`);
  console.log(`   ${REEL.postes.length} poste(s) resteraient non comblés · ${REEL.chaines.length} déplacement(s) exécuté(s) · ${REEL.sugg} enchaînement(s) PROPOSÉ(S)`);
  if(REEL.sugg) console.log(`   → ces ${REEL.sugg} propositions demandent son accord : les créneaux à libérer ne portent pas encore la marque « posé par l'auto-fill ».`);
  if(REEL.suggList && REEL.suggList.length){
    console.log('\n   LES ENCHAÎNEMENTS PROPOSÉS :');
    REEL.suggList.forEach(c=>console.log(`     • ${String(c.snack).replace('Raya ','')} · ${c.jour} ${c.svc} · ${c.role} ${c.horaire}`
      +`\n         ← ${c.xNom} depuis ${c.fromSnack} (${c.fromJour} ${c.fromSvc} ${c.fromHoraire}) · → ${c.yNom} reprend`));
  }
  if(REEL.postes.length){
    console.log('\n   LES POSTES QUI RESTERAIENT VIDES :');
    REEL.postes.forEach(x=>console.log(`     ⚠ ${String(x.snack).replace('Raya ','')} · ${x.jour} ${x.svc} · ${x.role} ${x.horaire} — ${x.detail}`));
  }

  // Et si la semaine avait été générée APRÈS la migration ? On rejoue à l'identique en marquant les
  // créneaux existants comme « posés par l'auto-fill » : c'est le régime de croisière, une fois la
  // colonne `origine` en place et une génération passée dessus.
  const CROISIERE=await generer(false, (D.cre||[]).map(c=>({...c,origine:'auto'})));
  console.log(`\n\nEN RÉGIME DE CROISIÈRE (mêmes données, créneaux marqués « posés par l'auto-fill ») :`);
  console.log(`   ${CROISIERE.postes.length} poste(s) non comblés (contre ${REEL.postes.length}) · ${CROISIERE.chaines.length} déplacement(s) exécuté(s) automatiquement`);
  CROISIERE.chaines.forEach(c=>console.log(`     • ${String(c.snack).replace('Raya ','')} · ${c.jour} ${c.svc} · ${c.role} ${c.horaire} ← ${c.xNom} depuis ${c.fromSnack} (${c.fromJour} ${c.fromSvc}) · → ${c.yNom} reprend`));
  CROISIERE.postes.forEach(x=>console.log(`     ⚠ reste vide : ${String(x.snack).replace('Raya ','')} · ${x.jour} ${x.svc} · ${x.role} — ${x.detail}`));
  { const hR=heuresPar(REEL.store), hC=heuresPar(CROISIERE.store);
    const ids=[...new Set([...Object.keys(hR),...Object.keys(hC)])];
    const mv=ids.map(id=>({nom:fullName(SAL[id]||{}), s:SAL[id]||{}, av:hR[id]||0, ap:hC[id]||0}))
                .filter(x=>Math.abs(x.ap-x.av)>0.01).sort((a,b)=>(b.ap-b.av)-(a.ap-a.av));
    console.log('\n   QUI GAGNE / QUI PERD DES HEURES (régime de croisière vs aujourd\'hui) :');
    if(!mv.length) console.log('     personne');
    mv.forEach(x=>{ const min=Number(x.s.heures_min)||0, max=Number(x.s.heures_max||x.s.plafond_heures)||48;
      console.log(`     ${((x.ap-x.av)>0?'+':'')+fh(x.ap-x.av)} h  ${x.nom.padEnd(26)} ${fh(x.av)} h → ${fh(x.ap)} h   (min ${min} h · plafond ${max} h)${x.ap>max+0.01?'   ⚠ AU-DESSUS DU PLAFOND':''}`); });
    const dC=coutDe(CROISIERE.store)-coutDe(REEL.store);
    console.log(`\n   Coût de la semaine : ${Math.round(coutDe(REEL.store))} € → ${Math.round(coutDe(CROISIERE.store))} € chargé (${dC>=0?'+':''}${Math.round(dC)} €)`); }
  console.log('');
})().catch(e=>{console.error(e);process.exit(1);});

// AUDIT LECTURE SEULE — impact de v0.73 (« multi-snack selon la réalité ») sur le planning EXISTANT.
//
// Rejoue, sur les créneaux réels d'une semaine, les VRAIES fonctions de planning/index.html dans DEUX
// versions — l'ancienne (v0.72, fichier passé en argument, tiré de git) et l'actuelle — puis compare :
//   1. le plafond hebdo de checkPlacement, créneau par créneau (excludeSelf, comme la revalidation) ;
//   2. la colonne Heures (rowHoursCell : couleur + ligne Σ) de chaque salarié, sur chaque snack ;
//   3. le panneau Vérifications (renderChecks), ligne par ligne, sur chaque snack.
//
// Limites assumées : réglages du planning = valeurs par défaut du code (planning_regles non chargé),
// aucune indispo / contrainte / rôle configuré → seules les règles d'heures et de repos sont jugées.
//
// Usage (jeu de données NON versionné — salariés réels) :
//   git show <commit v0.72>:planning/index.html > /chemin/planning_v072.html
//   node scripts/audit_multisnack_reel.js /chemin/semaine.json /chemin/planning_v072.html
// semaine.json = {cre:[[salarie_id,restaurant_id,date,service,deb,fin,role]…], sal:[fiches…]}, lu en
// LECTURE SEULE sur ynnqvtfayrdteqtgxeuk (planning_creneaux + salaries de l'organisation).
const fs=require('fs'), path=require('path'), {execFileSync}=require('child_process');

if(process.argv[2]==='--run'){            // ── mode « une version » (appelé deux fois par le mode principal)
  const h=fs.readFileSync(process.argv[3],'utf8'), P=JSON.parse(fs.readFileSync(process.argv[4],'utf8'));
  require(path.join(__dirname,'..','tests/plprims.js')).installPlanningPrims(h);
  const {extractFn}=require(path.join(__dirname,'..','tests/extract.js'));
  for(const k of ['_pmin','_pdur','fmtH1']) eval('global.'+k+'='+h.match(new RegExp('const '+k+'\\s*=([^\\n]*)'))[1].replace(/;$/,'')+';');
  for(const fn of ['_toMin','overlaps','_overlap','isMultiSnack','weekMinutesOf','weekHoursOf','otherSnackBreakdown','worksAt','plafondOf','rowHoursCell','renderChecks',
                   'restosTravaillesOf','estMultiDeFait','snacksHorsFiche','contrOf'])
    try{ eval('global.'+fn+'='+extractFn(h,fn)+';'); }catch(e){ /* absente de v0.72 : normal pour les nouveaux helpers */ }
  global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
  global.MONDAY=new Date('2026-11-16T00:00:00'); global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
  global._ruleCtx=()=>({num:(k,d)=>d, raw:()=>null, on:(k,d)=>d});
  global.escP=s=>''+(s==null?'':s);
  global.onRoster=s=>!!s && (s.date_sortie ? s.date_sortie>='2026-11-16' : s.actif!==false);
  global.targetFor=()=>({}); global.dayJourType=()=>'semaine'; global.getShifts=()=>[]; global.capCoverageGaps=()=>[];
  global.JOUR_TYPE_LABELS={}; global._contrainteBlocking=()=>null;
  let html=''; global.document={getElementById:()=>({set innerHTML(v){html=v;}})};
  const RESTOS=[...new Set(P.cre.map(c=>c[1]))];
  const ALL=P.cre.map(([salarie_id,restaurant_id,date,service,heure_debut,heure_fin,role])=>({salarie_id,restaurant_id,date,service,heure_debut,heure_fin,role}));
  const SAL=P.sal.map(s=>({...s, heures_min:Number(s.heures_min)||0, heures_max:Number(s.heures_max)||0, plafond_heures:Number(s.plafond_heures)||0}));
  global.salById=id=>SAL.find(s=>s.id===id);
  const nom=s=>[s.prenom,s.nom].filter(Boolean).join(' ')||s.nom;
  const out={plafond:[], cell:{}, checks:{}};
  for(const rid of RESTOS){
    global.SNACK={id:rid, nom:'R'};
    global.S={allCreneauxWeek:ALL, creneaux:ALL.filter(c=>c.restaurant_id===rid), salaries:SAL, dispos:[], miseAPied:[],
              contraintes:[], orgRoles:[], restos:P.restos||RESTOS.map(id=>({id,nom:id}))};
    // 1. plafond, créneau par créneau de CE snack (même calcul que checkPlacement : excludeSelf + durée > plafond)
    for(const c of S.creneaux){
      const s=salById(c.salarie_id); if(!s) continue;
      const wk=weekMinutesOf(c.salarie_id,{excludeSelf:true,date:c.date,svc:c.service,restaurant_id:rid});
      if(wk+_pdur(c.heure_debut,c.heure_fin) > plafondOf(s)*60+1e-6) out.plafond.push(`${nom(s)} ${c.date} ${c.service} @${rid.slice(0,4)}`);
    }
    // 2. colonne Heures des salariés présents sur la grille de ce snack
    const sids=new Set(S.creneaux.map(c=>c.salarie_id));
    SAL.filter(s=>onRoster(s) && (worksAt(s,rid)||sids.has(s.id))).forEach(s=>{
      const r=rowHoursCell(s); const sig=(r.html.match(/Σ ([\d,.]+)h/)||[])[1]||'';
      out.cell[rid.slice(0,4)+' '+nom(s)]=`${r.color.replace('var(--','').replace(')','')}${sig?' Σ'+sig:''}`;
    });
    // 3. panneau Vérifications
    global.CHECKS=[]; renderChecks();
    CHECKS.forEach(ch=>ch.details.forEach(d=>{ (out.checks[rid.slice(0,4)+' · '+ch.lbl.replace(/\d+/g,'n')]=out.checks[rid.slice(0,4)+' · '+ch.lbl.replace(/\d+/g,'n')]||[]).push(d); }));
  }
  process.stdout.write(JSON.stringify(out)); process.exit(0);
}

const [payload, oldHtml]=process.argv.slice(2);
if(!payload||!oldHtml||!fs.existsSync(payload)||!fs.existsSync(oldHtml)){ console.error('Usage : node scripts/audit_multisnack_reel.js semaine.json planning_v072.html'); process.exit(2); }
const run=f=>JSON.parse(execFileSync(process.execPath,[__filename,'--run',f,payload],{maxBuffer:1<<26,stdio:['ignore','pipe','inherit']}).toString().split('\n').filter(l=>l.startsWith('{')).pop());
const OLD=run(oldHtml), NEW=run(path.join(__dirname,'..','planning/index.html'));
const diff=(a,b)=>({plus:b.filter(x=>!a.includes(x)), moins:a.filter(x=>!b.includes(x))});
console.log('\n1. PLAFOND HEBDO — créneaux existants en dépassement');
console.log(`   avant ${OLD.plafond.length} · après ${NEW.plafond.length}`);
const dp=diff(OLD.plafond,NEW.plafond); dp.plus.forEach(x=>console.log('   + devient en infraction : '+x)); dp.moins.forEach(x=>console.log('   − ne l\'est plus : '+x));
console.log('\n2. COLONNE HEURES — cellules qui changent (couleur / ligne Σ)');
const ks=[...new Set([...Object.keys(OLD.cell),...Object.keys(NEW.cell)])].sort(); let n=0;
ks.forEach(k=>{ if(OLD.cell[k]!==NEW.cell[k]){ n++; console.log(`   ${k} : ${OLD.cell[k]||'(absent)'} → ${NEW.cell[k]||'(absent)'}`); } });
if(!n) console.log('   aucune');
console.log('\n3. PANNEAU VÉRIFICATIONS — lignes ajoutées (+) / retirées (−)');
const ck=[...new Set([...Object.keys(OLD.checks),...Object.keys(NEW.checks)])].sort(); let m=0;
ck.forEach(k=>{ const d=diff(OLD.checks[k]||[],NEW.checks[k]||[]); d.plus.forEach(x=>{m++;console.log(`   + [${k}] ${x}`);}); d.moins.forEach(x=>{m++;console.log(`   − [${k}] ${x}`);}); });
if(!m) console.log('   aucune');

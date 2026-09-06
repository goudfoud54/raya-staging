// AUDIT LECTURE SEULE — impact de v0.67 sur la revalidation du planning EXISTANT.
//
// Le patron demandait de « rejouer la revalidation après correction : des créneaux aujourd'hui
// signalés comme fautifs cesseront de l'être, et inversement. Chiffrer les deux sens. »
//
// Méthode : on rejoue la règle « indispo » sur TOUS les créneaux réels de l'organisation, avec les
// DEUX versions de _indispoBlocking — l'ancienne (copiée telle quelle depuis git, marquée comme telle)
// et la nouvelle (EXTRAITE du fichier réel, jamais recopiée). On compte les verdicts qui changent, dans
// les deux sens, et on affiche le détail.
//
// Données : org « Groupe Raya », lues le 2026-09-06 (964 créneaux, 530 indispos). Aucune écriture.
//   node scripts/audit_indispo_reval.js [chemin/vers/payload.json]
const fs=require('fs');
const path=require('path');
const h=fs.readFileSync(path.join(__dirname,'..','planning/index.html'),'utf8');
require(path.join(__dirname,'..','tests/plprims.js')).installPlanningPrims(h);
const {extractFn}=require(path.join(__dirname,'..','tests/extract.js'));

global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
eval('global._toMin='+extractFn(h,'_toMin')+';');
eval('global.overlaps='+extractFn(h,'overlaps')+';');
eval('global._indispoBlocking_NEW='+extractFn(h,'_indispoBlocking')+';');   // ← LE VRAI CODE v0.67

// ── VERSION v0.66, copiée VERBATIM depuis git (git show HEAD~1:planning/index.html) ───────────────
// Reproduite ici uniquement pour la comparaison : c'est un artefact d'audit, jamais du code produit.
function _indispoBlocking_OLD(sid, deb, fin, date, di){
  const a1=_toMin(deb); if(a1==null) return null;
  let a2=fin?_toMin(fin):a1+30; if(a2<=a1) a2+=1440;
  const crosses=a2>1440, nextEnd=a2-1440;
  const nextDate=crosses?fmtDate(new Date(new Date(date).getTime()+86400000)):null, nextDi=(di+1)%7;
  const isFull=d=>!(d.heure_debut||d.heure_fin);
  for(const d of S.dispos){
    if(d.salarie_id!==sid || d.statut!=='indispo' || (d.statut_demande||'validee')!=='validee') continue;
    const sameDay=(d.type==='recurrente'&&d.jour_semaine===di)||(d.type==='ponctuelle'&&d.date_specifique===date);
    if(sameDay && (isFull(d) || overlaps(deb,fin,d.heure_debut,d.heure_fin))) return d;
    if(crosses){
      const nextDay=(d.type==='recurrente'&&d.jour_semaine===nextDi)||(d.type==='ponctuelle'&&d.date_specifique===nextDate);
      if(nextDay){
        if(isFull(d)) return d;
        let nb1=_toMin(d.heure_debut), nb2=d.heure_fin?_toMin(d.heure_fin):nb1+30; if(nb2<=nb1)nb2+=1440;
        if(nb1<nextEnd) return d;
      }
    }
  }
  return null;
}

// Le jeu de données n'est PAS versionné (données salariés réelles). Le script dit comment le refaire
// plutôt que d'échouer sur un ENOENT brut.
const SRC=process.argv[2]||'/tmp/indispo_payload.json';
if(!fs.existsSync(SRC)){
  console.error(`\nJeu de données absent : ${SRC}\n\n` +
    `Il n'est pas versionné (créneaux et absences de salariés réels). Pour le régénérer, exécuter en\n` +
    `LECTURE SEULE sur le projet ynnqvtfayrdteqtgxeuk la requête décrite en tête de ce fichier, puis\n` +
    `enregistrer le JSON {creneaux:[...], dispos:[...]} à ce chemin (ou le passer en argument).\n`);
  process.exit(2);
}
const P=JSON.parse(fs.readFileSync(SRC,'utf8'));
const CRE=(P.creneaux||[]).map(([sid,date,svc,deb,fin])=>({sid,date,svc,deb,fin}));
const DIS=(P.dispos||[]).map(([salarie_id,type,jour_semaine,date_specifique,heure_debut,heure_fin,statut_demande])=>
  ({salarie_id,type,jour_semaine,date_specifique,heure_debut,heure_fin,statut:'indispo',statut_demande}));
global.ORG={journee_exploitation_debut:'05:00:00'};      // valeur RÉELLE de l'org (lue en base)
global.S={dispos:DIS};

const diOf=d=>(new Date(d+'T00:00:00').getDay()+6)%7;
const libere=[], nouveau=[];
for(const c of CRE){
  if(!c.deb||!c.fin) continue;
  const di=diOf(c.date);
  const av=!!_indispoBlocking_OLD(c.sid,c.deb,c.fin,c.date,di);
  const ap=!!_indispoBlocking_NEW(c.sid,c.deb,c.fin,c.date,di);
  if(av&&!ap) libere.push(c);
  if(!av&&ap) nouveau.push(c);
}
console.log('\nIMPACT v0.67 SUR LA REVALIDATION — org « Groupe Raya », bascule 05:00');
console.log(`${CRE.length} créneaux réels rejoués contre ${DIS.length} indisponibilités\n`);
console.log(`✅ ${libere.length} créneau(x) CESSENT d'être signalés « indisponibilité »`);
console.log(`⚠️  ${nouveau.length} créneau(x) DEVIENNENT signalés\n`);
const montre=(titre,list)=>{ if(!list.length) return;
  console.log(titre);
  for(const c of list.slice(0,40)) console.log(`    ${c.date} · ${c.svc} · ${c.deb}→${c.fin} · salarié ${c.sid.slice(0,8)}`);
  if(list.length>40) console.log(`    … et ${list.length-40} autres`);
  console.log(''); };
montre('Détail — libérés (un service du soir que la journée du LENDEMAIN bloquait à tort) :', libere);
montre('Détail — nouvellement signalés :', nouveau);
if(!libere.length && !nouveau.length) console.log('Aucun verdict ne change sur les données actuelles.\n');

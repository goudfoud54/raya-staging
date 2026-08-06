// v0.62 — LE MOTIF D'UNE ABSENCE NE DOIT PAS ÊTRE VISIBLE PAR L'ÉQUIPE.
//
// Le planning affiché en salle et le PDF distribué mentionnaient « Arrêt maladie », « Congé payé »,
// « Absence injustifiée » — lus par tous les salariés. Un arrêt maladie est une donnée de SANTÉ
// (catégorie particulière, RGPD) ; « absence injustifiée » est une information DISCIPLINAIRE affichée
// avant même que le salarié ait été entendu. Le champ `motif` concatène en plus un commentaire libre
// saisi par l'encadrant : tout ce qui y est écrit se retrouvait à l'écran et sur le mur.
//
// Le premier bloc porte sur le PDF RÉELLEMENT GÉNÉRÉ — les octets du document — et non sur le code qui
// le produit : c'est ce document qui finit punaisé en salle.
const fs=require("fs"), path=require("path");
const h=fs.readFileSync(path.join(__dirname,"..","planning/index.html"),"utf8");
require("../access.js");                       // EatimeAccess.canSeeAbsenceMotif
const {extractFn}=require("./extract.js");
const grab=n=>extractFn(h,n);

let ok=true;
const t=(l,c,extra)=>{console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra==null?'':extra)));ok=c&&ok;};

// ── ce qui ne doit JAMAIS sortir ────────────────────────────────────────────────────────────────
const TYPES=['Arrêt maladie','Congé payé','Congé sans solde','Absence injustifiée','Autre'];
const COMMENTAIRE='lombalgie chronique suivie par le médecin du travail';
const FUITES=TYPES.concat([COMMENTAIRE,'lombalgie','médecin']);

// ── décor commun ────────────────────────────────────────────────────────────────────────────────
eval("global._pmin="+(h.match(/const _pmin\s*=[^\n]*/)[0].replace(/^const _pmin\s*=/,'').replace(/;$/,''))+";");
eval("global._pdur="+(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const _pdur\s*=/,'').replace(/;$/,''))+";");
eval("global.fmtH1="+(h.match(/const fmtH1\s*=[^\n]*/)[0].replace(/^const fmtH1\s*=/,'').replace(/;$/,''))+";");
eval("global.INDISPO_ICONS="+h.match(/const INDISPO_ICONS=\[[^\n]*\]/)[0].replace(/^const INDISPO_ICONS=/,'')+";");
eval("global.ABSENCE_NEUTRE="+h.match(/const ABSENCE_NEUTRE=\{[^\n]*\}/)[0].replace(/^const ABSENCE_NEUTRE=/,'')+";");
for(const fn of ['indispoBadge','voirMotifAbsence','hasIndispo','_hexToRgb','_relLum','textColorFor','_rgbArr',
                 '_tintRgb','shortSnack','altDayType','drawSnackPage','_pdfHeader','isoWeek']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
try{ eval("global.roleMain="+(h.match(/const roleMain\s*=[^\n]*/)[0].replace(/^const roleMain\s*=/,'').replace(/;$/,''))+";"); }catch(e){}
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.MONDAY=new Date('2026-08-03T00:00:00'); global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
global.escP=s=>(''+(s==null?'':s));
global.roleNom=c=>c; global.rolesOf=()=>['cuisine']; global.worksAt=()=>true; global.isAltBlocked=()=>false;
global.S={salaries:[], dispos:[], altJours:{}};
global.SALARIE_ABSENT={id:'sal1', prenom:'Nadia', nom:'K.', actif:true, couleur:'#8899aa'};
S.salaries=[SALARIE_ABSENT];
// Une absence « journée entière » : c'est ce cas qui imprimait le motif dans le PDF.
S.dispos=[{salarie_id:'sal1', type:'ponctuelle', statut:'indispo', statut_demande:'validee',
           date_specifique:fmtDate(dateOfDay(2)), motif:'Arrêt maladie — '+COMMENTAIRE}];
const RESTO={id:'r1', nom:'Raya Carnot'};

// ── 1. LE PDF RÉELLEMENT GÉNÉRÉ ─────────────────────────────────────────────────────────────────
console.log('── 1. LE DOCUMENT PDF LUI-MÊME (celui qui finit sur le mur) ───────────────────────────');
// jsPDF n'est pas une dépendance du dépôt (pas de build, tout vient du CDN en navigateur). On le
// charge s'il est installé quelque part ; sinon on retombe sur un moteur ENREGISTREUR qui capture le
// texte réellement émis vers le document. Les deux jambes vérifient la même propriété — le CONTENU du
// document —, et on dit toujours laquelle a tourné.
function chargeJsPDF(){
  const bases=[process.env.JSPDF_PATH, path.join(__dirname,'node_modules'), path.join(__dirname,'..','node_modules'),
               '/private/tmp/claude-501/-Users-rayan-Dev-raya-staging/0ee8a657-4e40-4512-9da3-3b0867cc51ff/scratchpad/pdflib/node_modules'].filter(Boolean);
  for(const b of bases){
    try{
      const {jsPDF}=require(path.join(b,'jspdf'));
      const at=require(path.join(b,'jspdf-autotable'));
      // Selon la version, autoTable est un plugin qui se greffe sur le prototype, ou une fonction
      // autonome autoTable(doc, options). Le code du planning appelle doc.autoTable(...) : on rétablit
      // cette forme sans toucher au code testé.
      if(typeof at.applyPlugin==='function') at.applyPlugin(jsPDF);
      if(!jsPDF.API.autoTable && typeof at.default==='function'){
        jsPDF.API.autoTable=function(opts){ return at.default(this, opts); };
      }
      return jsPDF;
    }catch(e){}
  }
  return null;
}
// Extrait le texte lisible d'un PDF non compressé : jsPDF écrit les chaînes dans des opérateurs (…)Tj / TJ.
function texteDuPdf(buf){
  const s=buf.toString('latin1');
  const out=[];
  const re=/\(((?:\\.|[^()\\])*)\)\s*Tj/g; let m;
  while((m=re.exec(s))) out.push(m[1]);
  const re2=/\[((?:\\.|[^\[\]\\])*)\]\s*TJ/g;
  while((m=re2.exec(s))) out.push(m[1].replace(/\)\s*-?\d+\s*\(/g,''));
  return out.join('\n')
    .replace(/\\([()\\])/g,'$1')
    .replace(/\\(\d{3})/g,(_,o)=>String.fromCharCode(parseInt(o,8)));
}
const jsPDF=chargeJsPDF();
let texte=null, provenance='';
if(jsPDF){
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3',compress:false});
  drawSnackPage(doc, RESTO, [], {primary:'#c8a035', org:'Groupe Raya'});
  const buf=Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(path.join(require('os').tmpdir(),'planning_test.pdf'), buf);
  texte=texteDuPdf(buf);
  provenance=`PDF RÉEL généré par jsPDF (${buf.length} octets), texte extrait des opérateurs Tj/TJ`;
} else {
  // Moteur enregistreur : capture tout ce qui est ÉCRIT dans le document (cellules + doc.text).
  const vu=[];
  const push=v=>{ if(v==null)return; if(Array.isArray(v)) v.forEach(push);
                  else if(typeof v==='object') push(v.content); else vu.push(String(v)); };
  const doc={ internal:{pageSize:{getWidth:()=>420,getHeight:()=>297}},
    setFillColor(){},rect(){},addImage(){},setFontSize(){},setFont(){},setTextColor(){},setDrawColor(){},
    setLineWidth(){},line(){},text(v){push(v);},
    autoTable(o){ push(o.head); push(o.body); if(o.didDrawPage) o.didDrawPage({}); } };
  drawSnackPage(doc, RESTO, [], {primary:'#c8a035', org:'Groupe Raya'});
  texte=vu.join('\n');
  provenance='moteur ENREGISTREUR (jsPDF absent) — texte réellement émis vers le document';
}
console.log('   ℹ source : '+provenance);
const fuites=FUITES.filter(f=>texte.includes(f));
t('le document ne contient AUCUN des 5 types d\'absence ni le commentaire libre (fuites : '
  +(fuites.join(' · ')||'aucune')+')', fuites.length===0);
t('… il contient bien un libellé neutre « Absent »', /Absent/.test(texte), texte.slice(0,300));
t('… le salarié absent figure quand même au planning (l\'équipe voit l\'organisation)', /Nadia|K\./.test(texte));
// Contrôle de méthode : si l'extraction ne voyait rien, les assertions ci-dessus passeraient à vide.
t('CONTRÔLE : l\'extraction lit vraiment le document (jours de la semaine présents)',
  /Lundi|Mardi|Mercredi/.test(texte), texte.slice(0,200));

// ── 1 bis. LE TOTAL D'HEURES HEBDOMADAIRE N'EST PAS DANS LE PDF NON PLUS ────────────────────────
// Même raison que les motifs : le document est affiché en salle. Le total de chacun révèle sa
// situation contractuelle (temps plein, temps partiel, contrat court) à toute l'équipe.
// Le décor pose des créneaux réels pour que le total EXISTE : sans heures, l'absence de total ne
// prouverait rien.
{
  const d0=fmtDate(dateOfDay(0)), d1=fmtDate(dateOfDay(1));
  const creneaux=[
    {salarie_id:'sal1', date:d0, service:'midi', heure_debut:'11:00:00', heure_fin:'15:00:00'},
    {salarie_id:'sal1', date:d0, service:'soir', heure_debut:'18:30:00', heure_fin:'23:30:00'},
    {salarie_id:'sal1', date:d1, service:'soir', heure_debut:'18:30:00', heure_fin:'23:30:00'},
  ];   // 4 + 5 + 5 = 14 h → « 14h » apparaîtrait dans l'ancienne colonne Total
  let txt2, prov2;
  if(jsPDF){
    const doc2=new jsPDF({orientation:'landscape',unit:'mm',format:'a3',compress:false});
    drawSnackPage(doc2, RESTO, creneaux, {primary:'#c8a035', org:'Groupe Raya'});
    const b2=Buffer.from(doc2.output('arraybuffer'));
    txt2=texteDuPdf(b2); prov2=`PDF RÉEL (${b2.length} octets)`;
  } else {
    const vu=[]; const push=v=>{ if(v==null)return; if(Array.isArray(v)) v.forEach(push);
      else if(typeof v==='object') push(v.content); else vu.push(String(v)); };
    const doc2={ internal:{pageSize:{getWidth:()=>420,getHeight:()=>297}},
      setFillColor(){},rect(){},addImage(){},setFontSize(){},setFont(){},setTextColor(){},setDrawColor(){},
      setLineWidth(){},line(){},text(v){push(v);},
      autoTable(o){ push(o.head); push(o.body); if(o.didDrawPage) o.didDrawPage({}); } };
    drawSnackPage(doc2, RESTO, creneaux, {primary:'#c8a035', org:'Groupe Raya'});
    txt2=vu.join('\n'); prov2='moteur enregistreur';
  }
  console.log('   ℹ source (totaux) : '+prov2);
  // Contrôle de méthode d'abord : les horaires posés DOIVENT être lisibles, sinon l'absence de total
  // ne prouverait rien (on aurait pu tester un document vide).
  t('CONTRÔLE : les horaires posés sont bien dans le document', /11:00/.test(txt2)&&/23:30/.test(txt2), txt2.slice(0,200));
  t('le document ne porte AUCUN en-tête « Total »', !/Total/.test(txt2), (txt2.match(/.{0,20}Total.{0,20}/)||[''])[0]);
  t('… ni le total hebdomadaire du salarié (14h)', !/\b14h\b/.test(txt2), (txt2.match(/.{0,20}14h.{0,20}/)||[''])[0]);
  // Garde-fou générique : aucune cellule « <nombre>h » (format fmtH1 du total). Les horaires, eux,
  // sont au format HH:MM et ne matchent pas.
  const totaux=(txt2.match(/(^|\n)\s*\d{1,2}(,\d)?h\s*(\n|$)/g)||[]);
  t('… ni aucune cellule au format « Xh » (format du total)', totaux.length===0, JSON.stringify(totaux));
}

// ── 2. LE GARDE-FOU : indispoBadge est FAIL-CLOSED ──────────────────────────────────────────────
console.log('\n── 2. indispoBadge : oublier le droit d\'accès EXPURGE (jamais l\'inverse) ─────────────');
const IND={motif:'Arrêt maladie — '+COMMENTAIRE};
{ const sansDroit=indispoBadge(IND);           // appel qui « oublie » le second argument
  t('appel sans droit explicite → libellé neutre', sansDroit.lbl==='Absent', JSON.stringify(sansDroit));
  t('… le motif complet est neutralisé aussi (info-bulle)', sansDroit.full==='Absent', sansDroit.full);
  t('… et l\'ICÔNE ne trahit pas le type (pas de 🤒)', sansDroit.ic!=='🤒' && sansDroit.ic==='🚫', sansDroit.ic);
  const avecDroit=indispoBadge(IND,true);
  t('avec le droit → le motif complet reste lisible', /Arrêt maladie/.test(avecDroit.lbl)&&avecDroit.full.includes(COMMENTAIRE), JSON.stringify(avecDroit));
  t('… avec son icône de type', avecDroit.ic==='🤒', avecDroit.ic);
  t('indispoBadge(ind,false) est neutre pour les 5 types', TYPES.every(ty=>indispoBadge({motif:ty},false).lbl==='Absent'));
}

// ── 3. QUI A LE DROIT ───────────────────────────────────────────────────────────────────────────
console.log('\n── 3. canSeeAbsenceMotif : encadrement, et le salarié sur SA propre absence ───────────');
const C=EatimeAccess.canSeeAbsenceMotif;
t('admin voit le motif',        C({role:'admin'},'sal1')===true);
t('manager voit le motif',      C({role:'manager'},'sal1')===true);
t('super_admin voit le motif',  C({role:'super_admin'},'sal1')===true);
t('un salarié voit SA propre absence', C({role:'salarie',salarie_id:'sal1'},'sal1')===true);
t('un salarié NE voit PAS celle d\'un collègue', C({role:'salarie',salarie_id:'sal2'},'sal1')===false);
t('un salarié sans fiche liée ne voit rien',     C({role:'salarie',salarie_id:null},'sal1')===false);
t('deux identifiants nuls ne « se valent » pas', C({role:'salarie',salarie_id:null},null)===false);
t('profil absent → rien',                        C(null,'sal1')===false);
t('rôle inconnu → rien',                         C({role:'stagiaire'},'sal1')===false);
// Le point le plus important : le droit ne se déduit PAS de l'accès au module.
{ const salarieAvecAccesPlanning={role:'salarie', salarie_id:'sal2', module_exceptions:{planning:true}};
  t('un salarié à qui on a OUVERT le planning par exception ne voit toujours pas les motifs',
    C(salarieAvecAccesPlanning,'sal1')===false);
  t('… alors qu\'il a bien accès au module (contrôle)',
    EatimeAccess.canAccessModule('planning', salarieAvecAccesPlanning, null)===true); }

// ── 4. LA GRILLE À L'ÉCRAN ──────────────────────────────────────────────────────────────────────
console.log('\n── 4. La grille : libellé neutre pour un non-encadrant, motif pour l\'encadrement ─────');
function badgeVuPar(profil, sid){ global.ME=profil; return indispoBadge(IND, voirMotifAbsence(sid)); }
t('encadrant → motif visible dans la grille', /Arrêt maladie/.test(badgeVuPar({role:'manager'},'sal1').lbl));
t('salarié regardant un COLLÈGUE → « Absent »', badgeVuPar({role:'salarie',salarie_id:'sal2'},'sal1').lbl==='Absent');
t('salarié regardant SA propre absence → motif visible', /Arrêt maladie/.test(badgeVuPar({role:'salarie',salarie_id:'sal1'},'sal1').lbl));
t('aucun profil chargé → « Absent » (fail-closed)', badgeVuPar(null,'sal1').lbl==='Absent');
global.ME=null;

// ── 5. LE CODE NE PEUT PLUS RÉGRESSER SILENCIEUSEMENT ───────────────────────────────────────────
console.log('\n── 5. Verrous sur le code source ─────────────────────────────────────────────────────');
{ // On scanne le CODE, pas les commentaires : les commentaires de ce chantier citent volontairement
  // « indispoBadge(...) » pour expliquer ce qu'il ne faut plus faire, et feraient échouer le verrou.
  const sansCommentaires=h.replace(/\/\*[\s\S]*?\*\//g,'').split('\n').filter(l=>!/^\s*\/\//.test(l)).join('\n');
  const hh=sansCommentaires;
  // Le PDF ne doit plus jamais appeler indispoBadge : le motif n'y a aucune place, quel que soit le lecteur.
  const zonePdf=hh.slice(hh.indexOf('function drawSnackPage'), hh.indexOf('function buildPrintPage'));
  t('drawSnackPage n\'appelle plus indispoBadge', !/indispoBadge\s*\(/.test(zonePdf));
  t('… et pose bien un libellé neutre « Absent »', /'Absent'/.test(zonePdf));
  // VERROU sur le total d'heures : ni en-tête, ni cumul, ni largeur de colonne réservée. Trois
  // marqueurs indépendants — réintroduire la colonne en fait forcément réapparaître au moins un.
  t('drawSnackPage ne déclare aucun en-tête « Total »', !/content:\s*'Total'/.test(zonePdf),
    (zonePdf.match(/.{0,40}Total.{0,40}/)||[''])[0]);
  t('… ne calcule aucun cumul d\'heures (wkMin retiré)', !/wkMin/.test(zonePdf),
    (zonePdf.match(/.{0,40}wkMin.{0,40}/)||[''])[0]);
  t('… et ne réserve plus de largeur pour la 29e colonne', !/29\s*:\s*\{/.test(zonePdf),
    (zonePdf.match(/columnStyles[^\n]*/)||[''])[0]);
  t('… alors que fmtH1 (format « Xh ») n\'y est plus appelé', !/fmtH1\s*\(/.test(zonePdf),
    (zonePdf.match(/.{0,40}fmtH1.{0,40}/)||[''])[0]);
  // Tout appel à indispoBadge doit passer un droit explicite (fail-closed, mais on veut aussi l'intention).
  const appels=[...hh.matchAll(/indispoBadge\(([^)]*)\)/g)].map(m=>m[1]).filter(a=>!/^ind,\s*voirMotif$/.test(a));
  const sansDroit=appels.filter(a=>a.split(',').length<2);
  t('tout appel à indispoBadge passe un droit explicite (sans droit : '+(sansDroit.join(' | ')||'aucun')+')',
    sansDroit.length===0);
  // Ce n'est PAS un réglage : rien dans RULE_META ni dans les permissions ne doit piloter cette règle.
  t('aucun réglage ne permet de rendre les motifs publics', !/motif.{0,40}(reglage|RULE_META|setting)/i.test(hh)); }

console.log(ok?'\nALL PASS':'\nSOME FAILED');
process.exit(ok?0:1);

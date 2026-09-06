// v0.67 — LES INDISPONIBILITÉS : UNE SOURCE UNIQUE, ET LA JOURNÉE D'EXPLOITATION.
//
// Deux défauts signalés par le patron, deux causes distinctes.
//
// (1) Trois fonctions répondaient à « cette personne est-elle indisponible, et sur quelle plage ? » :
//     la grille (renderTable), le PDF (drawSnackPage) et le moteur (_indispoBlocking). La grille lisait
//     UNE ligne au hasard (hasIndispo faisait un `.find()`) puis comparait la plage à DEF_TIME — un
//     défaut CODÉ EN DUR (11:00–14:30 / 18:30–23:30) — au lieu des postes réellement configurés.
//
// (2) Une indispo « journée entière » du samedi refusait le créneau du VENDREDI 18:00→02:00, parce que
//     le débordement après minuit était confronté aux indispos du lendemain CIVIL. Un service du
//     vendredi soir qui finit à 2h du matin est un service du vendredi.
//
// ⚠ CE QUE LA BASE DIT VRAIMENT DU CAS AHMAD (lu le 2026-09-06, org « Groupe Raya ») :
// le 11/09 porte DEUX lignes — une journée entière (heures NULL) ET une 19:00→00:00. La grille barrait
// donc la journée entière parce qu'une telle ligne EXISTE, pas seulement à cause du bug d'affichage ;
// et le moteur la bloquait aussi (isFull → return). Sur CE dossier, grille et moteur étaient d'accord.
// Les deux cas sont testés séparément ci-dessous : la ligne seule (ce que le patron croyait avoir) et
// les deux lignes (ce qu'il a réellement).
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);
const {extractFn}=require("./extract.js");
const grab=n=>extractFn(h,n);
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.fmtH1=x=>(Math.round(x*10)/10).toString().replace('.',',');
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
for(const fn of ['_toMin','overlaps','_overlap','_endCapMin','_ruleCtx','isMultiSnack','weekMinutesOf',
                 'plafondOf','_indispoBlocking','checkPlacement','hasIndispo','hasPonctuelleAbsence',
                 'indispoBadge']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j;
  for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}
  eval("global.PLACE_RULES="+h.slice(st,j)+";"); }

global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
global.onRoster=()=>true; global.altDayType=()=>null; global.isExp=()=>true; global.rolesOf=()=>['cuisine'];
global.salById=id=>SAL[id];
global.worksAt=()=>true;
global.voirMotifAbsence=()=>true;
global.EatimeAccess={canSeeAbsenceMotif:()=>true};
global.ME={};
const GC='gc';
global.SNACK={id:GC,nom:'Raya Grand Coeur'};

let ok=true,n=0;
const t=(l,c,extra)=>{n++;console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra==null?'':extra)));ok=c&&ok;};

// ── POSTES RÉELS de Grand Cœur (production, copie exacte) ────────────────────────────────────────
// Le midi va jusqu'à 18:00 et le soir démarre à 18:00 : c'est CE décalage avec DEF_TIME (14:30) qui
// faisait diverger la grille et le moteur.
const EFF=[
  {restaurant_id:GC,jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:4,vagues:[
    {deb:'10:00',fin:'14:00',exp:true},{deb:'10:30',fin:'18:00',exp:true},{deb:'11:30',fin:'15:00'},{deb:'11:30',fin:'14:30'}]},
  {restaurant_id:GC,jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:4,vagues:[
    {deb:'18:00',fin:'23:30'},{deb:'18:00',fin:'00:00',exp:true},{deb:'18:30',fin:'00:00',exp:true},{deb:'19:00',fin:'22:30'}]},
  {restaurant_id:GC,jour_type:'Ve',service:'midi',role:'cuisine',nb_cible:4,vagues:[
    {deb:'10:00',fin:'14:00',exp:true},{deb:'10:30',fin:'18:00',exp:true},{deb:'11:00',fin:'18:00'},{deb:'11:30',fin:'15:00'}]},
  {restaurant_id:GC,jour_type:'Ve',service:'soir',role:'cuisine',nb_cible:4,vagues:[
    {deb:'18:00',fin:'00:30'},{deb:'18:00',fin:'02:00',exp:true},{deb:'18:30',fin:'23:00',exp:true},{deb:'19:00',fin:'02:00'}]},
  {restaurant_id:GC,jour_type:'Sa',service:'midi',role:'cuisine',nb_cible:4,vagues:[
    {deb:'10:00',fin:'14:00',exp:true},{deb:'10:30',fin:'18:00',exp:true},{deb:'11:00',fin:'18:00'},{deb:'11:30',fin:'15:00'}]},
  {restaurant_id:GC,jour_type:'Sa',service:'soir',role:'cuisine',nb_cible:4,vagues:[
    {deb:'18:00',fin:'00:30'},{deb:'18:00',fin:'02:00',exp:true},{deb:'18:30',fin:'23:00',exp:true},{deb:'19:00',fin:'02:00'}]},
];
// 2026-09-11 est un VENDREDI ; 2026-09-12 un samedi. MONDAY = lundi de cette semaine.
global.MONDAY=new Date('2026-09-07T00:00:00');
global.dateOfDay=i=>new Date(MONDAY.getTime()+i*86400000);
const VEN='2026-09-11', SAM='2026-09-12', DI_VEN=4, DI_SAM=5;
global.SAL={ahmad:{id:'ahmad',prenom:'Ahmad',nom:'NEHME',heures_max:48,heures_min:20,snack_origine_id:GC,roles:['cuisine']}};
global.ORG={};                                    // pas de réglage chargé → _cutMin() doit retomber sur 05:00

function setDispos(rows, org){
  global.ORG=org||{};
  global.S={restos:[{id:GC,nom:'Raya Grand Coeur'}],salaries:Object.values(SAL),
            orgRoles:[{cle:'cuisine',nom:'Cuisine'}],dispos:rows,miseAPied:[],contraintes:[],
            regles:[],derogations:[],effectifs:EFF,creneaux:[],allCreneauxWeek:[]};
}
const D=(date,hd,hf,type,jour)=>({salarie_id:'ahmad',statut:'indispo',statut_demande:'validee',
  type:type||'ponctuelle', date_specifique:type==='recurrente'?null:date, jour_semaine:type==='recurrente'?jour:null,
  heure_debut:hd||null, heure_fin:hf||null});
// Le verdict du MOTEUR pour un créneau donné, via checkPlacement (pas seulement le helper).
const place=(deb,fin,date,di,svc)=>checkPlacement('ahmad',{deb,fin,role:'cuisine'},date,svc||'soir',di,{rg:_ruleCtx(),manual:true});
const bloque=(deb,fin,date,di,svc)=>{ const v=place(deb,fin,date,di,svc); return !!v && v.cle==='indispo'; };
// Le verdict de la GRILLE et du PDF, via les MÊMES fonctions que le rendu réel.
const grille=(date,svc)=>{ const c=indisposOf('ahmad',date);
  return c.full.length ? 'journee' : indispoServiceEtat(date, svc, _indispoSegments(c.horaires)); };
const pdfAbsent=date=>indisposOf('ahmad',date).full.length>0;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 1. LA SOURCE UNIQUE — toutes les lignes du jour, pas la première venue ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
setDispos([D(VEN,'19:00','00:00')]);
{ const c=indisposOf('ahmad',VEN);
  t('une indispo 19:00→00:00 est classée « horaire », pas « journée entière »',
    c.full.length===0 && c.horaires.length===1, JSON.stringify({full:c.full.length,h:c.horaires.length})); }
// LE DOSSIER RÉEL D'AHMAD : deux lignes le même jour. L'ancien `.find()` en retenait UNE au hasard.
setDispos([D(VEN,'19:00','00:00'), D(VEN,null,null)]);
{ const c=indisposOf('ahmad',VEN);
  t('DOSSIER RÉEL — les DEUX lignes du 11/09 sont vues (1 horaire + 1 journée entière)',
    c.horaires.length===1 && c.full.length===1, JSON.stringify({full:c.full.length,h:c.horaires.length}));
  t('… quel que soit leur ORDRE de chargement (plus de tirage au sort)',
    (setDispos([D(VEN,null,null), D(VEN,'19:00','00:00')]), indisposOf('ahmad',VEN).full.length===1)); }
setDispos([D(VEN,'19:00','00:00'), D(VEN,null,null)]);
t('DOSSIER RÉEL — grille, PDF et moteur disent TOUS « journée entière » (la ligne sans heures prime)',
  grille(VEN,'midi')==='journee' && pdfAbsent(VEN)===true && bloque('11:00','14:30',VEN,DI_VEN,'midi'),
  JSON.stringify({grille:grille(VEN,'midi'),pdf:pdfAbsent(VEN),moteur:bloque('11:00','14:30',VEN,DI_VEN,'midi')}));
t('… c\'est donc une DONNÉE à corriger (ligne journée entière en trop), pas un désaccord des trois vues',
  grille(VEN,'midi')==='journee' && pdfAbsent(VEN)===true);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2. LE CAS TEL QUE LE PATRON LE VEUT : 19:00→00:00 SEULE, le midi reste libre ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
setDispos([D(VEN,'19:00','00:00')]);
t('grille — le MIDI reste saisissable (ce n\'est pas un congé)', grille(VEN,'midi')==='libre', grille(VEN,'midi'));
t('moteur — un midi 11:00→14:30 est ACCEPTÉ', !bloque('11:00','14:30',VEN,DI_VEN,'midi'), JSON.stringify(place('11:00','14:30',VEN,DI_VEN,'midi')));
t('PDF — la journée n\'est PAS marquée « Absent »', pdfAbsent(VEN)===false);
t('grille — le SOIR est marqué « gêné », pas grisé (18:00→19:00 reste possible)',
  grille(VEN,'soir')==='gene', grille(VEN,'soir'));
t('moteur — un soir 18:00→19:00 est ACCEPTÉ (adjacent à l\'indispo)', !bloque('18:00','19:00',VEN,DI_VEN,'soir'));
t('moteur — un soir 18:00→23:00 est REFUSÉ (il mord sur 19:00→00:00)', bloque('18:00','23:00',VEN,DI_VEN,'soir'));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 3. LÀ OÙ LA GRILLE ET LE MOTEUR SE CONTREDISAIENT VRAIMENT (DEF_TIME) ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Grand Cœur : le midi va de 10:30 à 18:00. Une indispo 15:00→17:00 ne chevauche PAS le défaut codé en
// dur (11:00–14:30) mais chevauche bel et bien le vrai service. Avant v0.67 : rien de grisé, et le
// placement refusait. C'est le désaccord réel entre les deux vues.
setDispos([D(VEN,'15:00','17:00')]);
t('la fenêtre du midi lue dans les POSTES va bien jusqu\'à 18:00 (et non 14:30)',
  _svcWindow(VEN,'midi').wE===18*60, JSON.stringify(_svcWindow(VEN,'midi')));
t('grille — le midi est signalé « gêné » par l\'indispo 15:00→17:00', grille(VEN,'midi')==='gene', grille(VEN,'midi'));
t('moteur — un midi 10:30→18:00 est REFUSÉ', bloque('10:30','18:00',VEN,DI_VEN,'midi'));
t('LES DEUX VUES SONT D\'ACCORD (avant v0.67 : grille muette, moteur refusant)',
  (grille(VEN,'midi')!=='libre') === bloque('10:30','18:00',VEN,DI_VEN,'midi'));
t('… et un midi 10:30→14:30, hors de l\'indispo, reste ACCEPTÉ et saisissable',
  !bloque('10:30','14:30',VEN,DI_VEN,'midi') && grille(VEN,'midi')!=='impossible');
// ── LE CONTRAT DE « gene » : l'écran ne doit JAMAIS interdire plus que checkPlacement ────────────
// C'est tout l'argument de l'état « gêné ». Sans cette vérification, une évolution de _couvreToute ou
// de _svcWindow pourrait produire des cases laissées saisissables mais que le moteur refuse toutes —
// ou l'inverse — sans que rien ne devienne rouge.
// Horaires candidats sur la fenêtre du service, de demi-heure en demi-heure.
function candidats(date,svc){
  const w=_svcWindow(date,svc), out=[];
  const hhmm=m=>`${String(Math.floor((m%1440)/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  for(let a=w.wS;a<w.wE;a+=30) for(let b=a+60;b<=w.wE;b+=30) out.push([hhmm(a),hhmm(b)]);
  return out;
}
setDispos([D(VEN,'15:00','17:00')]);
{ const acceptes=candidats(VEN,'midi').filter(([a,b])=>!bloque(a,b,VEN,DI_VEN,'midi'));
  t('CONTRAT — un service « gêné » laisse AU MOINS un horaire que le moteur accepte',
    grille(VEN,'midi')==='gene' && acceptes.length>0,
    `état=${grille(VEN,'midi')} · ${acceptes.length} horaires acceptés`); }
// Indispo couvrant TOUT le service → là, griser est justifié.
setDispos([D(VEN,'10:00','18:00')]);
t('une indispo qui couvre TOUTE la fenêtre du midi rend le service « impossible » (case grisée)',
  grille(VEN,'midi')==='impossible', grille(VEN,'midi'));
t('… et le moteur refuse aussi', bloque('10:30','18:00',VEN,DI_VEN,'midi'));
{ const acceptes=candidats(VEN,'midi').filter(([a,b])=>!bloque(a,b,VEN,DI_VEN,'midi'));
  t('CONTRAT — un service « impossible » n\'a AUCUN horaire acceptable (griser ne prive de rien)',
    acceptes.length===0, acceptes.length+' horaires accepteraient : '+JSON.stringify(acceptes.slice(0,3))); }

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 4. JOURNÉE D\'EXPLOITATION : le samedi ne bloque plus le vendredi soir ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
t('_cutMin() vaut 05:00 par défaut quand l\'organisation ne règle rien', _cutMin()===300, String(_cutMin()));
t('un shift qui démarre à 18:00 appartient à la journée d\'exploitation de SON jour',
  _jourExploitation(VEN,DI_VEN,18*60).date===VEN);
t('un shift qui démarre à 02:00 appartient à la journée de la VEILLE',
  _jourExploitation(SAM,DI_SAM,2*60).date===VEN, JSON.stringify(_jourExploitation(SAM,DI_SAM,2*60)));

setDispos([D(SAM,null,null)]);                       // journée entière SAMEDI
t('LE CAS DU PATRON — indispo journée du SAMEDI : le vendredi 18:00→02:00 est ACCEPTÉ',
  !bloque('18:00','02:00',VEN,DI_VEN,'soir'), JSON.stringify(place('18:00','02:00',VEN,DI_VEN,'soir')));
t('L\'AVANT-DERNIER TEST — la même indispo bloque BIEN le samedi 18:00→02:00',
  bloque('18:00','02:00',SAM,DI_SAM,'soir'), JSON.stringify(place('18:00','02:00',SAM,DI_SAM,'soir')));
t('… et bloque aussi un samedi midi', bloque('11:00','14:30',SAM,DI_SAM,'midi'));
t('… la grille barre bien le SAMEDI', grille(SAM,'soir')==='journee', grille(SAM,'soir'));
t('… et ne barre PAS le vendredi', grille(VEN,'soir')==='libre', grille(VEN,'soir'));
t('… le PDF dit « Absent » samedi et rien vendredi', pdfAbsent(SAM)===true && pdfAbsent(VEN)===false);

// Le contrôle n'a pas été DÉSACTIVÉ : une indispo HORAIRE de nuit continue de mordre.
setDispos([D(SAM,'00:00','06:00')]);
t('indispo HORAIRE samedi 00:00→06:00 : le vendredi 18:00→02:00 est REFUSÉ (elle le chevauche vraiment)',
  bloque('18:00','02:00',VEN,DI_VEN,'soir'), JSON.stringify(place('18:00','02:00',VEN,DI_VEN,'soir')));
t('… mais un vendredi 18:00→23:00, qui ne déborde pas, reste ACCEPTÉ',
  !bloque('18:00','23:00',VEN,DI_VEN,'soir'));
t('… et un samedi 06:00→12:00, après la plage, reste ACCEPTÉ',
  !bloque('06:00','12:00',SAM,DI_SAM,'midi'));

// Bascule d'organisation NON standard : le réglage doit être réellement lu.
setDispos([D(SAM,null,null)], {journee_exploitation_debut:'03:00:00'});
t('avec une bascule réglée à 03:00, _cutMin() la lit (le réglage n\'est pas décoratif)', _cutMin()===180, String(_cutMin()));
t('… un shift du samedi démarrant à 02:00 relève encore du vendredi (< 03:00)',
  _jourExploitation(SAM,DI_SAM,2*60).date===VEN);
t('… un shift du samedi démarrant à 04:00 relève du samedi (≥ 03:00) et est donc bloqué',
  bloque('04:00','10:00',SAM,DI_SAM,'midi'));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 5. MÊME COMPORTEMENT POUR UNE INDISPO RÉCURRENTE ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Le jour de semaine doit être recalculé sur la journée d'EXPLOITATION, pas sur le jour civil du
// créneau — sinon un repos fixe du samedi continuerait de refuser le vendredi soir.
setDispos([D(null,null,null,'recurrente',DI_SAM)]);   // repos fixe le SAMEDI
t('repos fixe le SAMEDI : le vendredi 18:00→02:00 est ACCEPTÉ',
  !bloque('18:00','02:00',VEN,DI_VEN,'soir'), JSON.stringify(place('18:00','02:00',VEN,DI_VEN,'soir')));
t('repos fixe le SAMEDI : le samedi 18:00→02:00 est REFUSÉ',
  bloque('18:00','02:00',SAM,DI_SAM,'soir'));
t('… la grille barre le samedi et pas le vendredi',
  grille(SAM,'soir')==='journee' && grille(VEN,'soir')==='libre');
setDispos([D(null,'00:00','06:00','recurrente',DI_SAM)]);
t('récurrente HORAIRE samedi 00:00→06:00 : le vendredi 18:00→02:00 est REFUSÉ (chevauchement réel)',
  bloque('18:00','02:00',VEN,DI_VEN,'soir'));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 6. hasPonctuelleAbsence RESTE DISTINCTE (prorata du minimum d\'heures) ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Elle ne doit PAS être fusionnée avec la source unique : une indispo RÉCURRENTE (jour de repos fixe)
// est déjà reflétée dans le heures_min contractuel et ne doit pas réduire l'attente hebdomadaire.
setDispos([D(null,null,null,'recurrente',DI_SAM)]);
t('un repos fixe du samedi ne compte PAS comme absence pour le prorata', hasPonctuelleAbsence('ahmad',SAM)===false);
t('… alors que la source unique, elle, le voit bien', indisposOf('ahmad',SAM).full.length===1);
setDispos([D(SAM,null,null)]);
t('une absence PONCTUELLE du samedi compte bien pour le prorata', hasPonctuelleAbsence('ahmad',SAM)===true);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 7. GARDE-FOUS STRUCTURELS : les trois vues lisent bien la source unique ──');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// C'est la vraie protection contre la réapparition du motif « trois fonctions, trois réponses ».
const src=h;
t('la grille (renderTable) appelle indisposOf', /const _ind=indisposOf\(s\.id,date\)/.test(src));
t('la grille délègue le verdict par service à indispoServiceEtat', /indispoServiceEtat\(date, svc, indSegs\)/.test(src));
t('le PDF appelle indisposOf pour décider d\'une journée entière',
  /fullDayAbs = \(adt==='ecole'\|\|adt==='examen'\) \|\| indisposOf\(s\.id,date\)\.full\.length>0/.test(src));
t('le moteur (_indispoBlocking) appelle indisposOf', /function _indispoBlocking[\s\S]{0,2200}indisposOf\(sid, je\.date\)\.full/.test(src));
t('hasIndispo ne réécrit plus le test : il DÉLÈGUE à indisposOf',
  /function hasIndispo\(sid,date\)\{\s*\n?\s*const c=indisposOf\(sid,date\);/.test(src));
t('plus aucun DEF_TIME dans la décision d\'affichage des indispos',
  !/DEF_TIME\([^)]*\)[\s\S]{0,120}_overlap\(indObj/.test(src) && !/indObj/.test(src));
t('la bascule de journée d\'exploitation est bien demandée à la base',
  /organizations'\)\.select\('[^']*journee_exploitation_debut/.test(src));
t('utils.js est chargé par la page (cutoffToMinutes disponible au navigateur)',
  /<script src="\.\.\/utils\.js/.test(src));
t('_indispoBlocking passe par la journée d\'EXPLOITATION pour les journées entières',
  /_jourExploitation\(date, di, a1\)/.test(src));
// La grille laisse désormais les cases « gênées » SAISISSABLES : l'enregistrement devient un chemin
// vivant qui ne l'était pas (les cases étaient grisées). Il doit passer par checkPlacement, et par lui
// seul — un quatrième test de l'indispo à cet endroit rouvrirait exactement le défaut corrigé.
{ const i=src.indexOf('async function saveCell'), corps=src.slice(i, i+6000);
  t('saveCell valide par checkPlacement…', /checkPlacement\(sid,shift,date,svc,di,\{manual:true,excludeSelf:true\}\)/.test(corps));
  t('… et ne refait AUCUN test d\'indispo de son côté (pas de 4e lecteur)',
    !/hasIndispo|indisposOf|_indispoBlocking/.test(corps)); }

console.log('\n'+(ok?'ALL PASS':'SOME FAILED')+`  (${n} vérifications)`);
process.exit(ok?0:1);

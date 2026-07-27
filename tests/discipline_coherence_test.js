// Lot 2 — cohérence des faits entre documents, marge des délais (cas réel 13→21/07), titre signataire.
// Fonctions RÉELLES extraites d'avertissements/index.html.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","avertissements/index.html"),"utf8");
// Slices contigus de fonctions PURES : fériés+joursOuvrables, convocDelaiAnchor, bloc LOT 2 (jusqu'à checkRiskTerms).
const sl=(from,to)=>h.slice(h.indexOf(from), h.indexOf(to, h.indexOf(from)));
const feries=sl("function _isoDate(","// Nombre de jours OUVRABLES");
const jo=(()=>{ const s=h.indexOf("function joursOuvrables("); return h.slice(s,h.indexOf("\n}",s)+2); })();
const anchor=(()=>{ const s=h.indexOf("function convocDelaiAnchor("); return h.slice(s,h.indexOf("\n}",s)+2); })();
const lot2=sl("function _faitsFieldsForKind(","// Affiche les suggestions");
eval(feries+jo+anchor+lot2+";Object.assign(global,{_isoDate,joursFeries,joursOuvrables,convocDelaiAnchor,faitsSignature,documentsIncoherents,delaiMargeConvoc,remiseComplete,titreSignataire,titreIncoherent,_faitsFieldsForKind});");

let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};

// ── #1 : faits = donnée unique, signature par document, incohérence après modification ──
const faits={motif_court:'Refus de tâche',motif_detail:'Propos agressifs puis refus de réceptionner les commandes, témoins X et Y',faits_date:'2026-07-12',faits_heure:'14:00',faits_lieu:'Cuisine',faits_impact:'Commandes non traitées'};
const sigLic=faitsSignature(faits,'licenciement'), sigConv=faitsSignature(faits,'convocation');
// documents générés : convocation + licenciement, sur ces faits
let recs={convocation:{sig:sigConv,at:'t1'}, licenciement:{sig:sigLic,at:'t2'}};
t('#1 aucun changement → aucun document incohérent', documentsIncoherents(faits,recs).length===0);
// L'utilisateur affine le DÉTAIL des faits (motif_detail)
const faits2={...faits, motif_detail:'Version dégradée : refusé de travailler après une dispute'};
t('#1 modif du détail → le LICENCIEMENT devient incohérent', documentsIncoherents(faits2,recs).includes('licenciement'));
t('#1 modif du détail → la CONVOCATION reste cohérente (elle ne détaille pas les faits)', !documentsIncoherents(faits2,recs).includes('convocation'));
// Changer le motif court touche les DEUX (les deux le rendent)
const faits3={...faits, motif_court:'Autre motif'};
t('#1 modif du motif court → convocation ET licenciement incohérents', documentsIncoherents(faits3,recs).length===2);
t('#1 la convocation ne signe QUE le motif court', JSON.stringify(_faitsFieldsForKind('convocation'))==='["motif_court"]');

// ── #2 : marge du délai — CAS RÉEL remise 13/07/2026 → entretien 21/07 (14/07 férié, 19/07 dimanche) ──
// Ancré sur la remise (présentation) : 15,16,17,sam18,(dim19 excl),lun20 = 5 ouvrables → marge 0.
const jReel=joursOuvrables('2026-07-13','2026-07-21');
t('#2 cas réel 13→21/07 (14/07 férié) = exactement 5 jours ouvrables', jReel===5);
t('#2 cas réel → marge 0 (conforme mais sans marge)', delaiMargeConvoc('2026-07-13','2026-07-21',5)===0);
t('#2 marge 0 est détectable (===0, pas <0)', delaiMargeConvoc('2026-07-13','2026-07-21',5)===0);
t('#2 entretien un jour plus tard (22/07) → marge 1', delaiMargeConvoc('2026-07-13','2026-07-22',5)===1);
t('#2 entretien trop tôt (20/07) → marge négative', delaiMargeConvoc('2026-07-13','2026-07-20',5)<0);
t('#2 remise complète (mode+date)', remiseComplete({mode:'main_propre',date_remise:'2026-07-13'})===true);
t('#2 remise incomplète (date manquante) → bloque', remiseComplete({mode:'main_propre'})===false);
t('#2 remise vide → incomplète', remiseComplete({})===false);

// ── #4 : titre du signataire selon la forme (normalisation du texte libre) ──
t('#4 SAS → Président', titreSignataire('SAS')==='Président');
t('#4 « S.A.S. » (points) → Président (normalisé)', titreSignataire('S.A.S.')==='Président');
t('#4 sasu minuscule → Président', titreSignataire('sasu')==='Président');
t('#4 SARL → Gérant', titreSignataire('SARL')==='Gérant');
t('#4 EURL → Gérant', titreSignataire('EURL')==='Gérant');
t('#4 SA → Président directeur général', titreSignataire('SA')==='Président directeur général');
t('#4 entreprise individuelle → L\'exploitant', titreSignataire('Entreprise individuelle')==="L'exploitant");
t('#4 forme inconnue → null (rien imposer)', titreSignataire('GIE')===null);
// Cohérence : SAS signée « Gérant » → incohérence (le cas réel du test)
t('#4 SAS + « Gérant » → incohérence signalée', !!titreIncoherent('SAS','Gérant'));
t('#4 SAS + « Président » → cohérent', titreIncoherent('SAS','Président')===null);
t('#4 SARL + « Gérant » → cohérent', titreIncoherent('SARL','Gérant')===null);
t('#4 qualité vide → pas d\'incohérence (on proposera le défaut)', titreIncoherent('SAS','')===null);
t('#4 forme inconnue → pas d\'incohérence (rien à comparer)', titreIncoherent('GIE','Gérant')===null);
t('#4 « Directeur général » sur SA → cohérent (même famille président)', titreIncoherent('SA','Directeur général')===null);

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

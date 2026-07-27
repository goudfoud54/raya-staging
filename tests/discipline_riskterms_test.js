// Faille 3 — détection des formulations à risque dans la motivation (SUGGESTION, jamais blocage).
// Fonction RÉELLE extraite d'avertissements/index.html.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","avertissements/index.html"),"utf8");
{ const s=h.indexOf("const RISK_TERMS="); const e=h.indexOf("// Affiche les suggestions"); if(s<0||e<0)throw new Error("RISK_TERMS/detectRiskTerms introuvable");
  eval(h.slice(s,e)+";global.detectRiskTerms=detectRiskTerms;"); }

let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const terms=txt=>detectRiskTerms(txt).map(x=>x.term.toLowerCase());

// ── Le cas réel du dossier audité ──
const reel="Vous avez refusé de travailler après vous être disputé avec votre équipe suite à un différend.";
t('cas réel : « disputé » ET « différend » détectés', terms(reel).some(x=>/disput/.test(x)) && terms(reel).some(x=>/diff/.test(x)));
t('cas réel : au moins 2 formulations signalées', detectRiskTerms(reel).length>=2);

// ── Litige partagé ──
t('« dispute » détecté', detectRiskTerms('une dispute a éclaté').length===1);
t('« différend » détecté (accents)', detectRiskTerms('un différend est survenu').length===1);
t('« conflit » détecté', detectRiskTerms('un conflit avec le chef').length===1);
t('« altercation » détecté', detectRiskTerms('une altercation en cuisine').length===1);

// ── Jugements sans fait ──
t('« comportement inacceptable » détecté', detectRiskTerms('comportement inacceptable envers un client').length===1);
t('« manque de professionnalisme » détecté', detectRiskTerms('manque de professionnalisme évident').length===1);
t('« mauvaise attitude » détecté', detectRiskTerms('mauvaise attitude en salle').length>=1);
t('« irrespect » détecté', detectRiskTerms('irrespect envers la hiérarchie').length===1);

// ── Chaque détection porte une explication ──
t('chaque hit a un « why » non vide', detectRiskTerms(reel).every(hh=>hh.why && hh.why.length>10));

// ── Ne se déclenche PAS sur une prose factuelle légitime (pas de faux positif bloquant) ──
const factuel="Le 12 mars 2026 à 14h, vous avez quitté votre poste de cuisine sans autorisation du chef M. Dupont, laissant le service du midi sans cuisinier pendant 40 minutes.";
t('prose factuelle → 0 formulation à risque (pas de faux positif)', detectRiskTerms(factuel).length===0);
t('texte vide → 0', detectRiskTerms('').length===0);
t('null → 0 (robuste)', detectRiskTerms(null).length===0);

// ── Dédoublonnage : le même terme répété ne compte qu'une fois ──
t('« conflit » répété → une seule suggestion', detectRiskTerms('conflit puis nouveau conflit et encore conflit').length===1);

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

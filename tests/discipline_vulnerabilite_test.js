// Cas particuliers — détection du salarié mineur (déductible de la fiche). Fonctions RÉELLES extraites.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","avertissements/index.html"),"utf8");
{ const s=h.indexOf("function ageAt("); const e=h.indexOf("function renderVulnBanner("); if(s<0||e<0)throw new Error("ageAt/estMineur introuvable");
  eval(h.slice(s,e)+";global.ageAt=ageAt;global.estMineur=estMineur;"); }

let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const ref='2026-07-27';

t('né en 2010 (16 ans au 27/07/2026) → mineur', estMineur({date_naissance:'2010-01-01'}, ref)===true);
t('né le 2008-07-28 (17 ans, anniv demain) → mineur', estMineur({date_naissance:'2008-07-28'}, ref)===true);
t('né le 2008-07-27 (18 ans pile aujourd\'hui) → PLUS mineur', estMineur({date_naissance:'2008-07-27'}, ref)===false);
t('né en 1990 → non mineur', estMineur({date_naissance:'1990-05-05'}, ref)===false);
t('ageAt calcule bien 16 ans', ageAt('2010-03-01', ref)===16);
t('ageAt gère l\'anniversaire non encore passé (17 pas 18)', ageAt('2008-12-31', ref)===17);

// Robustesse
t('date de naissance absente → non mineur (rien à déduire)', estMineur({}, ref)===false);
t('date invalide → non mineur', estMineur({date_naissance:'xxx'}, ref)===false);
t('salarié null → non mineur', estMineur(null, ref)===false);
t('date future → non mineur (a<0 filtré)', estMineur({date_naissance:'2030-01-01'}, ref)===false);

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

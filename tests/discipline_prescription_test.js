// L.1332-5 — une sanction de plus de 3 ans avant la nouvelle procédure ne peut plus être invoquée.
// Fonction RÉELLE extraite d'avertissements/index.html.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","avertissements/index.html"),"utf8");
{ const s=h.indexOf("function antecedentPrescrit("); const e=h.indexOf("\n}",s)+2; if(s<0)throw new Error("antecedentPrescrit introuvable");
  eval(h.slice(s,e)+";global.antecedentPrescrit=antecedentPrescrit;"); }

let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};

// Référence = date des faits de la NOUVELLE procédure : 2026-06-15.
const ref='2026-06-15';
t('sanction il y a 4 ans (2022-06-15) → PRESCRITE (>3 ans)', antecedentPrescrit('2022-06-15', ref)===true);
t('sanction il y a 2 ans (2024-06-15) → NON prescrite', antecedentPrescrit('2024-06-15', ref)===false);
t('sanction à exactement 3 ans moins 1 jour (2023-06-16) → NON prescrite', antecedentPrescrit('2023-06-16', ref)===false);
t('sanction à exactement 3 ans (2023-06-15) → NON prescrite (limite = pas STRICTEMENT avant)', antecedentPrescrit('2023-06-15', ref)===false);
t('sanction à 3 ans + 1 jour (2023-06-14) → PRESCRITE', antecedentPrescrit('2023-06-14', ref)===true);
t('sanction très ancienne (2015) → prescrite', antecedentPrescrit('2015-01-01', ref)===true);

// Robustesse
t('date de sanction nulle → non prescrite (rien à exclure)', antecedentPrescrit(null, ref)===false);
t('date invalide → non prescrite (défaut sûr)', antecedentPrescrit('pas-une-date', ref)===false);
t('ref absente → utilise aujourd\'hui : une sanction de 2010 est prescrite', antecedentPrescrit('2010-01-01', null)===true);

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

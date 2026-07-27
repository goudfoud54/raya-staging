// Faille 1 — la convocation à entretien préalable est BLOQUÉE tant que les adresses (inspection + mairie)
// manquent, sauf si l'entreprise a un CSE. Fonction RÉELLE extraite d'avertissements/index.html.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","avertissements/index.html"),"utf8");
{ const s=h.indexOf("function convocationBlockReason("); const e=h.indexOf("function generatePDF("); if(s<0||e<0)throw new Error("convocationBlockReason introuvable");
  eval(h.slice(s,e)+";global.convocationBlockReason=convocationBlockReason;"); }

let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const blocked=pp=>convocationBlockReason(pp)!==null;

// ── Sans CSE : les deux adresses sont requises ──
t('aucune adresse, pas de CSE → BLOQUÉ', blocked({}));
t('aucune adresse → les deux manquantes signalées', convocationBlockReason({}).length===2);
t('inspection seule → toujours bloqué (mairie manquante)', blocked({adresse_inspection_travail:'DREETS Épinal'}));
t('mairie seule → toujours bloqué (inspection manquante)', blocked({adresse_mairie:'Mairie Épinal'}));
t('les deux adresses présentes → NON bloqué', !blocked({adresse_inspection_travail:'DREETS, 88000 Épinal',adresse_mairie:'Mairie, 88000 Épinal'}));
t('adresses en espaces (vides réels) → bloqué', blocked({adresse_inspection_travail:'   ',adresse_mairie:'\t'}));

// ── Avec CSE : adresses non requises (conseiller extérieur inutile) ──
t('CSE présent, aucune adresse → NON bloqué (conseiller extérieur non requis)', !blocked({presence_cse:true}));
t('CSE présent + adresses → NON bloqué', !blocked({presence_cse:true,adresse_inspection_travail:'x',adresse_mairie:'y'}));

// ── Robustesse ──
t('pp null → bloqué (défaut sûr : rien de renseigné)', blocked(null));
t('pp undefined → bloqué', blocked(undefined));
// Le message identifie précisément ce qui manque
t('message = libellés d\'adresses manquantes (inspection + mairie)', (()=>{const m=convocationBlockReason({});return m.some(x=>/inspection/.test(x))&&m.some(x=>/mairie/.test(x));})());

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

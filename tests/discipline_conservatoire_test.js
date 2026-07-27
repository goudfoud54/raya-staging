// Faille 2 — alerte d'immédiateté de la mise à pied conservatoire (faute grave/lourde).
// Fonction RÉELLE extraite d'avertissements/index.html.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","avertissements/index.html"),"utf8");
{ const s=h.indexOf("function conservatoireImmediateteAlertes("); const e=h.indexOf("\n}",s)+2; if(s<0)throw new Error("fonction introuvable");
  eval(h.slice(s,e)+";global.conservatoireImmediateteAlertes=conservatoireImmediateteAlertes;"); }

let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const A=(f,c,v)=>conservatoireImmediateteAlertes(f,c,v);
const hasAlerte=r=>r.some(x=>x.niveau==='alerte');

// ── Le cas réel audité : 16 jours entre faits et sortie sans conservatoire immédiate ──
t('16 jours faits→conservatoire → ALERTE (immédiateté compromise)', hasAlerte(A('2026-06-01','2026-06-17',null)));

// ── Immédiat = OK ──
t('conservatoire le jour des faits → aucune alerte', A('2026-06-01','2026-06-01',null).length===0);
t('conservatoire à 1 jour → aucune alerte', A('2026-06-01','2026-06-02',null).length===0);
t('conservatoire à 2 jours → aucune alerte (tolérance)', A('2026-06-01','2026-06-03',null).length===0);

// ── Zone à justifier (info, pas alerte) ──
t('3 jours → info (à justifier), pas alerte', (()=>{const r=A('2026-06-01','2026-06-04',null);return r.length===1&&r[0].niveau==='info';})());
t('5 jours → info', (()=>{const r=A('2026-06-01','2026-06-06',null);return r.length===1&&r[0].niveau==='info';})());

// ── Trop long → alerte ──
t('7 jours → ALERTE', hasAlerte(A('2026-06-01','2026-06-08',null)));

// ── Incohérence de dates ──
t('conservatoire AVANT les faits → alerte', hasAlerte(A('2026-06-10','2026-06-01',null)));

// ── Délai conservatoire → convocation ──
t('conservatoire immédiate mais convocation 10 j plus tard → alerte sur ce 2e délai',
  hasAlerte(A('2026-06-01','2026-06-01','2026-06-11')));
t('conservatoire immédiate + convocation rapide (3 j) → aucune alerte', A('2026-06-01','2026-06-01','2026-06-04').length===0);

// ── Robustesse ──
t('dates manquantes → aucune alerte (rien à évaluer)', A(null,null,null).length===0);
t('faits seuls (pas encore de conservatoire) → aucune alerte', A('2026-06-01',null,null).length===0);
// chaque alerte porte un message
t('chaque alerte a un message non vide', A('2026-06-01','2026-06-17',null).every(x=>x.msg&&x.msg.length>10));

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

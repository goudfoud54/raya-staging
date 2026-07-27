// Calcul du délai en jours OUVRABLES (samedi compté, dimanche + jours fériés exclus, bornes exclues) +
// dérivation des jours fériés mobiles (Pâques). Fonctions RÉELLES extraites d'avertissements/index.html.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","avertissements/index.html"),"utf8");
{ const s=h.indexOf("function _isoDate("); const e=h.indexOf("// Nombre de jours OUVRABLES"); if(s<0)throw new Error("bloc fériés introuvable");
  const s2=h.indexOf("function joursOuvrables(",e), e2=h.indexOf("\n}",s2)+2;
  eval(h.slice(s,e)+h.slice(s2,e2)+";global._isoDate=_isoDate;global.joursFeries=joursFeries;global.joursOuvrables=joursOuvrables;"); }

let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};

// ── Jours fériés mobiles 2026 (Pâques dimanche 5 avril 2026) ──
const f26=joursFeries(2026);
t('2026 Lundi de Pâques = 6 avril', f26.has('2026-04-06'));
t('2026 Ascension = 14 mai', f26.has('2026-05-14'));
t('2026 Lundi de Pentecôte = 25 mai', f26.has('2026-05-25'));
t('2026 fériés fixes présents (1/1, 1/5, 8/5, 14/7, 15/8, 1/11, 11/11, 25/12)',
  ['2026-01-01','2026-05-01','2026-05-08','2026-07-14','2026-08-15','2026-11-01','2026-11-11','2026-12-25'].every(d=>f26.has(d)));
t('2026 : 11 jours fériés au total', f26.size===11);
// Contrôle d'une autre année (Pâques dimanche 20 avril 2025 → Lundi 21)
t('2025 Lundi de Pâques = 21 avril (dérivation, pas codé en dur)', joursFeries(2025).has('2025-04-21'));
t('2024 Lundi de Pâques = 1er avril (Pâques 31 mars)', joursFeries(2024).has('2024-04-01'));

// ── joursOuvrables : bornes exclues, samedi compté, dimanche exclu ──
// Lundi 5 janv 2026 → lundi 12 janv : entre = mar,mer,jeu,ven,SAM (dim exclu) = 5. Le samedi COMPTE.
t('lundi → lundi suivant (7 j) = 5 jours ouvrables (samedi compté, bornes exclues)', joursOuvrables('2026-01-05','2026-01-12')===5);
// lundi → samedi : entre = mar,mer,jeu,ven (le SAMEDI est la borne d'entretien, EXCLUE) = 4.
t('bornes exclues : lundi → samedi = 4 (mar..ven ; samedi = borne exclue)', joursOuvrables('2026-01-05','2026-01-10')===4);
t('borne d\'entretien exclue : lundi → vendredi = 3 (mar,mer,jeu)', joursOuvrables('2026-01-05','2026-01-09')===3);
t('même jour ou fin ≤ début → 0', joursOuvrables('2026-01-05','2026-01-05')===0);
t('null si date manquante', joursOuvrables(null,'2026-01-12')===null);

// ── FÉRIÉ MOBILE/FIXE EN MILIEU DE SEMAINE : réduit le décompte (le cœur de la vérif demandée) ──
// Lundi 27 avril 2026 → lundi 4 mai : entre = mar28,mer29,jeu30,VEN 1er mai (FÉRIÉ, exclu),sam2,(dim3) = 4.
t('férié 1er mai en milieu de semaine → 4 jours ouvrables (pas 5) → délai NON atteint', joursOuvrables('2026-04-27','2026-05-04')===4);
// Preuve que c'est bien le férié qui retire 1 : une semaine SANS férié sur le même écart = 5.
t('même écart (7 j) sans férié = 5 → l\'écart provient bien du férié', joursOuvrables('2026-01-05','2026-01-12')===5);
// Ascension (jeudi 14 mai 2026) au milieu : lundi 11 mai → lundi 18 mai : mar12,mer13,JEU14(férié),ven15,sam16 = 4.
t('Ascension (férié mobile) en semaine → 4 ouvrables (pas 5)', joursOuvrables('2026-05-11','2026-05-18')===4);

// ── Seuils métier : le module bloque à <5 (convocation) et <2 (notification) ──
t('exactement 5 ouvrables → convocation OK (pas <5)', joursOuvrables('2026-01-05','2026-01-12')>=5);
t('4 ouvrables (semaine fériée) → convocation bloquée (<5)', joursOuvrables('2026-04-27','2026-05-04')<5);

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

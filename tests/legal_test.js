// S2 — seuils légaux : legalBreach déclenche au bon seuil (et pas au-dessus), legalBreachList agrège.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
// Extrait LEGAL_LIMITS (const objet) + legalBreach + legalBreachList (fonctions).
{ const i=h.indexOf('const LEGAL_LIMITS='); let d=0,j=h.indexOf('{',i),st=j; for(;j<h.length;j++){if(h[j]==='{')d++;else if(h[j]==='}'){d--;if(d===0){j++;break;}}}
  eval('global.LEGAL_LIMITS='+h.slice(st,j)+';'); }
eval('global.legalBreach='+h.match(/function legalBreach\(cle, val\)\{[\s\S]*?\n\}/)[0]);
eval('global.legalBreachList='+h.match(/function legalBreachList\(\)\{[\s\S]*?\n\}/)[0]);
let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};

// repos_quotidien_h : min 11
t('repos 10h → sous le seuil (breach)', legalBreach('repos_quotidien_h','10')?.seuil===11);
t('repos 11h → PAS de breach (au seuil)', legalBreach('repos_quotidien_h','11')===null);
t('repos 12h → PAS de breach (au-dessus)', legalBreach('repos_quotidien_h','12')===null);
t('repos ref = art. L3131-1 (fournie, vérifiée)', /L3131-1/.test(legalBreach('repos_quotidien_h','9').ref));
// jour_off_min : min 1
t('jour_off 0 → breach', legalBreach('jour_off_min','0')?.seuil===1);
t('jour_off 1 → PAS de breach', legalBreach('jour_off_min','1')===null);
// plafond_hebdo : max 48
t('plafond 50 → breach (>48)', legalBreach('plafond_hebdo','50')?.seuil===48);
t('plafond 48 → PAS de breach', legalBreach('plafond_hebdo','48')===null);
t('plafond 40 → PAS de breach', legalBreach('plafond_hebdo','40')===null);
// amplitude_max : max 13
t('amplitude 14 → breach (>13)', legalBreach('amplitude_max','14')?.seuil===13);
t('amplitude 12 → PAS de breach', legalBreach('amplitude_max','12')===null);
// règle sans seuil légal
t('coupure_min → aucun seuil légal (null)', legalBreach('coupure_min','1')===null);
// valeur non numérique
t('valeur vide → null (pas de faux positif)', legalBreach('repos_quotidien_h','')===null);

// legalBreachList agrège les règles en base
global.S={regles:[{cle:'repos_quotidien_h',valeur:'10'},{cle:'plafond_hebdo',valeur:'52'},{cle:'amplitude_max',valeur:'12'},{cle:'coupure_min',valeur:'3'}]};
const bl=legalBreachList();
t('legalBreachList : 2 réglages sous seuil (repos 10 + plafond 52), amplitude 12 OK', bl.length===2 && bl.some(x=>x.cle==='repos_quotidien_h') && bl.some(x=>x.cle==='plafond_hebdo'));

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

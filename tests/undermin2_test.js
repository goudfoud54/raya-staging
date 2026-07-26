const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
function grab(name){const re=new RegExp("function "+name+"\\s*\\(");const i=h.search(re);let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
global.S={dispos:[],miseAPied:[]};
eval("global.hasPonctuelleAbsence="+grab("hasPonctuelleAbsence").replace(/^function/,'function')+";");
eval("global.isSuspended="+grab("isSuspended").replace(/^function/,'function')+";");
// mirror the exact inlined proration (now using hasPonctuelleAbsence)
function flagged(sal, have, W){
  const mn=sal.heures_min||0;
  if(have>=mn-0.01) return {flag:false};
  const blocked=W.filter(d=>hasPonctuelleAbsence(sal.id,d)||isSuspended(sal.id,d)).length;
  const dispo=7-blocked; const proratedMin=mn*dispo/7;
  return {flag: have<proratedMin-0.01, blocked, proratedMin:+proratedMin.toFixed(2)};
}
const W=['2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07','2026-08-08','2026-08-09'];
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};

// Mahmoud: ponctuelle every day → still excluded
S.dispos=W.map(d=>({salarie_id:'mah',statut:'indispo',statut_demande:'validee',type:'ponctuelle',date_specifique:d}));
let r=flagged({id:'mah',heures_min:35},0,W);
console.log('  Mahmoud:',JSON.stringify(r));
t('Mahmoud (ponctuelles) reste EXCLU', r.flag===false && r.blocked===7);

// NEW: recurrente-only part-timer, under min → NOT prorated anymore (blocked 0) → flagged if under
S.dispos=[{salarie_id:'pt',statut:'indispo',statut_demande:'validee',type:'recurrente',jour_semaine:5},
          {salarie_id:'pt',statut:'indispo',statut_demande:'validee',type:'recurrente',jour_semaine:6}]; // sat+sun off
r=flagged({id:'pt',heures_min:20},12,W);
console.log('  recurrente-only:',JSON.stringify(r));
t('récurrente seule NON proratisée (blocked 0) → 12h/20 flag manque plein', r.flag===true && r.blocked===0 && Math.abs(r.proratedMin-20)<0.01);

// Mixed: 2 ponctuelles + recurrente → only ponctuelles count (blocked 2)
S.dispos=[{salarie_id:'mx',statut:'indispo',statut_demande:'validee',type:'ponctuelle',date_specifique:'2026-08-03'},
          {salarie_id:'mx',statut:'indispo',statut_demande:'validee',type:'ponctuelle',date_specifique:'2026-08-04'},
          {salarie_id:'mx',statut:'indispo',statut_demande:'validee',type:'recurrente',jour_semaine:6}];
r=flagged({id:'mx',heures_min:35},10,W);
console.log('  mixed:',JSON.stringify(r));
t('mix : seules les 2 ponctuelles comptent (blocked 2 → prorata 25)', r.blocked===2 && Math.abs(r.proratedMin-25)<0.01);

// mise à pied still counts
S.dispos=[]; S.miseAPied=[{salarie_id:'m2',mise_a_pied_debut:'2026-08-01',mise_a_pied_fin:'2026-08-15'}];
r=flagged({id:'m2',heures_min:35},0,W);
t('mise à pied semaine entière → exclu', r.flag===false && r.blocked===7);

console.log(ok?'\nALL PASS':'\nSOME FAILED');

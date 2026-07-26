const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
function grab(name){const re=new RegExp("function "+name+"\\s*\\(");const i=h.search(re);let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
global.S={dispos:[],miseAPied:[]};
eval("global.hasIndispo="+grab("hasIndispo").replace(/^function/,'function')+";");
eval("global.isSuspended="+grab("isSuspended").replace(/^function/,'function')+";");
const fmtDate=d=>{const x=new Date(d);return x.toISOString().slice(0,10);};

// exact proration mirror of the inlined underMin logic
function flagged(sal, have, weekDates){
  const mn=sal.heures_min||0;
  if(have>=mn-0.01) return {flag:false,reason:'>=min'};
  const blocked=weekDates.filter(d=>hasIndispo(sal.id,d)||isSuspended(sal.id,d)).length;
  const dispo=7-blocked;
  const proratedMin=mn*dispo/7;
  return {flag: have<proratedMin-0.01, blocked, proratedMin:+proratedMin.toFixed(2), manque:+Math.max(0,proratedMin-have).toFixed(2)};
}
// Semaine 32
const wk=[3,4,5,6,7,8,9].map(d=>`2026-08-0${d}`.replace('0-0','-0')); // build 2026-08-03..09
const W=['2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07','2026-08-08','2026-08-09'];

let ok=true;const t=(label,cond)=>{console.log((cond?'PASS':'FAIL')+' · '+label);ok=cond&&ok;};

// Case Mahmoud: full-week arrêt maladie (ponctuelle every day) + heures_min 35, have 0
S.dispos = W.map(d=>({salarie_id:'mah',statut:'indispo',statut_demande:'validee',type:'ponctuelle',date_specifique:d}));
S.miseAPied=[];
let r=flagged({id:'mah',heures_min:35},0,W);
console.log('  Mahmoud:',JSON.stringify(r));
t('Mahmoud fully absent → NOT flagged', r.flag===false && r.blocked===7);

// Case partial 3 days sick, have 10 -> flagged, prorated 20, manque 10
S.dispos=[W[0],W[1],W[2]].map(d=>({salarie_id:'p',statut:'indispo',statut_demande:'validee',type:'ponctuelle',date_specifique:d}));
r=flagged({id:'p',heures_min:35},10,W);
console.log('  partial-10h:',JSON.stringify(r));
t('3j absent, 10h → flagged, prorated≈20, manque≈10', r.flag===true && Math.abs(r.proratedMin-20)<0.1 && Math.abs(r.manque-10)<0.1);

// Case partial 3 days but 22h -> NOT flagged (exceeds prorated 20)
r=flagged({id:'p',heures_min:35},22,W);
console.log('  partial-22h:',JSON.stringify(r));
t('3j absent, 22h → NOT flagged (>=prorated 20)', r.flag===false);

// Case no absence, 30h vs 35 -> flagged (unchanged), manque 5
S.dispos=[];
r=flagged({id:'q',heures_min:35},30,W);
console.log('  noabs-30h:',JSON.stringify(r));
t('no absence, 30h/35 → flagged manque 5', r.flag===true && r.blocked===0 && Math.abs(r.manque-5)<0.1);

// Case mise à pied whole week -> excluded
S.dispos=[]; S.miseAPied=[{salarie_id:'m2',mise_a_pied_debut:'2026-08-01',mise_a_pied_fin:'2026-08-15'}];
r=flagged({id:'m2',heures_min:35},0,W);
console.log('  miseapied:',JSON.stringify(r));
t('mise à pied full week → NOT flagged', r.flag===false && r.blocked===7);

console.log(ok?'\nALL PASS':'\nSOME FAILED');

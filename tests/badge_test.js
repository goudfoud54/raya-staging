const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
function grab(name){const re=new RegExp("function "+name+"\\s*\\(");const i=h.search(re);let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
eval(h.match(/const _pmin\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval(h.match(/const fmtH1\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval("global.otherSnackHoursOf="+grab("otherSnackHoursOf").replace(/^function/,'function')+";");
eval("global.otherSnackBreakdown="+grab("otherSnackBreakdown").replace(/^function/,'function')+";");
global.SNACK={id:'lobau'};
global.S={restos:[{id:'lobau',nom:'Raya Lobau'},{id:'gc',nom:'Raya Grand Cœur'}],
  allCreneauxWeek:[
    {salarie_id:'ahmad',restaurant_id:'lobau',date:'2026-08-03',heure_debut:'18:00',heure_fin:'00:00'}, // current snack, excluded
    {salarie_id:'ahmad',restaurant_id:'gc',date:'2026-08-03',heure_debut:'10:30',heure_fin:'18:00'}, // 7.5h
    {salarie_id:'ahmad',restaurant_id:'gc',date:'2026-08-05',heure_debut:'11:00',heure_fin:'18:00'}, // 7h
  ]};
console.log('otherSnackHoursOf (expect 14.5):', otherSnackHoursOf('ahmad'));
console.log('fmtH1(14.5):', fmtH1(14.5));
console.log('breakdown:', JSON.stringify(otherSnackBreakdown('ahmad')));
console.log('mono sal (no other):', otherSnackHoursOf('nobody'));

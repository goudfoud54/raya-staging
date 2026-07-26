const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
function grab(name){const re=new RegExp("function "+name+"\\s*\\(");const i=h.search(re);let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
eval(h.match(/const _pmin\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval(h.match(/const _pdur\s*=[^\n]*/)[0].replace(/^const/,'var'));
eval(h.match(/const fmtH1\s*=[^\n]*/)[0].replace(/^const/,'var'));
global.escP=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
eval("global._toMin="+grab("_toMin").replace(/^function/,'function')+";");
try{eval("global.overlaps="+grab("overlaps").replace(/^function/,'function')+";");}catch(e){}
try{eval("global.weekMinutesOf="+grab("weekMinutesOf").replace(/^function/,'function')+";");}catch(e){}
try{eval("global._indispoBlocking="+grab("_indispoBlocking").replace(/^function/,'function')+";");}catch(e){}
eval("global.isMultiSnack="+grab("isMultiSnack").replace(/^function/,'function')+";");
eval("global.weekHoursOf="+grab("weekHoursOf").replace(/^function/,'function')+";");
eval("global.plafondOf="+grab("plafondOf").replace(/^function/,'function')+";");
eval("global.otherSnackBreakdown="+grab("otherSnackBreakdown").replace(/^function/,'function')+";");
eval("global.rowHoursCell="+grab("rowHoursCell").replace(/^function/,'function')+";");
eval("global.snackTargetSlots="+grab("snackTargetSlots").replace(/^function/,'function')+";");
global.salById=id=>SAL[id];
global.SNACK={id:'lobau',nom:'Raya Lobau'};
global.SAL={sarah:{id:'sarah',heures_min:20,heures_max:39,est_multi:true,snacks_priorites:['lobau','gc']}};
global.S={restos:[{id:'lobau',nom:'Raya Lobau'},{id:'gc',nom:'Raya Grand Cœur'}],
  creneaux:[{salarie_id:'sarah',restaurant_id:'lobau',heure_debut:'10:00',heure_fin:'19:00'}], // 9h current
  allCreneauxWeek:[{salarie_id:'sarah',restaurant_id:'lobau',heure_debut:'10:00',heure_fin:'19:00'},
                   {salarie_id:'sarah',restaurant_id:'gc',heure_debut:'10:00',heure_fin:'18:00'},
                   {salarie_id:'sarah',restaurant_id:'gc',heure_debut:'10:00',heure_fin:'17:00'},
                   {salarie_id:'sarah',restaurant_id:'gc',heure_debut:'11:00',heure_fin:'18:00'}],
  effectifs:[
    {restaurant_id:'lobau',nb_cible:2}, {restaurant_id:'lobau',nb_cible:3},           // lobau 5
    {restaurant_id:'gc',vagues:[{},{},{}]}, {restaurant_id:'gc',nb_cible:1},          // gc 3+1=4
  ]};
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const r=rowHoursCell(SAL.sarah);
console.log('  html:',r.html);
t('Σ compact « Σ 31h » (sans « tous snacks »)', /Σ 31h</.test(r.html) && !r.html.includes('tous snacks'));
t('title contient le détail par snack (Lobau + Grand Cœur)', /title="[^"]*Lobau : 9h[^"]*Grand Cœur : 22h/.test(r.html));
t('title libellé « Total toutes plannings confondus (31h) »', r.html.includes('Total toutes plannings confondus (31h)'));
// snackTargetSlots : lobau=5 > gc=4 → lobau plus contraint
console.log('  slots lobau=',snackTargetSlots('lobau'),' gc=',snackTargetSlots('gc'));
t('snackTargetSlots: lobau(5, nb_cible) > gc(4, vagues+nb_cible)', snackTargetSlots('lobau')===5 && snackTargetSlots('gc')===4);
t('ordre le plus contraint d\'abord = [lobau, gc]', ['lobau','gc'].slice().sort((a,b)=>snackTargetSlots(b)-snackTargetSlots(a)).join(',')==='lobau,gc');
console.log(ok?'\nALL PASS':'\nSOME FAILED');

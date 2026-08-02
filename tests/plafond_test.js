const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
require("./plprims.js").installPlanningPrims(h);   // constantes/helpers de fichier (F2H_*, _finAbsM, _restoNom)
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
function grab(name){const re=new RegExp("(?:async\\s+)?function "+name+"\\s*\\(");const i=h.search(re);if(i<0)throw"no "+name;let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
function gc(n){const m=h.match(new RegExp("const "+n+"\\s*=[^\\n]*"));return m?m[0].replace(/^const/,'var'):null;}
eval(gc("_pmin")); eval(gc("_pdur"));
eval("global._overlap="+grab("_overlap").replace(/^function/,'function')+";");
eval("global._endCapMin="+grab("_endCapMin").replace(/^function/,'function')+";");
eval("global._ruleCtx="+grab("_ruleCtx").replace(/^function/,'function')+";");
eval("global.isMultiSnack="+grab("isMultiSnack").replace(/^function/,'function')+";");
eval("global.weekMinutesOf="+grab("weekMinutesOf").replace(/^function/,'function')+";");
eval("global.plafondOf="+grab("plafondOf").replace(/^function/,'function')+";");
eval("global._toMin="+grab("_toMin").replace(/^function/,'function')+";");
eval("global.overlaps="+grab("overlaps").replace(/^function/,'function')+";");
eval("global._indispoBlocking="+grab("_indispoBlocking").replace(/^function/,'function')+";");
eval("global.checkPlacement="+grab("checkPlacement").replace(/^function/,'function')+";");
eval("global."+gc("PLACE_RULES").slice(4));
global.fmtDate=d=>{const x=new Date(d);return x.toISOString().slice(0,10);};
global.salById=id=>SAL[id];
global.onRoster=()=>true;
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.rolesOf=id=>SAL[id].roles||['cuisine'];
global.isExp=()=>true; global.altDayType=()=>null;
const LOB='lob',CAR='car';
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
// build 7 x 5h Lobau créneaux = 35h (spread across days to avoid dbl_svc/repos issues: 1 soir per day)
function lobau35(sid){ return [0,1,2,3,4,5,6].map(i=>({id:'L'+i,restaurant_id:LOB,salarie_id:sid,role:'cuisine',date:`2026-07-${27+i>31?'0'+(i-4):27+i}`.replace('2026-07-0','2026-08-0'),service:'soir',heure_debut:'13:00',heure_fin:'18:00'})); }
// simpler: use fixed dates Mon..Sun 2026-07-27..08-02
const D=['2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-07-31','2026-08-01','2026-08-02'];
function lob35(sid){return D.map((d,i)=>({id:'L'+i,restaurant_id:LOB,salarie_id:sid,role:'cuisine',date:d,service:'soir',heure_debut:'13:00',heure_fin:'18:00'}));} // 7×5=35h

function setup(sal, lobCre, carCre){
  global.SAL={}; SAL[sal.id]=sal;
  global.S={restos:[{id:LOB,nom:'Lobau'},{id:CAR,nom:'Carnot'}],dispos:[],miseAPied:[],
    creneaux:(carCre||[]).slice(), // current snack = Carnot
    allCreneauxWeek:[...(lobCre||[]),...(carCre||[])]};
  global.SNACK={id:CAR,nom:'Carnot'};
}
global.S={regles:[]};
const rg=_ruleCtx();

// TEST 1 : multi 35h Lobau + tentative 12h Carnot (mardi midi, un jour libre), max 45 → REJET plafond (35+12=47>45)
const multi={id:'a',nom:'A',heures_max:45,est_multi:true,roles:['cuisine'],snacks_priorites:[{restaurant_id:LOB},{restaurant_id:CAR}]};
setup(multi, lob35('a'), []);
// place candidate 12h on Carnot a day with no Lobau conflict? Lobau occupies every day soir 13-18. Put Carnot midi 10:00-22:00 (12h) Wednesday → coupure with Lobau soir same day? Lobau 13:00-18:00, Carnot 10:00-22:00 overlap → inter_snack. Use a candidate that doesn't overlap: but Lobau is every day. To isolate PLAFOND, drop Lobau on the test day.
// Rebuild: Lobau 35h but leave Wednesday(2026-07-29) free of Lobau, add extra Lobau elsewhere. Simpler: 35h via 5 days×7h on Mon-Fri, Carnot candidate on Saturday.
function lob35b(sid){return ['2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-07-31'].map((d,i)=>({id:'L'+i,restaurant_id:LOB,salarie_id:sid,role:'cuisine',date:d,service:'soir',heure_debut:'11:00',heure_fin:'18:00'}));} // 5×7=35h Mon-Fri
setup(multi, lob35b('a'), []);
let cand={deb:'10:00',fin:'22:00',role:'cuisine'}; // 12h, Saturday 2026-08-01 (no Lobau that day)
let r=checkPlacement('a',cand,'2026-08-01','midi',5,{rg});
console.log('  T1:',r&&r.cle);
t('multi 35h(Lobau)+12h(Carnot)=47 > max 45 → REJET plafond', r&&r.cle==='plafond');

// TEST 2 : même mais 8h Carnot → 43 ≤ 45 → ACCEPTÉ
setup(multi, lob35b('a'), []);
cand={deb:'10:00',fin:'18:00',role:'cuisine'}; // 8h
r=checkPlacement('a',cand,'2026-08-01','midi',5,{rg});
console.log('  T2:',r);
t('multi 35h+8h=43 ≤ 45 → ACCEPTÉ (null)', r===null);

// TEST 3 : MONO-snack inchangé — 40h sur Carnot seul, max 45, +8h → 48>45 REJET (local, pas de régression)
const mono={id:'b',nom:'B',heures_max:45,est_multi:false,roles:['cuisine'],snack_origine_id:CAR};
const car40=['2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-07-31'].map((d,i)=>({id:'C'+i,restaurant_id:CAR,salarie_id:'b',role:'cuisine',date:d,service:'soir',heure_debut:'10:00',heure_fin:'18:00'})); // 5×8=40h
setup(mono, [], car40);
cand={deb:'10:00',fin:'18:00',role:'cuisine'};
r=checkPlacement('b',cand,'2026-08-01','midi',5,{rg});
t('mono 40h Carnot +8h=48 > 45 → REJET (comportement local inchangé)', r&&r.cle==='plafond');
// mono 40h +5h=45 ok
setup(mono, [], car40); cand={deb:'10:00',fin:'15:00',role:'cuisine'};
r=checkPlacement('b',cand,'2026-08-01','midi',5,{rg});
t('mono 40h +5h=45 ≤ 45 → ACCEPTÉ', r===null);

// TEST 4 : excludeSelf — remplacer un créneau EXISTANT ne le compte pas deux fois.
// multi a 35h Lobau + un créneau Carnot samedi 10:00-18:00 (8h) DÉJÀ posé = 43h global. On re-teste
// ce même créneau (excludeSelf) avec un shift 10h → global sans self = 35, +10 = 45 ≤ 45 → ACCEPTÉ.
const selfCre=[{id:'self',restaurant_id:CAR,salarie_id:'a',role:'cuisine',date:'2026-08-01',service:'midi',heure_debut:'10:00',heure_fin:'18:00'}];
setup(multi, lob35b('a'), selfCre);
cand={deb:'10:00',fin:'20:00',role:'cuisine'}; // 10h
r=checkPlacement('a',cand,'2026-08-01','midi',5,{rg,excludeSelf:true});
console.log('  T4 excludeSelf:',r);
t('excludeSelf : self (8h) exclu → 35+10=45 ≤ 45 ACCEPTÉ (pas de double comptage)', r===null);
// Preuve directe du no-double-count : weekMinutesOf avec/sans excludeSelf diffère EXACTEMENT du self (8h=480min).
setup(multi, lob35b('a'), selfCre);
const wInc=weekMinutesOf('a');
const wExc=weekMinutesOf('a',{excludeSelf:true,date:'2026-08-01',svc:'midi',restaurant_id:CAR});
console.log('  weekMin incl self:',wInc,' excl self:',wExc,' delta:',wInc-wExc);
t('excludeSelf retire EXACTEMENT le self (8h) : 2580 → 2100, delta 480', wInc===2580 && wExc===2100);
// et global multi = Lobau 35h + self 8h = 43h (2580) → prouve que weekMinutesOf lit bien S.allCreneauxWeek
t('multi : weekMinutesOf = cumul GLOBAL tous snacks (Lobau+Carnot=43h)', wInc===2580);

console.log(ok?'\nALL PASS':'\nSOME FAILED');

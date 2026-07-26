const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
function grab(name){const re=new RegExp("(?:async\\s+)?function "+name+"\\s*\\(");const i=h.search(re);if(i<0)throw"no "+name;let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
function gc(n){const m=h.match(new RegExp("const "+n+"\\s*=[^\\n]*"));return m[0].replace(/^const/,'var');}
eval(gc("_pmin"));
eval("global._toMin="+grab("_toMin").replace(/^function/,'function')+";");
eval("global.overlaps="+grab("overlaps").replace(/^function/,'function')+";");
eval("global._overlap="+grab("_overlap").replace(/^function/,'function')+";");
eval("global._endCapMin="+grab("_endCapMin").replace(/^function/,'function')+";");
eval("global._ruleCtx="+grab("_ruleCtx").replace(/^function/,'function')+";");
eval("global.isMultiSnack="+grab("isMultiSnack").replace(/^function/,'function')+";");
eval("global.weekMinutesOf="+grab("weekMinutesOf").replace(/^function/,'function')+";");
eval("global.plafondOf="+grab("plafondOf").replace(/^function/,'function')+";");
eval("global._indispoBlocking="+grab("_indispoBlocking").replace(/^function/,'function')+";");
eval("global.checkPlacement="+grab("checkPlacement").replace(/^function/,'function')+";");
eval(gc("_pdur"));
eval("global."+gc("PLACE_RULES").slice(4));
global.fmtDate=d=>{const x=new Date(d);return x.toISOString().slice(0,10);};
global.salById=id=>SAL[id];
global.onRoster=()=>true; global.altDayType=()=>null; global.isExp=()=>true; global.rolesOf=()=>['cuisine'];
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
const CAR='car';
global.S={regles:[],restos:[{id:CAR,nom:'Carnot'},{id:'lob',nom:'Lobau'}],creneaux:[],allCreneauxWeek:[]};
global.SNACK={id:CAR,nom:'Carnot'};
const rg=_ruleCtx();
// Souleye : indispo récurrente LUNDI (di=0) 10:00-18:00 (partielle)
global.SAL={s:{id:'s',nom:'Souleye',heures_max:45,est_multi:false,snack_origine_id:CAR,roles:['cuisine']}};
function setDispos(d){ S.dispos=d; }
const MONDAY='2026-07-27'; // di=0
const recMon=[{salarie_id:'s',statut:'indispo',statut_demande:'validee',type:'recurrente',jour_semaine:0,heure_debut:'10:00:00',heure_fin:'18:00:00'}];
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
function cp(deb,fin,date,di,svc){ return checkPlacement('s',{deb,fin,role:'cuisine'},date,svc||'soir',di,{rg}); }

// === CAS DEMANDÉS ===
setDispos(recMon);
t('indispo 10:00–18:00 + créneau 18:00→00:00 → ACCEPTÉ (adjacent)', cp('18:00','00:00',MONDAY,0)===null);
t('indispo 10:00–18:00 + créneau 17:30→23:00 → REJET indispo (vrai chevauchement)', (cp('17:30','23:00',MONDAY,0)||{}).cle==='indispo');
t('indispo 10:00–18:00 + créneau 10:00→15:00 → REJET indispo', (cp('10:00','15:00',MONDAY,0,'midi')||{}).cle==='indispo');
t('indispo 10:00–18:00 + créneau 08:00→10:00 → ACCEPTÉ (adjacent avant)', cp('08:00','10:00',MONDAY,0,'midi')===null);

// Franchissement minuit : créneau 19:00→02:00 (lundi) vs indispo 01:00–03:00 du LENDEMAIN (mardi di=1)
setDispos([{salarie_id:'s',statut:'indispo',statut_demande:'validee',type:'recurrente',jour_semaine:1,heure_debut:'01:00:00',heure_fin:'03:00:00'}]);
t('minuit : créneau 19:00→02:00 vs indispo lendemain 01:00–03:00 → REJET', (cp('19:00','02:00',MONDAY,0)||{}).cle==='indispo');
// contrôle : même créneau mais indispo lendemain 03:00–05:00 (pas de chevauchement avec 00:00-02:00) → ACCEPTÉ
setDispos([{salarie_id:'s',statut:'indispo',statut_demande:'validee',type:'recurrente',jour_semaine:1,heure_debut:'03:00:00',heure_fin:'05:00:00'}]);
t('minuit : créneau 19:00→02:00 vs indispo lendemain 03:00–05:00 → ACCEPTÉ (pas de chevauchement)', cp('19:00','02:00',MONDAY,0)===null);

// Journée entière (sans heures) → bloque tout le jour
setDispos([{salarie_id:'s',statut:'indispo',statut_demande:'validee',type:'recurrente',jour_semaine:0}]);
t('indispo journée ENTIÈRE lundi → soir 18:00→00:00 REJET', (cp('18:00','00:00',MONDAY,0)||{}).cle==='indispo');
// ponctuelle partielle
setDispos([{salarie_id:'s',statut:'indispo',statut_demande:'validee',type:'ponctuelle',date_specifique:MONDAY,heure_debut:'10:00:00',heure_fin:'18:00:00'}]);
t('ponctuelle partielle 10-18 + soir 18:00→00:00 → ACCEPTÉ', cp('18:00','00:00',MONDAY,0)===null);

// === NON-RÉGRESSION overlaps semi-ouvert direct ===
t('overlaps 18:00→00:00 vs 10:00–18:00 = false (adjacent)', overlaps('18:00','00:00','10:00','18:00')===false);
t('overlaps 17:30→23:00 vs 10:00–18:00 = true', overlaps('17:30','23:00','10:00','18:00')===true);
t('overlaps 10:00→15:00 vs 10:00–18:00 = true (borne début)', overlaps('10:00','15:00','10:00','18:00')===true);
t('overlaps 08:00→10:00 vs 10:00–18:00 = false (adjacent avant)', overlaps('08:00','10:00','10:00','18:00')===false);

console.log(ok?'\nALL PASS':'\nSOME FAILED');

console.log('\n=== VALIDATION réelle DIABIRA/FISSIROU (indispo Mon-Fri 10:00-18:00) ===');
let ok2=true;const t2=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok2=c&&ok2;};
// indispos réelles : récurrentes di 0..4, 10:00-18:00
const realInd=[0,1,2,3,4].map(d=>({salarie_id:'s',statut:'indispo',statut_demande:'validee',type:'recurrente',jour_semaine:d,heure_debut:'10:00:00',heure_fin:'18:00:00'}));
setDispos(realInd);
// "Lundi soir · Réception 18:00→00:00" (Carnot) — lundi di=0
t2('Lundi soir 18:00→00:00 → PLUS rejeté indispo (ACCEPTÉ)', cp('18:00','00:00','2026-07-27',0)===null);
// "Jeudi soir · Cuisine 19:00→23:30" (Lobau) — jeudi di=3
S.creneaux=[]; // même snack (isole le test indispo ; le resto Lobau serait un autre rejet)
t2('Jeudi soir 19:00→23:30 → PLUS rejeté indispo (ACCEPTÉ)', cp('19:00','23:30','2026-07-30',3)===null);
// contrôle : un MIDI ces jours-là reste bien bloqué (10:00-18:00)
t2('Jeudi midi 11:00→14:30 reste REJETÉ indispo (chevauche 10-18)', (cp('11:00','14:30','2026-07-30',3,'midi')||{}).cle==='indispo');
console.log(ok2?'\nVALIDATION OK':'\nFAIL');

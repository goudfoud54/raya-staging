// S1 — contraintes individuelles (salarie_contraintes) branchées dans checkPlacement.
// Teste _contrainteBlocking en direct (chaque clé dure + inactive ignorée + autre) ET l'intégration checkPlacement (cas ADAM HOJR).
const fs=require("fs");const {extractFn}=require("./extract.js");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
const grab=n=>extractFn(h,n);
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global._toMin=global._pmin;
global._pdur=(d,f)=>{let a=_pmin(d),b=_pmin(f);if(a==null||b==null)return 0;if(b<=a)b+=1440;return b-a;};
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
// Bloc contraintes (contrOf, _JOURS_IDX, _dayIndexOf, _truthyContr, _contrainteBlocking) — évalué en un tenant.
{ const start=h.indexOf('function contrOf(sid){'); const end=h.indexOf('function _endCapMin'); if(start<0||end<0)throw new Error('bloc contraintes introuvable');
  eval(h.slice(start,end)+'\nglobal.contrOf=contrOf;global._dayIndexOf=_dayIndexOf;global._truthyContr=_truthyContr;global._JOURS_IDX=_JOURS_IDX;global._contrainteBlocking=_contrainteBlocking;'); }
// Reste des fonctions pour l'intégration checkPlacement.
for(const fn of ['overlaps','_overlap','_indispoBlocking','_endCapMin','_ruleCtx','isMultiSnack','weekMinutesOf','plafondOf','hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement']){
  try{ eval("global."+fn+"="+grab(fn)+";"); }catch(e){ console.log('MISS',fn,(''+e).split('\n')[0]); }
}
{ const i=h.indexOf("const PLACE_RULES="); let d=0,j=h.indexOf("{",i),st=j; for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}} eval("global.PLACE_RULES="+h.slice(st,j)+";"); }
global.SNACK={id:'snk',nom:'Snack'};
global.salById=id=>SAL[id]; global.onRoster=()=>true; global.altDayType=()=>null;
global.worksAt=(s,rid)=>true; global.rolesOf=id=>SAL[id].roles||[]; global.isExp=(id,c)=>(SAL[id].exp||[]).includes(c);
global.fmtDate=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
// ── date fixe : lundi 2026-08-03 ; D(i)=date du jour i (0=lundi) ──
const MON=new Date('2026-08-03T00:00:00'); const D=i=>fmtDate(new Date(MON.getTime()+i*86400000));
const setC=(cs,cre)=>{ global.SAL={adam:{id:'adam',roles:['cuisine'],exp:['cuisine']}}; global.S={contraintes:cs,allCreneauxWeek:(cre||[]).map(c=>({...c,restaurant_id:'snk',salarie_id:'adam',heure_debut:c.deb,heure_fin:c.fin})),creneaux:[],salaries:[SAL.adam],regles:[],dispos:[]}; };
const cb=(deb,fin,svc,di)=>_contrainteBlocking('adam',{deb,fin,role:'cuisine'},D(di),svc,di);

// ── pas_apres 20:00 ──
setC([{salarie_id:'adam',cle:'pas_apres',valeur:'20:00',active:true}]);
t('pas_apres 20:00 : soir 18:00→23:00 BLOQUÉ', cb('18:00','23:00','soir',0)?.cle==='c_pas_apres');
t('pas_apres 20:00 : soir 18:00→00:30 (après minuit) BLOQUÉ', cb('18:00','00:30','soir',0)?.cle==='c_pas_apres');
t('pas_apres 20:00 : midi 10:00→14:00 OK', cb('10:00','14:00','midi',0)===null);
t('pas_apres 20:00 : soir 17:00→19:30 (finit avant) OK', cb('17:00','19:30','soir',0)===null);
// inactive → ignorée
setC([{salarie_id:'adam',cle:'pas_apres',valeur:'20:00',active:false}]);
t('pas_apres active=false : soir 18:00→23:00 NON bloqué', cb('18:00','23:00','soir',0)===null);

// ── pas_avant 11:00 ──
setC([{salarie_id:'adam',cle:'pas_avant',valeur:'11:00',active:true}]);
t('pas_avant 11:00 : midi 10:00→14:00 BLOQUÉ', cb('10:00','14:00','midi',0)?.cle==='c_pas_avant');
t('pas_avant 11:00 : midi 11:00→14:00 OK', cb('11:00','14:00','midi',0)===null);

// ── pas_de_coupure ──
setC([{salarie_id:'adam',cle:'pas_de_coupure',valeur:'true',active:true}],[{date:D(0),service:'midi',deb:'10:00',fin:'14:00'}]);
t('pas_de_coupure : soir le jour où il a déjà un midi BLOQUÉ', cb('18:00','23:00','soir',0)?.cle==='c_pas_coupure');
setC([{salarie_id:'adam',cle:'pas_de_coupure',valeur:'true',active:true}]);
t('pas_de_coupure : soir sans midi le même jour OK', cb('18:00','23:00','soir',0)===null);

// ── max_soirs_semaine 2 ──
setC([{salarie_id:'adam',cle:'max_soirs_semaine',valeur:'2',active:true}],[{date:D(0),service:'soir',deb:'18:00',fin:'23:00'},{date:D(1),service:'soir',deb:'18:00',fin:'23:00'}]);
t('max_soirs 2 : un 3e jour de soir BLOQUÉ', cb('18:00','23:00','soir',2)?.cle==='c_max_soirs');
t('max_soirs 2 : soir sur un jour DÉJÀ compté (D0) OK', cb('18:00','23:00','soir',0)===null);

// ── indispo_jour (nom + numéro) ──
setC([{salarie_id:'adam',cle:'indispo_jour',valeur:'jeudi',active:true}]);
t('indispo_jour "jeudi" : placement jeudi (di=3) BLOQUÉ', cb('18:00','23:00','soir',3)?.cle==='c_indispo_jour');
t('indispo_jour "jeudi" : placement mercredi (di=2) OK', cb('18:00','23:00','soir',2)===null);
setC([{salarie_id:'adam',cle:'indispo_jour',valeur:'3',active:true}]);
t('indispo_jour "3" (=jeudi) : placement di=3 BLOQUÉ', cb('18:00','23:00','soir',3)?.cle==='c_indispo_jour');

// ── autre + jours_off_consecutifs : jamais bloquants ──
setC([{salarie_id:'adam',cle:'autre',valeur:'préfère le matin',active:true},{salarie_id:'adam',cle:'jours_off_consecutifs',valeur:'2',active:true}]);
t('autre + jours_off_consecutifs : jamais bloquants (info/souple)', cb('18:00','23:00','soir',3)===null && cb('10:00','14:00','midi',5)===null);

// ══ INTÉGRATION checkPlacement — cas ADAM HOJR (pas_apres 20:00) ══
global.SAL={adam:{id:'adam',roles:['cuisine'],exp:['cuisine']}};
global.S={contraintes:[{salarie_id:'adam',cle:'pas_apres',valeur:'20:00',active:true}],allCreneauxWeek:[],creneaux:[],salaries:[SAL.adam],regles:[],dispos:[],miseAPied:[],altJours:{}};
const cp=(deb,fin,svc,di)=>checkPlacement('adam',{deb,fin,role:'cuisine',exp:false},D(di),svc,di,{});
t('INTÉGRATION : checkPlacement bloque un soir 18:00→23:00 (pas_apres 20:00)', cp('18:00','23:00','soir',0)?.cle==='c_pas_apres');
t('INTÉGRATION : checkPlacement bloque un soir finissant 00:30 (après minuit)', cp('18:00','00:30','soir',0)?.cle==='c_pas_apres');
t('INTÉGRATION : checkPlacement autorise un midi 10:00→14:00', cp('10:00','14:00','midi',0)===null);

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

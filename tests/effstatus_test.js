// v0.51 — badges + Vérifications basés sur la présence SIMULTANÉE (_effStatus), pas le nombre de têtes.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");

// Stubs minimaux + fonctions RÉELLES (_pmin, getShifts, _needAt, _coverAt, _effStatus).
global._pmin=t=>{if(t==null)return null;const[hh,mm]=String(t).slice(0,5).split(':').map(Number);if(isNaN(hh))return null;return hh*60+(mm||0);};
const STATE={ effectifs:[], creneaux:[] };
global.S=STATE;
global.SNACK={id:'snk1'};
global.DEF_TIME=svc=>svc==='midi'?['11:00','15:00']:['19:00','23:00'];

// getShifts + _needAt + _coverAt + _effStatus depuis le fichier réel.
{ const s=h.indexOf('function getShifts('); const e=h.indexOf('// ===== UNDO/REDO ====='); if(s<0||e<0)throw new Error('bloc introuvable');
  let block=h.slice(s,e);
  eval(block+';global.getShifts=getShifts;global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;global._effStatus=_effStatus;'); }

let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
const setEff=(jt,svc,role,vagues,nb)=>{ STATE.effectifs=[{restaurant_id:'snk1',jour_type:jt,service:svc,role,vagues:vagues||null,nb_cible:nb!=null?nb:(vagues?vagues.length:0)}]; };
const cre=(sid,date,svc,role,d,f)=>({salarie_id:sid,date,service:svc,role,heure_debut:d,heure_fin:f});

// ── CAS 1 : Grand Cœur mardi 28/07 midi cuisine — 4 têtes, max 3 simultanés, cible 3 → CONFORME (vert, rien).
// Vagues cible=3 sur ~10:00→15:00. Présences : Sedimou 10:00-14:00, Kalifa 10:30-13:00, Hikmat 11:30-15:00, Said 13:00-15:00.
setEff('Mardi','midi','cuisine',[{deb:'10:00',fin:'15:00'},{deb:'10:30',fin:'14:00'},{deb:'11:30',fin:'15:00'}]);
STATE.creneaux=[
  cre('sed','2026-07-28','midi','cuisine','10:00','14:00'),
  cre('kal','2026-07-28','midi','cuisine','10:30','13:00'),
  cre('hik','2026-07-28','midi','cuisine','11:30','15:00'),
  cre('sai','2026-07-28','midi','cuisine','13:00','15:00'),
];
let st=_effStatus('2026-07-28','Mardi','midi','cuisine');
t('CAS1 · 4 têtes / max 3 simultanés / cible 3 → peak=3', st.peak===3);
t('CAS1 · pas de sur-couverture', st.over===false);
t('CAS1 · pas de sous-couverture', st.under===false);
t('CAS1 · CONFORME (vert : ni over ni under)', !st.over && !st.under);

// ── CAS 2 : vraie sur-couverture — 4 simultanés pour cible 3 sur une demi-heure.
setEff('Mardi','midi','cuisine',[{deb:'11:00',fin:'14:00'},{deb:'11:00',fin:'14:00'},{deb:'11:00',fin:'14:00'}]); // besoin=3 constant
STATE.creneaux=[
  cre('a','2026-07-28','midi','cuisine','11:00','14:00'),
  cre('b','2026-07-28','midi','cuisine','11:00','14:00'),
  cre('c','2026-07-28','midi','cuisine','11:00','14:00'),
  cre('d','2026-07-28','midi','cuisine','12:00','12:30'), // le 4e chevauche 12:00-12:30 → 4 simultanés
];
st=_effStatus('2026-07-28','Mardi','midi','cuisine');
t('CAS2 · sur-couverture détectée (over=true)', st.over===true);
t('CAS2 · peak=4', st.peak===4);
t('CAS2 · pas de sous-couverture', st.under===false);

// ── CAS 3 : vraie sous-couverture — 2 simultanés pour cible 3 sur une demi-heure. NON-RÉGRESSION.
setEff('Mardi','midi','cuisine',[{deb:'11:00',fin:'14:00'},{deb:'11:00',fin:'14:00'},{deb:'11:00',fin:'14:00'}]);
STATE.creneaux=[
  cre('a','2026-07-28','midi','cuisine','11:00','14:00'),
  cre('b','2026-07-28','midi','cuisine','11:00','14:00'),
  // 3e absent → 2 simultanés sur tout le service, besoin 3
];
st=_effStatus('2026-07-28','Mardi','midi','cuisine');
t('CAS3 · sous-couverture détectée (under=true)', st.under===true);
t('CAS3 · peak=2', st.peak===2);
t('CAS3 · pas de sur-couverture', st.over===false);

// ── CAS 4 : nominal — 3 têtes, 3 simultanés, cible 3 → vert.
setEff('Mardi','midi','cuisine',[{deb:'11:00',fin:'14:00'},{deb:'11:00',fin:'14:00'},{deb:'11:00',fin:'14:00'}]);
STATE.creneaux=[
  cre('a','2026-07-28','midi','cuisine','11:00','14:00'),
  cre('b','2026-07-28','midi','cuisine','11:00','14:00'),
  cre('c','2026-07-28','midi','cuisine','11:00','14:00'),
];
st=_effStatus('2026-07-28','Mardi','midi','cuisine');
t('CAS4 · nominal → peak=3, ni over ni under', st.peak===3 && !st.over && !st.under);

// ── CAS 5 : service à cheval sur minuit (soir 22:00→01:00) — pas de faux positif après minuit.
setEff('Vendredi','soir','cuisine',[{deb:'22:00',fin:'01:00'}]); // besoin 1
STATE.creneaux=[ cre('n','2026-07-25','soir','cuisine','22:00','01:00') ];
st=_effStatus('2026-07-25','Vendredi','soir','cuisine');
t('CAS5 · minuit → peak=1, conforme (ni over ni under)', st.peak===1 && !st.over && !st.under);

// ── CAS 6 : rôle SANS vagues (fallback nb_cible flat) — dégrade proprement en tête vs cible sur la fenêtre service.
setEff('Mardi','midi','cuisine',null,2); // nb_cible=2, pas de vagues → besoin 2 sur 11:00-15:00 (DEF_TIME)
STATE.creneaux=[ cre('a','2026-07-28','midi','cuisine','11:00','15:00') ]; // 1 seul → sous-couverture
st=_effStatus('2026-07-28','Mardi','midi','cuisine');
t('CAS6 · fallback sans vagues → sous-couverture (1 pour 2)', st.under===true && st.peak===1);

// ── CAS 7 : DIVERGENCE badge/liste — sur-couverture ET sous-couverture le même jour (profil variable).
// vagues [11:00→14:30, 11:30→14:00] → besoin 1/2/1 ; plan manuel = 2 personnes 11:00→12:00.
// 11:00-11:30 : cov 2 > need 1 (over) ; 12:00-14:00 : cov 0 < need 2 (under) → les deux vrais.
setEff('Mardi','midi','cuisine',[{deb:'11:00',fin:'14:30'},{deb:'11:30',fin:'14:00'}]);
STATE.creneaux=[
  cre('a','2026-07-28','midi','cuisine','11:00','12:00'),
  cre('b','2026-07-28','midi','cuisine','11:00','12:00'),
];
st=_effStatus('2026-07-28','Mardi','midi','cuisine');
t('CAS7 · over ET under tous deux vrais', st.over===true && st.under===true);
// Mapping badge (renderEffectifs) : over prioritaire → rouge.
const badgeCls=st.over?'cnt-over':(st.under?'cnt-under':'cnt-ok');
t('CAS7 · badge rouge (cnt-over, over prioritaire)', badgeCls==='cnt-over');
// Mapping liste (renderChecks, _exact=true) : under ET over signalés INDÉPENDAMMENT (deux lignes).
const _exact=true; const lines=[];
if(st.under) lines.push('sous-couverture');
if(_exact && st.over) lines.push('sur-couverture');
t('CAS7 · liste émet DEUX lignes (sous + sur) → pas de divergence avec le badge', lines.length===2 && lines.includes('sous-couverture') && lines.includes('sur-couverture'));

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

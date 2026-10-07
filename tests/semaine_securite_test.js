// v0.69 — SÉCURITÉ DE LA SAISIE : trois correctifs liés.
//
// Incident d'origine : le patron prépare la semaine prochaine, recharge la page (Cmd+R), revient sans le
// voir sur la semaine en cours, lance « supprimer la semaine »… et efface la semaine en cours.
//
//   1. Après un rechargement, rouvrir la semaine de travail — AVEC un bandeau permanent quand ce n'est pas
//      la semaine en cours, et retour à la semaine en cours au-delà de quelques jours.
//   2. Toute action destructrice en masse nomme la semaine (et son statut), le nombre de créneaux et les
//      restaurants ; confirmation renforcée sur une semaine en cours ou passée. L'annulation multi-snack
//      restaure TOUT d'un seul ↶.
//   3. Le PDF d'un restaurant signale qu'un salarié travaille aussi ailleurs (« aussi Grand Cœur »,
//      « » GC » les jours concernés) — sans heures ni motif (verrous v0.62-0.63).
//
// Tout ce qui est testé ici est le VRAI code, extrait de planning/index.html. Les seuls doublures sont la
// base (table en mémoire), le DOM (objets minimaux) et localStorage — chacune commentée.
process.env.TZ='Europe/Paris';      // AVANT tout usage de Date : le planning raisonne en heure de Paris
const fs=require("fs"), path=require("path");
const h=fs.readFileSync(path.join(__dirname,"..","planning/index.html"),"utf8");
const {extractFn}=require("./extract.js");
const grab=n=>extractFn(h,n);
const inst=n=>{ try{ eval("global."+n+"="+grab(n).replace(/^(async )?function/,'$1function')+";"); }catch(e){ console.log('MISS',n,(''+e).split('\n')[0]); } };
// utils.js réel (fetchAllRows : la purge lit par pages depuis v0.71).
{ global.window=global.window||{}; eval(fs.readFileSync(path.join(__dirname,'..','utils.js'),'utf8')); global.fetchAllRows=window.EatimeUtils.fetchAllRows; }
const constOf=(n)=>{ const m=h.match(new RegExp("const "+n+"=([^;\\n]*);")); if(!m) throw new Error('const '+n+' introuvable'); eval("global."+n+"="+m[1]+";"); };

let ok=true;
const t=(l,c,extra)=>{console.log((c?'PASS':'FAIL')+' · '+l+(c?'':'   ↳ '+(extra==null?'':extra)));ok=c&&ok;};

// ── décor commun ────────────────────────────────────────────────────────────────────────────────
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
global.S={restos:[], creneaux:[], allCreneauxWeek:[], salaries:[], dispos:[], altJours:{}, roles:[], regles:[]};
global.ME={id:'u1'};
global.escP=s=>(s||'').toString().replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const SS=[]; global.setSS=(k,m)=>SS.push([k,m]);
global.updateUndoBtns=()=>{};
constOf('WEEK_RESTORE_MAX_MS'); constOf('SELECTION_CONFIRM_MIN'); constOf('_WINANSI_EXTRA');
for(const fn of ['getMonday','fmtDate','dateOfDay','parseYMD','weekDelta','weekStatus','weekRangeLong','weekToRestore',
  '_weekKey','rememberWeek','initialMonday','weekBannerText','renderWeekBanner','navWeek','goToday',
  '_pl','_restoListe','destructiveSpec','_dzClose','confirmDestructive','shortSnack',
  'beginTxn','endTxn','recordAction','applyAction','undo','purgeWeek','purgeRestos','deleteCreneauxBatch',
  'selectionImpact','autofillSpec','onRoster','_ruleCtx','_regleOf','movablePool','origineOf',
  '_pdfSafe','restoAbbr','pdfAilleurs','drawSnackPage','_pdfHeader','isoWeek','_hexToRgb','_relLum','textColorFor',
  '_rgbArr','_tintRgb','altDayType','indisposOf','worksAt']) inst(fn);
eval("global.salById="+h.match(/const salById=([^\n]*);/)[1]+";");
eval("global.rolesOf="+h.match(/const rolesOf=([^\n]*);/)[1]+";");
eval("global.roleMain="+h.match(/const roleMain=([^\n]*);/)[1]+";");
global.roleNom=c=>c;
global.UNDO=[]; global.REDO=[]; global._txn=null;
eval("global._dzResolve=null;");

// localStorage en mémoire (doublure du navigateur) — option `casse` pour simuler la navigation privée.
function fakeStorage(){ const m=new Map(); return { casse:false, m,
  getItem(k){ if(this.casse) throw new Error('SecurityError'); return m.has(k)?m.get(k):null; },
  setItem(k,v){ if(this.casse) throw new Error('SecurityError'); m.set(k,String(v)); },
  removeItem(k){ if(this.casse) throw new Error('SecurityError'); m.delete(k); } }; }
global.localStorage=fakeStorage();

// DOM minimal : les éléments que renderWeekBanner et confirmDestructive touchent réellement.
function el(id){ return { id, style:{}, dataset:{}, innerHTML:'', className:'', textContent:'',
  classList:{ _s:new Set(), toggle(c,on){ on?this._s.add(c):this._s.delete(c); }, contains(c){ return this._s.has(c); } } }; }
const DOM={ wkBanner:el('wkBanner'), wkLabel:el('wkLabel') };
// dzModal : l'affectation d'innerHTML « crée » le fond cliquable, dont on capte l'écouteur clavier.
let dzKey=null, dzFocus=null;
DOM.dzModal=(()=>{ const o={_h:''}; Object.defineProperty(o,'innerHTML',{get(){return this._h;},set(v){ this._h=v;
  this.firstElementChild=v?{addEventListener:(ty,f)=>{ if(ty==='keydown') dzKey=f; }}:null; }}); return o; })();
global.document={ getElementById:id=>{ if(id==='dzNo') return {focus(){dzFocus='dzNo';}}; return DOM[id]||null; } };

const tick=()=>new Promise(r=>setTimeout(r,0));
const YMD=(y,m,d)=>new Date(y,m-1,d);

(async()=>{
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('── 1. Libellés et statut de semaine (fonctions pures) ──────────────────────────────────');
{ const now=YMD(2026,9,30);
  t('« du 6 au 12 octobre » (même mois)', weekRangeLong(YMD(2025,10,6),YMD(2025,10,1))==='du 6 au 12 octobre', weekRangeLong(YMD(2025,10,6),YMD(2025,10,1)));
  t('« du 29 septembre au 5 octobre » (deux mois)', weekRangeLong(YMD(2025,9,29),YMD(2025,9,30))==='du 29 septembre au 5 octobre', weekRangeLong(YMD(2025,9,29),YMD(2025,9,30)));
  t('semaine qui enjambe l\'année : les deux années écrites', weekRangeLong(YMD(2025,12,29),now)==='du 29 décembre 2025 au 4 janvier 2026', weekRangeLong(YMD(2025,12,29),now));
  t('« 1er » pour le premier du mois', weekRangeLong(YMD(2026,6,1),now)==='du 1er au 7 juin', weekRangeLong(YMD(2026,6,1),now));
  t('autre année que l\'année en cours → année écrite', weekRangeLong(YMD(2027,2,1),now)==='du 1er au 7 février 2027', weekRangeLong(YMD(2027,2,1),now));
  t('un mercredi donné tombe sur SA semaine (lundi recalculé)', weekRangeLong(YMD(2026,10,7),now)==='du 5 au 11 octobre', weekRangeLong(YMD(2026,10,7),now));
  const L=d=>weekStatus(d,now);
  t('semaine en cours', L(YMD(2026,9,28)).kind==='en_cours' && L(YMD(2026,9,28)).label==='semaine en cours');
  t('semaine prochaine', L(YMD(2026,10,5)).kind==='a_venir' && L(YMD(2026,10,5)).label==='semaine prochaine');
  t('semaine dernière', L(YMD(2026,9,21)).kind==='passee' && L(YMD(2026,9,21)).label==='semaine dernière');
  t('dans 3 semaines / il y a 2 semaines', L(YMD(2026,10,19)).label==='dans 3 semaines' && L(YMD(2026,9,14)).label==='il y a 2 semaines', L(YMD(2026,10,19)).label+' / '+L(YMD(2026,9,14)).label);
  t('dimanche soir 23:59 = encore la semaine en cours', weekStatus(YMD(2026,9,28), new Date(2026,9,4,23,59)).kind==='en_cours');
  t('écart juste à travers le passage à l\'heure d\'hiver', weekDelta(YMD(2026,10,26),YMD(2026,10,21))===1 && weekDelta(YMD(2026,10,19),YMD(2026,10,27))===-1);
  t('bandeau : « Semaine du 5 au 11 octobre · semaine prochaine »', weekBannerText(YMD(2026,10,5),now)==='Semaine du 5 au 11 octobre · semaine prochaine', weekBannerText(YMD(2026,10,5),now));
  t('bandeau : semaine passée nommée', weekBannerText(YMD(2026,9,21),now)==='Semaine du 21 au 27 septembre · semaine dernière', weekBannerText(YMD(2026,9,21),now));
  t('bandeau : RIEN sur la semaine en cours', weekBannerText(YMD(2026,9,28),now)===null);
  t('parseYMD lit une date LOCALE (pas UTC)', fmtDate(parseYMD('2026-10-25'))==='2026-10-25' && parseYMD('2026-10-25').getHours()===0);
  t('parseYMD refuse une date impossible', parseYMD('2026-02-31')===null && parseYMD('n\'importe quoi')===null);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 2. Semaine à rouvrir après rechargement (weekToRestore, pure) ───────────────────────');
{ const now=new Date(2026,8,30,10,0), H=3600000, D=86400000;
  const st=(monday,ago)=>JSON.stringify({monday, at:now.getTime()-ago});
  t('mémorisée il y a 2 h → rouverte', fmtDate(weekToRestore(st('2026-10-05',2*H),now)||new Date(0))==='2026-10-05');
  t('mémorisée il y a 2 jours → rouverte', !!weekToRestore(st('2026-10-05',2*D),now));
  t('mémorisée il y a 4 jours → NON (retour à la semaine en cours)', weekToRestore(st('2026-10-05',4*D),now)===null);
  t('le seuil vaut bien 3 jours', WEEK_RESTORE_MAX_MS===3*D && !!weekToRestore(st('2026-10-05',3*D-1000),now) && weekToRestore(st('2026-10-05',3*D+1000),now)===null);
  t('horodatage dans le futur (horloge changée) → NON', weekToRestore(st('2026-10-05',-2*H),now)===null);
  t('date qui n\'est pas un lundi → NON', weekToRestore(st('2026-10-07',H),now)===null);
  t('contenu illisible → NON, sans exception', weekToRestore('{pas du json',now)===null && weekToRestore(null,now)===null && weekToRestore('42',now)===null);
  t('champ at absent → NON', weekToRestore(JSON.stringify({monday:'2026-10-05'}),now)===null);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 3. Scénario réel : naviguer, recharger, retrouver sa semaine + bandeau ──────────────');
{ let loads=0; global.loadWeek=async()=>{ loads++; };      // doublure : le rechargement des données n'est pas l'objet ici
  global.localStorage=fakeStorage(); global.ME={id:'u1'};
  global.MONDAY=getMonday(new Date());
  navWeek(1);                                                // le patron passe sur la semaine prochaine
  const vise=fmtDate(MONDAY);
  t('navWeek(+1) mémorise la semaine affichée', JSON.parse(localStorage.getItem('pl_week:u1')||'{}').monday===vise, localStorage.getItem('pl_week:u1'));
  // ── RECHARGEMENT : la mémoire JS repart de zéro, seul localStorage survit.
  global.MONDAY=null;
  global.MONDAY=initialMonday();
  t('après rechargement : MÊME semaine qu\'avant (semaine prochaine)', fmtDate(MONDAY)===vise, fmtDate(MONDAY)+' ≠ '+vise);
  renderWeekBanner();
  t('… et le bandeau est VISIBLE', DOM.wkBanner.style.display==='flex', DOM.wkBanner.style.display);
  t('… il nomme la semaine et son statut', DOM.wkBanner.innerHTML.includes(escP(weekBannerText(MONDAY,new Date()))) && /semaine prochaine/.test(DOM.wkBanner.innerHTML), DOM.wkBanner.innerHTML.slice(0,200));
  t('… avec le bouton « Revenir à cette semaine » (goToday)', /onclick="goToday\(\)"[^>]*>[^<]*Revenir à cette semaine/.test(DOM.wkBanner.innerHTML));
  t('… et le libellé de semaine du header change de style', DOM.wkLabel.classList.contains('wk-away'));
  // Un autre utilisateur sur le même poste n'hérite pas de la semaine du patron.
  global.ME={id:'u2'}; t('autre utilisateur → semaine en cours', weekDelta(initialMonday())===0); global.ME={id:'u1'};
  // Revenir à la semaine en cours : mémoire effacée, bandeau retiré.
  goToday(); renderWeekBanner();
  t('goToday → semaine en cours, mémoire effacée', weekDelta(MONDAY)===0 && localStorage.getItem('pl_week:u1')===null);
  t('… bandeau MASQUÉ sur la semaine en cours', DOM.wkBanner.style.display==='none' && !DOM.wkLabel.classList.contains('wk-away'));
  // Semaine ANCIENNE : mémorisée il y a 4 jours → on n'y retourne pas.
  localStorage.setItem('pl_week:u1', JSON.stringify({monday:fmtDate(getMonday(dateOfDay(14))), at:Date.now()-4*86400000}));
  t('semaine mémorisée il y a 4 jours → rechargement sur la SEMAINE EN COURS', weekDelta(initialMonday())===0);
  localStorage.setItem('pl_week:u1', JSON.stringify({monday:fmtDate(getMonday(dateOfDay(-7))), at:Date.now()-3600000}));
  global.MONDAY=initialMonday(); renderWeekBanner();
  t('semaine PASSÉE rouverte (il y a 1 h) → bandeau « semaine passée » rouge', weekDelta(MONDAY)===-1 && /wk-past/.test(DOM.wkBanner.className) && /semaine dernière/.test(DOM.wkBanner.innerHTML), DOM.wkBanner.className);
  // Navigation privée : localStorage inutilisable → la page s'ouvre quand même, sur la semaine en cours.
  localStorage.casse=true; let crash=null; try{ global.MONDAY=initialMonday(); navWeek(1); }catch(e){ crash=e; }
  t('localStorage indisponible → aucune exception, semaine en cours au chargement', !crash, crash&&crash.message);
  localStorage.casse=false;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 4. Changement d\'heure : la semaine du 19 octobre 2026 ──────────────────────────────');
{ global.loadWeek=async()=>{};
  global.MONDAY=YMD(2026,10,19);
  t('borne haute de la semaine = lundi 26 (le dimanche 25 est CHARGÉ)', fmtDate(dateOfDay(7))==='2026-10-26', fmtDate(dateOfDay(7)));
  t('l\'ancienne formule donnait bien le dimanche 25 (contrôle du défaut)', fmtDate(new Date(YMD(2026,10,19).getTime()+7*86400000))==='2026-10-25');
  navWeek(1); t('› depuis le 19/10 → lundi 26/10 (pas le dimanche 25)', fmtDate(MONDAY)==='2026-10-26' && MONDAY.getDay()===1, MONDAY.toString());
  navWeek(-1); t('‹ retour → lundi 19/10', fmtDate(MONDAY)==='2026-10-19');
  global.MONDAY=YMD(2026,3,30); navWeek(-1); t('‹ à travers l\'heure d\'été → lundi 23/03', fmtDate(MONDAY)==='2026-03-23' && MONDAY.getDay()===1, MONDAY.toString());
  let m=YMD(2026,1,5); global.MONDAY=m; let lundis=true; for(let i=0;i<60;i++){ navWeek(1); if(MONDAY.getDay()!==1||MONDAY.getHours()!==0) lundis=false; }
  t('60 semaines de › consécutives : toujours un lundi à 00:00', lundis);
  const code=h.replace(/\/\/[^\n]*/g,'');
  t('plus aucune arithmétique MONDAY.getTime()+n×86400000 dans le code', !/MONDAY\.getTime\(\)/.test(code), (code.match(/.{0,40}MONDAY\.getTime\(\).{0,40}/)||[''])[0]);
  localStorage.removeItem('pl_week:u1');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 5. Le texte de la confirmation (destructiveSpec, pure) ──────────────────────────────');
{ const now=YMD(2026,10,1);
  const R=['Raya Carnot','Raya Grand Cœur','Raya Lobau'];
  const cur=destructiveSpec({action:'Supprimer 87 créneaux', restos:R, monday:YMD(2026,9,28), now});
  t('phrase complète', cur.phrase==='Supprimer 87 créneaux de la semaine du 28 septembre au 4 octobre — SEMAINE EN COURS — sur Carnot, Grand Cœur et Lobau ?', cur.phrase);
  t('semaine en cours → confirmation RENFORCÉE', cur.fort===true);
  const fut=destructiveSpec({action:'Supprimer 12 créneaux', restos:[R[2]], monday:YMD(2026,10,5), now});
  t('semaine à venir → confirmation simple, statut nommé', fut.fort===false && /à venir \(semaine prochaine\)/.test(fut.phrase) && /sur Lobau \?$/.test(fut.phrase), fut.phrase);
  const pas=destructiveSpec({action:'Supprimer 3 créneaux', restos:[R[0]], monday:YMD(2026,9,14), now});
  t('semaine passée → RENFORCÉE, « SEMAINE PASSÉE (il y a 2 semaines) »', pas.fort===true && /SEMAINE PASSÉE \(il y a 2 semaines\)/.test(pas.phrase), pas.phrase);
  t('pluriel/singulier', _pl(1,'créneau','créneaux')==='1 créneau' && _pl(87,'créneau','créneaux')==='87 créneaux');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 6. La fenêtre de confirmation : Entrée ne valide JAMAIS, case + bouton rouge ────────');
{ const now=new Date();
  const sp=destructiveSpec({titre:'🧹 Purger la semaine', action:'Supprimer 87 créneaux', restos:['Raya Carnot','Raya Lobau'], monday:getMonday(now), now, details:['Carnot : 50 créneaux'], bouton:'Supprimer', danger:true});
  dzKey=null; dzFocus=null;
  let res='en attente'; const p=confirmDestructive(sp).then(v=>{res=v;});
  const html=DOM.dzModal.innerHTML;
  t('la fenêtre nomme l\'action, la semaine, le statut, les restaurants', /Supprimer 87 créneaux/.test(html) && html.includes(escP(weekRangeLong(getMonday(now),now))) && /SEMAINE EN COURS/.test(html) && /Carnot et Lobau/.test(html));
  t('bouton de validation ROUGE et DÉSACTIVÉ tant que la case n\'est pas cochée', /class="btn dz-danger" id="dzGo" disabled/.test(html), (html.match(/<button[^>]*id="dzGo"[^>]*>/)||[''])[0]);
  t('… libellé distinct « Supprimer — SEMAINE EN COURS »', /id="dzGo"[^>]*>Supprimer — SEMAINE EN COURS</.test(html));
  t('case à cocher qui active le bouton', /id="dzAck" onchange="document.getElementById\('dzGo'\).disabled=!this.checked"/.test(html));
  t('le focus part sur « Annuler »', dzFocus==='dzNo');
  let stopped=0, prevented=0;
  const key=(k,id)=>dzKey({key:k, target:{id}, stopPropagation(){stopped++;}, preventDefault(){prevented++;}});
  key('Enter','dzGo'); await tick();
  t('Entrée sur le bouton rouge → RIEN (la fenêtre reste ouverte)', res==='en attente' && DOM.dzModal.innerHTML!=='');
  key('Enter','dzAck'); await tick();
  t('Entrée sur la case → RIEN', res==='en attente');
  t('les touches ne remontent pas à la grille (Retour arrière / Ctrl+Z)', stopped===2 && prevented===2);
  key('Escape','dzGo'); await p;
  t('Échap → annulé (false), fenêtre fermée', res===false && DOM.dzModal.innerHTML==='');
  // Semaine à venir : pas de case, bouton actif — mais toujours pas de validation par Entrée.
  const fut=destructiveSpec({action:'Supprimer 4 créneaux', restos:['Raya Lobau'], monday:getMonday(dateOfDay(7)), now, bouton:'Supprimer'});
  let r2='en attente'; const p2=confirmDestructive(fut).then(v=>{r2=v;});
  const h2=DOM.dzModal.innerHTML;
  t('semaine à venir : pas de case à cocher, bouton actif', !/dzAck/.test(h2) && !/id="dzGo" disabled/.test(h2));
  key('Enter','dzGo'); await tick(); t('… Entrée ne valide pas non plus', r2==='en attente');
  _dzClose(true); await p2; t('clic sur le bouton (_dzClose(true)) → confirmé', r2===true);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 7. Purge multi-snack de bout en bout, sur une base en mémoire ───────────────────────');
// Doublure de la base : une table planning_creneaux en mémoire qui répond comme PostgREST aux appels
// réellement faits (select/in/gte/lt/eq, delete(...).select('id'), upsert onConflict). `refuse` simule
// une ligne que la RLS refuse de supprimer : pas d'erreur, la ligne n'est juste pas dans la réponse.
function makeDB(rows, refuse){
  const db={rows:rows.map(r=>({...r}))};
  const key=r=>[r.restaurant_id,r.salarie_id,r.date,r.service].join('|');
  class Q{ constructor(k,p){this.k=k;this.p=p;this.f=[];this.sel=false;}
    in(c,v){this.f.push(r=>v.includes(r[c]));return this;} eq(c,v){this.f.push(r=>r[c]===v);return this;}
    gte(c,v){this.f.push(r=>r[c]>=v);return this;} lt(c,v){this.f.push(r=>r[c]<v);return this;}
    select(c,o){this.sel=true;this.so=o||{};return this;} single(){this.one=true;return this;}
    // v0.71 : la purge lit par fetchAllRows (compte exact + pages). Tri par id, plafond de 1 000 comme la vraie base.
    order(){return this;} range(a,b){this.rg=[a,b];return this;}
    then(res,rej){ try{ res(this.run()); }catch(e){ rej(e); } }
    run(){ const m=r=>this.f.every(f=>f(r));
      if(this.k==='select'){ const all=db.rows.filter(m).sort((x,y)=>x.id<y.id?-1:x.id>y.id?1:0);
        if(this.so&&this.so.head) return {data:null,count:all.length,error:null};
        const sl=this.rg?all.slice(this.rg[0],this.rg[1]+1):all; return {data:sl.slice(0,1000).map(r=>({...r})), error:null}; }
      if(this.k==='delete'){ const hit=db.rows.filter(m).filter(r=>!(refuse&&refuse.has(r.id)));
        db.rows=db.rows.filter(r=>!hit.includes(r)); return {data:this.sel?hit.map(r=>({id:r.id})):null, error:null}; }
      if(this.k==='upsert'){ db.rows=db.rows.filter(r=>key(r)!==key(this.p)); db.rows.push({...this.p}); return {data:{...this.p},error:null}; } } }
  db.api={ from:()=>({ select:(c,o)=>new Q('select').select(c,o), delete:()=>new Q('delete'), upsert:(row)=>new Q('upsert',row) }) };
  return db;
}
const RESTOS=[{id:'c',nom:'Raya Carnot'},{id:'g',nom:'Raya Grand Cœur'},{id:'l',nom:'Raya Lobau'}];
function semaine(monday, n, rid, pfx){ const out=[]; for(let i=0;i<n;i++){ const d=new Date(monday); d.setDate(d.getDate()+(i%7));
  out.push({id:`${pfx}${i}`, restaurant_id:rid, salarie_id:`${rid}s${Math.floor(i/2)}`, date:fmtDate(d), service:(i%2?'soir':'midi'), heure_debut:'11:00', heure_fin:'15:00'}); } return out; }
{ const M=getMonday(new Date());
  const suiv=new Date(M); suiv.setDate(suiv.getDate()+7);
  const base=[...semaine(M,30,'c','c'),...semaine(M,32,'g','g'),...semaine(M,25,'l','l'),...semaine(suiv,20,'l','n')];
  let db=makeDB(base);
  global.EatimeScope=db.api; global.MONDAY=new Date(M); global.SNACK=RESTOS[2];
  S.restos=RESTOS; S.creneaux=[]; S.allCreneauxWeek=base.slice(0,10);   // grille chargée il y a longtemps : PÉRIMÉE (10 lignes)
  global.loadWeek=async()=>{ const f=fmtDate(MONDAY), to=fmtDate(dateOfDay(7));
    S.allCreneauxWeek=db.rows.filter(r=>r.date>=f&&r.date<to); S.creneaux=S.allCreneauxWeek.filter(r=>r.restaurant_id===SNACK.id); };
  // Doublure de la fenêtre : on capte EXACTEMENT ce que le patron lirait, et on répond pour lui.
  let vu=null, reponse=false; global.confirmDestructive=async sp=>{ vu=sp; return reponse; };
  UNDO=[]; REDO=[];
  // (a) Il lit la confirmation… et annule.
  await purgeRestos(['c','g','l']);
  t('confirmation : « Supprimer 87 créneaux » — compté EN BASE, pas sur la grille périmée (10)', vu && vu.action==='Supprimer 87 créneaux', vu&&vu.action);
  t('… la semaine en toutes lettres + SEMAINE EN COURS + les trois restaurants', vu && vu.semaine==='la semaine '+weekRangeLong(M) && vu.tag==='SEMAINE EN COURS' && vu.restos==='Carnot, Grand Cœur et Lobau', vu&&vu.phrase);
  t('… détail par restaurant', vu && vu.details.join(' | ')==='Carnot : 30 créneaux · 15 salariés | Grand Cœur : 32 créneaux · 16 salariés | Lobau : 25 créneaux · 13 salariés', vu&&vu.details.join(' | '));
  t('… niveau RENFORCÉ (semaine en cours)', vu && vu.fort===true);
  t('annulé → la base est INTACTE, rien dans l\'historique', db.rows.length===107 && UNDO.length===0);
  // (b) Il confirme.
  reponse=true; vu=null; await purgeRestos(['c','g','l']);
  const semRows=db.rows.filter(r=>r.date>=fmtDate(M)&&r.date<fmtDate(suiv));
  t('confirmé → les 87 créneaux de la semaine sont supprimés sur les 3 restaurants', semRows.length===0, semRows.length);
  t('… la semaine SUIVANTE est intacte (20)', db.rows.length===20 && db.rows.every(r=>r.id.startsWith('n')));
  t('… UN SEUL lot d\'annulation pour les 3 restaurants (87 entrées)', UNDO.length===1 && UNDO[0].length===87, UNDO.length+' lot(s)');
  t('… message de fin qui nomme la semaine', /87 créneau\(x\) supprimé\(s\) la semaine du/.test((SS[SS.length-1]||[])[1]||''), (SS[SS.length-1]||[])[1]);
  // (c) ↶ — UN appui doit TOUT rendre, avec les bons restaurants et les bons identifiants.
  await undo();
  const par=rid=>db.rows.filter(r=>r.restaurant_id===rid && r.date<fmtDate(suiv)).length;
  t('↶ unique → les 87 créneaux reviennent', db.rows.length===107, db.rows.length);
  t('… chacun dans SON restaurant (30 / 32 / 25)', par('c')===30 && par('g')===32 && par('l')===25, `${par('c')}/${par('g')}/${par('l')}`);
  t('… avec ses identifiants d\'origine', base.every(b=>db.rows.some(r=>r.id===b.id && r.restaurant_id===b.restaurant_id && r.date===b.date && r.service===b.service)));
  t('… et le statut dit « Annulé » (aucune erreur)', (SS[SS.length-1]||[])[0]==='ok');
  // (d) Mono-snack : même chemin, un seul restaurant nommé.
  UNDO=[]; vu=null; await purgeWeek();
  t('purge mono (snack courant) : même confirmation, Lobau seul', vu && vu.action==='Supprimer 25 créneaux' && vu.restos==='Lobau', vu&&vu.phrase);
  await undo();
  // (e) Une ligne que la base REFUSE de supprimer (RLS) : elle ne doit pas être comptée supprimée.
  db=makeDB(base, new Set(['g3','g4'])); global.EatimeScope=db.api; UNDO=[];
  await purgeRestos(['g']);
  const last=SS[SS.length-1]||[];
  t('suppression refusée silencieusement par la base → signalée en ERREUR', last[0]==='err' && /30 créneau\(x\) supprimé\(s\), 2 NON supprimé\(s\)/.test(last[1]), last.join(' · '));
  t('… l\'historique ne contient que les 30 vraiment supprimés', UNDO.length===1 && UNDO[0].length===30);
  // (e bis) Gros volume : 320 créneaux = 3 lots de suppression. L'historique doit rester UN SEUL lot
  // d'annulation — un découpage par lot (ou par restaurant) obligerait à appuyer 3 fois sur ↶ sans le dire.
  { const gros=[...semaine(M,110,'c','C'),...semaine(M,110,'g','G'),...semaine(M,100,'l','L')];
    db=makeDB(gros); global.EatimeScope=db.api; UNDO=[]; reponse=true;
    await purgeRestos(['c','g','l']);
    t('320 créneaux (3 lots) → tout supprimé, UN SEUL lot d\'annulation', db.rows.length===0 && UNDO.length===1 && UNDO[0].length===320, `${db.rows.length} restant(s), ${UNDO.length} lot(s)`);
    await undo(); t('… un seul ↶ rend les 320', db.rows.length===320, db.rows.length); }
  // (f) Semaine à venir : confirmation simple.
  db=makeDB(base); global.EatimeScope=db.api; global.MONDAY=new Date(suiv); vu=null; reponse=false;
  await purgeRestos(['l']);
  t('semaine prochaine : « à venir (semaine prochaine) », niveau simple', vu && vu.fort===false && /à venir \(semaine prochaine\)/.test(vu.phrase) && vu.action==='Supprimer 20 créneaux', vu&&vu.phrase);
  // (g) Semaine vide : pas de fenêtre du tout.
  global.MONDAY=getMonday(dateOfDay(21)); vu=null; await purgeRestos(['l']);
  t('semaine vide : aucune fenêtre, message « Rien à purger »', vu===null && /Rien à purger/.test((SS[SS.length-1]||[])[1]||''));
  // Garantie de méthode : la suite d'annulation est la même que l'ancien harnais (pl_pts23) utilisait.
  t('applyAction renvoie l\'erreur au lieu de l\'avaler', /return \(r&&r\.error\)\|\|null/.test(grab('applyAction')));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 8. Auto-fill, import, suppression multiple : la même confirmation nommée ────────────');
{ const code=n=>grab(n).replace(/\/\/[^\n]*/g,'');
  for(const fn of ['autoFillDay','autoFillWeek','autoFillMultiWeek','doImport','purgeRestos']){
    const c=code(fn);
    t(`${fn} passe par confirmDestructive (et plus par confirm())`, /confirmDestructive\(/.test(c) && !/[^.\w]confirm\(/.test(c), (c.match(/.{0,30}[^.\w]confirm\(.{0,30}/)||[''])[0]);
  }
  // Suppression par sélection : confirmation AVANT d'effacer quoi que ce soit à l'écran.
  const d=code('deleteSelectedCells');
  t('suppression multiple : la confirmation vient AVANT de vider les cases', d.indexOf('confirmDestructive(')>0 && d.indexOf('confirmDestructive(')<d.indexOf("inp.value=''"));
  t('… à partir de 3 créneaux entiers (seuil nommé)', SELECTION_CONFIRM_MIN===3 && /imp\.suppr\.length>=SELECTION_CONFIRM_MIN/.test(d));
  const cr=[{salarie_id:'a',date:'2026-10-05',service:'midi',heure_debut:'11:00',heure_fin:'15:00'},
            {salarie_id:'a',date:'2026-10-05',service:'soir',heure_debut:'18:00',heure_fin:'22:00'},
            {salarie_id:'b',date:'2026-10-05',service:'midi',heure_debut:'11:00',heure_fin:'15:00'}];
  const imp=selectionImpact([{sid:'a',date:'2026-10-05',svc:'midi',debSel:true,finSel:true},{sid:'a',date:'2026-10-05',svc:'soir',debSel:false,finSel:true},
                             {sid:'b',date:'2026-10-05',svc:'midi',debSel:true,finSel:true},{sid:'z',date:'2026-10-05',svc:'midi',debSel:true,finSel:true}],cr);
  t('selectionImpact : 2 supprimés, 1 modifié (une borne), case vide ignorée', imp.suppr.length===2 && imp.modif.length===1);
  // autofillSpec : ce que l'auto-fill peut DÉFAIRE est annoncé, chiffré — et décide du niveau.
  // v0.70 (décision du patron) : sur la semaine EN COURS, case à cocher SEULEMENT s'il peut déplacer ou
  // supprimer un créneau existant ; s'il ne fait qu'ajouter, confirmation simple.
  global.MONDAY=getMonday(new Date()); global.SNACK=RESTOS[1]; S.restos=RESTOS;
  S.salaries=[{id:'x',actif:true},{id:'y',actif:true},{id:'parti',actif:false,date_sortie:'2020-01-01'}];
  // Réglages : doublure de _regleOf (lecture de S.regles pour le restaurant affiché). Absent = défaut.
  let REG={}; global._regleOf=c=>REG[c]||null;
  const af=(rid,sid,i,svc,origine,extra)=>Object.assign({id:`${rid}${sid}${i}${svc}`,restaurant_id:rid,salarie_id:sid,date:fmtDate(dateOfDay(i)),service:svc,heure_debut:'11:00',heure_fin:'15:00',origine},extra||{});
  const SEM=[0,1,2,3,4,5,6];
  const spec=(rows,ids,days)=>{ S.allCreneauxWeek=rows; return autofillSpec(ids||['g'],days||SEM,'Remplir les postes vides'); };
  // (a) Rien à défaire : uniquement des créneaux saisis à la main → il ne fera qu'AJOUTER.
  let sp=spec([af('g','y',3,'soir','manuel'), af('g','x',3,'midi','manuel')]);
  t('auto-fill semaine en cours, il ne peut qu\'AJOUTER → confirmation SIMPLE (pas de case)', sp.fort===false && sp.tag==='SEMAINE EN COURS' && /^Remplir les postes vides de la semaine du /.test(sp.phrase), JSON.stringify({fort:sp.fort,tag:sp.tag}));
  t('… la fenêtre le dit : « ne fera qu\'AJOUTER »', /ne fera qu'AJOUTER/.test(sp.details.join(' | ')), sp.details.join(' | '));
  inst('confirmDestructive');   // la VRAIE fenêtre (la section 7 l'avait remplacée par une doublure)
  let html; { const p=confirmDestructive(sp); html=DOM.dzModal.innerHTML; _dzClose(false); await p; }
  t('… et la fenêtre réelle n\'a ni case ni bouton désactivé, mais nomme toujours SEMAINE EN COURS', !/dzAck/.test(html) && !/id="dzGo" disabled/.test(html) && /SEMAINE EN COURS/.test(html));
  // (b) Un créneau posé par un auto-fill précédent, dans ce restaurant → il PEUT être déplacé.
  sp=spec([af('g','x',3,'midi','auto'), af('g','y',3,'soir','manuel')]);
  t('créneau généré déplaçable ici → case EXIGÉE', sp.fort===true && sp.touche.deplacables===1, JSON.stringify(sp.touche));
  t('… annoncé « peut être DÉPLACÉ »', /1 créneau posé par un auto-fill précédent peut être DÉPLACÉ/.test(sp.details.join(' | ')), sp.details.join(' | '));
  // (c) Généré dans un AUTRE restaurant : déplaçable si l'inter-établissement est autorisé (défaut).
  sp=spec([af('c','x',4,'soir','auto')]);
  t('généré à Carnot, inter-établissement autorisé (défaut) → case EXIGÉE, Carnot nommé', sp.fort===true && /y compris à Carnot/.test(sp.details.join(' | ')), sp.details.join(' | '));
  REG={reparation_inter_snack:{active:false}};
  sp=spec([af('c','x',4,'soir','auto')]);
  t('… inter-établissement DÉSACTIVÉ → hors d\'atteinte → confirmation simple', sp.fort===false && sp.touche.deplacables===0, JSON.stringify(sp.touche));
  REG={autofill_reparation:{active:false}};
  sp=spec([af('g','x',3,'midi','auto')]);
  t('réparation DÉSACTIVÉE → rien ne bouge → confirmation simple', sp.fort===false && sp.touche.deplacables===0);
  REG={};
  // (d) Ce que la réparation ne déplace jamais (vivier réel movablePool) ne doit pas exiger la case.
  sp=spec([af('g','x',3,'midi','auto',{sureffectif:true}), af('g','x',3,'soir','auto',{heure_fin:null}), af('g','x',4,'midi',null)]);
  t('sureffectif, créneau incomplet, origine inconnue : jamais déplacés → confirmation simple', sp.fort===false, JSON.stringify(sp.touche));
  sp=spec([af('g','x',5,'midi','auto')], ['g'], [2]);
  t('auto-fill d\'UN jour : un créneau généré d\'un autre jour n\'est pas concerné', sp.fort===false);
  // (e) Un salarié sorti de l'effectif : son créneau sera SUPPRIMÉ → case exigée.
  sp=spec([af('g','parti',4,'midi','manuel')]);
  t('créneau d\'un salarié sorti → sera SUPPRIMÉ → case EXIGÉE', sp.fort===true && sp.touche.supprimes===1 && /1 créneau appartient à un salarié sorti de l'effectif : il sera SUPPRIMÉ/.test(sp.details.join(' | ')), sp.details.join(' | '));
  // (f) Multi-snack : réglages des autres restaurants inconnus ici → on retient le cas le plus large.
  REG={reparation_inter_snack:{active:false}, autofill_reparation:{active:false}};
  sp=spec([af('l','x',3,'midi','auto')], ['g','c']);
  t('multi-snack : réglages des autres restaurants inconnus → hypothèse large → case EXIGÉE', sp.fort===true);
  REG={};
  // (g) Semaine PASSÉE : toujours renforcée, même pour un simple ajout. Semaine à venir : jamais.
  global.MONDAY=getMonday(dateOfDay(-7)); sp=spec([]);
  t('semaine PASSÉE, simple ajout → case EXIGÉE quand même', sp.fort===true && /SEMAINE PASSÉE/.test(sp.tag));
  global.MONDAY=getMonday(dateOfDay(14)); sp=spec([af('g','x',3,'midi','auto')]);
  t('semaine À VENIR, même avec déplacement possible → confirmation simple', sp.fort===false && sp.touche.deplacables===1);
  global.MONDAY=getMonday(new Date());
  // destructiveSpec : l'assouplissement est réservé à la semaine en cours, et n'existe que sur demande.
  const now=new Date();
  t('destructiveSpec : sans fortSiEnCours, la semaine en cours reste RENFORCÉE (purge, import, sélection)', destructiveSpec({action:'x',monday:getMonday(now),now}).fort===true);
  t('… fortSiEnCours:false n\'assouplit PAS une semaine passée', destructiveSpec({action:'x',monday:getMonday(dateOfDay(-7)),now,fortSiEnCours:false}).fort===true);
  t('seul autofillSpec utilise l\'assouplissement', (h.match(/fortSiEnCours:/g)||[]).length===1 && /fortSiEnCours:touche>0/.test(grab('autofillSpec')));
  const passes=SEM.filter(i=>fmtDate(dateOfDay(i))<fmtDate(new Date())).length;
  sp=spec([]);
  t('… signale les jours déjà passés de la semaine en cours ('+passes+' aujourd\'hui)', passes===0 ? !/déjà passé/.test(sp.details.join(' | ')) : /déjà passé/.test(sp.details.join(' | ')), sp.details.join(' | '));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 9. PDF : « travaille ailleurs ce jour-là » — fonctions pures ──────────────────────────────');
{ const noms=RESTOS.map(r=>r.nom);
  t('abréviations : GC / Carnot / Lobau', restoAbbr('Raya Grand Cœur',noms)==='GC' && restoAbbr('Raya Carnot',noms)==='Carnot' && restoAbbr('Raya Lobau',noms)==='Lobau');
  t('abréviation ambiguë → nom court', restoAbbr('Raya Grand Cœur',noms.concat(['Raya Gare Centrale']))==='Grand Cœur');
  const all=[{salarie_id:'y',restaurant_id:'l',date:'2026-08-03',service:'midi',heure_debut:'11:00',heure_fin:'15:00'},
             {salarie_id:'y',restaurant_id:'g',date:'2026-08-04',service:'soir',heure_debut:'18:37',heure_fin:'23:43'},
             {salarie_id:'y',restaurant_id:'c',date:'2026-08-04',service:'midi',heure_debut:'10:00',heure_fin:'14:00'},
             {salarie_id:'y',restaurant_id:'g',date:'2026-08-05',service:'midi',heure_debut:null,heure_fin:null}];   // ligne vide : ne compte pas
  const a=pdfAilleurs('y','l',all,RESTOS);
  t('ailleurs : par jour et par service (Carnot le midi, GC le soir)', JSON.stringify(a)==='{"parJour":{"2026-08-04":{"soir":["GC"],"midi":["Carnot"]}}}', JSON.stringify(a));
  t('… une ligne sans heures ne fait pas « travailler ailleurs »', !a.parJour['2026-08-05']);
  t('… AUCUNE heure dans ce qui est renvoyé', !/\d{1,2}:\d{2}/.test(JSON.stringify(a)));
  t('… plus de liste des autres restaurants (mention sous le nom retirée en v0.70)', Object.keys(a).join()==='parJour');
  t('salarié d\'un seul restaurant → rien', Object.keys(pdfAilleurs('y','l',all.filter(c=>c.restaurant_id==='l'),RESTOS).parJour).length===0);
  t('_pdfSafe : flèches remplacées, Œ et « – » conservés, lettre hors jeu translittérée',
    _pdfSafe('→ ↗ Œ – ş ł')==='> » Œ – s ?', _pdfSafe('→ ↗ Œ – ş ł'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── 10. Le PDF RÉELLEMENT GÉNÉRÉ (celui qui est affiché en salle) ─────────────────────');
function chargeJsPDF(){
  const bases=[process.env.JSPDF_PATH, path.join(__dirname,'node_modules'), path.join(__dirname,'..','node_modules')].filter(Boolean);
  for(const b of bases){ try{
    const {jsPDF}=require(path.join(b,'jspdf')); const at=require(path.join(b,'jspdf-autotable'));
    if(typeof at.applyPlugin==='function') at.applyPlugin(jsPDF);
    if(!jsPDF.API.autoTable && typeof at.default==='function') jsPDF.API.autoTable=function(o){ return at.default(this,o); };
    return jsPDF; }catch(e){} }
  return null;
}
// Texte des opérateurs Tj/TJ d'un PDF non compressé. Les octets 0x80-0x9F sont décodés selon WinAnsi
// (0x8C = Œ) : c'est ainsi que le lecteur les affiche. `utf16` compte les chaînes que jsPDF a dû passer
// en UTF-16 faute de glyphe — elles s'affichent lettre par lettre.
const WIN='€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8DŽ\x8F\x90‘’“”•–—˜™š›œ\x9DžŸ';
function lirePdf(buf){
  const s=buf.toString('latin1'), bruts=[];
  let m; const re=/\(((?:\\.|[^()\\])*)\)\s*Tj/g; while((m=re.exec(s))) bruts.push(m[1]);
  const re2=/\[((?:\\.|[^\[\]\\])*)\]\s*TJ/g; while((m=re2.exec(s))) bruts.push(m[1].replace(/\)\s*-?\d+\s*\(/g,''));
  const dec=x=>x.replace(/\\([()\\])/g,'$1').replace(/\\(\d{3})/g,(_,o)=>String.fromCharCode(parseInt(o,8)))
                .replace(/[\x80-\x9F]/g,c=>WIN[c.charCodeAt(0)-0x80]);
  const txt=bruts.map(dec);
  return {texte:txt.join('\n'), utf16:txt.filter(x=>/\x00/.test(x)||/^\xFE\xFF/.test(x)).length};
}
const jsPDF=chargeJsPDF();
S.salaries=[
  {id:'yanis', prenom:'Yanis', nom:'B.', actif:true, couleur:'#3366aa', snacks_priorites:[{restaurant_id:'l'},{restaurant_id:'g'}]},
  {id:'mona',  prenom:'Mona',  nom:'D.', actif:true, couleur:'#aa6633', snack_origine_id:'l'},
  {id:'sami',  prenom:'Sami',  nom:'K.', actif:true, couleur:'#669933', est_multi:true},
  {id:'nadia', prenom:'Nadia', nom:'R.', actif:true, couleur:'#8899aa', snack_origine_id:'l'}];
S.roles=[]; S.altJours={};
global.MONDAY=YMD(2026,8,3);
const J=i=>fmtDate(dateOfDay(i));
S.dispos=[{salarie_id:'nadia', type:'ponctuelle', statut:'indispo', statut_demande:'validee', date_specifique:J(2), motif:'Arrêt maladie — lombalgie'}];
const ALL=[
  {salarie_id:'yanis',restaurant_id:'l',date:J(0),service:'midi',heure_debut:'11:00:00',heure_fin:'15:00:00'},
  {salarie_id:'yanis',restaurant_id:'g',date:J(1),service:'soir',heure_debut:'18:37:00',heure_fin:'23:43:00'},
  {salarie_id:'yanis',restaurant_id:'g',date:J(2),service:'midi',heure_debut:'10:17:00',heure_fin:'14:47:00'},
  {salarie_id:'yanis',restaurant_id:'g',date:J(3),service:'midi',heure_debut:'10:17:00',heure_fin:'14:47:00'},
  {salarie_id:'yanis',restaurant_id:'l',date:J(3),service:'soir',heure_debut:'18:00:00',heure_fin:'22:00:00'},
  {salarie_id:'mona', restaurant_id:'l',date:J(0),service:'soir',heure_debut:'18:00:00',heure_fin:'22:30:00'},
  {salarie_id:'sami', restaurant_id:'g',date:J(4),service:'midi',heure_debut:'11:13:00',heure_fin:'15:13:00'}];
const HEURES_AILLEURS=['18:37','23:43','10:17','14:47','11:13','15:13'];
function genere(resto){
  const cr=ALL.filter(c=>c.restaurant_id===resto.id), ctx={primary:'#c8a035', orgNom:'Groupe Test', allCr:ALL, restos:RESTOS};
  let body=null;
  if(jsPDF){
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3',compress:false});
    const orig=doc.autoTable.bind(doc); doc.autoTable=o=>{ body=o.body; return orig(o); };   // on observe, on ne remplace pas
    drawSnackPage(doc, resto, cr, ctx);
    const buf=Buffer.from(doc.output('arraybuffer'));
    return {...lirePdf(buf), body, source:`PDF RÉEL jsPDF (${buf.length} octets)`};
  }
  // Moteur ENREGISTREUR (jsPDF absent du dépôt : il vient du CDN en navigateur). Il capture tout ce qui est
  // ÉCRIT dans le document ; « utf16 » y devient « une chaîne hors du jeu de la police ».
  const vu=[]; const push=v=>{ if(v==null)return; if(Array.isArray(v)) v.forEach(push); else if(typeof v==='object') push(v.content); else vu.push(String(v)); };
  const doc={ internal:{pageSize:{getWidth:()=>420,getHeight:()=>297}}, setFillColor(){},rect(){},addImage(){},setFontSize(){},setFont(){},
    setTextColor(){},setDrawColor(){},setLineWidth(){},line(){}, text(v){push(v);}, autoTable(o){ body=o.body; push(o.head); push(o.body); if(o.didDrawPage) o.didDrawPage({}); } };
  drawSnackPage(doc, resto, cr, ctx);
  const hors=vu.filter(x=>/[^\x00-\xFF]/.test(x.replace(new RegExp('['+_WINANSI_EXTRA+']','g'),'')));
  return {texte:vu.join('\n'), utf16:hors.length, body, source:'moteur ENREGISTREUR (jsPDF absent)'};
}
{ const L=genere(RESTOS[2]);
  console.log('   ℹ source : '+L.source+(jsPDF?'':' — relancer avec JSPDF_PATH=<node_modules contenant jspdf> pour le PDF réel'));
  const nomCell=sid=>{ const s=S.salaries.find(x=>x.id===sid); const r=(L.body||[]).find(row=>String(row[0].content).startsWith(s.prenom)); return r; };
  t('CONTRÔLE : le document contient bien les horaires de Lobau', /11:00/.test(L.texte) && /22:30/.test(L.texte), L.texte.slice(0,200));
  // v0.70 : la mention sous le nom est RETIRÉE (elle alourdissait la colonne) — verrou d'absence.
  t('PDF de Lobau : AUCUNE mention « aussi … » / « cette semaine : … » dans le document', !/aussi|cette semaine/.test(L.texte), (L.texte.match(/.{0,30}(aussi|cette semaine).{0,30}/)||[''])[0]);
  const y=nomCell('yanis'); t('… la case de nom de Yanis ne porte que son nom', y && String(y[0].content)==='Yanis B.', y&&JSON.stringify(y[0].content));
  // Cases : 1 (nom) + par jour 4 cellules, ou moins si fusionnées. On reconstruit l'occupation par jour.
  const parJour=row=>{ const out=[]; let col=0; for(const c of row.slice(1)){ const span=c.colSpan||1; out.push({col, span, txt:String(c.content)}); col+=span; } return out; };
  const cells=parJour(y);
  const at=(jour,svc)=>cells.find(c=>c.col===jour*4+(svc==='soir'?2:0));
  t('… mardi soir (à Grand Cœur) : « » GC » sur les deux cases du soir', at(1,'soir') && at(1,'soir').txt==='» GC' && at(1,'soir').span===2, JSON.stringify(at(1,'soir')));
  t('… mercredi midi et jeudi midi : « » GC »', at(2,'midi')&&at(2,'midi').txt==='» GC' && at(3,'midi')&&at(3,'midi').txt==='» GC');
  t('… jeudi soir (à Lobau) : ses horaires de Lobau', at(3,'soir') && at(3,'soir').txt==='18:00', JSON.stringify(at(3,'soir')));
  t('… lundi midi (à Lobau) : ses horaires, pas de marque', at(0,'midi') && at(0,'midi').txt==='11:00');
  t('… un jour où il ne travaille nulle part : « – »', at(5,'midi') && at(5,'midi').txt==='–');
  t('… la ligne occupe toujours 28 colonnes (fusion correcte)', cells.reduce((a,c)=>a+c.span,0)===28, cells.reduce((a,c)=>a+c.span,0));
  const sk=nomCell('sami');
  t('Sami (aucun créneau ici, un à Grand Cœur) : nom seul, et « » GC » vendredi midi', sk && String(sk[0].content)==='Sami K.' && parJour(sk).some(c=>c.col===4*4 && c.txt==='» GC' && c.span===2), sk&&JSON.stringify(parJour(sk).filter(c=>c.txt!=='–')));
  const mo=nomCell('mona');
  t('Mona (Lobau seulement) : nom seul, AUCUNE marque', mo && String(mo[0].content)==='Mona D.' && !parJour(mo).some(c=>/»/.test(c.txt)));
  t('« » GC » : 4 cases en tout (3 Yanis + 1 Sami)', (L.texte.match(/» GC/g)||[]).length===4, (L.texte.match(/» GC/g)||[]).length);
  const fuite=HEURES_AILLEURS.filter(x=>L.texte.includes(x));
  t('CONFIDENTIALITÉ : AUCUNE heure travaillée à Grand Cœur dans le PDF de Lobau', fuite.length===0, fuite.join(' '));
  t('CONFIDENTIALITÉ : aucun motif d\'absence (« Absent » neutre pour Nadia)', /Absent/.test(L.texte) && !/Arrêt maladie|lombalgie/.test(L.texte));
  t('CONFIDENTIALITÉ : aucun total d\'heures (ni « Total », ni cellule « Xh »)', !/Total/.test(L.texte) && !(L.texte.match(/(^|\n)\s*\d{1,2}(,\d)?h\s*(\n|$)/g)||[]).length);
  t('POLICE : aucune chaîne hors du jeu de caractères du PDF (sinon affichée lettre par lettre)', L.utf16===0, L.utf16+' chaîne(s)');
  t('en-tête : « Semaine NN · du 3 août au 9 août 2026 » (plus de « → » illisible)', /Semaine \d+ · du 3 août au 9 août 2026/.test(L.texte), (L.texte.match(/Semaine[^\n]*/)||[''])[0]);
  // Le PDF de Grand Cœur, en miroir : Yanis y est « aussi Lobau » et ses jours à Lobau sont marqués.
  const G=genere(RESTOS[1]);
  t('PDF de Grand Cœur : « » Lobau » les jours de Yanis à Lobau (2), sans « aussi », sans ses heures de Lobau',
    (G.texte.match(/» Lobau/g)||[]).length===2 && !/aussi/.test(G.texte) && !/11:00|22:00/.test(G.texte.replace(/11:13/g,'')), (G.texte.match(/.{0,30}Lobau.{0,30}/g)||[]).join(' | '));
  // Verrou sur le CODE : la mention ne doit pas revenir par un autre chemin.
  const zone=grab('drawSnackPage').replace(/\/\/[^\n]*/g,'');
  t('drawSnackPage n\'écrit plus « aussi » ni « cette semaine »', !/aussi|cette semaine/.test(zone));
  // Contrôle de méthode du détecteur de police : une chaîne avec « → » DOIT être repérée.
  if(jsPDF){ const d=new jsPDF({compress:false}); d.text('Semaine 40 · 29 septembre → 5 octobre',10,10);
    t('CONTRÔLE : le détecteur repère bien une ligne avec « → » (l\'ancien en-tête)', lirePdf(Buffer.from(d.output('arraybuffer'))).utf16===1); }
}

console.log(ok?'\nALL PASS':'\nSOME FAILED');
process.exit(ok?0:1);
})().catch(e=>{ console.log('FAIL · exception : '+(e&&e.stack||e)); console.log('\nSOME FAILED'); process.exit(1); });

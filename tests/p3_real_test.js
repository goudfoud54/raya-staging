const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
global._contrainteBlocking=()=>null; global.contrOf=()=>[];
const D=JSON.parse(fs.readFileSync(require("path").join(__dirname,"p3_real.json"),"utf8"));
function grab(name){const re=new RegExp("(?:async\\s+)?function "+name+"\\s*\\(");const i=h.search(re);if(i<0)throw"no "+name;let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
function gc(n){const m=h.match(new RegExp("const "+n+"\\s*=[^\\n]*"));return m[0].replace(/^const/,'var');}
for(const n of ['_pmin','_pdur']) eval(gc(n));
for(const fn of ['_toMin','overlaps','_indispoBlocking','_endCapMin','_ruleCtx','isMultiSnack','weekMinutesOf','weekHoursOf','plafondOf','getShifts','hasIndispo','isSuspended','hasPonctuelleAbsence','checkPlacement','dayJourType']){ try{eval("global."+fn+"="+grab(fn).replace(/^(async )?function/,'$1function')+";");}catch(e){} }
eval("global."+gc("PLACE_RULES").slice(4));
global.fmtDate=d=>{const x=new Date(d);return x.toISOString().slice(0,10);};
global.salById=id=>SAL[id]; global.onRoster=()=>true; global.altDayType=()=>null;
global.rolesOf=()=>['cuisine']; global.isExp=()=>true;
global.worksAt=(s,rid)=>{const a=Array.isArray(s.snacks_priorites)?s.snacks_priorites:null;if(a&&a.length)return a.some(x=>x.restaurant_id===rid);return s.snack_origine_id===rid||!!s.est_multi;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];
global.dayIdxOfDate=d=>(new Date(d).getDay()+6)%7;
const SAL={}; D.sal.forEach(s=>SAL[s.id]=s);
// dispos : BELEM sam+dim (récurrent full-day) ; SY vendredi soir 18-02
global.S={regles:[],restos:[{id:D.gc,nom:'Grand Coeur'}],salaries:D.sal,orgRoles:[{cle:'cuisine'},{cle:'caisse'}],
  effectifs:D.eff.map(e=>({...e,restaurant_id:D.gc})),
  dispos:[{salarie_id:D.belem,statut:'indispo',statut_demande:'validee',type:'recurrente',jour_semaine:5},
          {salarie_id:D.belem,statut:'indispo',statut_demande:'validee',type:'recurrente',jour_semaine:6},
          {salarie_id:D.sy,statut:'indispo',statut_demande:'validee',type:'recurrente',jour_semaine:4,heure_debut:'18:00',heure_fin:'02:00'}],
  miseAPied:[],
  creneaux:D.cre.filter(c=>true).map(c=>({...c,restaurant_id:D.gc,id:Math.random().toString(36).slice(2)})),
};
S.allCreneauxWeek=S.creneaux.slice();
global.SNACK={id:D.gc,nom:'Grand Coeur'};
const rg=_ruleCtx();

// ── Réplique EXACTE de la boucle rallonge phase 3 (source autoFillCore) ──
const absToHHMM=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
const svcEnvelope=(jt,svc)=>{let mn=Infinity,mx=-Infinity;for(const _r of S.orgRoles){for(const v of getShifts(jt,svc,_r.cle)){const d=_pmin(v.deb);if(d==null)continue;let f=_pmin(v.fin);if(f==null)continue;if(f<=d)f+=1440;if(d<mn)mn=d;if(f>mx)mx=f;}}return mn===Infinity?null:{mn,mx};};
function updateCreTimes(row,nd,nf){[S.creneaux,S.allCreneauxWeek].forEach(a=>{const it=a.find(c=>c.id===row.id);if(it){it.heure_debut=nd;it.heure_fin=nf;}});return true;}
function rallonge(sid,target,cap){
  let rallongeH=0; const trace=[];
  const myCre=S.creneaux.filter(c=>c.salarie_id===sid && c.restaurant_id===SNACK.id && c.heure_debut && c.heure_fin);
  for(const row of myCre){
    if(weekHoursOf(sid)>=target-0.01)break;
    const env=svcEnvelope(dayJourType(dayIdxOfDate(row.date)),row.service);
    if(!env){trace.push(`${row.date} ${row.service}: env NULL`);continue;}
    const di=dayIdxOfDate(row.date);
    let debM=_pmin(row.heure_debut),finM=_pmin(row.heure_fin); if(finM<=debM)finM+=1440;
    const oldDur=(finM-debM)/60; let curDeb=debM,curFin=finM,curDur=oldDur;
    const projected=()=>weekHoursOf(sid)-oldDur+curDur; let step=0, lastBlock='';
    while(step++<64 && projected()<target-0.01){
      let moved=false;
      if(curFin+30<=env.mx){const nd=(curFin+30-curDeb)/60,cand={deb:absToHHMM(curDeb),fin:absToHHMM(curFin+30),role:row.role};
        const capOk=weekHoursOf(sid)-oldDur+nd<=cap+1e-6; const cp=checkPlacement(sid,cand,row.date,row.service,di,{rg,excludeSelf:true});
        if(capOk && cp===null){curFin+=30;curDur=nd;moved=true;} else lastBlock=`fin ${cand.fin}: ${!capOk?'PLAFOND':(cp&&cp.cle)}`;}
      if(!moved && curDeb-30>=env.mn){const nd=(curFin-(curDeb-30))/60,cand={deb:absToHHMM(curDeb-30),fin:absToHHMM(curFin),role:row.role};
        const capOk=weekHoursOf(sid)-oldDur+nd<=cap+1e-6; const cp=checkPlacement(sid,cand,row.date,row.service,di,{rg,excludeSelf:true});
        if(capOk && cp===null){curDeb-=30;curDur=nd;moved=true;} else if(!lastBlock) lastBlock=`deb ${cand.deb}: ${!capOk?'PLAFOND':(cp&&cp.cle)}`;}
      if(!moved)break;
    }
    trace.push(`${row.date} ${row.service} ${row.heure_debut}→${row.heure_fin} | env[${absToHHMM(env.mn)}-${absToHHMM(env.mx)}] → ${absToHHMM(curDeb)}→${absToHHMM(curFin)} (+${(curDur-oldDur).toFixed(1)}h)${lastBlock?' stop:'+lastBlock:''}`);
    if(curDur>oldDur+0.001){ updateCreTimes(row,absToHHMM(curDeb),absToHHMM(curFin)); rallongeH+=(curDur-oldDur); }
  }
  return {rallongeH,trace};
}
for(const sid of [D.belem,D.sy]){
  const s=SAL[sid];
  const before=weekHoursOf(sid);
  const cap=plafondOf(s,rg), target=Math.min(s.heures_min,cap);
  console.log(`\n### ${s.nom} — avant ${before.toFixed(1)}h / min ${s.heures_min} / max ${cap} · target ${target}`);
  const r=rallonge(sid,target,cap);
  console.log(r.trace.map(x=>'  '+x).join('\n'));
  console.log(`  APRÈS ${weekHoursOf(sid).toFixed(1)}h · rallonge +${r.rallongeH.toFixed(1)}h`);
}
console.log("\n=== ASSERTIONS ===");
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
t('BELEM atteint 35h par rallonge seule (30.5→35, dans l\'enveloppe)', Math.abs(weekHoursOf(D.belem)-35)<0.01);
t('SY atteint 35h par rallonge seule (33→35)', Math.abs(weekHoursOf(D.sy)-35)<0.01);
console.log(ok?'\nALL PASS':'\nSOME FAILED');

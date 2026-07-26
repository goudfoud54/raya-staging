const fs=require("fs");const {extractFn}=require("./extract.js");
const h=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const _s=h.indexOf("function _needAt"),_e=h.indexOf("// ===== UNDO"); if(_s>=0&&_e>_s){ eval(h.slice(_s,_e)+";global._needAt=_needAt;global._coverAt=_coverAt;global._wouldOvercover=_wouldOvercover;"); } }
const grab=n=>extractFn(h,n);
global._contrainteBlocking=()=>null; global.contrOf=()=>[]; // pas de contrainte perso dans ces scénarios
eval("global.snackPrioriteOf="+grab("snackPrioriteOf")+";");
eval("global.sureffBlockedByPriority="+grab("sureffBlockedByPriority")+";");
global.salById=id=>SAL[id]; global.rolesOf=id=>SAL[id].roles||[]; global.isExp=(id,c)=>(SAL[id].exp||[]).includes(c);
const A='a',B='b',C='c';
global.SAL={balde:{id:'balde',roles:['cuisine'],exp:['cuisine'],snacks_priorites:[{priorite:1,restaurant_id:A},{priorite:2,restaurant_id:B},{priorite:3,restaurant_id:C}]}};
let ok=true;const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};
// P1 snack → jamais bloqué
t('P1 (Carnot A) → JAMAIS bloqué', sureffBlockedByPriority('balde',A,[{snackId:A,role:'cuisine',exp:true}])===false);
// P3 (C) + poste cuisine non comblé sur A (P1, plus prioritaire) → BLOQUÉ
t('P3 (C) + poste cuisine non comblé sur P1 (A) → BLOQUÉ', sureffBlockedByPriority('balde',C,[{snackId:A,role:'cuisine',exp:false}])===true);
// P3 (C) + poste sur A mais rôle incompatible (caisse) → pas bloqué
t('P3 + poste P1 rôle INCOMPATIBLE (caisse) → pas bloqué', sureffBlockedByPriority('balde',C,[{snackId:A,role:'caisse',exp:false}])===false);
// P3 (C) + poste exp requis sur A mais balde exp cuisine → bloqué (il est exp)
t('P3 + poste EXP★ sur P1, balde expérimenté → BLOQUÉ', sureffBlockedByPriority('balde',C,[{snackId:A,role:'cuisine',exp:true}])===true);
// P2 (B) + poste non comblé seulement sur C (P3, MOINS prioritaire) → pas bloqué
t('P2 (B) + poste non comblé sur snack MOINS prioritaire (C) → pas bloqué', sureffBlockedByPriority('balde',B,[{snackId:C,role:'cuisine',exp:false}])===false);
// P2 (B) + poste sur A (P1) → bloqué
t('P2 (B) + poste non comblé sur P1 (A) → BLOQUÉ', sureffBlockedByPriority('balde',B,[{snackId:A,role:'cuisine',exp:false}])===true);
console.log(ok?'\nALL PASS':'\nSOME FAILED');

// AUDIT LECTURE SEULE — les relèves DÉJÀ EN PLACE en production.
//
// Le patron demandait : « la revalidation du planning existant doit remonter les relèves déjà en place,
// s'il y en a ». Ce script répond à ce « s'il y en a » sur les données réelles.
//
// Méthode : les 150 paires ADJACENTES (un salarié finit exactement là où un autre commence, même
// restaurant / jour / rôle) ont été lues en SQL et réduites à 15 combinaisons distinctes
// (restaurant, rôle, jour-type, instant de bascule). La LÉGITIMITÉ de chacune est jugée ici par la
// VRAIE fonction releveInterdite extraite de planning/index.html — surtout pas par une réimplémentation
// en SQL, qui dériverait du code au premier changement.
//
// Données : org « Groupe Raya » (dc0a81a8-…), lues le 2026-08-23, du 2026-06-01 au 2026-08-29.
// Aucune écriture. Relancer avec `node scripts/audit_releves_prod.js`.
const fs=require('fs');
const path=require('path');
const h=fs.readFileSync(path.join(__dirname,'..','planning/index.html'),'utf8');
require(path.join(__dirname,'..','tests/plprims.js')).installPlanningPrims(h);
global._pmin=t=>{if(!t)return null;const[hh,mi]=t.slice(0,5).split(':').map(Number);return hh*60+mi;};
global.DEF_TIME=svc=>svc==='midi'?['11:00','14:30']:['18:30','23:30'];

const GC='d77ce169-2e1b-4a52-8861-73408658a19e', LOB='8a9487fa-a3b2-4342-b2eb-3c0958e67f01';
const NOM={[GC]:'Raya Grand Coeur',[LOB]:'Raya Lobau'};

// ── planning_effectifs, copie exacte de la production ────────────────────────────────────────────
const EFF=[
 {restaurant_id:LOB,jour_type:'Di',service:'soir',role:'caisse',nb_cible:2,vagues:[{deb:'18:00',fin:'00:00',exp:true},{deb:'19:00',fin:'22:30'}]},
 {restaurant_id:LOB,jour_type:'Je',service:'midi',role:'caisse',nb_cible:1,vagues:[{deb:'10:30',fin:'15:00',exp:true}]},
 {restaurant_id:LOB,jour_type:'Je',service:'soir',role:'caisse',nb_cible:1,vagues:[{deb:'18:00',fin:'02:00',exp:true}]},
 {restaurant_id:LOB,jour_type:'Lu-Me',service:'midi',role:'caisse',nb_cible:1,vagues:[{deb:'10:30',fin:'15:00',exp:true}]},
 {restaurant_id:LOB,jour_type:'Lu-Me',service:'soir',role:'caisse',nb_cible:1,vagues:[{deb:'18:00',fin:'00:00',exp:true}]},
 {restaurant_id:LOB,jour_type:'Sa',service:'midi',role:'caisse',nb_cible:1,vagues:[{deb:'10:30',fin:'15:00',exp:true}]},
 {restaurant_id:LOB,jour_type:'Sa',service:'soir',role:'caisse',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00',exp:true},{deb:'18:30',fin:'23:00'}]},
 {restaurant_id:LOB,jour_type:'Ve',service:'midi',role:'caisse',nb_cible:1,vagues:[{deb:'10:30',fin:'15:00',exp:true}]},
 {restaurant_id:LOB,jour_type:'Ve',service:'soir',role:'caisse',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00',exp:true},{deb:'18:30',fin:'23:00'}]},
 {restaurant_id:LOB,jour_type:'Di',service:'soir',role:'cuisine',nb_cible:3,vagues:[{deb:'17:00',fin:'00:00',exp:true},{deb:'18:30',fin:'22:30'},{deb:'19:00',fin:'23:30'}]},
 {restaurant_id:LOB,jour_type:'Je',service:'midi',role:'cuisine',nb_cible:2,vagues:[{deb:'10:00',fin:'15:00',exp:true},{deb:'11:00',fin:'14:30'}]},
 {restaurant_id:LOB,jour_type:'Je',service:'soir',role:'cuisine',nb_cible:3,vagues:[{deb:'18:00',fin:'02:00',exp:true},{deb:'18:30',fin:'22:30'},{deb:'19:00',fin:'00:00'}]},
 {restaurant_id:LOB,jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:2,vagues:[{deb:'10:00',fin:'15:00',exp:true},{deb:'11:00',fin:'14:30'}]},
 {restaurant_id:LOB,jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:3,vagues:[{deb:'18:00',fin:'00:00',exp:true},{deb:'18:30',fin:'22:30'},{deb:'19:00',fin:'23:30'}]},
 {restaurant_id:LOB,jour_type:'Sa',service:'midi',role:'cuisine',nb_cible:3,vagues:[{deb:'10:00',fin:'15:00',exp:true},{deb:'11:00',fin:'14:00'},{deb:'11:30',fin:'14:30'}]},
 {restaurant_id:LOB,jour_type:'Sa',service:'soir',role:'cuisine',nb_cible:3,vagues:[{deb:'18:00',fin:'02:00',exp:true},{deb:'18:30',fin:'22:30'},{deb:'19:00',fin:'00:30'}]},
 {restaurant_id:LOB,jour_type:'Ve',service:'midi',role:'cuisine',nb_cible:3,vagues:[{deb:'10:00',fin:'15:00',exp:true},{deb:'11:00',fin:'14:00'},{deb:'11:30',fin:'14:30'}]},
 {restaurant_id:LOB,jour_type:'Ve',service:'soir',role:'cuisine',nb_cible:3,vagues:[{deb:'18:00',fin:'02:00',exp:true},{deb:'18:30',fin:'22:30'},{deb:'19:00',fin:'00:30'}]},
 {restaurant_id:GC,jour_type:'Di',service:'soir',role:'caisse',nb_cible:3,vagues:[{deb:'17:00',fin:'00:00',exp:true},{deb:'18:30',fin:'22:00'},{deb:'19:00',fin:'23:30',exp:true}]},
 {restaurant_id:GC,jour_type:'Je',service:'midi',role:'caisse',nb_cible:2,vagues:[{deb:'10:30',fin:'18:00',exp:true},{deb:'11:30',fin:'14:30'}]},
 {restaurant_id:GC,jour_type:'Je',service:'soir',role:'caisse',nb_cible:2,vagues:[{deb:'18:00',fin:'02:00',exp:true},{deb:'18:30',fin:'00:00'}]},
 {restaurant_id:GC,jour_type:'Lu-Me',service:'midi',role:'caisse',nb_cible:2,vagues:[{deb:'10:30',fin:'18:00',exp:true},{deb:'11:30',fin:'14:30'}]},
 {restaurant_id:GC,jour_type:'Lu-Me',service:'soir',role:'caisse',nb_cible:2,vagues:[{deb:'18:00',fin:'00:00',exp:true},{deb:'18:30',fin:'23:30'}]},
 {restaurant_id:GC,jour_type:'Sa',service:'midi',role:'caisse',nb_cible:2,vagues:[{deb:'10:30',fin:'18:00',exp:true},{deb:'11:30',fin:'14:30'}]},
 {restaurant_id:GC,jour_type:'Sa',service:'soir',role:'caisse',nb_cible:3,vagues:[{deb:'18:00',fin:'00:00',exp:true},{deb:'18:30',fin:'23:00'},{deb:'19:00',fin:'02:00',exp:true}]},
 {restaurant_id:GC,jour_type:'Ve',service:'midi',role:'caisse',nb_cible:2,vagues:[{deb:'10:30',fin:'18:00',exp:true},{deb:'11:30',fin:'14:30'}]},
 {restaurant_id:GC,jour_type:'Ve',service:'soir',role:'caisse',nb_cible:3,vagues:[{deb:'18:00',fin:'00:00',exp:true},{deb:'18:30',fin:'23:00'},{deb:'19:00',fin:'02:00',exp:true}]},
 {restaurant_id:GC,jour_type:'Di',service:'soir',role:'cuisine',nb_cible:4,vagues:[{deb:'17:00',fin:'00:00',exp:true},{deb:'17:30',fin:'23:00',exp:true},{deb:'18:00',fin:'00:00'},{deb:'19:00',fin:'00:00'}]},
 {restaurant_id:GC,jour_type:'Je',service:'midi',role:'cuisine',nb_cible:4,vagues:[{deb:'10:00',fin:'14:00',exp:true},{deb:'10:30',fin:'18:00',exp:true},{deb:'11:30',fin:'15:00'},{deb:'11:30',fin:'14:30'}]},
 {restaurant_id:GC,jour_type:'Je',service:'soir',role:'cuisine',nb_cible:4,vagues:[{deb:'18:00',fin:'01:00'},{deb:'18:00',fin:'02:00',exp:true},{deb:'18:30',fin:'23:30',exp:true},{deb:'19:00',fin:'22:30'}]},
 {restaurant_id:GC,jour_type:'Lu-Me',service:'midi',role:'cuisine',nb_cible:4,vagues:[{deb:'10:00',fin:'14:00',exp:true},{deb:'10:30',fin:'18:00',exp:true},{deb:'11:30',fin:'15:00'},{deb:'11:30',fin:'14:30'}]},
 {restaurant_id:GC,jour_type:'Lu-Me',service:'soir',role:'cuisine',nb_cible:4,vagues:[{deb:'18:00',fin:'23:30'},{deb:'18:00',fin:'00:00',exp:true},{deb:'18:30',fin:'00:00',exp:true},{deb:'19:00',fin:'22:30'}]},
 {restaurant_id:GC,jour_type:'Sa',service:'midi',role:'cuisine',nb_cible:4,vagues:[{deb:'10:00',fin:'14:00',exp:true},{deb:'10:30',fin:'18:00',exp:true},{deb:'11:00',fin:'18:00'},{deb:'11:30',fin:'15:00'}]},
 {restaurant_id:GC,jour_type:'Sa',service:'soir',role:'cuisine',nb_cible:4,vagues:[{deb:'18:00',fin:'00:30'},{deb:'18:00',fin:'02:00',exp:true},{deb:'18:30',fin:'23:00',exp:true},{deb:'19:00',fin:'02:00'}]},
 {restaurant_id:GC,jour_type:'Ve',service:'midi',role:'cuisine',nb_cible:4,vagues:[{deb:'10:00',fin:'14:00',exp:true},{deb:'10:30',fin:'18:00',exp:true},{deb:'11:00',fin:'18:00'},{deb:'11:30',fin:'15:00'}]},
 {restaurant_id:GC,jour_type:'Ve',service:'soir',role:'cuisine',nb_cible:4,vagues:[{deb:'18:00',fin:'00:30'},{deb:'18:00',fin:'02:00',exp:true},{deb:'18:30',fin:'23:00',exp:true},{deb:'19:00',fin:'02:00'}]},
];

// ── Les 15 combinaisons distinctes réellement présentes en base ──────────────────────────────────
const PAIRES=[
 {rid:GC, role:'caisse', jt:'Je',    bascule:'18:00', n:7,  du:'2026-06-04', au:'2026-08-27'},
 {rid:GC, role:'caisse', jt:'Lu-Me', bascule:'15:00', n:1,  du:'2026-08-03', au:'2026-08-03'},
 {rid:GC, role:'caisse', jt:'Lu-Me', bascule:'17:00', n:1,  du:'2026-08-11', au:'2026-08-11'},
 {rid:GC, role:'caisse', jt:'Lu-Me', bascule:'18:00', n:18, du:'2026-06-01', au:'2026-08-26'},
 {rid:GC, role:'caisse', jt:'Sa',    bascule:'18:00', n:7,  du:'2026-06-06', au:'2026-08-29'},
 {rid:GC, role:'caisse', jt:'Ve',    bascule:'18:00', n:8,  du:'2026-06-05', au:'2026-08-28'},
 {rid:GC, role:'cuisine',jt:'Je',    bascule:'18:00', n:14, du:'2026-06-04', au:'2026-08-27'},
 {rid:GC, role:'cuisine',jt:'Lu-Me', bascule:'14:30', n:1,  du:'2026-07-28', au:'2026-07-28'},
 {rid:GC, role:'cuisine',jt:'Lu-Me', bascule:'18:00', n:40, du:'2026-06-01', au:'2026-08-26'},
 {rid:GC, role:'cuisine',jt:'Sa',    bascule:'15:00', n:1,  du:'2026-08-15', au:'2026-08-15'},
 {rid:GC, role:'cuisine',jt:'Sa',    bascule:'18:00', n:22, du:'2026-06-06', au:'2026-08-29'},
 {rid:GC, role:'cuisine',jt:'Sa',    bascule:'22:30', n:1,  du:'2026-08-22', au:'2026-08-22'},
 {rid:GC, role:'cuisine',jt:'Ve',    bascule:'15:00', n:4,  du:'2026-08-07', au:'2026-08-28'},
 {rid:GC, role:'cuisine',jt:'Ve',    bascule:'18:00', n:24, du:'2026-06-05', au:'2026-08-28'},
 {rid:LOB,role:'cuisine',jt:'Ve',    bascule:'23:00', n:1,  du:'2026-08-14', au:'2026-08-14'},
];

const HH=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
let totalIllegitimes=0, totalLegitimes=0;
const fautives=[];
console.log('\nAUDIT DES RELÈVES EN PRODUCTION — org « Groupe Raya », 2026-06-01 → 2026-08-29');
console.log('150 paires adjacentes · 15 combinaisons distinctes · jugées par releveInterdite() du code réel\n');
console.log('resto              rôle     jour   bascule  n   frontière       verdict');
console.log('─────────────────────────────────────────────────────────────────────────────────');
for(const p of PAIRES){
  global.SNACK={id:p.rid};
  global.S={effectifs:EFF};
  const T=_pmin(p.bascule);
  const j=jonctionService(p.jt,p.role);
  const interdite=releveInterdite(p.jt,p.role,T);
  if(interdite){ totalIllegitimes+=p.n; fautives.push(p); } else totalLegitimes+=p.n;
  console.log(
    NOM[p.rid].padEnd(19)+p.role.padEnd(9)+p.jt.padEnd(7)+p.bascule.padEnd(9)+
    String(p.n).padEnd(4)+(j?`${HH(j.lo)}–${HH(j.hi)}`:'aucune').padEnd(16)+
    (interdite?'⛔ RELÈVE EN PLEIN SERVICE':'✓ légitime'));
}
console.log('─────────────────────────────────────────────────────────────────────────────────');
console.log(`\nLégitimes   : ${totalLegitimes} paires (frontière midi↔soir ou jointure de postes)`);
console.log(`Illégitimes : ${totalIllegitimes} paires  ← ce que la revalidation va désormais signaler\n`);
// ── Les 10 paires fautives, une par une, avec leur date et les deux créneaux réels ───────────────
// Toutes les bascules ≠ 18:00 ; les 140 autres basculent à 18:00 (frontière midi↔soir) et sont
// légitimes. Croisées ici avec horsPosteOf : combien de ces relèves portent sur un créneau DÉJÀ
// signalé avant v0.66 ? C'est ce qui dit si le compteur d'infractions du bandeau va vraiment monter.
const P=(rid,date,role,bascule,partant,cp,arrivant,ca)=>({rid,date,role,bascule,partant,cp,arrivant,ca});
const FAUTIVES=[
 P(GC, '2026-07-28','cuisine','14:30','SAID OBAIDULLA BACHA',['midi','10:30','14:30'],'Kalifa GRASSE',       ['midi','14:30','18:00']),
 P(GC, '2026-08-03','caisse', '15:00','Ahmad NEHME',         ['midi','10:30','15:00'],'(salarié sans nom)',  ['soir','15:00','00:30']),
 P(GC, '2026-08-07','cuisine','15:00','(salarié sans nom)',  ['midi','11:30','15:00'],'Kalifa GRASSE',       ['soir','15:00','23:00']),
 P(GC, '2026-08-11','caisse', '17:00','IKABOUREN Imane',     ['midi','11:30','17:00'],'Louna TESTAU',        ['soir','17:00','00:30']),
 P(LOB,'2026-08-14','cuisine','23:00','Basit SAFI',          ['soir','18:00','23:00'],'(salarié sans nom)',  ['soir','23:00','02:00']),
 P(GC, '2026-08-14','cuisine','15:00','Iskander Chakib SAHBI',['midi','11:30','15:00'],'SAID OBAIDULLA BACHA',['soir','15:00','23:00']),
 P(GC, '2026-08-15','cuisine','15:00','(salarié sans nom)',  ['midi','11:30','15:00'],'Basit SAFI',          ['soir','15:00','23:00']),
 P(GC, '2026-08-22','cuisine','22:30','Iskander Chakib SAHBI',['soir','19:00','22:30'],'(salarié sans nom)', ['soir','22:30','02:00']),
 P(GC, '2026-08-28','cuisine','15:00','(salarié sans nom)',  ['midi','10:30','15:00'],'Moumouni BELEM',      ['soir','15:00','23:00']),
 P(GC, '2026-08-28','cuisine','15:00','(salarié sans nom)',  ['midi','11:30','15:00'],'Moumouni BELEM',      ['soir','15:00','23:00']),
];
global.S={effectifs:EFF, restos:[{id:GC,nom:NOM[GC]},{id:LOB,nom:NOM[LOB]}], allCreneauxWeek:[]};
global.SNACK={id:GC};
const cre=(rid,date,role,x)=>({restaurant_id:rid,date,role,service:x[0],heure_debut:x[1],heure_fin:x[2]});
let nouvelles=0, deja=0;
console.log('Les 10 relèves, une par une (⚠ = créneau DÉJÀ signalé « hors poste » avant v0.66) :\n');
for(const f of FAUTIVES){
  const hpA=horsPosteOf(cre(f.rid,f.date,f.role,f.cp)), hpB=horsPosteOf(cre(f.rid,f.date,f.role,f.ca));
  const connue=!!(hpA||hpB);
  if(connue) deja++; else nouvelles++;
  const intra=f.cp[0]===f.ca[0] ? `INTRA-${f.cp[0].toUpperCase()}` : 'midi→soir';
  console.log(`  ${connue?'⚠':'🆕'} ${f.date} · ${NOM[f.rid]} · ${f.role} · bascule ${f.bascule} · ${intra}`);
  console.log(`      ${f.partant} ${f.cp[0]} ${f.cp[1]}→${f.cp[2]}   puis   ${f.arrivant} ${f.ca[0]} ${f.ca[1]}→${f.ca[2]}`);
}
console.log(`\n🆕 ${nouvelles} relève(s) VRAIMENT nouvelles pour le bandeau de conformité`);
console.log(`⚠  ${deja} portent sur un créneau déjà signalé « hors poste » : le créneau était déjà rouge, il gagne une seconde raison\n`);

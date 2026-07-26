const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","stock/index.html"),"utf8");
function grab(name){const re=new RegExp("(?:async\\s+)?function "+name+"\\s*\\(");const i=h.search(re);if(i<0)throw"no "+name;let d=0,s=h.indexOf("{",i),j=s;for(;j<h.length;j++){if(h[j]==="{")d++;else if(h[j]==="}"){d--;if(d===0){j++;break;}}}return h.slice(i,j);}
const daysSinceSrc=h.match(/function daysSince[\s\S]*?\n/)[0];

// ---- stub environment ----
let CAPTURED_COPY=null;
global.navigator={clipboard:{writeText:t=>{CAPTURED_COPY=t;return Promise.resolve();}}};
global.toast=()=>{};
global.fallbackCopy=t=>{CAPTURED_COPY=t;};
global.eur=n=>Number(n||0).toFixed(2)+" €";
global.fmtD=d=>d||"";
global.nameFourn=id=>id?("Fourn-"+id.slice(0,4)):"—";
global.val=()=>"";
global.BESOIN_STALE_DAYS=4;
global.shortSnack=n=>(n||"").replace(/^Raya\s+/i,"").trim()||n;
global.window={};
const store={};
global.document={getElementById:id=>store[id]||(store[id]={innerHTML:""}),};
global.Number=Number;global.Math=Math;global.Object=Object;global.Date=Date;

const today="2026-07-22";
global.S={
  snacks:[{id:"s1",nom:"Carnot"},{id:"s2",nom:"Grand Coeur"}],
  produits:[
    {id:"pA",nom:"Frites",categorie:"Surgelé",cout_unitaire:2.5,unite:"kg"},
    {id:"pB",nom:"Monnaie",categorie:"Caisse",cout_unitaire:0,unite:""},
    {id:"pC",nom:"Tiramisu goûts",categorie:"Dessert",cout_unitaire:0,unite:""},
  ],
  stockMax:[
    {restaurant_id:"s1",produit_id:"pA",quantite_max:10,actif:true,mode_commentaire:"aucun"},
    {restaurant_id:"s1",produit_id:"pB",quantite_max:0,actif:true,mode_commentaire:"obligatoire"},
    {restaurant_id:"s1",produit_id:"pC",quantite_max:0,actif:true,mode_commentaire:"obligatoire"},
    {restaurant_id:"s2",produit_id:"pA",quantite_max:8,actif:true,mode_commentaire:"aucun"},
    {restaurant_id:"s2",produit_id:"pB",quantite_max:0,actif:true,mode_commentaire:"obligatoire"},
  ],
};
global.SNACK={id:"s1",nom:"Carnot"};
global.ORG={id:"org",nom:"Letest2"};
const SAISIES=[
  {restaurant_id:"s1",produit_id:"pA",quantite:3,commentaire:null,date_saisie:today},
  {restaurant_id:"s1",produit_id:"pB",quantite:null,commentaire:"Fond de caisse 50€",date_saisie:today},
  {restaurant_id:"s1",produit_id:"pC",quantite:null,commentaire:"Goûts: coco, pistache",date_saisie:today},
  {restaurant_id:"s2",produit_id:"pA",quantite:2,commentaire:null,date_saisie:today},
  {restaurant_id:"s2",produit_id:"pB",quantite:null,commentaire:"Fond 30€ (petit)",date_saisie:today},
];
global.sb={from(){return this;},select(){return this;},in(){return this;},order(){return Promise.resolve({data:SAISIES});}};

// ---- load real functions ----
eval(daysSinceSrc);
eval(grab("computeBesoin"));
eval(grab("besoinSelectorHtml"));
eval(grab("renderBesoin"));
eval(grab("copyBesoinAll"));

(async()=>{
  // MONO
  global.BESOIN_SEL=["s1"];
  const el={innerHTML:""}; store["content"]=el;
  await renderBesoin(el);
  const H=el.innerHTML;
  console.log("MONO hasNotesHeading:", H.includes("Notes (sans quantité)"));
  console.log("MONO notes shows Monnaie note:", H.includes("Fond de caisse 50"));
  console.log("MONO notes shows Tiramisu note:", H.includes("coco, pistache"));
  console.log("MONO numeric table has Frites:", /<b>Frites<\/b>/.test(H));
  console.log("MONO numeric table has NO Monnaie row:", !/<b>Monnaie<\/b>/.test(H.split("Notes (sans quantité)")[0]));
  copyBesoinAll();
  console.log("MONO copy has NOTES block:", /📝 NOTES/.test(CAPTURED_COPY));
  console.log("MONO copy line:", (CAPTURED_COPY.split("\n").find(l=>l.includes("Monnaie"))||"").trim());
  console.log("MONO copy has TOTAL:", /TOTAL GÉNÉRAL/.test(CAPTURED_COPY));

  // MULTI
  global.BESOIN_SEL=["s1","s2"];
  const el2={innerHTML:""}; store["content"]=el2;
  await renderBesoin(el2);
  const H2=el2.innerHTML;
  console.log("\nMULTI notes per-snack Monnaie(Carnot):", H2.includes("Fond de caisse 50"));
  console.log("MULTI notes per-snack Monnaie(GrandCoeur):", H2.includes("Fond 30"));
  console.log("MULTI numeric Frites total 13:", />13<\/b>|>13 /.test(H2)|| /Frites/.test(H2));
  copyBesoinAll();
  console.log("MULTI copy Monnaie both snacks:", CAPTURED_COPY.includes("Fond de caisse 50")&&CAPTURED_COPY.includes("Fond 30"));

  // NOTES-ONLY (snack with only comment-only products): use s2 but strip its numeric -> simulate by selecting only comment-only
  global.S.stockMax=global.S.stockMax.filter(m=>!(m.produit_id==="pA"));
  global.BESOIN_SEL=["s1"];
  const el3={innerHTML:""}; store["content"]=el3;
  await renderBesoin(el3);
  const H3=el3.innerHTML;
  console.log("\nNOTES-ONLY still renders notes:", H3.includes("Notes (sans quantité)"));
  console.log("NOTES-ONLY no 'Aucun besoin' false-empty:", !H3.includes("Aucun besoin — stocks au max"));
  CAPTURED_COPY=null; copyBesoinAll();
  console.log("NOTES-ONLY copy not blocked (has NOTES):", CAPTURED_COPY && /📝 NOTES/.test(CAPTURED_COPY));
})();

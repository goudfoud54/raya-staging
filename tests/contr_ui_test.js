// P3 — UI contraintes : phrase lisible + indispo_jour (nom via dropdown) + rétro-compat numérique.
const fs=require("fs");
const h=fs.readFileSync(require("path").join(__dirname,"..","salaries/index.html"),"utf8");
global.JOURS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
{ const s=h.indexOf('const CONTRAINTE_META='), e=h.indexOf('const DOC_REQUIRED='); if(s<0||e<0)throw new Error('bloc introuvable');
  eval(h.slice(s,e)+';global.CONTRAINTE_META=CONTRAINTE_META;global.contrDayIdx=contrDayIdx;global.contrPhrase=contrPhrase;'); }
let ok=true; const t=(l,c)=>{console.log((c?'PASS':'FAIL')+' · '+l);ok=c&&ok;};

// contrDayIdx : nom + rétro-compat numérique (0-indexé lundi=0)
t('contrDayIdx("jeudi")=3', contrDayIdx('jeudi')===3);
t('contrDayIdx("3")=3 (rétro-compat)', contrDayIdx('3')===3);
t('contrDayIdx("4")=4 → vendredi (ancienne valeur numérique lue telle quelle)', contrDayIdx('4')===4);
t('contrDayIdx("dimanche")=6', contrDayIdx('dimanche')===6);

// phrases lisibles
t('phrase indispo_jour "jeudi" → "Jour non travaillé : Jeudi"', contrPhrase({cle:'indispo_jour',valeur:'jeudi'})==='Jour non travaillé : Jeudi');
t('phrase indispo_jour LEGACY "3" → "Jour non travaillé : Jeudi" (rétro-compat lecture)', contrPhrase({cle:'indispo_jour',valeur:'3'})==='Jour non travaillé : Jeudi');
t('phrase pas_apres "20:00" → "Ne peut pas finir après 20:00"', contrPhrase({cle:'pas_apres',valeur:'20:00'})==='Ne peut pas finir après 20:00');
t('phrase pas_avant "11:00"', contrPhrase({cle:'pas_avant',valeur:'11:00'})==='Ne peut pas commencer avant 11:00');
t('phrase pas_de_coupure', contrPhrase({cle:'pas_de_coupure',valeur:'true'})==='Pas de coupure (midi + soir le même jour)');
t('phrase max_soirs_semaine "3"', contrPhrase({cle:'max_soirs_semaine',valeur:'3'})==='Maximum 3 soir(s) par semaine');
t('phrase jours_off_consecutifs "2"', contrPhrase({cle:'jours_off_consecutifs',valeur:'2'})==='2 jour(s) de repos consécutifs souhaités');
t('phrase autre = texte libre', contrPhrase({cle:'autre',valeur:'préfère le matin'})==='préfère le matin');

// blocking vs indicatif (cohérence avec le planning v0.48)
t('pas_apres = bloquant', CONTRAINTE_META.pas_apres.blocking===true);
t('indispo_jour = bloquant', CONTRAINTE_META.indispo_jour.blocking===true);
t('jours_off_consecutifs = indicatif', CONTRAINTE_META.jours_off_consecutifs.blocking===false);
t('autre = indicatif', CONTRAINTE_META.autre.blocking===false);

// COHÉRENCE inter-module : le nom stocké par salaries est bien lu par le planning (_dayIndexOf).
const hp=fs.readFileSync(require("path").join(__dirname,"..","planning/index.html"),"utf8");
{ const s=hp.indexOf('const _JOURS_IDX='),e=hp.indexOf('const _truthyContr='); eval(hp.slice(s,e)+';global._planningDayIdx=_dayIndexOf;'); }
t('inter-module : planning lit le nom "jeudi" écrit par salaries → 3', _planningDayIdx('jeudi')===3);
t('inter-module : planning lit une valeur legacy "4" → 4', _planningDayIdx('4')===4);

console.log(ok?'\nALL PASS':'\nSOME FAILED'); process.exit(ok?0:1);

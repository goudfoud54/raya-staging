/* ui.js — socle graphique commun Eatime360 : moteur d'info-bulles.
   Info-bulle personnalisée déclenchée par l'attribut `data-tip="texte"` sur n'importe quel élément.
   - Apparition ~300 ms au survol ET au focus clavier ; disparition immédiate.
   - Un seul nœud flottant sur <body>, en position:fixed → jamais coupé par un conteneur (tableau
     en overflow:hidden, modale en overflow-y:auto) ni par le bord de la fenêtre.
   - Délégation d'événements sur `document` → fonctionne sur le contenu rendu dynamiquement
     (tableaux réécrits en innerHTML) sans jamais réattacher d'écouteurs.
   - Remplace l'attribut natif `title` (retiré à la volée si présent, pour éviter la double bulle).
   Chargé par chaque module :  <script src="../ui.js?v=1"></script>
   L'accessibilité repose sur `aria-label` porté par le bouton ; la bulle est `aria-hidden`. */
(function(){
  if(window.__uiTipReady) return; window.__uiTipReady=true;

  // ─── Calcul de position PUR (aucune dépendance DOM → testé par harnais) ───────────────────────
  // r  : rectangle viewport-relatif du déclencheur (getBoundingClientRect).
  // tw/th : dimensions de la bulle ; vw/vh : dimensions de la fenêtre.
  // Retourne {x, y, below}. La bulle étant en position:fixed, ce sont des coordonnées viewport :
  // aucun scroll à ajouter. Priorité : au-dessus, centrée ; recalage pour ne jamais sortir de l'écran ;
  // bascule en dessous s'il n'y a pas la place en haut.
  function tipPosition(r, tw, th, vw, vh){
    var M=8;                                     // marge écran + espace bulle↔déclencheur
    var x=r.left + r.width/2 - tw/2;             // centrée horizontalement sur le déclencheur
    if(x + tw > vw - M) x = vw - M - tw;         // pas coupée à droite (bouton en fin de ligne)
    if(x < M) x = M;                             // pas coupée à gauche (ni bulle plus large que l'écran)
    var below=false;
    var y=r.top - th - M;                        // au-dessus par défaut
    if(y < M){ y = r.bottom + M; below=true; }   // pas de place en haut → dessous
    return {x:x, y:y, below:below};
  }
  window.tipPosition = tipPosition;              // exposé pour le harnais

  var tip=null, timer=null, cur=null;
  function ensure(){
    if(tip) return tip;
    tip=document.createElement('div');
    tip.className='ui-tip';
    tip.setAttribute('aria-hidden','true');      // le nom accessible est sur le bouton (aria-label)
    document.body.appendChild(tip);
    return tip;
  }
  function hide(){
    if(timer){ clearTimeout(timer); timer=null; }
    cur=null;
    if(tip) tip.classList.remove('show');
  }
  function show(el){
    var txt=el.getAttribute('data-tip'); if(!txt) return;
    if(el.hasAttribute('title')) el.removeAttribute('title'); // anti double bulle native
    cur=el;
    ensure();
    tip.classList.remove('show');                // mesure faite à opacity 0, mais bien dans le flux
    tip.textContent=txt;                         // texte AVANT mesure
    var r=el.getBoundingClientRect();
    var p=tipPosition(r, tip.offsetWidth, tip.offsetHeight, window.innerWidth, window.innerHeight);
    tip.style.left=Math.round(p.x)+'px';
    tip.style.top =Math.round(p.y)+'px';
    if(timer) clearTimeout(timer);
    timer=setTimeout(function(){ if(cur===el) tip.classList.add('show'); }, 300);
  }

  function trig(e){ var el=e.target.closest ? e.target.closest('[data-tip]') : null; if(el) show(el); }
  document.addEventListener('mouseover', trig);
  document.addEventListener('mouseout', function(e){ var el=e.target.closest ? e.target.closest('[data-tip]') : null; if(el && el===cur) hide(); });
  document.addEventListener('focusin', trig);
  document.addEventListener('focusout', hide);
  // La bulle ne survit ni au défilement, ni au redimensionnement, ni à Échap.
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') hide(); });
})();

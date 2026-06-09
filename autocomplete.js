// Eatime360 — Autocomplétion réutilisable pour les menus déroulants (surtout salariés).
// Principe : on garde le <select> existant comme SOURCE DE VÉRITÉ (caché), et on superpose
// un champ texte avec recherche instantanée. Tout le code existant qui lit/écrit select.value
// continue de marcher : on intercepte aussi les écritures programmatiques de .value pour
// synchroniser le champ affiché.
//
// Usage :
//   EatimeAutocomplete.enhance(document.getElementById('ed_salarie'), { placeholder:'Tape un nom…' });
//   EatimeAutocomplete.enhanceAll('select.js-sal', { placeholder:'Salarié…' });   // pour des selects multiples/dynamiques
(function(){
  if (window.EatimeAutocomplete) return;

  const style = document.createElement('style');
  style.textContent = `
  .ea-wrap{position:relative;width:100%}
  .ea-panel{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:99990;
    background:var(--panel,var(--card,var(--surface,#1c1c28)));
    border:1px solid var(--border2,var(--line-2,var(--border,rgba(127,127,127,.35))));
    border-radius:8px;max-height:240px;overflow-y:auto;box-shadow:0 12px 34px rgba(0,0,0,.35);display:none}
  .ea-panel.open{display:block}
  .ea-item{padding:8px 12px;cursor:pointer;font-size:13px;line-height:1.3;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text,#e8e8ec)}
  .ea-item.active,.ea-item:hover{background:var(--accent,var(--gold,#3b82f6));color:#fff}
  .ea-empty{padding:10px 12px;font-size:12px;color:var(--muted,#8b94a3)}
  `;
  document.head.appendChild(style);

  const norm = s => (s||'').toString().toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const esc = s => (s||'').toString().replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  function enhance(sel, opts){
    opts = opts || {};
    if (!sel || sel.dataset.eaEnhanced === '1') return;
    sel.dataset.eaEnhanced = '1';

    const wrap = document.createElement('div');
    wrap.className = 'ea-wrap';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (sel.className) input.className = sel.className;
    input.placeholder = opts.placeholder || 'Rechercher…';
    wrap.appendChild(input);

    const panel = document.createElement('div');
    panel.className = 'ea-panel';
    wrap.appendChild(panel);

    let items = [], active = -1;

    const readOptions = () => Array.from(sel.options)
      .map(o => ({ value:o.value, label:o.textContent.trim(), placeholder:o.value==='' }));
    const selectedLabel = () => {
      const o = sel.options[sel.selectedIndex];
      return (!o || o.value === '') ? '' : o.textContent.trim();
    };
    const syncInput = () => { input.value = selectedLabel(); };

    function open(filter){
      const q = norm(filter);
      const words = q.split(' ').filter(Boolean);
      items = readOptions().filter(o => {
        if (o.placeholder) return false;
        if (!words.length) return true;
        const nl = norm(o.label);
        return words.every(w => nl.includes(w));
      }).slice(0, 60);
      active = items.length ? 0 : -1;
      render();
      panel.classList.add('open');
    }
    function render(){
      if (!items.length){ panel.innerHTML = '<div class="ea-empty">Aucun résultat</div>'; return; }
      panel.innerHTML = items.map((o,i)=>`<div class="ea-item ${i===active?'active':''}" data-i="${i}">${esc(o.label)}</div>`).join('');
      Array.from(panel.children).forEach(ch=>{
        ch.addEventListener('mousedown', e=>{ e.preventDefault(); pick(items[+ch.dataset.i]); });
      });
      const act = panel.querySelector('.ea-item.active'); if (act) act.scrollIntoView({block:'nearest'});
    }
    const close = () => panel.classList.remove('open');
    function pick(o){
      if (!o) return;
      sel.value = o.value;                                   // déclenche le setter override → syncInput
      sel.dispatchEvent(new Event('change', { bubbles:true }));
      syncInput();
      close();
    }

    input.addEventListener('focus', ()=> open(''));
    input.addEventListener('input', ()=> {
      // Champ vidé → on réinitialise la sélection (utile pour les filtres "Tous")
      if (input.value.trim() === '' && sel.value !== '') {
        sel.value = '';
        sel.dispatchEvent(new Event('change', { bubbles:true }));
      }
      open(input.value);
    });
    input.addEventListener('keydown', e=>{
      if (!panel.classList.contains('open')){ if (e.key==='ArrowDown') open(input.value); return; }
      if (e.key==='ArrowDown'){ e.preventDefault(); active=Math.min(active+1, items.length-1); render(); }
      else if (e.key==='ArrowUp'){ e.preventDefault(); active=Math.max(active-1, 0); render(); }
      else if (e.key==='Enter'){ e.preventDefault(); if (active>=0) pick(items[active]); }
      else if (e.key==='Escape'){ close(); input.blur(); }
    });
    input.addEventListener('blur', ()=> { setTimeout(close, 120); syncInput(); });
    document.addEventListener('click', e=>{ if (!wrap.contains(e.target)) close(); });

    // Intercepte les écritures programmatiques de select.value (openEdit/openNew/reset)
    const desc = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
    Object.defineProperty(sel, 'value', {
      configurable: true,
      get(){ return desc.get.call(this); },
      set(v){ desc.set.call(this, v); syncInput(); },
    });

    syncInput();
  }

  const enhanceAll = (selector, opts) => document.querySelectorAll(selector).forEach(s => enhance(s, opts));

  window.EatimeAutocomplete = { enhance, enhanceAll };
})();

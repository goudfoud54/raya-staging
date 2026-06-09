// Eatime AI — widget flottant
// S'auto-injecte sur toutes les pages de l'app. Reconnaît la page via le pathname.
// Dépendances : Supabase JS SDK (déjà chargé par chaque module).

(function(){
  if (window.__EATIME_AI_WIDGET__) return;
  window.__EATIME_AI_WIDGET__ = true;

  // ─────── EARLY EXIT : pas d'agent sur les kiosques ni dans "Mon Espace" salarié ───────
  // L'agent est réservé aux admins/managers. Kiosques (PIN) et /moi/ (salariés mobile) sont exclus.
  const _path = location.pathname;
  const _BLACKLISTED_MODULES = ['stock-kiosk', 'haccp-kiosk', 'badgeuse', 'moi'];
  for (const m of _BLACKLISTED_MODULES) {
    if (_path.includes('/' + m)) { return; }
  }

  function ensureSb() {
    if (typeof supabase === 'undefined') return null;
    // Récupère la clé Supabase depuis un client déjà créé sur la page si possible
    const url = (window.__EATIME_SUPA_URL__) || 'https://ynnqvtfayrdteqtgxeuk.supabase.co';
    const key = (window.__EATIME_SUPA_KEY__) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlubnF2dGZheXJkdGVxdGd4ZXVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4OTE1MTQsImV4cCI6MjA5NTQ2NzUxNH0._mfVAGexu7ew38UQk6adn42az4Gt_J3ePxR6O6wuWHc';
    return { url, sb: supabase.createClient(url, key), key };
  }

  function detectModule() {
    const p = location.pathname;
    if (p.includes('stock-kiosk')) return 'stock-kiosk';
    if (p.includes('haccp-kiosk')) return 'haccp-kiosk';
    if (p.includes('badgeuse')) return 'badgeuse';
    if (p.includes('salaries')) return 'salaries';
    if (p.includes('planning')) return 'planning';
    if (p.includes('haccp')) return 'haccp';
    if (p.includes('stock')) return 'stock';
    if (p.includes('finance')) return 'finance';
    if (p.includes('facturation')) return 'facturation';
    if (p.includes('parametres')) return 'parametres';
    if (p.includes('moi')) return 'moi';
    if (p.includes('dispos')) return 'dispos';
    if (p.includes('import-contrats')) return 'import-contrats';
    return 'portail';
  }

  // ─────── STYLE ───────
  // Le widget utilise --eai-primary et --eai-primary-dark, surchargés dynamiquement depuis ORG.couleur_primaire
  const style = document.createElement('style');
  style.textContent = `
  :root{--eai-primary:var(--gold,#c8a035);--eai-primary-dark:#a88528;--eai-primary-glow:rgba(200,160,53,.45);--eai-primary-soft:rgba(200,160,53,.15);--eai-primary-text:#1a1a1a;--eai-bg:#0f0f1a;--eai-bg-soft:rgba(255,255,255,.04);--eai-bg-elev:rgba(255,255,255,.07);--eai-text:#e8e8ec;--eai-muted:#7b7b8a;--eai-border:rgba(255,255,255,.08);--eai-border-2:rgba(255,255,255,.14)}
  [data-theme="light"]{--eai-bg:#fff;--eai-bg-soft:#f5f5f7;--eai-bg-elev:#fff;--eai-text:#1a1a1f;--eai-muted:#6b6b78;--eai-border:rgba(0,0,0,.08);--eai-border-2:rgba(0,0,0,.14)}

  /* ─── BOUTON FLOTTANT ─── */
  .eai-fab{position:fixed;bottom:24px;right:24px;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,var(--eai-primary) 0%,var(--eai-primary-dark) 100%);color:var(--eai-primary-text);border:none;cursor:pointer;box-shadow:0 4px 20px var(--eai-primary-glow),0 8px 28px rgba(0,0,0,.25);z-index:99998;display:flex;align-items:center;justify-content:center;transition:transform .22s cubic-bezier(.34,1.56,.64,1),box-shadow .22s;padding:0}
  .eai-fab:hover{transform:scale(1.1) rotate(8deg);box-shadow:0 6px 30px var(--eai-primary-glow),0 12px 36px rgba(0,0,0,.35)}
  .eai-fab:active{transform:scale(.95)}
  .eai-fab svg{width:28px;height:28px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.2))}
  .eai-fab .pulse{position:absolute;inset:0;border-radius:50%;border:2px solid var(--eai-primary);animation:eai-pulse 2.4s ease-out infinite;opacity:0;pointer-events:none}
  .eai-fab .pulse:nth-child(2){animation-delay:1.2s}
  @keyframes eai-pulse{0%{transform:scale(1);opacity:.5}80%{opacity:0}100%{transform:scale(1.6);opacity:0}}

  /* ─── PANEL ─── */
  .eai-panel{position:fixed;bottom:24px;right:24px;width:420px;max-width:calc(100vw - 24px);height:640px;max-height:calc(100vh - 48px);background:var(--eai-bg);color:var(--eai-text);border:1px solid var(--eai-border);border-radius:18px;box-shadow:0 20px 70px rgba(0,0,0,.5),0 0 0 1px var(--eai-primary-soft);z-index:99999;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;font-size:14px;transform:translateY(20px) scale(.96);opacity:0;pointer-events:none;transition:transform .28s cubic-bezier(.34,1.56,.64,1),opacity .22s;overflow:hidden}
  .eai-panel.open{transform:translateY(0) scale(1);opacity:1;pointer-events:auto}
  .eai-panel::before{content:'';position:absolute;top:0;left:0;right:0;height:80px;background:linear-gradient(180deg,var(--eai-primary-soft),transparent);pointer-events:none;opacity:.7}

  /* ─── HEAD ─── */
  .eai-head{position:relative;padding:14px 16px;border-bottom:1px solid var(--eai-border);display:flex;align-items:center;gap:12px;z-index:1}
  .eai-head .ic{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,var(--eai-primary),var(--eai-primary-dark));display:flex;align-items:center;justify-content:center;color:var(--eai-primary-text);box-shadow:0 4px 12px var(--eai-primary-glow);flex-shrink:0}
  .eai-head .ic svg{width:20px;height:20px}
  .eai-head .name{flex:1;font-weight:700;font-size:15px;letter-spacing:-.01em}
  .eai-head .sub{font-size:11px;color:var(--eai-muted);margin-top:2px;font-weight:400}
  .eai-head button{background:none;border:none;color:var(--eai-muted);font-size:16px;cursor:pointer;padding:6px 10px;border-radius:8px;transition:.15s}
  .eai-head button:hover{background:var(--eai-bg-elev);color:var(--eai-text)}

  /* ─── BODY / MESSAGES ─── */
  .eai-body{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}
  .eai-body::-webkit-scrollbar{width:6px}
  .eai-body::-webkit-scrollbar-thumb{background:var(--eai-border-2);border-radius:3px}
  .eai-msg{padding:10px 14px;border-radius:16px;max-width:88%;line-height:1.5;font-size:13.5px;animation:eai-in .22s cubic-bezier(.34,1.56,.64,1);word-wrap:break-word}
  @keyframes eai-in{from{transform:translateY(6px);opacity:0}to{transform:translateY(0);opacity:1}}
  .eai-msg.user{background:linear-gradient(135deg,var(--eai-primary),var(--eai-primary-dark));color:var(--eai-primary-text);align-self:flex-end;border-bottom-right-radius:6px;box-shadow:0 2px 8px var(--eai-primary-glow);font-weight:500}
  .eai-msg.assistant{background:var(--eai-bg-soft);align-self:flex-start;border-bottom-left-radius:6px;border:1px solid var(--eai-border)}
  .eai-msg.system{background:transparent;color:var(--eai-muted);font-size:12px;font-style:italic;align-self:center;text-align:center;max-width:95%;padding:6px 12px}
  .eai-msg .tools{margin-top:8px;padding-top:8px;font-size:11px;color:var(--eai-muted);border-top:1px dashed var(--eai-border-2);display:flex;align-items:center;gap:5px;flex-wrap:wrap}
  .eai-msg .tools span{background:var(--eai-primary-soft);color:var(--eai-primary);padding:2px 7px;border-radius:8px;font-weight:600;font-size:10.5px}
  .eai-msg .att{display:flex;align-items:center;gap:6px;margin-top:6px;padding:6px 10px;background:rgba(0,0,0,.15);border-radius:10px;font-size:11.5px}
  [data-theme="light"] .eai-msg.user .att{background:rgba(0,0,0,.1)}
  .eai-msg pre,.eai-msg code{background:rgba(0,0,0,.2);padding:1px 5px;border-radius:4px;font-size:12px;white-space:pre-wrap;word-break:break-word}
  [data-theme="light"] .eai-msg.assistant pre,[data-theme="light"] .eai-msg.assistant code{background:rgba(0,0,0,.06)}
  .eai-msg pre{padding:8px;margin:6px 0;display:block}

  /* ─── TYPING ─── */
  .eai-typing{display:flex;gap:5px;padding:14px 16px;align-self:flex-start;background:var(--eai-bg-soft);border-radius:16px;border-bottom-left-radius:6px;border:1px solid var(--eai-border)}
  .eai-typing span{width:7px;height:7px;border-radius:50%;background:var(--eai-primary);animation:eai-bounce 1.3s infinite ease-in-out}
  .eai-typing span:nth-child(2){animation-delay:.15s}
  .eai-typing span:nth-child(3){animation-delay:.3s}
  @keyframes eai-bounce{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}

  /* ─── SUGGESTIONS ─── */
  .eai-suggest{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px}
  .eai-suggest button{background:var(--eai-bg-soft);border:1px solid var(--eai-border);color:var(--eai-text);font-size:11.5px;padding:6px 11px;border-radius:14px;cursor:pointer;transition:.15s}
  .eai-suggest button:hover{background:var(--eai-primary-soft);border-color:var(--eai-primary);color:var(--eai-primary)}

  /* ─── INPUT ─── */
  .eai-input{padding:10px 12px;border-top:1px solid var(--eai-border);background:var(--eai-bg)}
  .eai-attach{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
  .eai-attach .chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:var(--eai-primary-soft);border:1px solid var(--eai-primary);color:var(--eai-primary);border-radius:14px;font-size:11.5px;font-weight:500}
  .eai-attach .chip button{background:none;border:none;color:var(--eai-primary);cursor:pointer;font-size:14px;padding:0;line-height:1;opacity:.7}
  .eai-attach .chip button:hover{opacity:1}
  .eai-row{display:flex;gap:8px;align-items:flex-end}
  .eai-btn{background:var(--eai-bg-soft);border:1px solid var(--eai-border-2);color:var(--eai-text);border-radius:50%;width:38px;height:38px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:.15s}
  .eai-btn:hover{background:var(--eai-bg-elev);border-color:var(--eai-primary)}
  .eai-btn.send{background:linear-gradient(135deg,var(--eai-primary),var(--eai-primary-dark));color:var(--eai-primary-text);border:none;box-shadow:0 2px 8px var(--eai-primary-glow)}
  .eai-btn.send:hover{transform:scale(1.05);box-shadow:0 4px 12px var(--eai-primary-glow)}
  .eai-btn.send:disabled{opacity:.4;cursor:not-allowed;transform:none}
  .eai-textarea{flex:1;background:var(--eai-bg-soft);border:1px solid var(--eai-border-2);color:var(--eai-text);border-radius:20px;padding:10px 16px;font-family:inherit;font-size:13.5px;resize:none;max-height:120px;outline:none;transition:.15s}
  .eai-textarea:focus{border-color:var(--eai-primary);background:var(--eai-bg)}
  .eai-textarea::placeholder{color:var(--eai-muted)}

  /* ─── DROP OVERLAY ─── */
  .eai-dropping{position:absolute;inset:0;background:var(--eai-primary-soft);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);border:3px dashed var(--eai-primary);border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:var(--eai-primary);z-index:10;pointer-events:none}

  @media(max-width:600px){.eai-panel{bottom:0;right:0;left:0;width:100%;height:calc(100vh - 50px);max-height:none;border-radius:18px 18px 0 0}.eai-fab{bottom:16px;right:16px;width:54px;height:54px}.eai-fab svg{width:24px;height:24px}}
  `;
  document.head.appendChild(style);

  // SVG sparkles modernisé
  const SPARKLE_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="currentColor"/><path d="M19 14L19.7 17L22.5 17.7L19.7 18.4L19 21.5L18.3 18.4L15.5 17.7L18.3 17L19 14Z" fill="currentColor" opacity=".7"/><path d="M5 16L5.5 18L7.5 18.5L5.5 19L5 21L4.5 19L2.5 18.5L4.5 18L5 16Z" fill="currentColor" opacity=".5"/></svg>`;

  // ─────── HTML ───────
  const fab = document.createElement('button');
  fab.className = 'eai-fab';
  fab.title = 'Eatime AI (demande-moi quoi que ce soit)';
  fab.innerHTML = SPARKLE_SVG + '<span class="pulse"></span><span class="pulse"></span>';

  const panel = document.createElement('div');
  panel.className = 'eai-panel';
  panel.innerHTML = `
    <div class="eai-head">
      <div class="ic">${SPARKLE_SVG}</div>
      <div style="flex:1">
        <div class="name">Eatime AI</div>
        <div class="sub" id="eai-sub">Initialisation…</div>
      </div>
      <button id="eai-clear" title="Nouvelle conversation">↻</button>
      <button id="eai-close" title="Fermer">✕</button>
    </div>
    <div class="eai-body" id="eai-body"></div>
    <div class="eai-suggest" id="eai-suggest"></div>
    <div class="eai-input">
      <div class="eai-attach" id="eai-attach"></div>
      <div class="eai-row">
        <button class="eai-btn" id="eai-file" title="Joindre des PDFs">📎</button>
        <textarea class="eai-textarea" id="eai-text" placeholder="Pose une question, ou glisse un contrat…" rows="1"></textarea>
        <button class="eai-btn send" id="eai-send" title="Envoyer">↑</button>
      </div>
    </div>
    <input type="file" id="eai-fileinput" multiple accept="application/pdf,image/*" style="display:none">
  `;

  // Applique la couleur cachée AVANT injection au DOM pour éviter le flash jaune
  try {
    const cached = localStorage.getItem('eatime_ai_color');
    if (cached) {
      let h = cached.replace('#', '');
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      if (/^[0-9a-fA-F]{6}$/.test(h)) {
        const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const tx = lum > 0.6 ? '#1a1a1a' : '#ffffff';
        const dk = '#' + Math.round(r * 0.78).toString(16).padStart(2, '0') + Math.round(g * 0.78).toString(16).padStart(2, '0') + Math.round(b * 0.78).toString(16).padStart(2, '0');
        const root = document.documentElement;
        root.style.setProperty('--eai-primary', '#' + h);
        root.style.setProperty('--eai-primary-dark', dk);
        root.style.setProperty('--eai-primary-text', tx);
        root.style.setProperty('--eai-primary-glow', `rgba(${r},${g},${b},.45)`);
        root.style.setProperty('--eai-primary-soft', `rgba(${r},${g},${b},.15)`);
      }
    }
  } catch (_) {}

  // Le fab est masqué tant qu'on n'a pas confirmé une session active
  fab.style.display = 'none';
  document.body.appendChild(fab);
  document.body.appendChild(panel);

  // ─────── STATE ───────
  let CTX = null; // {sb, url, key, user}
  let CURRENT_MODULE = detectModule();
  let MESSAGES = []; // {role, text, attachments?, tools?}
  let ATTACHMENTS = []; // {filename, mime_type, base64, size}
  // LIVE_ATTACHMENTS = toutes les PJ ENVOYÉES dans la conversation courante (en mémoire JS uniquement)
  // → permet de ré-envoyer le binaire à chaque tour pour que l'agent puisse faire attach_pdf
  let LIVE_ATTACHMENTS = [];
  let CONV_ID = null;
  let TYPING = false;
  let AUTH_LISTENER_SET = false;

  // ─────── INIT auth check ───────
  async function init() {
    if (!CTX) {
      const r = ensureSb();
      if (!r) { fab.style.display = 'none'; return false; }
      CTX = r;
    }
    const { data: { session } } = await CTX.sb.auth.getSession();
    if (!session) {
      // Pas connecté → on garde le fab caché
      fab.style.display = 'none';
      return false;
    }
    const { data: profile } = await CTX.sb.from('profiles').select('id,full_name,role,email,organization_id').eq('id', session.user.id).maybeSingle();
    if (!profile) { fab.style.display = 'none'; return false; }
    // Salariés (role salarie) n'ont pas accès à l'agent (réservé admin/manager/super_admin)
    if (!['admin', 'manager', 'super_admin'].includes(profile.role)) {
      fab.style.display = 'none';
      return false;
    }
    // OK — on affiche le fab
    fab.style.display = 'flex';
    CTX.user = { ...profile, id: profile.id || session.user.id };
    // Récupère la couleur primaire de l'org et applique au widget
    try {
      const { data: org } = await CTX.sb.from('organizations').select('couleur_primaire').eq('id', profile.organization_id).maybeSingle();
      if (org?.couleur_primaire) applyPrimaryColor(org.couleur_primaire);
    } catch (_) {}
    setSub(`Module : ${CURRENT_MODULE} · ${profile.role}`);
    setupAuthListener();
    // Charge la conversation depuis localStorage (scopée par user)
    loadFromStorage(profile.id);
    if (MESSAGES.length === 0) {
      addMessage('system', `✦ Bonjour ${profile.full_name || ''}, je peux t'aider sur cette page (${CURRENT_MODULE}). Pose-moi une question ou glisse un contrat.`);
    }
    renderMessages();
    renderSuggestions();
    // Re-ouvre le panel s'il était ouvert
    if (localStorage.getItem('eatime_ai_panel_open') === '1') {
      panel.classList.add('open');
      fab.style.display = 'none';
    }
    return true;
  }
  function setSub(t) { panel.querySelector('#eai-sub').textContent = t; }

  // ─────── COULEUR DYNAMIQUE DE L'ORG ───────
  function applyPrimaryColor(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const textColor = lum > 0.6 ? '#1a1a1a' : '#ffffff';
    const darken = (v) => Math.round(v * 0.78).toString(16).padStart(2, '0');
    const dark = '#' + darken(r) + darken(g) + darken(b);
    const root = document.documentElement;
    root.style.setProperty('--eai-primary', '#' + h);
    root.style.setProperty('--eai-primary-dark', dark);
    root.style.setProperty('--eai-primary-text', textColor);
    root.style.setProperty('--eai-primary-glow', `rgba(${r},${g},${b},.45)`);
    root.style.setProperty('--eai-primary-soft', `rgba(${r},${g},${b},.15)`);
    // Cache pour éviter le flash au prochain reload
    try { localStorage.setItem('eatime_ai_color', '#' + h); } catch (_) {}
  }
  // Applique IMMÉDIATEMENT la couleur en cache (avant tout fetch) pour éviter le flash jaune
  try {
    const cached = localStorage.getItem('eatime_ai_color');
    if (cached) applyPrimaryColor(cached);
  } catch (_) {}

  // ─────── PERSISTENCE ───────
  function storageKey() { return CTX?.user?.id ? `eatime_ai_chat_${CTX.user.id}` : null; }
  function saveToStorage() {
    const k = storageKey();
    if (!k) { console.warn('[EatimeAI] saveToStorage: pas de user.id, skip'); return; }
    try {
      const toSave = MESSAGES.slice(-50).map(m => ({
        role: m.role, text: m.text,
        _enriched_text: m._enriched_text || null,
        attachments: m.attachments?.map(a => ({ filename: a.filename, size: a.size })) || null,
      }));
      localStorage.setItem(k, JSON.stringify({ messages: toSave, conv_id: CONV_ID, ts: Date.now() }));
      console.log('[EatimeAI] saved', toSave.length, 'msgs in', k);
    } catch (e) { console.error('[EatimeAI] saveToStorage error:', e); }
  }
  function loadFromStorage(userId) {
    try {
      const k = `eatime_ai_chat_${userId}`;
      const raw = localStorage.getItem(k);
      console.log('[EatimeAI] loadFromStorage', k, raw ? `(${raw.length} chars)` : '(empty)');
      if (!raw) return;
      const j = JSON.parse(raw);
      if (j.messages && Array.isArray(j.messages)) {
        MESSAGES = j.messages;
        CONV_ID = j.conv_id || null;
        console.log('[EatimeAI] hydrated', MESSAGES.length, 'msgs');
      }
    } catch (e) { console.error('[EatimeAI] loadFromStorage error:', e); MESSAGES = []; CONV_ID = null; }
  }
  function clearStorage(userId) {
    try {
      localStorage.removeItem(`eatime_ai_chat_${userId || (CTX?.user?.id)}`);
      localStorage.removeItem('eatime_ai_panel_open');
    } catch (_) {}
  }

  // Écoute la déconnexion : vide le chat à ce moment-là
  function setupAuthListener() {
    if (AUTH_LISTENER_SET || !CTX?.sb) return;
    AUTH_LISTENER_SET = true;
    try {
      CTX.sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          clearStorage();
          MESSAGES = []; CONV_ID = null;
          if (CTX) CTX.user = null;
          panel.classList.remove('open');
          fab.style.display = 'none';
        } else if (session && !CTX.user) {
          // Connexion détectée (ex: login "in-page" sur le portail, sans rechargement)
          // → on (ré)évalue le rôle et on affiche la bulle si admin/manager/super_admin
          init().catch(() => {});
        }
      });
    } catch (_) {}
  }

  function renderSuggestions() {
    const el = panel.querySelector('#eai-suggest');
    const suggestions = {
      salaries: ['Combien de salariés actifs ?', 'Trouve Cali', 'Salariés sans PIN'],
      stock: ['Quelle est ma feuille de besoin ?', 'Catégories produits'],
      planning: ['Qui travaille demain ?', 'Coût hebdo équipe'],
      haccp: ['Dernier relevé température'],
      portail: ['Stats de mon org', 'Liste mes restaurants', 'Que peux-tu faire ?'],
    };
    const list = suggestions[CURRENT_MODULE] || suggestions.portail;
    el.innerHTML = list.map(s => `<button>${s}</button>`).join('');
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      panel.querySelector('#eai-text').value = b.textContent;
      send();
    }));
  }

  // ─────── MESSAGES UI ───────
  function addMessage(role, text, opts = {}) {
    MESSAGES.push({ role, text, ...opts });
    saveToStorage();
    renderMessages();
  }
  function renderMessages() {
    const body = panel.querySelector('#eai-body');
    body.innerHTML = '';
    for (const m of MESSAGES) {
      const div = document.createElement('div');
      div.className = 'eai-msg ' + m.role;
      let inner = renderMarkdown(m.text || '');
      if (m.attachments) {
        for (const a of m.attachments) {
          inner += `<div class="att">📄 ${escape(a.filename)} <span style="color:#7b7b8a">(${Math.round(a.size/1024)} Ko)</span></div>`;
        }
      }
      // Badges tools masqués (n'apportent rien à l'utilisateur final)
      div.innerHTML = inner;
      body.appendChild(div);
    }
    if (TYPING) {
      const t = document.createElement('div');
      t.className = 'eai-typing';
      t.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(t);
    }
    body.scrollTop = body.scrollHeight;
  }
  function escape(s) { return (s||'').toString().replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function renderMarkdown(t) {
    let s = escape(t);
    s = s.replace(/```([^`]+)```/g, '<pre>$1</pre>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  // ─────── ATTACHMENTS ───────
  function renderAttachments() {
    const box = panel.querySelector('#eai-attach');
    box.innerHTML = ATTACHMENTS.map((a, i) =>
      `<span class="chip">📄 ${escape(a.filename)} <button onclick="window.__EATIME_AI_RM__(${i})">×</button></span>`
    ).join('');
  }
  window.__EATIME_AI_RM__ = (i) => { ATTACHMENTS.splice(i, 1); renderAttachments(); };

  async function addFiles(files) {
    for (const f of files) {
      if (!f.type.match(/pdf|image/)) continue;
      const b64 = await fileToBase64(f);
      ATTACHMENTS.push({ filename: f.name, mime_type: f.type || 'application/pdf', base64: b64, size: f.size });
    }
    renderAttachments();
  }
  function fileToBase64(f) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }

  // ─────── SEND ───────
  async function send() {
    const ta = panel.querySelector('#eai-text');
    const text = ta.value.trim();
    if (!text && !ATTACHMENTS.length) return;
    if (!CTX || !CTX.user) { const ok = await init(); if (!ok) return; }

    const userMsg = { role: 'user', text, attachments: ATTACHMENTS.length ? [...ATTACHMENTS] : null };
    MESSAGES.push(userMsg);
    saveToStorage();
    // Ajoute les nouvelles PJ aux LIVE_ATTACHMENTS (préservées pour les prochains tours)
    for (const a of ATTACHMENTS) {
      LIVE_ATTACHMENTS.push({ filename: a.filename, mime_type: a.mime_type, base64: a.base64, size: a.size });
    }
    ATTACHMENTS = [];
    ta.value = '';
    renderAttachments();
    TYPING = true; renderMessages();

    try {
      const { data: { session } } = await CTX.sb.auth.getSession();
      // Build messages payload (omit attachments from history except last user msg)
      const payload = {
        messages: MESSAGES.map(m => ({ role: m.role, text: m._enriched_text || m.text })),
        // On envoie TOUTES les PJ de la conversation à chaque tour
        // → l'agent peut toujours faire attach_pdf même 5 messages après le drop initial
        attachments: LIVE_ATTACHMENTS.map(a => ({ filename: a.filename, mime_type: a.mime_type, base64: a.base64 })),
        current_module: CURRENT_MODULE,
        conversation_id: CONV_ID,
      };
      const r = await fetch(`${CTX.url}/functions/v1/assistant-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: CTX.key },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      TYPING = false;
      if (!r.ok) {
        addMessage('assistant', '⚠ Erreur : ' + (j.error || 'inconnue'));
        return;
      }
      CONV_ID = j.conversation_id;
      // Stocke la version enrichie (avec OCR) dans un champ caché _enriched_text
      // → utilisée par les prochains envois pour préserver la mémoire OCR
      // → mais l'affichage utilise text (court, sans OCR)
      if (j.enriched_last_user_text && MESSAGES.length) {
        const lastIdx = MESSAGES.length - 1;
        if (MESSAGES[lastIdx].role === 'user') {
          MESSAGES[lastIdx]._enriched_text = j.enriched_last_user_text;
        }
      }
      MESSAGES.push({ role: 'assistant', text: j.response, tools: j.tool_actions });
      saveToStorage();
      renderMessages();
    } catch (e) {
      TYPING = false;
      addMessage('assistant', '⚠ Erreur réseau : ' + (e.message || e));
      saveToStorage();
    }
  }

  // ─────── EVENTS ───────
  fab.addEventListener('click', async () => {
    panel.classList.add('open');
    fab.style.display = 'none';
    localStorage.setItem('eatime_ai_panel_open', '1');
    if (!CTX || !CTX.user) await init();
    // Force re-render au cas où l'init s'est fait après l'ouverture
    renderMessages();
  });
  panel.querySelector('#eai-close').addEventListener('click', () => {
    panel.classList.remove('open');
    fab.style.display = 'flex';
    localStorage.removeItem('eatime_ai_panel_open');
  });
  panel.querySelector('#eai-clear').addEventListener('click', () => {
    if (!confirm('Nouvelle conversation ? L\'historique actuel sera oublié.')) return;
    MESSAGES = []; CONV_ID = null; LIVE_ATTACHMENTS = [];
    saveToStorage();
    addMessage('system', '✦ Nouvelle conversation. En quoi puis-je t\'aider ?');
    renderSuggestions();
  });
  panel.querySelector('#eai-send').addEventListener('click', send);
  panel.querySelector('#eai-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  panel.querySelector('#eai-text').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  });
  panel.querySelector('#eai-file').addEventListener('click', () => panel.querySelector('#eai-fileinput').click());
  panel.querySelector('#eai-fileinput').addEventListener('change', (e) => addFiles(e.target.files));

  // Drag-drop on panel
  let dropOverlay = null;
  panel.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dropOverlay) {
      dropOverlay = document.createElement('div');
      dropOverlay.className = 'eai-dropping';
      dropOverlay.textContent = '📂 Lâche pour joindre';
      panel.appendChild(dropOverlay);
    }
  });
  panel.addEventListener('dragleave', (e) => {
    if (e.target === panel || e.relatedTarget === null) { dropOverlay?.remove(); dropOverlay = null; }
  });
  panel.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropOverlay?.remove(); dropOverlay = null;
    await addFiles(e.dataTransfer.files);
  });

  // Listen for theme changes
  const themeObs = new MutationObserver(() => {});
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Bootstrap : établit le client Supabase + écoute les changements d'auth AVANT tout,
  // pour que la bulle apparaisse aussi après un login "in-page" (portail) sans rechargement.
  (function bootstrap(){
    const r = ensureSb();
    if (r) { CTX = r; setupAuthListener(); }
    init().catch(() => {});
  })();
})();

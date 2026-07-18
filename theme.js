// Eatime360 — Apply theme from localStorage (called at the top of every page)
(function(){
  try {
    var t = localStorage.getItem('eatime_theme');
    if (t === 'light') document.documentElement.setAttribute('data-theme','light');
    else document.documentElement.setAttribute('data-theme','dark');
  } catch(e){}
})();
// Listen for changes from other tabs
window.addEventListener('storage', function(e){
  if (e.key === 'eatime_theme') {
    document.documentElement.setAttribute('data-theme', e.newValue === 'light' ? 'light' : 'dark');
  }
});
// Helper for the UI toggle
window.setEatimeTheme = function(theme){
  if (theme !== 'light' && theme !== 'dark') return;
  localStorage.setItem('eatime_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
};

// Auto-inject the Eatime AI assistant widget on every page, after Supabase SDK loads
(function injectAssistant(){
  function tryInject(){
    if (window.__EATIME_AI_WIDGET__) return;
    if (typeof supabase === 'undefined') { setTimeout(tryInject, 300); return; }
    // Skip on lock screens / login pages : the widget will init when session arrives
    var s = document.createElement('script');
    // Resolve relative to the page : go up until we find the assistant script at /assistant-widget.js
    var base = location.pathname.replace(/\/[^/]*$/, '/');
    var depth = (base.match(/\//g) || []).length - 1;
    var prefix = '';
    for (var i = 0; i < depth; i++) prefix += '../';
    s.src = prefix + 'assistant-widget.js?v=4.9';
    s.defer = true;
    document.body.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInject);
  else tryInject();
})();

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

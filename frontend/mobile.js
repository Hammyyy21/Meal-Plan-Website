// MEALPLAN MOBILE NAV v1
(function(){
  if (!document.querySelector('.sidebar')) return;
  const btn=document.createElement('button');
  btn.type='button';btn.className='mobile-menu-toggle';btn.setAttribute('aria-label','Open navigation menu');btn.setAttribute('aria-expanded','false');
  btn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>Menu</span>';
  const overlay=document.createElement('div');overlay.className='mobile-menu-overlay';
  const sidebar=document.querySelector('.sidebar');
  sidebar.id=sidebar.id||'mobile-navigation';btn.setAttribute('aria-controls',sidebar.id);
  function setOpen(open){document.body.classList.toggle('mobile-nav-open',open);btn.setAttribute('aria-expanded',String(open));btn.setAttribute('aria-label',open?'Close navigation menu':'Open navigation menu');}
  btn.addEventListener('click',()=>setOpen(!document.body.classList.contains('mobile-nav-open')));
  overlay.addEventListener('click',()=>setOpen(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false)});
  sidebar.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setOpen(false)));
  document.body.append(btn,overlay);
})();


// MEALPLAN PROFILE + BRAND v2
(function(){
  if (!document.querySelector('.sidebar')) return;
  if (!document.querySelector('.mobile-brand-name')) {
    const brand=document.createElement('span');
    brand.className='mobile-brand-name';brand.textContent='MealPlan';
    document.body.appendChild(brand);
  }
  fetch('/api/me',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(user=>{
    if (!user) return;
    const name=[user.first_name,user.last_name].filter(Boolean).join(' ').trim();
    if (!name) return;
    const label=document.querySelector('.sidebar .sidebar-user .user-info strong');
    const avatar=document.querySelector('.sidebar .sidebar-user .user-avatar');
    if (label) label.textContent=name;
    if (avatar) avatar.textContent=name[0].toUpperCase();
    const role=document.querySelector('.sidebar .sidebar-user .user-info span');
    if (role) role.textContent='MealPlan member';
  }).catch(()=>{});
})();


// MEALPLAN APPEARANCE SYNC V2: apply Preferences even when script.js is not loaded.
(function () {
  function applySavedAppearance() {
    const palettes = {
      green:['#315f45','#244b35','#e9f2ec'], blue:['#35698c','#28536f','#e8f1f7'],
      purple:['#69528c','#51406d','#f0ebf6'], orange:['#b4673d','#92502f','#f8eee8'],
      red:['#a94c4c','#873b3b','#f8eaea'], pink:['#b75f83','#944968','#f8eaf0'],
      teal:['#367b78','#285f5d','#e7f3f2'], black:['#292d2a','#171a18','#eceeec'],
      'forest-gradient':['#315f45','#18392a','#e9f2ec'],
      'ocean-gradient':['#357ca0','#183b56','#e7f3f8'],
      'sunset-gradient':['#9e4b45','#813c36','#faede6'],
      'berry-gradient':['#76549a','#442a67','#f1eaf6']
    };
    const palette = palettes[localStorage.getItem('mealPlanTheme')] || palettes.green;
    document.documentElement.style.setProperty('--primary', palette[0]);
    document.documentElement.style.setProperty('--primary-dark', palette[1]);
    document.documentElement.style.setProperty('--primary-light', palette[2]);
    if (!document.getElementById('loginForm') && !document.getElementById('registerForm')) {
      document.body.classList.toggle('dark-mode', localStorage.getItem('mealPlanDarkMode') === 'true');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applySavedAppearance);
  else applySavedAppearance();
})();

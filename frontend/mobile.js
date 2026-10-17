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

// Dashboard + Nutrition pages: all numbers come from /api/summary, /api/water, /api/notifications, /api/inventory.
(function(){
  const $ = id => document.getElementById(id);
  const page = $("dashStats") ? "dash" : ($("nutMacros") ? "nut" : null); if (!page) return;
  const pct = (a,b) => b > 0 ? Math.min(100, Math.round(a/b*100)) : 0;

  function weekBars(el, days, key, goal){
    const max = Math.max(goal || 0, ...days.map(d => Number(d[key])), 1);
    el.innerHTML = days.map(d => '<div><i style="height:'+Math.round(Number(d[key])/max*100)+'px" title="'+Math.round(d[key])+' kcal"></i>'+d.label+'<br><small>'+Math.round(d[key])+'</small></div>').join("");
  }

  async function dash(){
    document.addEventListener("mm-user", e => { const h = new Date().getHours(); $("dashHello").textContent = (h<12?"Good morning":h<18?"Good afternoon":"Good evening")+", "+(e.detail.first_name||"")+"."; });
    $("dashDate").textContent = new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
    const today = MM.iso(new Date());
    try {
      const [s, inv, notes, bud] = await Promise.all([
        MM.api("/api/summary?date="+today), MM.api("/api/inventory"), MM.api("/api/notifications?today="+today), MM.api("/api/budgets").catch(()=>[])]);
      $("dashStats").innerHTML =
        '<div><strong>'+s.today.planned_count+'</strong>meals planned today</div>'+
        '<div><strong>'+s.today.eaten_count+'</strong>eaten today</div>'+
        '<div><strong>'+Math.round(s.eaten.calories)+' / '+s.goals.calories+'</strong>kcal eaten / goal</div>'+
        '<div><strong>'+s.week.meals_planned+'</strong>meals planned this week</div>'+
        '<div><strong>'+s.pantry_count+'</strong>items in pantry</div>';
      $("dashToday").innerHTML = s.today.meals.length ? '<table class="s4-table">'+s.today.meals.map(m=>'<tr><td>'+MM.esc(m.emoji||"")+' '+MM.esc(m.title)+'</td><td>'+m.meal_type+'</td><td>'+Math.round(m.calories)+' kcal</td><td>'+(m.is_completed?"✓ eaten":"planned")+'</td></tr>').join("")+'</table>'
        : 'Nothing planned today. <a href="recipes.html">Find a recipe</a> or <a href="calendar.html">open the calendar</a>.';
      weekBars($("dashWeek"), s.week.days, "planned_calories", s.goals.calories);
      const lim = Number(s.goals.weekly_budget), cost = Number(s.week.est_cost);
      $("dashBudgetBar").className = "s4-bar"+(cost>lim?" warn":""); $("dashBudgetBar").firstChild.style.width = pct(cost,lim)+"%";
      $("dashBudgetText").textContent = "Planned meals cost about "+MM.money(cost)+" of your "+MM.money(lim)+" weekly budget"+(cost>lim?" — over budget!":".");
      const soon = inv.filter(i => i.expiration_date && (MM.parse(i.expiration_date) - MM.parse(today)) / 86400000 <= 3);
      $("dashPantry").innerHTML = (soon.length ? soon.map(i=>'<div class="s4-note">'+MM.esc(i.name)+' ('+i.quantity+' '+MM.esc(i.unit)+') — '+(i.expiration_date < today ? "expired " : "expires ")+MM.esc(i.expiration_date)+'</div>').join("") : '<span>No items are expiring in the next 3 days.</span>');
      const unread = notes.filter(n => !n.is_read);
      if (unread.length){ $("bellCount").textContent = unread.length; $("bellCount").classList.remove("s4-hidden"); }
      $("bell").onclick = () => {
        const m = MM.modal('<h2>Notifications</h2>'+(notes.length?notes.map(n=>'<div class="s4-note'+(n.is_read?'':' bad')+'">'+MM.esc(n.message)+'</div>').join(""):'<p>No notifications.</p>'));
        unread.forEach(n => MM.api("/api/notifications/"+n.notification_id+"/read","PATCH").catch(()=>{}));
        $("bellCount").classList.add("s4-hidden");
      };
    } catch(e){ $("dashMsg").innerHTML = '<div class="s4-note bad">'+MM.esc(e.message)+'</div>'; }
  }

  async function nut(){
    let day = new Date(), glasses = 0;
    const dt = $("nutDate");
    async function load(){
      const iso = MM.iso(day); dt.value = iso;
      try {
        const [s, w, ent] = await Promise.all([MM.api("/api/summary?date="+iso), MM.api("/api/water?date="+iso), MM.api("/api/calendar?start="+iso+"&end="+iso)]);
        $("nutMsg").innerHTML = "";
        const e = s.eaten, g = s.goals;
        $("nutCalBar").className = "s4-bar"+(e.calories>g.calories?" warn":""); $("nutCalBar").firstChild.style.width = pct(e.calories,g.calories)+"%";
        $("nutCalText").textContent = Math.round(e.calories)+" of "+g.calories+" kcal ("+Math.max(0,Math.round(g.calories-e.calories))+" left)";
        $("nutMacros").innerHTML = [["Protein","protein_g"],["Carbs","carbs_g"],["Fat","fat_g"]].map(([n,k]) =>
          '<div><strong>'+Math.round(e[k])+' / '+g[k]+' g</strong>'+n+'<div class="s4-bar" style="margin-top:6px"><i style="width:'+pct(e[k],g[k])+'%"></i></div></div>').join("");
        glasses = w.glasses; water();
        const done = ent.filter(x => x.is_completed);
        $("nutMeals").innerHTML = done.length ? '<table class="s4-table"><tr><th>Meal</th><th>Type</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr>'+done.map(x=>'<tr><td>'+MM.esc(x.title)+'</td><td>'+x.meal_type+'</td><td>'+Math.round(x.calories)+'</td><td>'+Math.round(x.protein_g)+'g</td><td>'+Math.round(x.carbs_g)+'g</td><td>'+Math.round(x.fat_g)+'g</td></tr>').join("")+'</table>'
          : 'No meals marked as eaten on this day. Tick <strong>✓ Eaten</strong> on the <a href="calendar.html">calendar</a> to log them.';
        weekBars($("nutWeek"), s.week.days, "eaten_calories", g.calories);
        $("nutWeekTable").innerHTML = '<p class="s4-sub" style="color:#6b7280">Daily goal: '+g.calories+' kcal</p>';
      } catch(err){ $("nutMsg").innerHTML = '<div class="s4-note bad">'+MM.esc(err.message)+'</div>'; }
    }
    function water(){ $("waterText").textContent = glasses+" of 8 glasses"; $("waterBar").firstChild.style.width = pct(glasses,8)+"%"; }
    async function setWater(n){
      if (n < 0 || n > 20) return;
      try { const r = await MM.api("/api/water","PUT",{log_date:MM.iso(day), glasses:n}); glasses = r.glasses; water(); } catch(e){ MM.toast(e.message,true); }
    }
    $("waterPlus").onclick = () => setWater(glasses+1);
    $("waterMinus").onclick = () => setWater(glasses-1);
    $("nutPrev").onclick = () => { day = MM.addDays(day,-1); load(); };
    $("nutNext").onclick = () => { day = MM.addDays(day,1); load(); };
    $("nutToday").onclick = () => { day = new Date(); load(); };
    dt.onchange = () => { if (dt.value){ day = MM.parse(dt.value); load(); } };
    load();
  }
  page === "dash" ? dash() : nut();
})();

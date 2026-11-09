// Budget planning page -> /api/budgets (create/delete) and /api/budget/overview (spend that includes groceries and orders)
(function(){
  window.__budgetLoaded = true;
  const $ = id => document.getElementById(id);
  const fmt = s => MM.parse(String(s).slice(0,10)).toLocaleDateString("en-US",{month:"short",day:"numeric"});
  function setPeriod(kind){
    const t = new Date(), mon = MM.monday(t);
    let a = mon, b = MM.addDays(mon,6);
    if (kind === "next"){ a = MM.addDays(mon,7); b = MM.addDays(mon,13); }
    if (kind === "month"){ a = new Date(t.getFullYear(), t.getMonth(), 1); b = new Date(t.getFullYear(), t.getMonth()+1, 0); }
    if (kind !== "custom"){ $("start").value = MM.iso(a); $("end").value = MM.iso(b); }
  }
  setPeriod("week");
  $("presetVal").addEventListener("change", () => setPeriod($("presetVal").value));
  ["start","end"].forEach(id => $(id).addEventListener("input", () => MM.setPick("presetVal","custom")));

  function bar(b, onList){
    const sp = Math.min(100, b.limit ? b.spent / b.limit * 100 : 0);
    const ls = onList ? Math.max(0, Math.min(100 - sp, onList / b.limit * 100)) : 0;
    const over = b.spent + (onList||0) > b.limit;
    return '<div class="seg-bar'+(over?' over':'')+'"><i class="sp" style="width:'+sp+'%"></i><i class="ls" style="width:'+ls+'%"></i></div>';
  }
  function hero(d){
    const c = d.current;
    if (!c){
      $("bHero").innerHTML = '<section class="s4-card"><h3>This week</h3><div class="g-empty"><strong>No budget covers today</strong>Create one below. Your grocery list currently totals '+MM.money(d.on_list_total)+'.</div></section>';
      return;
    }
    const after = d.after_list, bad = after < 0;
    $("bHero").innerHTML = '<div class="s4-stats">'+
      '<div><strong>'+MM.money(c.limit)+'</strong>Budget · '+fmt(c.period_start)+' – '+fmt(c.period_end)+'</div>'+
      '<div><strong>'+MM.money(c.spent)+'</strong>Spent so far</div>'+
      '<div><strong>'+MM.money(d.on_list_total)+'</strong>On your grocery list ('+d.on_list_count+')</div>'+
      '<div><strong style="color:'+(bad?'#b42318':'var(--text-dark)')+'">'+(bad?'-':'')+MM.money(Math.abs(after))+'</strong>'+(bad?'Over after buying list':'Left after buying list')+'</div></div>'+
      '<section class="s4-card"><div class="s4-bar-head"><h3 style="margin:0">Current budget</h3><a class="s4-btn ghost sm" style="text-decoration:none" href="grocery.html">Open grocery list →</a></div>'+
      '<div style="margin-top:14px">'+bar(c, d.on_list_total)+'</div>'+
      '<div class="seg-legend"><span><b class="sp"></b>Spent</span><span><b class="ls"></b>Planned on grocery list</span><span><b class="fr"></b>Free</span></div>'+
      (bad ? '<div class="s4-note bad">Buying everything on your grocery list would put you '+MM.money(-after)+' over budget. Try cheaper <a href="recommendations.html">recommended meals</a> or remove items.</div>' : '')+
      '<div class="b-break"><div>Logged by you<strong>'+MM.money(c.manual)+'</strong></div><div>Groceries bought<strong>'+MM.money(c.groceries)+'</strong></div><div>Delivery orders<strong>'+MM.money(c.orders)+'</strong></div><div>Still on list<strong>'+MM.money(d.on_list_total)+'</strong></div></div></section>';
  }
  async function load(){
    try {
      const d = await MM.api("/api/budget/overview");
      hero(d);
      $("records").innerHTML = d.budgets.length ? d.budgets.map(x =>
        '<div class="b-card'+(x.current?' current':'')+'"><header><div><h4>'+MM.money(x.spent)+' <span style="font-weight:500;color:var(--text-gray)">of '+MM.money(x.limit)+'</span>'+(x.current?'<span class="s4-chip">Current</span>':'')+'</h4>'+
        '<div class="meta">'+fmt(x.period_start)+' – '+fmt(x.period_end)+'</div></div><button class="b-del" data-id="'+Number(x.budget_id)+'" title="Delete budget" aria-label="Delete budget">✕</button></header>'+
        bar(x, 0)+'<div class="nums"><div><strong>'+x.pct+'%</strong>used</div><div class="'+(x.remaining<0?'neg':'')+'"><strong>'+(x.remaining<0?'-':'')+MM.money(Math.abs(x.remaining))+'</strong>'+(x.remaining<0?'over budget':'remaining')+'</div>'+
        '<div><strong>'+MM.money(x.groceries+x.orders)+'</strong>groceries &amp; orders</div></div></div>').join("")
        : '<div class="g-empty"><strong>No budgets yet</strong>Create your first one with the form.</div>';
    } catch(e){ $("bHero").innerHTML = '<div class="s4-note bad">'+MM.esc(e.message)+'</div>'; $("records").innerHTML = ""; }
  }
  $("form").addEventListener("submit", async e => {
    e.preventDefault(); $("message").textContent = "";
    try {
      await MM.api("/api/budgets","POST",{period_start:$("start").value, period_end:$("end").value, limit_amount:Number($("limit").value), spent_amount:Number($("spent").value)});
      $("limit").value = ""; $("spent").value = "0"; MM.toast("Budget saved"); load();
    } catch(err){ $("message").textContent = err.message; }
  });
  $("records").addEventListener("click", e => {
    const b = e.target.closest("button[data-id]"); if (!b) return;
    const m = MM.modal('<h2>Delete this budget?</h2><p class="s4-sub">This removes the budget record. Your grocery list and orders are not affected.</p><div class="s4-row"><button class="s4-btn danger" id="yes">Delete</button><button class="s4-btn ghost" id="no">Cancel</button></div>');
    m.querySelector("#no").onclick = m.close;
    m.querySelector("#yes").onclick = async () => { try { await MM.api("/api/budgets/"+b.dataset.id,"DELETE"); m.close(); load(); } catch(err){ m.close(); MM.toast(err.message,true); } };
  });
  load();
})();

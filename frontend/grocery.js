// Grocery page: build a shopping list from the meal plan, add it to "My grocery list", suggestions, delivery orders.
(function(){
  window.__groceryLoaded = true;
  const $ = id => document.getElementById(id);
  let monday = MM.monday(new Date()), data = null;
  const range = () => ({start: MM.iso(monday), end: MM.iso(MM.addDays(monday, 6))});
  const fmt = d => d.toLocaleDateString("en-US", {month:"short", day:"numeric"});

  // ---------------- plan + suggestions
  async function loadPlan(){
    const r = range();
    $("gWeekLabel").textContent = fmt(monday)+" – "+fmt(MM.addDays(monday,6))+(MM.iso(monday) === MM.iso(MM.monday(new Date())) ? " (this week)" : "");
    try { data = await MM.api("/api/grocery/suggestions?start="+r.start+"&end="+r.end); }
    catch(e){ $("gPlan").innerHTML = '<div class="s4-note bad">'+MM.esc(e.message)+'</div>'; return; }
    drawPlan(); drawSuggest();
  }

  function drawPlan(){
    const n = data.needed;
    if (!n.length){
      $("gPlan").innerHTML = '<div class="s4-note ok" style="margin-top:14px">'+(data.planned_meals ? 'Your pantry already covers every planned meal this week.' : 'No meals are planned for this week yet.')+
        ' <a href="calendar.html">Open the calendar</a> or <a href="recipes.html">browse recipes</a> to plan some.</div>';
      return;
    }
    const allOn = n.every(i => i.on_list);
    $("gPlan").innerHTML = (data.warning ? '<div class="s4-note bad">'+MM.esc(data.warning)+'</div>' : '')+
      '<div style="overflow:auto"><table class="s4-table g-table" style="margin-top:8px"><tr><th>Item</th><th>Needed</th><th>In pantry</th><th>To buy</th><th>Cost</th><th>For</th><th></th></tr>'+
      n.map(i => '<tr><td><strong>'+MM.esc(i.name)+'</strong></td><td>'+i.needed+' '+MM.esc(i.unit)+'</td><td>'+i.in_stock+'</td><td>'+i.to_buy+' '+MM.esc(i.unit)+'</td><td>'+MM.money(i.line_cost)+'</td>'+
        '<td style="color:var(--text-gray);font-size:11px">'+MM.esc((i.used_in||[]).slice(0,2).join(", "))+((i.used_in||[]).length>2?" +"+((i.used_in.length)-2):"")+'</td>'+
        '<td>'+(i.on_list ? '<span class="s4-chip">On your list</span>' : '<button class="s4-btn ghost sm" data-add-one="'+i.ingredient_id+'">+ Add</button>')+'</td></tr>').join("")+
      '</table></div><div class="s4-bar-head" style="margin-top:14px"><strong>Estimated total: '+MM.money(data.total_cost)+'</strong>'+
      '<div class="s4-row" style="margin:0"><button class="s4-btn" id="addAll" '+(allOn?'disabled':'')+'>'+(allOn?'All items are on your list':'Add all to my grocery list')+'</button>'+
      '<button class="s4-btn ghost" id="orderBtn">Order delivery</button></div></div>';
  }

  function drawSuggest(){
    let h = '<div class="s4-sug">';
    h += '<h5>Running low or expired</h5>';
    h += data.running_low.length ? data.running_low.map(i => '<div class="row"><div><strong>'+MM.esc(i.name)+'</strong><small>'+MM.esc(i.reason)+'</small></div>'+
        (i.on_list ? '<span class="s4-chip">On your list</span>' : '<button class="s4-btn ghost sm" data-add-low=\''+MM.esc(JSON.stringify({name:i.name,unit:i.unit,price:i.price}))+'\'>+ Add</button>')+'</div>').join("")
      : '<p class="s4-empty">Nothing is running low. Nice work.</p>';
    h += '<h5>Meal ideas to fill your week</h5>';
    h += data.meal_ideas.length ? data.meal_ideas.map(m => '<div class="row"><div><strong>'+MM.esc((m.emoji||"")+" "+m.name)+'</strong><small>'+MM.esc((m.reasons[0]||"")+" · "+Math.round(m.calories)+" kcal")+'</small></div>'+
        '<button class="s4-btn ghost sm" data-plan="'+m.recipe_id+'" data-name="'+MM.esc(m.name)+'" data-emoji="'+MM.esc(m.emoji||"")+'">+ Plan it</button></div>').join("")
      : '<p class="s4-empty">Save a goal or preferences to get meal ideas.</p>';
    $("gSuggest").innerHTML = h+'<p class="s4-sub" style="margin-top:12px">Planning a meal adds its ingredients to the list above.</p></div>';
  }

  document.addEventListener("click", async e => {
    const one = e.target.closest("[data-add-one]"), all = e.target.closest("#addAll"), low = e.target.closest("[data-add-low]"), plan = e.target.closest("[data-plan]"), ord = e.target.closest("#orderBtn");
    try {
      if (one || all){
        const r = range(), res = await MM.api("/api/grocery/add-from-plan","POST",{start:r.start, end:r.end, ingredient_ids: one ? [Number(one.dataset.addOne)] : null});
        MM.toast(res.added+" added"+(res.merged ? ", "+res.merged+" updated" : "")+" on your grocery list"); loadAll();
      } else if (low){
        const i = JSON.parse(low.dataset.addLow);
        await MM.api("/api/grocery-items","POST",{name:i.name, quantity:1, unit:i.unit, estimated_price:Number(i.price)||0}); MM.toast(i.name+" added to your list"); loadAll();
      } else if (plan){
        MM.addToPlan({recipe_id:Number(plan.dataset.plan), title:plan.dataset.name, emoji:plan.dataset.emoji, tags:[]}, null, loadAll);
      } else if (ord) openOrder();
    } catch(err){ MM.toast(err.message, true); }
  });
  $("gWeekPrev").onclick = () => { monday = MM.addDays(monday,-7); loadPlan(); };
  $("gWeekNext").onclick = () => { monday = MM.addDays(monday,7); loadPlan(); };

  // ---------------- budget strip (from /api/budget/overview)
  async function loadBudget(){
    const box = $("gBudget");
    try {
      const d = await MM.api("/api/budget/overview"), c = d.current;
      if (!c){
        box.innerHTML = '<div class="bud-strip"><div class="big">No budget this week<small>Weekly default: '+MM.money(d.weekly_budget)+'</small></div><div class="s4-sub" style="margin:0">Your list is '+MM.money(d.on_list_total)+'. Set a budget to see how it fits.</div><a class="s4-btn ghost" style="text-decoration:none" href="budget.html">Set a budget</a></div>';
        return;
      }
      const spent = Math.min(100, c.spent / c.limit * 100), list = Math.max(0, Math.min(100 - spent, d.on_list_total / c.limit * 100));
      const after = d.after_list, bad = after < 0;
      box.innerHTML = '<div class="bud-strip"><div class="big">'+MM.money(Math.max(0, c.remaining))+' left<small>of '+MM.money(c.limit)+' · '+MM.esc(String(c.period_start).slice(5,10))+' to '+MM.esc(String(c.period_end).slice(5,10))+'</small></div>'+
        '<div><div class="seg-bar'+(bad?' over':'')+'"><i class="sp" style="width:'+spent+'%"></i><i class="ls" style="width:'+list+'%"></i></div>'+
        '<div class="seg-legend"><span><b class="sp"></b>Spent '+MM.money(c.spent)+'</span><span><b class="ls"></b>On your list '+MM.money(d.on_list_total)+'</span><span><b class="fr"></b>Free '+MM.money(Math.max(0, after))+'</span></div></div>'+
        '<div class="after'+(bad?' bad':'')+'">'+(bad ? 'This list puts you '+MM.money(-after)+' over budget' : 'Buying your list leaves '+MM.money(after))+'<br><a href="budget.html" style="font-weight:600">Manage budget →</a></div></div>';
    } catch(e){ box.innerHTML = '<div class="s4-note bad" style="margin:0">'+MM.esc(e.message)+'</div>'; }
  }

  // ---------------- my grocery list (manual items)
  const list = $("groceryItems"), err = $("groceryError");
  const X = '<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  function row(it){
    return '<div class="g-item'+(it.purchased?' done':'')+'" data-id="'+it.item_id+'"><input type="checkbox" aria-label="Mark '+MM.esc(it.name)+' as bought" '+(it.purchased?'checked':'')+'>'+
      '<div class="g-name"><strong>'+MM.esc(it.name)+'</strong><small>'+MM.num(it.quantity)+' '+MM.esc(it.unit)+'</small></div>'+
      '<span class="g-price">'+MM.money(it.estimated_price)+'</span><button class="g-x" type="button" title="Remove" aria-label="Remove '+MM.esc(it.name)+'">'+X+'</button></div>';
  }
  async function loadList(){
    try {
      const items = await MM.api("/api/grocery-items");
      const todo = items.filter(i => !i.purchased), done = items.filter(i => i.purchased);
      const sum = arr => arr.reduce((t,i) => t + Number(i.estimated_price), 0);
      $("groceryTotal").textContent = MM.money(sum(todo))+" to spend";
      $("gSum").innerHTML = items.length ? '<div class="g-sum"><div>To buy<strong>'+todo.length+'</strong></div><div>In the cart<strong>'+done.length+'</strong></div><div>Still to spend<strong>'+MM.money(sum(todo))+'</strong></div></div>' : '';
      list.innerHTML = !items.length ? '<div class="g-empty"><strong>Your list is empty</strong>Add an item above, or use “Add all to my grocery list” in the meal-plan section.</div>' :
        (todo.length ? '<div class="g-head"><span>To buy</span><span>'+todo.length+'</span></div>'+todo.map(row).join("") : '')+
        (done.length ? '<div class="g-head"><span>Bought</span><span>'+done.length+'</span></div>'+done.map(row).join("") : '');
    } catch(e){ list.innerHTML = ""; err.textContent = e.message; }
  }
  list.addEventListener("change", async ev => {
    const r = ev.target.closest(".g-item"); if (!r || ev.target.type !== "checkbox") return;
    try { await MM.api("/api/grocery-items/"+r.dataset.id, "PATCH", {purchased: ev.target.checked}); } catch(x){ err.textContent = x.message; }
    loadList(); loadBudget();
  });
  list.addEventListener("click", async ev => {
    const x = ev.target.closest(".g-x"); if (!x) return;
    try { await MM.api("/api/grocery-items/"+x.closest(".g-item").dataset.id, "DELETE"); loadAll(); } catch(e){ err.textContent = e.message; }
  });
  $("groceryForm").addEventListener("submit", async ev => {
    ev.preventDefault(); err.textContent = "";
    try {
      await MM.api("/api/grocery-items","POST",{name:$("itemName").value.trim(), quantity:Number($("itemQty").value), unit:$("itemUnit").value.trim(), estimated_price:Number($("itemPrice").value)||0});
      $("itemName").value = ""; $("itemQty").value = 1; $("itemPrice").value = 0; loadAll();
    } catch(e){ err.textContent = e.message; }
  });

  // ---------------- order for delivery
  function openOrder(){
    const r = range();
    const m = MM.modal('<h2>Order delivery</h2><div class="s4-sub">'+data.needed.length+' items for '+fmt(monday)+' – '+fmt(MM.addDays(monday,6))+' · estimated '+MM.money(data.total_cost)+'</div>'+
      (data.warning ? '<div class="s4-note bad">'+MM.esc(data.warning)+'</div>' : '')+
      '<div class="s4-row"><label class="s4-field" style="flex:2">Delivery address<input id="ordAddr" maxlength="255" placeholder="Street, city, state"></label>'+
      '<label class="s4-field">Delivery date<input type="date" id="ordDate" value="'+MM.iso(MM.addDays(new Date(),2))+'"></label></div>'+
      '<div class="s4-err" id="ordErr"></div><button class="s4-btn" id="ordPlace">Place order</button>');
    m.querySelector("#ordPlace").onclick = async () => {
      const addr = m.querySelector("#ordAddr").value.trim();
      if (addr.length < 5){ m.querySelector("#ordErr").textContent = "Enter a delivery address."; return; }
      try {
        const o = await MM.api("/api/grocery/orders","POST",{start:r.start, end:r.end, delivery_address:addr, delivery_date:m.querySelector("#ordDate").value});
        m.close(); MM.toast("Order placed — confirmation "+o.confirmation);
      } catch(e){ m.querySelector("#ordErr").textContent = e.message+" Your list was saved as a draft; you can send it again from Order history."; }
      loadHistory(); loadBudget();
    };
  }
  async function loadHistory(){
    try {
      const l = await MM.api("/api/grocery/orders");
      $("ordHistory").innerHTML = l.length ? l.map(o =>
        '<div class="g-order"><div class="no">#'+o.order_id+'</div><div><strong>'+o.item_count+' item'+(o.item_count==1?'':'s')+'</strong><small>'+MM.esc(String(o.created_at).slice(0,10))+(o.delivery_date ? ' · deliver '+MM.esc(String(o.delivery_date).slice(0,10)) : '')+'</small></div>'+
        '<div class="tot">'+MM.money(o.total_cost)+'</div><div class="st"><span class="s4-chip '+MM.esc(o.status)+'" style="margin:0">'+MM.esc(o.status)+'</span>'+(o.status==="draft" ? ' <button class="s4-btn ghost sm" data-send="'+o.order_id+'">Send</button>' : '')+'</div></div>').join("")
        : '<div class="g-empty"><strong>No orders yet</strong>Build your list above and choose Order delivery when you are ready.</div>';
    } catch(e){ $("ordHistory").innerHTML = '<div class="s4-note bad" style="margin:0">'+MM.esc(e.message)+'</div>'; }
  }
  $("ordHistory").addEventListener("click", async e => {
    const b = e.target.closest("[data-send]"); if (!b) return;
    try { const o = await MM.api("/api/grocery/orders/"+b.dataset.send+"/send","POST"); MM.toast("Order sent — "+o.confirmation); } catch(x){ MM.toast(x.message,true); }
    loadHistory(); loadBudget();
  });

  function loadAll(){ loadPlan(); loadList(); loadBudget(); }
  loadAll(); loadHistory();
})();

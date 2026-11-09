// Recommendations: ranked by goals, pantry and calendar (GET /api/recommendations/meals); preferences saved via /settings.
(function(){
  window.__recsLoaded = true;
  const $ = id => document.getElementById(id);
  const ALLERGENS = [["peanuts","🥜"],["tree-nuts","🌰"],["dairy","🥛"],["eggs","🥚"],["fish","🐟"],["shellfish","🦐"],["soy","🫘"],["wheat","🌾"],["sesame","⚪"]];
  $("allergies").innerHTML = ALLERGENS.map(a => '<label><input type="checkbox" value="'+a[0]+'"><span>'+a[1]+'</span>'+a[0].replace("-"," ")+'</label>').join("");
  // diet tiles + cost slider keep the hidden #diet / #maxCost inputs in sync
  function setDiet(v){ $("diet").value = v; document.querySelectorAll("#dietTiles .r-tile").forEach(t => t.classList.toggle("active", t.dataset.v === v)); }
  $("dietTiles").addEventListener("click", e => { const t = e.target.closest(".r-tile"); if (t) setDiet(t.dataset.v); });
  function setCost(v){
    v = Math.max(2, Math.min(25, Number(v) || 8));
    const r = $("maxCostRange"); r.value = v; $("maxCost").value = v; $("maxCostOut").textContent = MM.money(v);
    r.style.setProperty("--fill", ((v-2)/23*100)+"%");
  }
  $("maxCostRange").addEventListener("input", e => setCost(e.target.value));
  setCost(8);
  const GT = {weight_loss:"Lose weight", weight_gain:"Gain weight", maintain:"Maintain weight", calorie:"Daily calories", protein:"Daily protein"};

  function goals(d){
    if (!d.goals.length){
      $("recGoals").innerHTML = '<h3>Your goals</h3><p class="s4-empty">You have no active goals, so meals are ranked by your calorie goal of about '+d.per_meal_calories+' kcal per meal. <a href="goals.html">Set a goal</a> to get more specific suggestions.</p>';
      return;
    }
    $("recGoals").innerHTML = '<h3>Your goals shape these suggestions</h3><div class="s4-goalpills">'+d.goals.map(g =>
      '<div><strong>'+(g.goal_type==="custom"?MM.esc(g.label||"Custom goal"):GT[g.goal_type])+'</strong><div class="s4-bar"><i style="width:'+g.progress+'%"></i></div>'+
      '<div style="margin-top:6px">'+Math.round(g.progress)+'% · '+g.current_value+' / '+g.target_value+' '+MM.esc(g.unit)+'</div></div>').join("")+'</div>'+
      '<p class="s4-sub" style="margin:12px 0 0">Target per meal: about '+d.per_meal_calories+' kcal'+(d.per_meal_protein?' and '+d.per_meal_protein+' g protein':'')+'. <a href="goals.html">Edit goals</a></p>';
  }
  function pantryChips(m){
    const have = (m.have||[]), exp = new Set(m.expiring||[]), miss = (m.missing||[]);
    if (!have.length && !miss.length) return "";
    return '<div class="r-chips">'+have.slice(0,4).map(n => '<span class="s4-chip '+(exp.has(n)?'warn':'have')+'">'+(exp.has(n)?'⏳ use soon: ':'✓ have ')+MM.esc(n)+'</span>').join("")+
      miss.slice(0,3).map(n => '<span class="s4-chip need">+ need '+MM.esc(n)+'</span>').join("")+(miss.length>3?'<span class="s4-chip need">+'+(miss.length-3)+' more</span>':"")+'</div>';
  }
  function card(m){
    return '<article class="recipe-card"><div class="recipe-image"><span class="recipe-emoji">'+MM.esc(m.emoji||"🍽️")+'</span><span class="recipe-time">'+m.minutes+' min</span></div>'+
      '<div class="recipe-card-content"><div class="recipe-type">'+(m.fits_goal?'FITS YOUR GOAL':'MEAL IDEA')+'</div><h3>'+MM.esc(m.name)+'</h3><p>'+MM.esc(m.description||"")+'</p>'+
      '<div class="recipe-macros"><span><strong>'+Math.round(m.calories)+'</strong> kcal</span><span><strong>'+Math.round(m.protein)+'g</strong> protein</span><span><strong>'+MM.money(m.cost)+'</strong> / serving</span></div>'+
      pantryChips(m)+
      (m.reasons.length?'<ul class="s4-reasons">'+m.reasons.slice(0,3).map(x=>'<li>'+MM.esc(x)+'</li>').join("")+'</ul>':'')+
      '<div class="s4-row"><a class="s4-btn ghost" style="text-align:center;text-decoration:none;flex:1" href="recipes.html?q='+encodeURIComponent(m.name)+'">View recipe</a>'+
      '<button class="add-plan-button" data-add="'+m.recipe_id+'">+ Add to plan</button></div></div></article>';
  }
  let meals = [];
  async function loadMeals(){
    try {
      const f = $("focus").value;
      const d = await MM.api("/api/recommendations/meals?focus="+encodeURIComponent(f)); meals = d.meals; goals(d);
      $("resultTitle").textContent = (f==="pantry" ? "Meals from your pantry" : f==="goals" ? "Meals that fit your goals" : "Suggested meals")+" ("+d.count+")";
      $("recBanner").innerHTML = f==="pantry" ? (d.pantry.items
        ? '<div class="r-banner"><span class="ic">🧺</span><div><strong>Based on '+d.pantry.items+' item'+(d.pantry.items==1?'':'s')+' in your pantry</strong>'+(d.pantry.expiring.length ? 'Use soon: '+d.pantry.expiring.map(MM.esc).join(", ")+'. Meals that use them are listed first.' : 'Meals that use the most of what you already have are listed first.')+'</div></div>'
        : '<div class="r-banner"><span class="ic">🧺</span><div><strong>Your pantry is empty</strong>Add items on the <a href="inventory.html">Inventory</a> page and we will suggest meals that use them.</div></div>')
        : f==="goals" && !d.goals.length ? '<div class="r-banner"><span class="ic">🎯</span><div><strong>No active goals yet</strong><a href="goals.html">Set a goal</a> and we will pick meals that fit it.</div></div>' : "";
      $("results").innerHTML = d.meals.length ? d.meals.map(card).join("") : '<p class="s4-empty" style="grid-column:1/-1">'+(f==="pantry" ? "Nothing in your pantry matches a recipe yet. Add more items or switch to Best overall." : f==="goals" ? "No meals match your goals with the current preferences. Try a higher cost limit." : "No matches. Try a higher cost limit or fewer exclusions.")+'</p>';
    } catch(e){ $("results").innerHTML = '<div class="s4-note bad" style="grid-column:1/-1">'+MM.esc(e.message)+'</div>'; }
  }
  $("results").addEventListener("click", e => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    const m = meals.find(x => String(x.recipe_id) === b.dataset.add); if (m) MM.addToPlan({recipe_id:m.recipe_id, title:m.name, emoji:m.emoji, tags:m.tags, base_servings:m.base_servings}, null, loadMeals);
  });
  $("recForm").addEventListener("submit", async e => {
    e.preventDefault(); $("error").textContent = "";
    try {
      await MM.api("/api/recommendations/settings","PUT",{diet:$("diet").value, max_cost:Number($("maxCost").value), allergies:Array.from(document.querySelectorAll("#allergies input:checked")).map(x=>x.value)});
      MM.toast("Preferences saved"); loadMeals();
    } catch(err){ $("error").textContent = err.message; }
  });
  $("focus").addEventListener("change", loadMeals);
  const qf = new URLSearchParams(location.search).get("focus"); if (["pantry","goals"].includes(qf)) MM.setPick("focus", qf);
  MM.api("/api/recommendations/settings").then(s => {
    setDiet(s.diet); setCost(s.max_cost);
    document.querySelectorAll("#allergies input").forEach(i => i.checked = (s.allergies||[]).includes(i.value));
  }).catch(()=>{}).then(loadMeals);
})();

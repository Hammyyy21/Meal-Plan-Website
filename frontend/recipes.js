// Recipes page (UC-05 search/filter, UC-07 scaling, favorites, add to meal plan). All data comes from /api/recipes.
(function(){
  const grid = document.getElementById("recipeGrid"); if (!grid) return;
  const state = {q:"", category:"", max:"", prefs:true, page:1};
  const $ = id => document.getElementById(id);
  let timer;

  async function load(){
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.category === "favorites") p.set("favorites","true"); else if (state.category) p.set("category", state.category);
    if (state.max) p.set("max_minutes", state.max);
    p.set("apply_preferences", state.prefs ? "true" : "false");
    p.set("page", state.page);
    grid.innerHTML = '<p style="grid-column:1/-1">Loading recipes…</p>';
    try {
      const d = await MM.api("/api/recipes?"+p);
      render(d);
    } catch(e){ grid.innerHTML = '<p class="s4-err" style="grid-column:1/-1">'+MM.esc(e.message)+'</p>'; }
  }

  function render(d){
    $("recipeCount").textContent = d.total + (d.total === 1 ? " recipe" : " recipes");
    const ap = d.applied || {};
    const bits = [];
    if (ap.preferences && ap.diet && ap.diet !== "Balanced") bits.push("diet: "+ap.diet);
    if (ap.preferences && ap.allergens && ap.allergens.length) bits.push("avoiding: "+ap.allergens.join(", "));
    $("recipePrefNote").innerHTML = bits.length ? '<div class="s4-note ok">Filtered by your saved preferences ('+MM.esc(bits.join("; "))+'). Untick the box to see every recipe.</div>' : "";
    $("recipeEmptyState").style.display = d.total ? "none" : "block";
    $("recipeEmptyText").textContent = state.category === "favorites" ? "You have no favorite recipes yet — tap the heart on a recipe." : "Try searching for another meal or ingredient.";
    grid.innerHTML = d.items.map(card).join("");
    const pg = $("recipePager");
    pg.innerHTML = d.pages > 1 ? '<button class="s4-btn ghost" id="pgPrev" '+(d.page<=1?"disabled":"")+'>‹ Previous</button><span>Page '+d.page+' of '+d.pages+'</span><button class="s4-btn ghost" id="pgNext" '+(d.page>=d.pages?"disabled":"")+'>Next ›</button>' : "";
    if (d.pages > 1){
      $("pgPrev").onclick = () => { state.page--; load(); window.scrollTo({top:0}); };
      $("pgNext").onclick = () => { state.page++; load(); window.scrollTo({top:0}); };
    }
    d.items.forEach(r => cache[r.recipe_id] = r);
  }
  const cache = {};

  function card(r){
    const type = (r.tags||[]).find(t => ["breakfast","lunch","dinner","snack"].includes(t)) || "meal";
    return '<article class="recipe-card" data-id="'+r.recipe_id+'">'+
      '<div class="recipe-image"><span class="recipe-emoji">'+MM.esc(r.emoji||"🍽️")+'</span>'+
      '<button class="favorite-button'+(r.is_favorite?' saved':'')+'" data-fav="'+r.recipe_id+'" aria-label="Favorite" title="Favorite">'+(r.is_favorite?'♥':'♡')+'</button>'+
      '<span class="recipe-time">'+r.minutes+' min</span></div>'+
      '<div class="recipe-card-content"><div class="recipe-type">'+MM.esc(type.toUpperCase())+'</div>'+
      '<h3>'+MM.esc(r.title)+'</h3><p>'+MM.esc(r.description||"")+'</p>'+
      '<div class="recipe-macros"><span><strong>'+MM.num(r.calories)+'</strong> kcal</span><span><strong>'+MM.num(r.protein_g)+'g</strong> protein</span></div>'+
      '<div style="margin:6px 0">'+(r.tags||[]).map(t=>'<span class="s4-chip">'+MM.esc(t)+'</span>').join("")+'</div>'+
      '<div class="s4-row"><button class="s4-btn ghost" data-view="'+r.recipe_id+'">View &amp; scale</button>'+
      '<button class="add-plan-button" data-add="'+r.recipe_id+'">+ Add to meal plan</button></div></div></article>';
  }

  grid.addEventListener("click", async e => {
    const fav = e.target.closest("[data-fav]"), view = e.target.closest("[data-view]"), add = e.target.closest("[data-add]");
    if (fav){
      const id = fav.dataset.fav, on = !fav.classList.contains("saved");
      try { await MM.api("/api/recipes/"+id+"/favorite", on ? "PUT" : "DELETE");
        fav.classList.toggle("saved", on); fav.textContent = on ? "♥" : "♡"; if (cache[id]) cache[id].is_favorite = on;
        if (!on && state.category === "favorites") load();
      } catch(err){ MM.toast(err.message, true); }
    } else if (view) openDetail(view.dataset.view);
    else if (add) openAdd(cache[add.dataset.add]);
  });

  document.querySelectorAll(".recipe-category").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".recipe-category").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); state.category = b.dataset.category || ""; state.page = 1; load();
  }));
  $("recipeSearch").addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; load(); }, 300); });
  $("recipeTime").addEventListener("change", e => { state.max = e.target.value; state.page = 1; load(); });
  $("recipePrefs").addEventListener("change", e => { state.prefs = e.target.checked; state.page = 1; load(); });

  // ---- detail with scaling (UC-07)
  async function openDetail(id){
    const m = MM.modal('<p>Loading…</p>');
    async function show(servings){
      try {
        const r = await MM.api("/api/recipes/"+id+(servings ? "?servings="+encodeURIComponent(servings) : ""));
        m.querySelector(".s4-box").innerHTML = '<button class="s4-close">&times;</button>'+
          '<h2>'+MM.esc(r.emoji||"")+' '+MM.esc(r.title)+'</h2><div class="s4-sub">'+MM.esc(r.description||"")+' · '+r.minutes+' min · written for '+r.base_servings+' serving'+(r.base_servings==1?"":"s")+'</div>'+
          '<div class="s4-row"><label class="s4-field" style="max-width:150px">Servings<input id="scaleIn" type="number" min="0.25" max="100" step="0.25" value="'+r.servings+'"></label><button class="s4-btn" id="scaleBtn">Scale</button><span class="s4-err" id="scaleErr"></span></div>'+
          '<strong>Totals for '+r.servings+' serving'+(r.servings==1?"":"s")+'</strong>'+MM.macros(r.total)+
          '<p>Estimated cost: <strong>'+MM.money(r.total.cost)+'</strong></p>'+
          '<table class="s4-table"><tr><th>Ingredient</th><th>Amount</th></tr>'+r.ingredients.map(i=>'<tr><td>'+MM.esc(i.name)+'</td><td>'+i.quantity+' '+MM.esc(i.unit)+'</td></tr>').join("")+'</table>'+
          '<h4>Instructions</h4><p>'+MM.esc(r.instructions)+'</p>'+
          (r.allergens&&r.allergens.length?'<p>Contains: '+r.allergens.map(a=>'<span class="s4-chip">'+MM.esc(a)+'</span>').join("")+'</p>':"")+
          '<div class="s4-row"><button class="s4-btn" id="detAdd">+ Add to meal plan</button></div>';
        m.querySelector(".s4-close").onclick = m.close;
        m.querySelector("#scaleBtn").onclick = () => {
          const v = m.querySelector("#scaleIn").value;
          if (!(Number(v) > 0)) { m.querySelector("#scaleErr").textContent = "Enter a number above 0."; return; }
          show(v);
        };
        m.querySelector("#detAdd").onclick = () => { m.close(); openAdd(cache[id] || r, r.servings); };
      } catch(e){ m.querySelector(".s4-box").innerHTML = '<button class="s4-close">&times;</button><p class="s4-err">'+MM.esc(e.message)+'</p>'; m.querySelector(".s4-close").onclick = m.close; }
    }
    show("");
  }

  // ---- add to meal plan (UC-06)
  function openAdd(r, servings){
    const today = MM.iso(new Date());
    const m = MM.modal('<h2>Add to meal plan</h2><div class="s4-sub">'+MM.esc(r.emoji||"")+' '+MM.esc(r.title)+'</div>'+
      '<div class="s4-formgrid"><label class="s4-field">Date<input type="date" id="addDate" value="'+today+'"></label>'+
      '<label class="s4-field">Servings<input type="number" id="addServ" min="0.25" max="100" step="0.25" value="'+(servings||r.base_servings||1)+'"></label></div>'+
      '<div class="s4-field">Meal'+MM.pick("addType", MEALS.map(t=>[t, t[0].toUpperCase()+t.slice(1)]), "dinner")+'</div>'+
      '<div class="s4-err" id="addErr"></div><button class="s4-btn block" id="addGo">Add to calendar</button>');
    const t = (r.tags||[]).find(x => MEALS.includes(x)); if (t) MM.setPick("addType", t);
    m.querySelector("#addGo").onclick = async () => {
      const body = {recipe_id:r.recipe_id, meal_date:m.querySelector("#addDate").value, meal_type:m.querySelector("#addType").value, servings:Number(m.querySelector("#addServ").value)};
      try { await MM.api("/api/calendar","POST",body); m.close(); MM.toast("Added to your calendar"); }
      catch(e){ m.querySelector("#addErr").textContent = e.message; }
    };
  }
  const q0 = new URLSearchParams(location.search).get('q'); if (q0){ state.q = q0; $('recipeSearch').value = q0; }
  load();
})();

// Meal calendar (UC-06): week + month view from /api/calendar, add / move / delete / mark eaten.
(function(){
  const body = document.getElementById("calBody"); if (!body) return;
  const $ = id => document.getElementById(id);
  let view = "week", anchor = MM.monday(new Date()), month = new Date(); month.setDate(1);
  let entries = [];
  const todayIso = MM.iso(new Date());

  function range(){
    if (view === "week") return [anchor, MM.addDays(anchor,6)];
    const first = new Date(month.getFullYear(), month.getMonth(), 1), start = MM.monday(first);
    return [start, MM.addDays(start,41)];
  }

  async function load(){
    const [s,e] = range();
    $("calTitle").textContent = view === "week"
      ? s.toLocaleDateString("en-US",{month:"long",day:"numeric"})+" – "+e.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})
      : month.toLocaleDateString("en-US",{month:"long",year:"numeric"});
    $("calLabel").textContent = view === "week" ? (MM.iso(anchor) === MM.iso(MM.monday(new Date())) ? "THIS WEEK" : "WEEK") : "MONTH";
    $("viewWeek").classList.toggle("ghost", view !== "week"); $("viewMonth").classList.toggle("ghost", view !== "month");
    try {
      entries = await MM.api("/api/calendar?start="+MM.iso(s)+"&end="+MM.iso(e));
      $("calMsg").innerHTML = "";
    } catch(err){ entries = []; $("calMsg").innerHTML = '<div class="s4-note bad">'+MM.esc(err.message)+'</div>'; }
    render();
  }

  function stats(){
    const [s,e] = view === "week" ? [anchor, MM.addDays(anchor,6)] : [new Date(month.getFullYear(),month.getMonth(),1), new Date(month.getFullYear(),month.getMonth()+1,0)];
    const inR = entries.filter(x => x.meal_date >= MM.iso(s) && x.meal_date <= MM.iso(e));
    const cal = inR.reduce((t,x)=>t+Number(x.calories),0), cost = inR.reduce((t,x)=>t+Number(x.cost),0), done = inR.filter(x=>x.is_completed).length;
    const days = new Set(inR.map(x=>x.meal_date)).size || 1;
    $("calStats").innerHTML = '<div><strong>'+inR.length+'</strong>meals planned</div><div><strong>'+done+'</strong>eaten</div><div><strong>'+Math.round(cal/days)+'</strong>avg kcal / planned day</div><div><strong>'+MM.money(cost)+'</strong>estimated cost</div>';
  }

  function meal(x){
    return '<div class="s4-meal '+x.meal_type+(x.is_completed?' done':'')+'" draggable="true" data-id="'+x.entry_id+'">'+
      MM.esc(x.emoji||"")+' <strong>'+MM.esc(x.title)+'</strong><small>'+x.meal_type+' · '+x.servings+' serving'+(Number(x.servings)==1?"":"s")+' · '+Math.round(x.calories)+' kcal</small>'+
      '<div class="acts"><button data-act="done" title="Mark eaten">'+(x.is_completed?"↺ Undo":"✓ Eaten")+'</button><button data-act="edit" title="Change servings or meal">✎</button><button data-act="del" title="Remove">✕</button></div></div>';
  }

  function dayCell(d, other){
    const iso = MM.iso(d), list = entries.filter(x => x.meal_date === iso).sort((a,b)=>MEALS.indexOf(a.meal_type)-MEALS.indexOf(b.meal_type));
    return '<div class="s4-day'+(iso===todayIso?' today':'')+(other?' other':'')+'" data-date="'+iso+'"><h4><span>'+d.toLocaleDateString("en-US",{weekday:view==="week"?"short":undefined,month:"short",day:"numeric"})+'</span><button data-add="'+iso+'" aria-label="Add meal" title="Add meal">+</button></h4>'+list.map(meal).join("")+'</div>';
  }

  function render(){
    stats();
    if (view === "week"){
      body.innerHTML = '<div class="s4-cal-grid">'+[0,1,2,3,4,5,6].map(i=>dayCell(MM.addDays(anchor,i))).join("")+'</div>';
    } else {
      const [s] = range(), names = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
      let h = '<div class="s4-cal-grid">'+names.map(n=>'<strong style="text-align:center">'+n+'</strong>').join("");
      for (let i=0;i<42;i++){ const d = MM.addDays(s,i); if (i>=35 && d.getMonth()!==month.getMonth()) break; h += dayCell(d, d.getMonth()!==month.getMonth()); }
      body.innerHTML = h+'</div>';
    }
  }

  body.addEventListener("click", async e => {
    const add = e.target.closest("[data-add]"), act = e.target.closest("[data-act]");
    if (add) return openAdd(add.dataset.add);
    if (!act) return;
    const id = act.closest(".s4-meal").dataset.id, x = entries.find(v => String(v.entry_id) === id);
    try {
      if (act.dataset.act === "del"){ if (!confirm("Remove this meal from your calendar?")) return; await MM.api("/api/calendar/"+id,"DELETE"); MM.toast("Meal removed"); }
      else if (act.dataset.act === "done"){
        const r = await MM.api("/api/calendar/"+id,"PATCH",{is_completed:!x.is_completed});
        if (!x.is_completed){
          const used = ((r.inventory||{}).used||[]).map(u => u.name+" −"+u.used+" "+u.unit);
          MM.toast("Logged to nutrition"+(used.length?" · Pantry updated: "+used.join(", "):""));
        } else MM.toast("Nutrition log removed");
      } else if (act.dataset.act === "edit") return openEdit(x);
      load();
    } catch(err){ MM.toast(err.message, true); }
  });

  // drag and drop to another day
  body.addEventListener("dragstart", e => { const m = e.target.closest(".s4-meal"); if (m){ e.dataTransfer.setData("text/plain", m.dataset.id); e.dataTransfer.effectAllowed = "move"; } });
  body.addEventListener("dragover", e => { const d = e.target.closest(".s4-day"); if (d){ e.preventDefault(); d.classList.add("over"); } });
  body.addEventListener("dragleave", e => { const d = e.target.closest(".s4-day"); if (d) d.classList.remove("over"); });
  body.addEventListener("drop", async e => {
    const d = e.target.closest(".s4-day"); if (!d) return; e.preventDefault(); d.classList.remove("over");
    const id = e.dataTransfer.getData("text/plain"), x = entries.find(v => String(v.entry_id) === id);
    if (!x || x.meal_date === d.dataset.date) return;
    try { await MM.api("/api/calendar/"+id,"PATCH",{meal_date:d.dataset.date}); MM.toast("Meal moved to "+MM.parse(d.dataset.date).toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})); load(); }
    catch(err){ MM.toast(err.message, true); }
  });

  const MEAL_OPTS = [["breakfast","Breakfast"],["lunch","Lunch"],["dinner","Dinner"],["snack","Snack"]];
  function openEdit(x){
    const m = MM.modal('<h2>Edit meal</h2><div class="s4-sub">'+MM.esc(x.title)+'</div>'+
      '<div class="s4-formgrid"><label class="s4-field">Date<input type="date" id="edDate" value="'+x.meal_date+'"></label>'+
      '<label class="s4-field">Servings<input id="edServ" type="number" min="0.25" max="100" step="0.25" value="'+x.servings+'"></label></div>'+
      '<div class="s4-field">Meal'+MM.pick("edType", MEAL_OPTS, x.meal_type)+'</div>'+
      '<div class="s4-err" id="edErr"></div><button class="s4-btn block" id="edGo">Save changes</button>');
    m.querySelector("#edGo").onclick = async () => {
      try { await MM.api("/api/calendar/"+x.entry_id,"PATCH",{meal_date:m.querySelector("#edDate").value, meal_type:m.querySelector("#edType").value, servings:Number(m.querySelector("#edServ").value)}); m.close(); load(); }
      catch(err){ m.querySelector("#edErr").textContent = err.message; }
    };
  }

  function openAdd(date){
    const m = MM.modal('<h2>Add a meal</h2><div class="s4-sub">Pick a recipe, then choose when you will eat it.</div>'+
      '<div class="s4-search"><span>⌕</span><input id="adQ" placeholder="Search recipes or ingredients" autocomplete="off"></div>'+
      '<div class="s4-recipes" id="adList" role="listbox"></div>'+
      '<div class="s4-formgrid"><label class="s4-field">Date<input type="date" id="adDate" value="'+(date||todayIso)+'"></label>'+
      '<label class="s4-field">Servings<input id="adServ" type="number" min="0.25" max="100" step="0.25" value="1"></label></div>'+
      '<div class="s4-field">Meal'+MM.pick("adType", MEAL_OPTS, "dinner")+'</div>'+
      '<div class="s4-err" id="adErr"></div><button class="s4-btn block" id="adGo">Add meal</button>');
    const box = m.querySelector("#adList"); let list = [], t, chosen = null;
    function draw(){
      box.innerHTML = list.length ? list.map(r => '<button type="button" class="s4-recipe'+(r.recipe_id===chosen?' on':'')+'" data-id="'+r.recipe_id+'" role="option">'+
        '<span class="em">'+MM.esc(r.emoji||"🍽️")+'</span><span class="tx"><strong>'+MM.esc(r.title)+'</strong><small>'+Math.round(r.calories)+' kcal · '+Math.round(r.protein_g)+'g protein · '+r.minutes+' min</small></span><span class="ck"></span></button>').join("")
        : '<p class="s4-empty" style="padding:18px;text-align:center">No recipes found.</p>';
    }
    async function find(){
      const q = m.querySelector("#adQ").value.trim();
      try { const d = await MM.api("/api/recipes?apply_preferences=true"+(q?"&q="+encodeURIComponent(q):"")); list = d.items;
        if (!list.find(r => r.recipe_id === chosen)) chosen = null;
        draw();
      } catch(err){ m.querySelector("#adErr").textContent = err.message; }
    }
    box.addEventListener("click", ev => {
      const b = ev.target.closest(".s4-recipe"); if (!b) return;
      chosen = Number(b.dataset.id); draw();
      const r = list.find(x => x.recipe_id === chosen);
      if (r){ const ty = (r.tags||[]).find(z => MEALS.includes(z)); if (ty) MM.setPick("adType", ty); m.querySelector("#adServ").value = r.base_servings; }
    });
    m.querySelector("#adQ").oninput = () => { clearTimeout(t); t = setTimeout(find, 250); };
    m.querySelector("#adGo").onclick = async () => {
      if (!chosen) { m.querySelector("#adErr").textContent = "Choose a recipe first."; return; }
      try { await MM.api("/api/calendar","POST",{recipe_id:chosen, meal_date:m.querySelector("#adDate").value, meal_type:m.querySelector("#adType").value, servings:Number(m.querySelector("#adServ").value)}); m.close(); MM.toast("Meal added"); load(); }
      catch(err){ m.querySelector("#adErr").textContent = err.message; }
    };
    find();
  }

  $("calPrev").onclick = () => { if (view==="week") anchor = MM.addDays(anchor,-7); else month = new Date(month.getFullYear(), month.getMonth()-1, 1); load(); };
  $("calNext").onclick = () => { if (view==="week") anchor = MM.addDays(anchor,7); else month = new Date(month.getFullYear(), month.getMonth()+1, 1); load(); };
  $("calToday").onclick = () => { anchor = MM.monday(new Date()); month = new Date(); month.setDate(1); load(); };
  $("viewWeek").onclick = () => { view = "week"; load(); };
  $("viewMonth").onclick = () => { view = "month"; load(); };
  const top = $("topAddMealBtn"); if (top) top.onclick = () => openAdd(todayIso);
  load();
})();

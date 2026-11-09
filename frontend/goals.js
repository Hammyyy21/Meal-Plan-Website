// Goal tracking: the form changes with the goal type; progress is calculated by the server (/api/goals).
(function(){
  const $ = id => document.getElementById(id);
  const TYPES = {
    weight_loss: {name:"Lose weight", sub:"lbs", help:"Enter where you are now and where you want to be. We suggest a safe pace.",
      fields:[["start","Current weight (lbs)","number",{min:50,max:700,step:"0.1"}],["target","Target weight (lbs)","number",{min:50,max:700,step:"0.1"}],["date","Target date","date",{}]]},
    weight_gain: {name:"Gain weight", sub:"lbs", help:"Enter where you are now and where you want to be.",
      fields:[["start","Current weight (lbs)","number",{min:50,max:700,step:"0.1"}],["target","Target weight (lbs)","number",{min:50,max:700,step:"0.1"}],["date","Target date","date",{}]]},
    maintain: {name:"Maintain weight", sub:"lbs", help:"Stay within about 2% of this weight.",
      fields:[["target","Weight to maintain (lbs)","number",{min:50,max:700,step:"0.1"}]]},
    calorie: {name:"Daily calories", sub:"kcal / day", help:"Your daily calorie target. Recommendations choose meals that fit it.",
      fields:[["target","Daily calorie target (kcal)","number",{min:500,max:10000,step:"10"}],["current","Your current daily average (optional)","number",{min:0,max:10000,step:"10"}]]},
    protein: {name:"Daily protein", sub:"g / day", help:"Your daily protein target. Recommendations favor high-protein meals.",
      fields:[["target","Daily protein target (g)","number",{min:10,max:500,step:"1"}],["current","Your current daily average (optional)","number",{min:0,max:500,step:"1"}]]},
    custom: {name:"Custom goal", sub:"your own", help:"Track anything: servings of vegetables, meals cooked at home, and so on.",
      fields:[["label","Goal name","text",{maxlength:80,placeholder:"e.g. Home-cooked dinners"}],["target","Target","number",{min:0.01,step:"any"}],["unit","Unit","text",{maxlength:20,placeholder:"e.g. dinners / week"}],["current","Current progress","number",{min:0,step:"any"}],["date","Target date (optional)","date",{}]]}
  };
  let type = "weight_loss";

  function drawTypes(){
    $("goalTypes").innerHTML = Object.entries(TYPES).map(([k,t]) => '<button type="button" data-type="'+k+'" class="'+(k===type?"active":"")+'">'+t.name+'<small>'+t.sub+'</small></button>').join("");
  }
  function drawFields(){
    const t = TYPES[type];
    $("goalHelp").textContent = t.help;
    $("goalFields").innerHTML = t.fields.map(([id,label,kind,attrs]) =>
      '<label class="s4-field" style="min-width:150px">'+label+'<input id="f_'+id+'" type="'+kind+'" '+Object.entries(attrs).map(([k,v])=>k+'="'+MM.esc(v)+'"').join(" ")+'></label>').join("");
    if (document.getElementById("f_date")) $("f_date").min = MM.iso(new Date());
    $("goalErr").textContent = ""; hint();
    ["start","target","date"].forEach(id => { const e = $("f_"+id); if (e) e.addEventListener("input", hint); });
  }
  function hint(){
    const h = $("goalHint"); h.className = "s4-hint"; h.textContent = "";
    if (type !== "weight_loss" && type !== "weight_gain") return;
    const s = Number($("f_start").value), t = Number($("f_target").value), d = $("f_date").value;
    if (!(s > 0 && t > 0)) return;
    const diff = Math.abs(s - t);
    if (type === "weight_loss" && t >= s){ h.textContent = "Your target must be lower than your current weight."; h.className = "s4-hint show warn"; return; }
    if (type === "weight_gain" && t <= s){ h.textContent = "Your target must be higher than your current weight."; h.className = "s4-hint show warn"; return; }
    if (d){
      const weeks = Math.max(1, (MM.parse(d) - new Date()) / 604800000), rate = diff / weeks;
      h.textContent = diff.toFixed(1)+" lbs in "+weeks.toFixed(1)+" weeks is about "+rate.toFixed(1)+" lbs per week" + (rate > 2 ? " — faster than the 1–2 lbs per week that is usually considered safe." : ".");
      h.className = "s4-hint show" + (rate > 2 ? " warn" : "");
    } else {
      h.textContent = "At a steady 1–2 lbs per week, that takes about "+Math.ceil(diff/2)+" to "+Math.ceil(diff)+" weeks.";
      h.className = "s4-hint show";
    }
  }
  $("goalTypes").addEventListener("click", e => { const b = e.target.closest("[data-type]"); if (b){ type = b.dataset.type; drawTypes(); drawFields(); } });

  $("goalForm").addEventListener("submit", async e => {
    e.preventDefault(); $("goalErr").textContent = "";
    const v = id => { const x = $("f_"+id); return x ? x.value.trim() : ""; };
    const num = id => v(id) === "" ? null : Number(v(id));
    const body = {goal_type: type, target_value: num("target"), unit: TYPES[type].sub.split(" ")[0], target_date: v("date") || null};
    if (!(body.target_value > 0)) { $("goalErr").textContent = "Enter a target above 0."; return; }
    if (type === "weight_loss" || type === "weight_gain"){ body.start_value = num("start"); body.current_value = num("start"); if (!(body.start_value > 0)){ $("goalErr").textContent = "Enter your current weight."; return; } }
    if (type === "maintain"){ body.start_value = body.target_value; body.current_value = body.target_value; }
    if (type === "calorie") { body.unit = "kcal"; body.current_value = num("current") || 0; }
    if (type === "protein") { body.unit = "g"; body.current_value = num("current") || 0; }
    if (type === "custom"){ body.label = v("label"); body.unit = v("unit"); body.current_value = num("current") || 0; if (!body.label){ $("goalErr").textContent = "Give your goal a name."; return; } if (!body.unit){ $("goalErr").textContent = "Enter a unit."; return; } }
    try { await MM.api("/api/goals","POST",body); MM.toast("Goal saved"); drawFields(); load(); }
    catch(err){ $("goalErr").textContent = err.message; }
  });

  const TITLE = {weight_loss:"Lose weight", weight_gain:"Gain weight", maintain:"Maintain weight", calorie:"Daily calories", protein:"Daily protein"};
  function card(g){
    const unit = g.unit, t = g.goal_type;
    const title = t === "custom" ? MM.esc(g.label || "Custom goal") : TITLE[t];
    const weight = t === "weight_loss" || t === "weight_gain" || t === "maintain";
    const due = g.target_date ? (()=>{ const d = Math.ceil((MM.parse(String(g.target_date).slice(0,10)) - new Date())/86400000); return "Due "+String(g.target_date).slice(0,10)+(d>=0?" ("+d+" days left)":" (past due)"); })() : "No target date";
    const nums = weight
      ? '<div><strong>'+(g.start_value ?? "—")+'</strong>start</div><div><strong>'+g.current_value+'</strong>now</div><div><strong>'+g.target_value+'</strong>target ('+unit+')</div>'
      : '<div><strong>'+g.current_value+'</strong>current</div><div><strong>'+g.target_value+'</strong>target ('+unit+')</div>';
    const lab = weight ? "Log today's weight" : (t === "custom" ? "Update progress" : "Update daily average");
    return '<div class="s4-goal"><div class="s4-bar-head"><h4>'+title+'</h4><button class="s4-link" data-del="'+g.goal_id+'">Delete</button></div>'+
      '<div class="meta">'+due+'</div><div class="s4-bar"><i style="width:'+g.progress+'%"></i></div>'+
      '<div class="nums"><div><strong>'+Math.round(g.progress)+'%</strong>complete</div>'+nums+'</div>'+
      '<div class="acts"><label class="s4-field">'+lab+'<input type="number" min="0" step="any" id="upd_'+g.goal_id+'" value="'+g.current_value+'"></label><button class="s4-btn ghost sm" data-upd="'+g.goal_id+'">Save</button></div></div>';
  }
  async function load(){
    try {
      const rows = await MM.api("/api/goals");
      $("goalList").innerHTML = rows.length ? rows.map(card).join("") : '<p class="s4-empty">No goals yet. Choose a goal type on the left to get started.</p>';
    } catch(err){ $("goalList").innerHTML = '<div class="s4-note bad">'+MM.esc(err.message)+'</div>'; }
  }
  $("goalList").addEventListener("click", async e => {
    const del = e.target.closest("[data-del]"), upd = e.target.closest("[data-upd]");
    try {
      if (del && confirm("Delete this goal?")){ await MM.api("/api/goals/"+del.dataset.del,"DELETE"); load(); }
      if (upd){ const v = $("upd_"+upd.dataset.upd).value; if (v === "" || Number(v) < 0) return MM.toast("Enter a number", true); await MM.api("/api/goals/"+upd.dataset.upd+"?current_value="+encodeURIComponent(v),"PATCH"); MM.toast("Progress updated"); load(); }
    } catch(err){ MM.toast(err.message, true); }
  });
  drawTypes(); drawFields(); load();
})();

// Shared helpers for the Sprint 4 pages. Needs script.js (apiRequest) to be loaded first.
const MM = {
  esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); },
  iso(d){ const z = n => String(n).padStart(2,"0"); return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate()); },
  parse(s){ const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); },
  addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; },
  monday(d){ const x = new Date(d); x.setDate(x.getDate() - ((x.getDay()+6)%7)); x.setHours(0,0,0,0); return x; },
  num(x){ return Math.round(Number(x||0)*100)/100; },
  money(x){ return "$"+Number(x||0).toFixed(2); },
  api(path, method, body){ return apiRequest(path, method, body); },
  toast(msg, err){
    const t = document.createElement("div"); t.className = "s4-toast"+(err?" err":""); t.textContent = msg;
    document.body.appendChild(t); setTimeout(()=>t.remove(), 3500);
  },
  modal(html){
    const m = document.createElement("div"); m.className = "s4-modal";
    m.innerHTML = '<div class="s4-box" role="dialog" aria-modal="true"><button class="s4-close" aria-label="Close">&times;</button>'+html+'</div>';
    const close = () => m.remove();
    m.addEventListener("click", e => { if (e.target === m) close(); });
    m.querySelector(".s4-close").addEventListener("click", close);
    document.body.appendChild(m);
    m.close = close;
    return m;
  },
  macros(o){
    return '<div class="s4-macros"><div><strong>'+MM.num(o.calories)+'</strong>kcal</div><div><strong>'+MM.num(o.protein_g)+'g</strong>protein</div><div><strong>'+MM.num(o.carbs_g)+'g</strong>carbs</div><div><strong>'+MM.num(o.fat_g)+'g</strong>fat</div></div>';
  }
};
const MEALS_OPTS = [["breakfast","Breakfast"],["lunch","Lunch"],["dinner","Dinner"],["snack","Snack"]];
MM.addToPlan = function(r, servings, onDone){
  const today = MM.iso(new Date());
  const m = MM.modal('<h2>Add to meal plan</h2><div class="s4-sub">'+MM.esc(r.emoji||"")+' '+MM.esc(r.title||r.name)+'</div>'+
    '<div class="s4-formgrid"><label class="s4-field">Date<input type="date" id="apDate" value="'+today+'"></label>'+
    '<label class="s4-field">Servings<input type="number" id="apServ" min="0.25" max="100" step="0.25" value="'+(servings||r.base_servings||1)+'"></label></div>'+
    '<div class="s4-field">Meal'+MM.pick("apType", MEALS_OPTS, "dinner")+'</div>'+
    '<div class="s4-err" id="apErr"></div><button class="s4-btn block" id="apGo">Add to calendar</button>');
  const t = (r.tags||[]).find(x => ["breakfast","lunch","dinner","snack"].includes(x)); if (t) MM.setPick("apType", t);
  m.querySelector("#apGo").onclick = async () => {
    try { await MM.api("/api/calendar","POST",{recipe_id:r.recipe_id, meal_date:m.querySelector("#apDate").value, meal_type:m.querySelector("#apType").value, servings:Number(m.querySelector("#apServ").value)});
      m.close(); MM.toast("Added to your calendar"); if (onDone) onDone(); }
    catch(e){ m.querySelector("#apErr").textContent = e.message; }
  };
};
const MEALS = ["breakfast","lunch","dinner","snack"];

// Sidebar name/initials come from the server session, not from localStorage.
(function(){
  if (!document.body.classList.contains("app-body")) return;
  MM.api("/api/me").then(u => {
    const name = ((u.first_name||"")+" "+(u.last_name||"")).trim() || u.email || "";
    const box = document.querySelector(".sidebar-user");
    if (box && name){
      const n = box.querySelector(".user-info strong"); if (n) n.textContent = name;
      const a = box.querySelector(".user-avatar"); if (a) a.textContent = name.split(/\s+/).map(p=>p[0]).slice(0,2).join("").toUpperCase();
    }
    if (u.role_name === "admin" && !document.querySelector('a[href="admin.html"].nav-item')){
      const nav = document.querySelector(".sidebar-nav");
      if (nav){
        const lbl = document.createElement("p"); lbl.className = "nav-label nav-section"; lbl.textContent = "ADMIN";
        const a = document.createElement("a"); a.href = "admin.html"; a.className = "nav-item";
        a.innerHTML = '<span class="nav-icon">⚑</span> Admin panel';
        nav.append(lbl, a);
      }
    }
    document.dispatchEvent(new CustomEvent("mm-user", {detail:u}));
  }).catch(()=>{});
})();

// ---------------------------------------------------------------------------------------------
// Segmented picker: <div class="s4-pick" data-for="inputId"><button data-v="x">X</button>...</div>
// ---------------------------------------------------------------------------------------------
MM.pick = function(id, options, value){
  return '<input type="hidden" id="'+id+'" value="'+MM.esc(value)+'"><div class="s4-pick" data-for="'+id+'">'+
    options.map(o => '<button type="button" data-v="'+MM.esc(o[0])+'" class="'+(o[0]===value?'active':'')+'">'+MM.esc(o[1])+'</button>').join("")+'</div>';
};
document.addEventListener("click", e => {
  const b = e.target.closest(".s4-pick button"); if (!b) return;
  const wrap = b.parentElement, input = document.getElementById(wrap.dataset.for);
  wrap.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
  if (input){ input.value = b.dataset.v; input.dispatchEvent(new Event("change", {bubbles:true})); }
});
MM.setPick = function(id, v){
  const input = document.getElementById(id); if (!input) return; input.value = v;
  const w = document.querySelector('.s4-pick[data-for="'+id+'"]');
  if (w) w.querySelectorAll("button").forEach(x => x.classList.toggle("active", x.dataset.v === v));
};

// ---------------------------------------------------------------------------------------------
// Custom dropdowns: every <select> gets a styled button + option panel. The real <select> stays in
// the page (hidden) so existing code that reads .value or listens for "change" keeps working.
// ---------------------------------------------------------------------------------------------
(function(){
  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");
  let openPanel = null, openBtn = null;
  function closePanel(){ if (openPanel){ openPanel.remove(); openBtn && openBtn.classList.remove("open"); openPanel = openBtn = null; } }
  function label(sel){ const o = sel.options[sel.selectedIndex]; return o ? o.textContent : ""; }

  function enhance(sel){
    if (sel.dataset.mm || sel.multiple || sel.size > 1 || sel.classList.contains("no-enhance")) return;
    sel.dataset.mm = "1";
    const wrap = document.createElement("div"); wrap.className = "mm-select";
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "mm-select-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    sel.parentNode.insertBefore(wrap, sel); wrap.append(sel, btn);
    sel.classList.add("mm-native");
    const refresh = () => { btn.innerHTML = '<span></span><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'; btn.firstChild.textContent = label(sel) || "Select"; btn.disabled = sel.disabled; };
    Object.defineProperty(sel, "value", {configurable:true, get(){ return valueDesc.get.call(sel); }, set(v){ valueDesc.set.call(sel, v); refresh(); }});
    Object.defineProperty(sel, "selectedIndex", {configurable:true, get(){ return indexDesc.get.call(sel); }, set(v){ indexDesc.set.call(sel, v); refresh(); }});
    new MutationObserver(refresh).observe(sel, {childList:true, subtree:true, attributes:true});
    sel.addEventListener("change", refresh);
    refresh();

    function open(){
      if (openBtn === btn){ closePanel(); return; }
      closePanel();
      const panel = document.createElement("div"); panel.className = "mm-select-panel"; panel.setAttribute("role", "listbox");
      Array.from(sel.options).forEach((o, i) => {
        const d = document.createElement("div"); d.className = "mm-opt"+(i === sel.selectedIndex ? " sel" : "")+(o.disabled ? " dis" : "");
        d.setAttribute("role", "option"); d.dataset.i = i; d.textContent = o.textContent;
        d.addEventListener("mousedown", ev => ev.preventDefault());
        d.addEventListener("click", () => { if (o.disabled) return; indexDesc.set.call(sel, i); sel.dispatchEvent(new Event("change", {bubbles:true})); refresh(); closePanel(); btn.focus(); });
        panel.append(d);
      });
      document.body.append(panel);
      const r = btn.getBoundingClientRect(), h = Math.min(panel.scrollHeight, 260);
      panel.style.minWidth = r.width+"px";
      const below = window.innerHeight - r.bottom, up = below < h + 12 && r.top > below;
      panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8))+"px";
      panel.style.top = up ? (r.top - h - 6)+"px" : (r.bottom + 6)+"px";
      panel.style.maxHeight = "260px";
      const cur = panel.querySelector(".sel"); if (cur) panel.scrollTop = cur.offsetTop - 60;
      openPanel = panel; openBtn = btn; btn.classList.add("open");
    }
    btn.addEventListener("click", open);
    btn.addEventListener("keydown", ev => {
      if (ev.key === "Escape") closePanel();
      else if (ev.key === "ArrowDown" || ev.key === "ArrowUp"){
        ev.preventDefault();
        const n = sel.options.length; let i = sel.selectedIndex + (ev.key === "ArrowDown" ? 1 : -1);
        while (i >= 0 && i < n && sel.options[i].disabled) i += ev.key === "ArrowDown" ? 1 : -1;
        if (i >= 0 && i < n){ indexDesc.set.call(sel, i); sel.dispatchEvent(new Event("change", {bubbles:true})); refresh(); if (openPanel) { closePanel(); open(); } }
      }
    });
  }
  document.addEventListener("click", e => { if (openPanel && !e.target.closest(".mm-select-btn") && !e.target.closest(".mm-select-panel")) closePanel(); });
  window.addEventListener("resize", closePanel);
  window.addEventListener("scroll", e => { if (openPanel && !(e.target.closest && e.target.closest(".mm-select-panel"))) closePanel(); }, true);
  const scan = root => (root.querySelectorAll ? root.querySelectorAll("select") : []).forEach(enhance);
  const start = () => {
    scan(document);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1){ if (n.tagName === "SELECT") enhance(n); else scan(n); } }))).observe(document.body, {childList:true, subtree:true});
  };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  MM.enhanceSelects = () => scan(document);
})();
MM.version = 6;

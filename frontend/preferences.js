// Preferences page (UC-04): profile, household, diet, allergens, goals, budget, password -> /api/preferences.
(function(){
  const save = document.getElementById("savePreferences"); if (!save) return;
  const $ = id => document.getElementById(id);
  const chips = () => Array.from(document.querySelectorAll(".preference-chip"));
  chips().forEach(c => c.addEventListener("click", () => c.classList.toggle("selected")));

  function fill(p){
    $("firstName").value = p.first_name; $("lastName").value = p.last_name; $("profileEmail").value = p.email;
    $("householdSize").value = p.household_size; $("dietType").value = p.diet_type;
    chips().forEach(c => c.classList.toggle("selected", p.allergens.includes(c.textContent.trim())));
    $("nutritionGoal").value = p.primary_goal; $("calorieGoal").value = p.calorie_goal;
    $("budgetGoal").value = p.weekly_budget; $("mealsPerDay").value = p.meals_per_day + (p.meals_per_day === 1 ? " meal" : " meals");
    const full = (p.first_name+" "+p.last_name).trim();
    $("preferencesProfileName").textContent = full;
    $("preferencesProfileAvatar").textContent = full.split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase();
  }

  MM.api("/api/preferences").then(fill).catch(e => { $("prefMsg").textContent = e.message; });

  save.addEventListener("click", async () => {
    const msg = $("prefMsg"); msg.style.color = ""; msg.textContent = "";
    const body = {
      first_name: $("firstName").value.trim(), last_name: $("lastName").value.trim(), email: $("profileEmail").value.trim(),
      household_size: Number($("householdSize").value), diet_type: $("dietType").value,
      allergens: chips().filter(c => c.classList.contains("selected")).map(c => c.textContent.trim()),
      primary_goal: $("nutritionGoal").value, calorie_goal: Number($("calorieGoal").value),
      weekly_budget: Number($("budgetGoal").value), meals_per_day: parseInt($("mealsPerDay").value, 10)
    };
    if (!body.first_name || !body.last_name || !body.email){ msg.textContent = "First name, last name and email are required."; return; }
    save.disabled = true;
    try {
      await MM.api("/api/preferences", "PUT", body);
      msg.style.color = "#166534"; msg.textContent = "✓ Saved to your account";
      const p = await MM.api("/api/preferences"); fill(p);
    } catch(e){ msg.textContent = e.message; }
    save.disabled = false;
  });

  $("changePw").addEventListener("click", async () => {
    const m = $("pwMsg"); m.style.color = ""; m.textContent = "";
    try {
      await MM.api("/api/password", "POST", {current_password: $("curPw").value, new_password: $("newPw").value});
      m.style.color = "#166534"; m.textContent = "✓ Password updated"; $("curPw").value = ""; $("newPw").value = "";
    } catch(e){ m.textContent = e.message; }
  });
})();

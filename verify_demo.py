"""One-command demo check.  Uses only the Python standard library - nothing to install.

  python verify_demo.py                                  # tests http://localhost:8000
  python verify_demo.py https://your-app.onrender.com    # tests the deployed site
  ADMIN_EMAIL=... ADMIN_PASSWORD=... python verify_demo.py <url>   # also tests admin

It registers a throw-away test user, exercises every Sprint 3 and Sprint 4 feature through the API
(so data really travels frontend -> backend -> tables), and prints PASS/FAIL per step.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
results = []


def client():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def call(op, method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with op.open(req, timeout=60) as r:
            raw = r.read().decode() or "null"
            return r.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw[:200]
    except Exception as e:                       # server down, DNS, timeout ...
        return 0, str(e)


def check(name, ok, detail=""):
    ok = bool(ok)
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"   [{detail}]" if detail and not ok else ""))
    return ok


print(f"Testing {BASE}\n(first request may take ~60 s if the free server is asleep)\n")
u = client()
email = f"verify{int(time.time())}@mealplan-demo.com"
pw = "Verify-pass-123"

s, r = call(u, "POST", "/api/register", {"first_name": "Verify", "last_name": "Bot", "email": email, "password": pw})
if not check("Register new user -> row in users", s == 201, f"{s} {r}"):
    sys.exit("Cannot continue: is the server running and DATABASE_URL correct?")
s, r = call(u, "POST", "/api/register", {"first_name": "V", "email": email, "password": pw})
check("Duplicate email rejected (409)", s == 409, f"{s} {r}")
s, r = call(u, "POST", "/api/login", {"email": email, "password": "wrong-password"})
check("Wrong password rejected (401)", s == 401, f"{s} {r}")
s, r = call(u, "POST", "/api/login", {"email": email, "password": pw})
check("Login -> session row + cookie", s == 200, f"{s} {r}")
s, r = call(u, "GET", "/api/me")
check("Session works (/api/me)", s == 200 and r.get("email") == email, f"{s} {r}")
s, r = call(u, "GET", "/api/admin/users")
check("Regular user blocked from admin (403)", s == 403, f"{s} {r}")

# Budget
s, r = call(u, "POST", "/api/budgets", {"period_start": "2026-10-01", "period_end": "2026-10-31", "limit_amount": 300})
bid = r.get("budget_id") if isinstance(r, dict) else None
check("Budget: create -> row in budgets", s == 201 and bid, f"{s} {r}")
s, r = call(u, "POST", "/api/budgets", {"period_start": "2026-10-31", "period_end": "2026-10-01", "limit_amount": 5})
check("Budget: bad dates rejected (400)", s == 400, f"{s} {r}")
s, r = call(u, "GET", "/api/budgets")
check("Budget: read back", s == 200 and any(b["budget_id"] == bid for b in r), f"{s} {r}")

# Goals
s, r = call(u, "POST", "/api/goals", {"goal_type": "protein", "target_value": 120, "current_value": 20, "unit": "g"})
gid = r.get("goal_id") if isinstance(r, dict) else None
check("Goal: create -> row in goals", s == 201 and gid, f"{s} {r}")
s, r = call(u, "PATCH", f"/api/goals/{gid}?current_value=75")
check("Goal: update progress", s == 200, f"{s} {r}")
s, r = call(u, "GET", "/api/goals")
check("Goal: progress saved (75)", s == 200 and any(float(g["current_value"]) == 75 for g in r), f"{s} {r}")

# Grocery list
s, r = call(u, "POST", "/api/grocery-items", {"name": "Milk", "quantity": 1, "unit": "gal", "estimated_price": 3.99})
iid = r.get("item_id") if isinstance(r, dict) else None
check("Grocery: add -> row in grocery_list_items", s == 201 and iid, f"{s} {r}")
s, r = call(u, "PATCH", f"/api/grocery-items/{iid}", {"purchased": True})
check("Grocery: tick off", s == 200, f"{s} {r}")
s, r = call(u, "GET", "/api/grocery-items")
check("Grocery: read back (purchased=true)", s == 200 and any(i["item_id"] == iid and i["purchased"] for i in r), f"{s} {r}")

# Recommendations
s, r = call(u, "PUT", "/api/recommendations/settings", {"diet": "vegan", "allergies": ["dairy"], "max_cost": 6})
check("Recommendations: save settings -> recommendation_settings", s == 200, f"{s} {r}")
s, r = call(u, "GET", "/api/recommendations/meals")
ok = s == 200 and r.get("count", 0) > 0 and all("vegan" in m["tags"] and m["cost"] <= 6 for m in r["meals"])
check("Recommendations: vegan + under $6 filter applied", ok, f"{s}")

# ---------------------------------------------------------------- Sprint 4
import datetime
today = datetime.date.today()
monday = today - datetime.timedelta(days=today.weekday())
iso = lambda d: d.isoformat()

# Inventory (UC-08)
s, r = call(u, "POST", "/api/inventory", {"name": "Chicken Breast", "category": "protein", "quantity": 3, "unit": "lbs",
                                          "expiration_date": iso(today + datetime.timedelta(days=1))})
inv_id = r.get("item_id") if isinstance(r, dict) else None
check("Inventory: add -> rows in ingredients + inventory_items", s == 201 and inv_id, f"{s} {r}")
s, r = call(u, "POST", "/api/inventory", {"name": "chicken breast", "category": "protein", "quantity": 1, "unit": "lbs"})
s2, r2 = call(u, "GET", "/api/inventory")
row = next((x for x in r2 if x["item_id"] == inv_id), {}) if s2 == 200 else {}
check("Inventory: same food added twice -> quantities add up (4 lbs, one row)", row.get("quantity") == 4 and sum(1 for x in r2 if x["name"].lower() == "chicken breast") == 1, f"{s2} {row}")
s, r = call(u, "PATCH", f"/api/inventory/{inv_id}", {"quantity": 3})
check("Inventory: edit quantity", s == 200, f"{s} {r}")
s, r = call(u, "PATCH", f"/api/inventory/{inv_id}", {"quantity": -2})
check("Inventory: negative quantity rejected (422)", s == 422, f"{s} {r}")
s, r = call(u, "GET", f"/api/notifications?today={iso(today)}")
check("Inventory: expiry notification created (item expires in 1 day)", s == 200 and any("expires in 1 day" in n["message"] for n in r), f"{s} {r}")

# Recipes (UC-05) + scaling (UC-07)
s, r = call(u, "GET", "/api/recipes")
total_recipes = r.get("total", 0) if isinstance(r, dict) else 0
check("Recipes: list from database with nutrition per serving", s == 200 and total_recipes >= 12 and all("calories" in x for x in r["items"]), f"{s} {total_recipes}")
s, r = call(u, "GET", "/api/recipes?q=pasta")
check("Recipes: search by title", s == 200 and any(x["title"] == "Creamy Garlic Pasta" for x in r["items"]), f"{s}")
s, r = call(u, "GET", "/api/recipes?q=salmon")
check("Recipes: search by ingredient", s == 200 and any(x["title"] == "Salmon Rice Bowl" for x in r["items"]), f"{s}")
s, r = call(u, "GET", "/api/recipes?category=breakfast&max_minutes=15")
check("Recipes: category + max time filters", s == 200 and r["total"] > 0 and all("breakfast" in x["tags"] and x["minutes"] <= 15 for x in r["items"]), f"{s}")
s, r = call(u, "GET", "/api/recipes?q=zzzznothing")
check("Recipes: no match -> empty list", s == 200 and r["total"] == 0 and r["items"] == [], f"{s}")
s, r = call(u, "GET", "/api/recipes?page=2")
check("Recipes: 20 per page (page 2 empty with this few recipes)", s == 200 and r["page_size"] == 20 and r["items"] == [], f"{s}")
s, r = call(u, "GET", "/api/recipes?q=power")
bowl = next((x for x in r["items"] if x["title"] == "Grilled Chicken Power Bowl"), None) if s == 200 else None
bowl_id = bowl["recipe_id"] if bowl else None
s, r = call(u, "GET", f"/api/recipes/{bowl_id}?servings=4")
chicken = next((x for x in r.get("ingredients", []) if x["name"] == "Chicken Breast"), {}) if s == 200 else {}
check("Scaling: 2 -> 4 servings doubles ingredients and calories", chicken.get("quantity") == 2 and r.get("total", {}).get("calories") == 2160, f"{s} {chicken}")
s, r = call(u, "GET", f"/api/recipes/{bowl_id}?servings=2.5")
chicken = next((x for x in r.get("ingredients", []) if x["name"] == "Chicken Breast"), {}) if s == 200 else {}
check("Scaling: decimal servings accepted, rounded to 2 decimals (2.5 -> 1.25)", chicken.get("quantity") == 1.25, f"{s} {chicken}")
check("Scaling: zero / negative servings rejected (400)", call(u, "GET", f"/api/recipes/{bowl_id}?servings=0")[0] == 400 and call(u, "GET", f"/api/recipes/{bowl_id}?servings=-3")[0] == 400)
check("Scaling: non-numeric servings rejected", call(u, "GET", f"/api/recipes/{bowl_id}?servings=abc")[0] in (400, 422))
s, r = call(u, "PUT", f"/api/recipes/{bowl_id}/favorite")
s2, r2 = call(u, "GET", "/api/recipes?favorites=true")
check("Recipes: favorite saved in recipe_favorites", s == 200 and s2 == 200 and [x["recipe_id"] for x in r2["items"]] == [bowl_id], f"{s} {s2}")
call(u, "DELETE", f"/api/recipes/{bowl_id}/favorite")

# Preferences (UC-04)
s, r = call(u, "GET", "/api/preferences")
check("Preferences: read profile + settings", s == 200 and r.get("email") == email and r.get("calorie_goal") == 2000, f"{s} {r}")
prefs = {"first_name": "Verify", "last_name": "Bot", "email": email, "household_size": 3, "diet_type": "Vegan",
         "allergens": ["Dairy", "Soy"], "primary_goal": "Lose weight", "calorie_goal": 1800, "weekly_budget": 90, "meals_per_day": 3}
s, r = call(u, "PUT", "/api/preferences", prefs)
check("Preferences: save -> users, user_settings, user_dietary_preferences", s == 200, f"{s} {r}")
s, r = call(u, "GET", "/api/preferences")
check("Preferences: saved values read back", s == 200 and r["diet_type"] == "Vegan" and r["allergens"] == ["Dairy", "Soy"] and r["calorie_goal"] == 1800 and r["household_size"] == 3, f"{s} {r}")
s, r = call(u, "GET", "/api/recipes")
check("Preferences: vegan + no dairy/soy applied to recipe search", s == 200 and r["total"] > 0 and all("vegan" in x["tags"] and not ({"dairy", "soy"} & set(x["allergens"])) for x in r["items"]), f"{s} {r.get('total')}")
s, r = call(u, "GET", "/api/recipes?apply_preferences=false")
check("Preferences: 'show all' ignores saved preferences", s == 200 and r["total"] == total_recipes, f"{s} {r.get('total')}")
s, r = call(u, "GET", "/api/recommendations/settings")
check("Preferences: also applied to Recommendations settings", s == 200 and r.get("diet") == "vegan" and "dairy" in r.get("allergies", []), f"{s} {r}")
s, r = call(u, "PUT", "/api/preferences", {**prefs, "calorie_goal": 100})
check("Preferences: out-of-range calorie goal rejected (422)", s == 422, f"{s}")
other = client(); oemail = "other" + email
call(other, "POST", "/api/register", {"first_name": "O", "last_name": "T", "email": oemail, "password": pw})
call(other, "POST", "/api/login", {"email": oemail, "password": pw})
s, r = call(u, "PUT", "/api/preferences", {**prefs, "email": oemail})
check("Preferences: email used by another account rejected (409)", s == 409, f"{s} {r}")
s, r = call(u, "POST", "/api/password", {"current_password": "not-my-password", "new_password": "New-pass-4567"})
check("Password change: wrong current password rejected (400)", s == 400, f"{s} {r}")
s, r = call(u, "POST", "/api/password", {"current_password": pw, "new_password": "short"})
check("Password change: new password under 8 characters rejected (422)", s == 422, f"{s} {r}")
s, r = call(u, "POST", "/api/password", {"current_password": pw, "new_password": "New-pass-4567"})
ok_old = call(client(), "POST", "/api/login", {"email": email, "password": pw})[0] == 401
ok_new = call(client(), "POST", "/api/login", {"email": email, "password": "New-pass-4567"})[0] == 200
check("Password change: new password logs in, old one fails", s == 200 and ok_old and ok_new, f"{s} {r}")
pw = "New-pass-4567"
call(u, "PUT", "/api/preferences", {**prefs, "diet_type": "Balanced", "allergens": []})

# Calendar (UC-06) + nutrition (summary)
s, r = call(u, "GET", "/api/recipes?q=chicken+power")
bowl_id = r["items"][0]["recipe_id"]
d1, d2 = monday + datetime.timedelta(days=2), monday + datetime.timedelta(days=3)
s, r = call(u, "POST", "/api/calendar", {"recipe_id": bowl_id, "meal_date": iso(d1), "meal_type": "dinner", "servings": 2})
eid = r.get("entry_id") if isinstance(r, dict) else None
check("Calendar: add meal -> meal_plans + calendar_entries", s == 201 and eid and r.get("calories") == 1080, f"{s} {r}")
s, r = call(u, "GET", f"/api/calendar?start={iso(monday)}&end={iso(monday + datetime.timedelta(days=6))}")
check("Calendar: week view lists the meal", s == 200 and any(x["entry_id"] == eid for x in r), f"{s}")
check("Calendar: invalid meal type rejected (422)", call(u, "POST", "/api/calendar", {"recipe_id": bowl_id, "meal_date": iso(d1), "meal_type": "brunch"})[0] == 422)
check("Calendar: zero servings rejected (422)", call(u, "POST", "/api/calendar", {"recipe_id": bowl_id, "meal_date": iso(d1), "meal_type": "lunch", "servings": 0})[0] == 422)
check("Calendar: date far outside the allowed range rejected (400)", call(u, "POST", "/api/calendar", {"recipe_id": bowl_id, "meal_date": "1990-01-01", "meal_type": "lunch"})[0] == 400)
check("Calendar: unknown recipe rejected (404)", call(u, "POST", "/api/calendar", {"recipe_id": 999999, "meal_date": iso(d1), "meal_type": "lunch"})[0] == 404)
s, r = call(u, "PATCH", f"/api/calendar/{eid}", {"meal_date": iso(d2), "meal_type": "lunch"})
check("Calendar: move meal to another day / slot (drag and drop)", s == 200 and r.get("meal_date") == iso(d2) and r.get("meal_type") == "lunch", f"{s} {r}")
check("Calendar: another user cannot change my meal (404)", call(other, "PATCH", f"/api/calendar/{eid}", {"servings": 5})[0] == 404)
s, r = call(u, "GET", f"/api/grocery/preview?start={iso(monday)}&end={iso(monday + datetime.timedelta(days=6))}")
chicken_line = next((x for x in r.get("items", []) if x["name"] == "Chicken Breast"), {}) if s == 200 else {}
check("Grocery plan: needed minus pantry (1 lb needed, 3 in stock -> buy 0)", s == 200 and chicken_line == {} and r["total_cost"] > 0, f"{s} {chicken_line}")
s, r = call(u, "PATCH", f"/api/calendar/{eid}", {"is_completed": True})
used = next((x for x in (r.get("inventory") or {}).get("used", []) if x["name"] == "Chicken Breast"), {}) if s == 200 else {}
check("Calendar: marking a meal eaten subtracts the pantry (3 lbs - 1 lb for 2 servings = 2)", s == 200 and used.get("used") == 1 and used.get("remaining") == 2, f"{s} {r}")
s, r = call(u, "GET", f"/api/summary?date={iso(d2)}")
check("Nutrition: eaten calories come from nutrition_logs (1080 kcal, 92g protein)", s == 200 and r["eaten"]["calories"] == 1080 and r["eaten"]["protein_g"] == 92, f"{s} {r.get('eaten')}")
check("Nutrition: goals follow the saved calorie goal (1800)", s == 200 and r["goals"]["calories"] == 1800 and r["goals"]["protein_g"] == 101, f"{s} {r.get('goals')}")
s, r = call(u, "PUT", "/api/water", {"log_date": iso(today), "glasses": 5})
s2, r2 = call(u, "GET", f"/api/water?date={iso(today)}")
check("Nutrition: water tracker saved in water_logs", s == 200 and r2.get("glasses") == 5, f"{s} {r2}")
check("Nutrition: water above 20 glasses rejected (422)", call(u, "PUT", "/api/water", {"glasses": 99})[0] == 422)
s, r = call(u, "PATCH", f"/api/calendar/{eid}", {"is_completed": False})
s2, r2 = call(u, "GET", f"/api/summary?date={iso(d2)}")
check("Calendar: un-ticking a meal removes its nutrition log", s == 200 and r2["eaten"]["calories"] == 0, f"{s} {r2.get('eaten')}")

# Grocery order from the plan (UC-09)
addr = "123 Peachtree St, Atlanta, GA"
d3 = monday + datetime.timedelta(days=4)
call(u, "POST", "/api/calendar", {"recipe_id": bowl_id, "meal_date": iso(d3), "meal_type": "dinner", "servings": 4})
rng = f"start={iso(monday)}&end={iso(monday + datetime.timedelta(days=6))}"
s, r = call(u, "GET", f"/api/grocery/preview?{rng}")
chicken_line = next((x for x in r.get("items", []) if x["name"] == "Chicken Breast"), {}) if s == 200 else {}
check("Grocery plan: 2 + 4 servings need 3 lbs chicken, pantry has 2 lbs of the right unit -> buy 1", chicken_line.get("to_buy") == 1 and chicken_line.get("in_stock") == 2, f"{s} {chicken_line}")
check("Grocery plan: cost estimated from ingredient prices", s == 200 and r["total_cost"] > 0 and abs(sum(x["line_cost"] for x in r["items"]) - r["total_cost"]) < 0.01)
check("Grocery order: missing address rejected (422)", call(u, "POST", "/api/grocery/orders", {"start": iso(monday), "end": iso(monday + datetime.timedelta(days=6)), "delivery_date": iso(today + datetime.timedelta(days=2))})[0] == 422)
s, r = call(u, "POST", "/api/grocery/orders", {"start": iso(monday), "end": iso(monday + datetime.timedelta(days=6)), "delivery_address": addr, "delivery_date": iso(today + datetime.timedelta(days=2))})
oid = r.get("order_id") if isinstance(r, dict) else None
check("Grocery order: stored in grocery_orders and sent to the delivery service", s == 201 and oid and r.get("status") == "placed" and r.get("confirmation"), f"{s} {r}")
s, r = call(u, "GET", "/api/grocery/orders")
check("Grocery order: appears in order history with its items", s == 200 and any(o["order_id"] == oid and o["item_count"] > 0 and o["status"] == "placed" for o in r), f"{s}")

# Cleanup of the Sprint 4 test data
for x in (call(u, "GET", f"/api/calendar?{rng}")[1] or []):
    call(u, "DELETE", f"/api/calendar/{x['entry_id']}")
call(u, "DELETE", f"/api/inventory/{inv_id}")

# ---------------------------------------------------------------- Sprint 4 update: goals, recommendations, shopping suggestions
s, r = call(u, "POST", "/api/goals", {"goal_type": "weight_loss", "start_value": 150, "current_value": 150, "target_value": 160, "unit": "lbs"})
check("Goals: weight loss with a target above the start is rejected (400)", s == 400, f"{s} {r}")
s, r = call(u, "POST", "/api/goals", {"goal_type": "weight_gain", "start_value": 150, "current_value": 150, "target_value": 140, "unit": "lbs"})
check("Goals: weight gain with a target below the start is rejected (400)", s == 400, f"{s} {r}")
s, r = call(u, "POST", "/api/goals", {"goal_type": "calorie", "target_value": 100, "unit": "kcal"})
check("Goals: calorie target outside 500-10,000 rejected (400)", s == 400, f"{s} {r}")
s, r = call(u, "POST", "/api/goals", {"goal_type": "custom", "target_value": 5, "unit": "dinners"})
check("Goals: custom goal needs a name (400)", s == 400, f"{s} {r}")
s, r = call(u, "POST", "/api/goals", {"goal_type": "weight_loss", "start_value": 170, "current_value": 170, "target_value": 160, "unit": "lbs"})
gid1 = r.get("goal_id") if isinstance(r, dict) else None
check("Goals: weight-loss goal saved with start and target", s == 201 and gid1, f"{s} {r}")
call(u, "PATCH", f"/api/goals/{gid1}?current_value=165")
s, r = call(u, "GET", "/api/goals")
g1 = next((x for x in r if x["goal_id"] == gid1), {}) if s == 200 else {}
check("Goals: progress = 50% when 165 of the way from 170 to 160", g1.get("progress") == 50, f"{g1}")
s, r = call(u, "POST", "/api/goals", {"goal_type": "protein", "target_value": 150, "current_value": 0, "unit": "g"})
gid2 = r.get("goal_id") if isinstance(r, dict) else None
s, r = call(u, "GET", "/api/recommendations/meals")
top = r["meals"][0] if s == 200 and r.get("meals") else {}
check("Recommendations: use goals (reasons mention the weight-loss / protein goal)", s == 200 and any("goal" in x for m in r["meals"] for x in m["reasons"]) and len(r["goals"]) >= 2, f"{s} {top.get('reasons')}")
check("Recommendations: per-meal protein target comes from the protein goal (150 g / 3 = 50)", s == 200 and r.get("per_meal_protein") == 50, f"{r.get('per_meal_protein')}")
call(u, "DELETE", f"/api/goals/{gid1}"); call(u, "DELETE", f"/api/goals/{gid2}")

d4 = monday + datetime.timedelta(days=5)
s, r = call(u, "POST", "/api/calendar", {"recipe_id": bowl_id, "meal_date": iso(d4), "meal_type": "dinner", "servings": 6})
sug_entry = r.get("entry_id") if isinstance(r, dict) else None
rng2 = f"start={iso(monday)}&end={iso(monday + datetime.timedelta(days=6))}"
s, r = call(u, "GET", f"/api/grocery/suggestions?{rng2}")
need = next((x for x in r.get("needed", []) if x["name"] == "Chicken Breast"), {}) if s == 200 else {}
check("Shopping suggestions: needed items list which planned meals use them", s == 200 and need.get("to_buy", 0) > 0 and any("Power Bowl" in t for t in need.get("used_in", [])), f"{s} {need}")
check("Shopping suggestions: includes meal ideas for the week", s == 200 and len(r.get("meal_ideas", [])) > 0)
s, r = call(u, "POST", "/api/grocery/add-from-plan", {"start": iso(monday), "end": iso(monday + datetime.timedelta(days=6))})
added1 = r.get("added") if isinstance(r, dict) else None
check("Shopping list: 'add all' puts the plan's items on the grocery list", s == 200 and added1 and added1 > 0, f"{s} {r}")
s, r = call(u, "GET", "/api/grocery-items")
check("Shopping list: chicken is now on the list", s == 200 and any(x["name"] == "Chicken Breast" for x in r), f"{s}")
s, r = call(u, "POST", "/api/grocery/add-from-plan", {"start": iso(monday), "end": iso(monday + datetime.timedelta(days=6))})
s2, r2 = call(u, "GET", "/api/grocery-items")
check("Shopping list: adding twice does not double the quantities", s == 200 and r.get("added") == 0 and sum(1 for x in r2 if x["name"] == "Chicken Breast") == 1, f"{r}")
for x in (r2 or []):
    if isinstance(x, dict) and x.get("name") in {i["name"] for i in call(u, "GET", f"/api/grocery/preview?{rng2}")[1].get("items", [])}:
        call(u, "DELETE", f"/api/grocery-items/{x['item_id']}")
call(u, "DELETE", f"/api/calendar/{sug_entry}")

# Chatbot (needs OPENAI_API_KEY on the server)
s, r = call(u, "POST", "/api/chat/message", {"message": "Give me a cheap high-protein dinner idea."})
if s == 200:
    check("Chatbot: AI reply saved to chat_messages", bool(r.get("reply")), f"{r}")
elif s == 503:
    check("Chatbot: OPENAI_API_KEY is set on the server", False, "503 - key missing; add it in Render > Environment")
else:
    check("Chatbot: AI call works", False, f"{s} {r}")

# Cleanup + logout
call(u, "DELETE", f"/api/grocery-items/{iid}")
call(u, "DELETE", f"/api/goals/{gid}")
call(u, "DELETE", f"/api/budgets/{bid}")
s, r = call(u, "POST", "/api/logout")
check("Logout", s == 200, f"{s} {r}")
s, r = call(u, "GET", "/api/me")
check("After logout the session is rejected (401)", s == 401, f"{s} {r}")

# Admin (optional)
ae, ap = os.getenv("ADMIN_EMAIL"), os.getenv("ADMIN_PASSWORD")
if ae and ap:
    a = client()
    s, r = call(a, "POST", "/api/login", {"email": ae, "password": ap})
    if check("Admin: login", s == 200, f"{s} {r}"):
        s, r = call(a, "GET", "/api/admin/users")
        check("Admin: list users", s == 200 and isinstance(r, list) and len(r) > 0, f"{s}")
        s, r = call(a, "GET", "/api/admin/users?q=verify&status=active")
        check("Admin: search by email + filter by status", s == 200 and any(x["email"] == email for x in r), f"{s}")
        target = next((x["user_id"] for x in r if x["email"] == email), None)
        if target:
            s, r = call(a, "PATCH", f"/api/admin/users/{target}/status?status=suspended")
            check("Admin: suspend user", s == 200, f"{s} {r}")
            s, r = call(client(), "POST", "/api/login", {"email": email, "password": pw})
            check("Suspended user cannot log in (403)", s == 403, f"{s} {r}")
else:
    print("(Admin checks skipped - set ADMIN_EMAIL and ADMIN_PASSWORD to include them.)")

print(f"\n{sum(results)}/{len(results)} checks passed")
print("Test user left in the database:", email, "(suspended if admin checks ran). Delete it in the DB if you like.")
sys.exit(0 if all(results) else 1)

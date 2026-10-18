"""One-command demo check.  Uses only the Python standard library - nothing to install.

  python verify_demo.py                                  # tests http://localhost:8000
  python verify_demo.py https://your-app.onrender.com    # tests the deployed site
  ADMIN_EMAIL=... ADMIN_PASSWORD=... python verify_demo.py <url>   # also tests admin

It registers a throw-away test user, exercises every Sprint 3 feature through the API
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

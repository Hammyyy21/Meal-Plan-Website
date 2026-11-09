"""MealMate AI - Sprint 4 API (FastAPI + PostgreSQL).

Adds the modules that used to live only in the browser:
  UC-04 Preferences / profile / password      UC-05 Recipe search + favorites
  UC-06 Interactive calendar                  UC-07 Recipe portion scaling
  UC-08 Inventory edit + expiry notifications UC-09 Grocery list from the meal plan + delivery order
  Nutrition dashboard summary and water tracker

main.py calls build_router(current_user, db) and includes the result, so this file reuses
the same login/session code as the rest of the app. Pure rules live in mealplan_logic.py.
"""
import json
import os
import urllib.error
import urllib.request
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

import bcrypt
import psycopg2.errors
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field

import mealplan_logic as L

RECIPE_CATEGORIES = ("breakfast", "lunch", "dinner", "snack", "high-protein", "vegetarian",
                     "vegan", "quick", "gluten-free")
ORDER_STATUSES = ("draft", "placed", "shipped", "delivered", "cancelled")

RECIPE_COLS = """r.recipe_id, r.title, r.description, r.emoji, r.tags, r.allergens, r.base_servings,
       COALESCE(r.prep_minutes,0) + COALESCE(r.cook_minutes,0) AS minutes,
       r.calories::float AS calories, r.protein_g::float AS protein_g, r.carbs_g::float AS carbs_g,
       r.fat_g::float AS fat_g, r.cost_per_serving::float AS cost_per_serving"""

ENTRY_SQL = """SELECT e.entry_id, e.meal_date, e.meal_type, e.servings::float AS servings, e.is_completed,
       r.recipe_id, r.title, r.emoji, r.base_servings,
       (r.calories * e.servings)::float AS calories, (r.protein_g * e.servings)::float AS protein_g,
       (r.carbs_g * e.servings)::float AS carbs_g, (r.fat_g * e.servings)::float AS fat_g,
       (r.cost_per_serving * e.servings)::float AS cost
  FROM calendar_entries e
  JOIN meal_plans p ON p.plan_id = e.plan_id
  JOIN recipes r    ON r.recipe_id = e.recipe_id"""
ENTRY_ORDER = """ORDER BY e.meal_date, array_position(ARRAY['breakfast','lunch','dinner','snack']::text[], e.meal_type), e.entry_id"""


# ---------------------------------------------------------------- request bodies
class CalendarIn(BaseModel):
    recipe_id: int
    meal_date: date
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    servings: Decimal = Field(default=Decimal("1"), gt=0, le=100)


class CalendarPatch(BaseModel):
    meal_date: date | None = None
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] | None = None
    servings: Decimal | None = Field(default=None, gt=0, le=100)
    is_completed: bool | None = None


class PrefsIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(default="", max_length=50)
    email: EmailStr
    household_size: int = Field(default=1, ge=1, le=20)
    diet_type: Literal["Balanced", "Vegetarian", "Vegan", "Pescatarian", "Low Carb", "High Protein"] = "Balanced"
    allergens: list[Literal["Peanuts", "Dairy", "Shellfish", "Gluten", "Soy"]] = Field(default_factory=list)
    primary_goal: Literal["Maintain weight", "Lose weight", "Gain weight", "Build muscle", "Eat healthier"] = "Maintain weight"
    calorie_goal: int = Field(default=2000, ge=500, le=10000)
    weekly_budget: Decimal = Field(default=Decimal("100"), ge=0, le=100000)
    meals_per_day: int = Field(default=3, ge=1, le=6)


class PasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=72)


class WaterIn(BaseModel):
    log_date: date | None = None
    glasses: int = Field(ge=0, le=20)


class InventoryPatch(BaseModel):
    quantity: Decimal | None = Field(default=None, ge=0, le=100000)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    expiration_date: date | None = None


class OrderIn(BaseModel):
    start: date
    end: date
    delivery_address: str = Field(min_length=5, max_length=255)
    delivery_date: date


class DeliveryError(Exception):
    pass


# ---------------------------------------------------------------- helpers
def _check_date(d):
    today = date.today()
    if d < today - timedelta(days=366) or d > today + timedelta(days=731):
        raise HTTPException(400, "Date must be within the last year or the next two years")


def _plan_for(cur, uid, d):
    """Find the user's meal plan that covers date d, or create the Monday-Sunday plan for it."""
    cur.execute("SELECT plan_id FROM meal_plans WHERE user_id=%s AND start_date<=%s AND end_date>=%s "
                "ORDER BY plan_id LIMIT 1", (uid, d, d))
    row = cur.fetchone()
    if row:
        return row["plan_id"]
    monday, sunday = L.week_bounds(d)
    cur.execute("INSERT INTO meal_plans (user_id, plan_name, start_date, end_date) VALUES (%s,%s,%s,%s) "
                "RETURNING plan_id", (uid, L.week_plan_name(monday), monday, sunday))
    return cur.fetchone()["plan_id"]


def _settings(cur, uid):
    cur.execute("SELECT primary_goal, calorie_goal, weekly_budget::float AS weekly_budget, meals_per_day "
                "FROM user_settings WHERE user_id=%s", (uid,))
    row = cur.fetchone()
    return dict(row) if row else {"primary_goal": "Maintain weight", "calorie_goal": 2000,
                                  "weekly_budget": 100.0, "meals_per_day": 3}


def _pref_names(cur, uid):
    cur.execute("SELECT p.name FROM user_dietary_preferences u JOIN dietary_preferences p "
                "ON p.preference_id=u.preference_id WHERE u.user_id=%s", (uid,))
    return [r["name"] for r in cur.fetchall()]


def _entry(cur, uid, entry_id):
    cur.execute(ENTRY_SQL + " WHERE e.entry_id=%s AND p.user_id=%s", (entry_id, uid))
    return cur.fetchone()


def _macro_goals(calories):
    cal = Decimal(calories)
    half_up = lambda x: int((x + Decimal("0.5")).to_integral_value(rounding="ROUND_FLOOR"))
    return {"protein_g": half_up(cal * Decimal("0.225") / 4),
            "carbs_g": half_up(cal * Decimal("0.5") / 4),
            "fat_g": half_up(cal * Decimal("0.3") / 9)}


def _complete_entry(cur, uid, entry_id):
    """Mark a meal eaten: write the nutrition log and subtract the ingredients from the pantry (UC-08)."""
    cur.execute("""SELECT e.meal_date, e.servings, r.recipe_id, r.base_servings, r.calories, r.protein_g,
                          r.carbs_g, r.fat_g
                   FROM calendar_entries e JOIN recipes r ON r.recipe_id = e.recipe_id
                   WHERE e.entry_id=%s""", (entry_id,))
    e = cur.fetchone()
    s = Decimal(e["servings"])
    cur.execute("DELETE FROM nutrition_logs WHERE entry_id=%s", (entry_id,))
    cur.execute("""INSERT INTO nutrition_logs (user_id, entry_id, log_date, calories, protein_g, carbs_g, fat_g)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (uid, entry_id, e["meal_date"], L.round2(e["calories"] * s), L.round2(e["protein_g"] * s),
                 L.round2(e["carbs_g"] * s), L.round2(e["fat_g"] * s)))
    cur.execute("""SELECT i.name, ri.quantity, ri.unit, inv.item_id, inv.quantity AS have, inv.unit AS have_unit
                   FROM recipe_ingredients ri
                   JOIN ingredients i ON i.ingredient_id = ri.ingredient_id
                   JOIN inventory_items inv ON inv.ingredient_id = ri.ingredient_id AND inv.user_id=%s
                   WHERE ri.recipe_id=%s""", (uid, e["recipe_id"]))
    used, skipped = [], []
    for row in cur.fetchall():
        need = L.scale_quantity(row["quantity"], e["base_servings"], s)
        result = L.deduct_inventory(row["have"], row["have_unit"], need, row["unit"])
        if result is None:
            skipped.append(row["name"])
            continue
        remaining, amount = result
        cur.execute("UPDATE inventory_items SET quantity=%s, updated_at=NOW() WHERE item_id=%s",
                    (remaining, row["item_id"]))
        used.append({"name": row["name"], "used": float(amount), "unit": row["unit"], "remaining": float(remaining)})
    return {"used": used, "skipped_units": skipped}


def _complete_log_only(cur, uid, entry_id):
    cur.execute("""SELECT e.meal_date, e.servings, r.calories, r.protein_g, r.carbs_g, r.fat_g
                   FROM calendar_entries e JOIN recipes r ON r.recipe_id=e.recipe_id WHERE e.entry_id=%s""", (entry_id,))
    e = cur.fetchone()
    s = Decimal(e["servings"])
    cur.execute("""UPDATE nutrition_logs SET log_date=%s, calories=%s, protein_g=%s, carbs_g=%s, fat_g=%s
                   WHERE entry_id=%s""",
                (e["meal_date"], L.round2(e["calories"] * s), L.round2(e["protein_g"] * s),
                 L.round2(e["carbs_g"] * s), L.round2(e["fat_g"] * s), entry_id))


def _plan_needs(cur, uid, start, end):
    cur.execute("""SELECT ri.ingredient_id, i.name, ri.unit, i.price_per_unit AS price,
                          SUM(ri.quantity * e.servings / r.base_servings) AS qty
                   FROM calendar_entries e
                   JOIN meal_plans p ON p.plan_id = e.plan_id
                   JOIN recipes r ON r.recipe_id = e.recipe_id
                   JOIN recipe_ingredients ri ON ri.recipe_id = r.recipe_id
                   JOIN ingredients i ON i.ingredient_id = ri.ingredient_id
                   WHERE p.user_id=%s AND e.meal_date BETWEEN %s AND %s AND NOT e.is_completed
                   GROUP BY ri.ingredient_id, i.name, ri.unit, i.price_per_unit""", (uid, start, end))
    needs = {}
    for r in cur.fetchall():
        needs[(r["ingredient_id"], r["unit"])] = {"ingredient_id": r["ingredient_id"], "name": r["name"],
                                                  "unit": r["unit"], "qty": r["qty"], "price": r["price"]}
    cur.execute("SELECT ingredient_id, quantity, unit FROM inventory_items WHERE user_id=%s", (uid,))
    pantry = {r["ingredient_id"]: (r["quantity"], r["unit"]) for r in cur.fetchall()}
    return L.grocery_shortfall(needs, pantry)


def _grocery_preview(cur, uid, start, end):
    if end < start:
        raise HTTPException(400, "End date must be on or after the start date")
    if (end - start).days > 62:
        raise HTTPException(400, "Choose a range of 62 days or less")
    items = _plan_needs(cur, uid, start, end)
    total = sum((i["line_cost"] for i in items), Decimal("0"))
    cur.execute("""SELECT (limit_amount - spent_amount) AS left_amount FROM budgets
                   WHERE user_id=%s AND period_start<=%s AND period_end>=%s
                   ORDER BY period_start DESC LIMIT 1""", (uid, end, start))
    b = cur.fetchone()
    if b:
        limit, label = Decimal(b["left_amount"]), "remaining in your budget for this period"
    else:
        limit, label = Decimal(str(_settings(cur, uid)["weekly_budget"])), "weekly budget"
    over = total > limit
    warning = None
    if over:
        warning = f"Estimated cost ${total} is over your {label} (${L.money(limit)})."
    return {"start": start, "end": end, "items": [
                {**i, "needed": float(i["needed"]), "in_stock": float(i["in_stock"]), "to_buy": float(i["to_buy"]),
                 "unit_price": float(i["unit_price"]), "line_cost": float(i["line_cost"])} for i in items],
            "total_cost": float(total), "budget_limit": float(L.money(limit)), "budget_label": label,
            "over_budget": over, "warning": warning}


def submit_to_delivery_service(order):
    """Send an order to the external delivery service (the 'DeliveryService' class in the class diagram).
    Set DELIVERY_API_URL (and optionally DELIVERY_API_KEY) to use a real service. Without it, the
    order is accepted by a built-in simulator so the demo works with no outside account."""
    url = os.getenv("DELIVERY_API_URL", "").strip()
    if not url:
        return {"status": "placed", "confirmation": "SIM-" + uuid.uuid4().hex[:8].upper(), "simulated": True}
    headers = {"Content-Type": "application/json"}
    key = os.getenv("DELIVERY_API_KEY", "").strip()
    if key:
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(url, data=json.dumps(order, default=str).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.load(resp)
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        raise DeliveryError(str(exc)) from exc
    status = data.get("status") if isinstance(data, dict) else None
    return {"status": status if status in ORDER_STATUSES else "placed",
            "confirmation": str((data or {}).get("confirmation", "")) if isinstance(data, dict) else "",
            "simulated": False}


def refresh_expiry_notifications(cur, uid, today):
    """UC-08: create a notification for pantry items that are expired or expire within 3 days."""
    cur.execute("""SELECT g.name, i.expiration_date FROM inventory_items i
                   JOIN ingredients g ON g.ingredient_id = i.ingredient_id
                   WHERE i.user_id=%s AND i.expiration_date IS NOT NULL AND i.expiration_date <= %s""",
                (uid, today + timedelta(days=L.EXPIRY_DAYS)))
    for r in cur.fetchall():
        days = (r["expiration_date"] - today).days
        if days < 0:
            msg = f"{r['name']} expired on {r['expiration_date'].isoformat()}"
        elif days == 0:
            msg = f"{r['name']} expires today"
        else:
            msg = f"{r['name']} expires in {days} day{'s' if days != 1 else ''}"
        cur.execute("""INSERT INTO notifications (user_id, message)
                       SELECT %s, %s WHERE NOT EXISTS
                       (SELECT 1 FROM notifications WHERE user_id=%s AND message=%s)""", (uid, msg, uid, msg))


# ---------------------------------------------------------------- router
def build_router(current_user, db):
    router = APIRouter()

    # ============================ UC-05 recipes ============================
    @router.get("/api/recipes")
    def list_recipes(q: str | None = None, category: str | None = None, max_minutes: int | None = None,
                     diet: str | None = None, favorites: bool = False, apply_preferences: bool = True,
                     page: int = 1, user=Depends(current_user), conn=Depends(db)):
        if page < 1:
            raise HTTPException(400, "page must be 1 or higher")
        if category and category not in RECIPE_CATEGORIES:
            raise HTTPException(400, "Unknown category")
        if diet and diet not in L.DIET_TYPES:
            raise HTTPException(400, "Unknown diet")
        if max_minutes is not None and not (1 <= max_minutes <= 1440):
            raise HTTPException(400, "max_minutes must be between 1 and 1440")
        uid = user["user_id"]
        with conn.cursor() as cur:
            saved_diet, saved_allergens = L.split_preferences(_pref_names(cur, uid))
            use_diet = diet or (saved_diet if apply_preferences else "Balanced")
            allergen_chips = saved_allergens if apply_preferences else []
            conds, params = ["r.is_approved"], []
            if q and q.strip():
                like = "%" + L.escape_like(q) + "%"
                conds.append("(r.title ILIKE %s OR r.description ILIKE %s OR EXISTS (SELECT 1 FROM recipe_ingredients ri "
                             "JOIN ingredients i ON i.ingredient_id = ri.ingredient_id "
                             "WHERE ri.recipe_id = r.recipe_id AND i.name ILIKE %s))")
                params += [like, like, like]
            if category:
                conds.append("%s = ANY(r.tags)")
                params.append(category)
            if max_minutes is not None:
                conds.append("COALESCE(r.prep_minutes,0) + COALESCE(r.cook_minutes,0) <= %s")
                params.append(max_minutes)
            if allergen_chips:
                conds.append("NOT (r.allergens && %s::text[])")
                params.append([L.ALLERGEN_TOKEN[a] for a in allergen_chips])
            clause = L.diet_sql(use_diet)
            if clause:
                conds.append(clause)
            if favorites:
                conds.append("EXISTS (SELECT 1 FROM recipe_favorites f WHERE f.recipe_id = r.recipe_id AND f.user_id=%s)")
                params.append(uid)
            where = " AND ".join(conds)
            cur.execute(f"SELECT COUNT(*) AS n FROM recipes r WHERE {where}", params)
            total = cur.fetchone()["n"]
            cur.execute(f"""SELECT {RECIPE_COLS},
                                   EXISTS (SELECT 1 FROM recipe_favorites f WHERE f.recipe_id = r.recipe_id AND f.user_id=%s) AS is_favorite
                            FROM recipes r WHERE {where}
                            ORDER BY r.title LIMIT %s OFFSET %s""",
                        [uid] + params + [L.PAGE_SIZE, (page - 1) * L.PAGE_SIZE])
            items = cur.fetchall()
        pages = max(1, -(-total // L.PAGE_SIZE))
        return {"items": items, "total": total, "page": page, "pages": pages, "page_size": L.PAGE_SIZE,
                "applied": {"diet": use_diet, "allergens": allergen_chips, "preferences": apply_preferences}}

    @router.get("/api/recipes/{recipe_id}")
    def recipe_detail(recipe_id: int, servings: Decimal | None = None,
                      user=Depends(current_user), conn=Depends(db)):
        with conn.cursor() as cur:
            cur.execute(f"""SELECT {RECIPE_COLS}, r.instructions,
                                   EXISTS (SELECT 1 FROM recipe_favorites f WHERE f.recipe_id = r.recipe_id AND f.user_id=%s) AS is_favorite
                            FROM recipes r WHERE r.recipe_id=%s AND r.is_approved""", (user["user_id"], recipe_id))
            r = cur.fetchone()
            if not r:
                raise HTTPException(404, "Recipe not found")
            target = Decimal(r["base_servings"]) if servings is None else servings
            if target <= 0 or target > 100:
                raise HTTPException(400, "Servings must be above 0 and at most 100")
            cur.execute("""SELECT i.name, ri.quantity, ri.unit FROM recipe_ingredients ri
                           JOIN ingredients i ON i.ingredient_id = ri.ingredient_id
                           WHERE ri.recipe_id=%s ORDER BY i.name""", (recipe_id,))
            ingredients = [{"name": x["name"], "unit": x["unit"],
                            "quantity": float(L.scale_quantity(x["quantity"], r["base_servings"], target))}
                           for x in cur.fetchall()]
        total = {k: float(L.round2(Decimal(str(r[k])) * target)) for k in ("calories", "protein_g", "carbs_g", "fat_g")}
        total["cost"] = float(L.round2(Decimal(str(r["cost_per_serving"])) * target))
        return {**r, "servings": float(L.round2(target)), "ingredients": ingredients, "total": total}

    @router.put("/api/recipes/{recipe_id}/favorite")
    def add_favorite(recipe_id: int, user=Depends(current_user), conn=Depends(db)):
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM recipes WHERE recipe_id=%s AND is_approved", (recipe_id,))
            if not cur.fetchone():
                raise HTTPException(404, "Recipe not found")
            cur.execute("INSERT INTO recipe_favorites (user_id, recipe_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",
                        (user["user_id"], recipe_id))
        conn.commit()
        return {"recipe_id": recipe_id, "is_favorite": True}

    @router.delete("/api/recipes/{recipe_id}/favorite")
    def remove_favorite(recipe_id: int, user=Depends(current_user), conn=Depends(db)):
        with conn.cursor() as cur:
            cur.execute("DELETE FROM recipe_favorites WHERE user_id=%s AND recipe_id=%s", (user["user_id"], recipe_id))
        conn.commit()
        return {"recipe_id": recipe_id, "is_favorite": False}

    # ============================ UC-06 calendar ============================
    @router.get("/api/calendar")
    def calendar_list(start: date | None = None, end: date | None = None,
                      user=Depends(current_user), conn=Depends(db)):
        if start is None or end is None:
            start, end = L.week_bounds(date.today())
        if end < start:
            raise HTTPException(400, "End date must be on or after the start date")
        if (end - start).days > 62:
            raise HTTPException(400, "Choose a range of 62 days or less")
        with conn.cursor() as cur:
            cur.execute(ENTRY_SQL + " WHERE p.user_id=%s AND e.meal_date BETWEEN %s AND %s " + ENTRY_ORDER,
                        (user["user_id"], start, end))
            return cur.fetchall()

    @router.post("/api/calendar", status_code=201)
    def calendar_add(body: CalendarIn, user=Depends(current_user), conn=Depends(db)):
        _check_date(body.meal_date)
        uid = user["user_id"]
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM recipes WHERE recipe_id=%s AND is_approved", (body.recipe_id,))
            if not cur.fetchone():
                raise HTTPException(404, "Recipe not found")
            plan_id = _plan_for(cur, uid, body.meal_date)
            cur.execute("""INSERT INTO calendar_entries (plan_id, recipe_id, meal_date, meal_type, servings)
                           VALUES (%s,%s,%s,%s,%s) RETURNING entry_id""",
                        (plan_id, body.recipe_id, body.meal_date, body.meal_type, body.servings))
            entry_id = cur.fetchone()["entry_id"]
            row = _entry(cur, uid, entry_id)
        conn.commit()
        return row

    @router.patch("/api/calendar/{entry_id}")
    def calendar_update(entry_id: int, body: CalendarPatch, user=Depends(current_user), conn=Depends(db)):
        uid = user["user_id"]
        changes = body.model_dump(exclude_unset=True)
        with conn.cursor() as cur:
            cur.execute("""SELECT e.is_completed FROM calendar_entries e JOIN meal_plans p ON p.plan_id=e.plan_id
                           WHERE e.entry_id=%s AND p.user_id=%s FOR UPDATE OF e""", (entry_id, uid))
            cur_state = cur.fetchone()
            if not cur_state:
                raise HTTPException(404, "Meal not found")
            sets, params = [], []
            if changes.get("meal_date") is not None:
                _check_date(changes["meal_date"])
                sets += ["meal_date=%s", "plan_id=%s"]
                params += [changes["meal_date"], _plan_for(cur, uid, changes["meal_date"])]
            if changes.get("meal_type") is not None:
                sets.append("meal_type=%s")
                params.append(changes["meal_type"])
            if changes.get("servings") is not None:
                sets.append("servings=%s")
                params.append(changes["servings"])
            if sets:
                cur.execute("UPDATE calendar_entries SET " + ", ".join(sets) + " WHERE entry_id=%s", params + [entry_id])
            inventory = None
            if changes.get("is_completed") is not None and changes["is_completed"] != cur_state["is_completed"]:
                cur.execute("UPDATE calendar_entries SET is_completed=%s WHERE entry_id=%s",
                            (changes["is_completed"], entry_id))
                if changes["is_completed"]:
                    inventory = _complete_entry(cur, uid, entry_id)
                else:
                    cur.execute("DELETE FROM nutrition_logs WHERE entry_id=%s", (entry_id,))
            elif cur_state["is_completed"] and sets:
                # an eaten meal that was edited: keep the nutrition log in step with the new servings/date
                _complete_log_only(cur, uid, entry_id)
            row = _entry(cur, uid, entry_id)
        conn.commit()
        return {**row, "inventory": inventory}

    @router.delete("/api/calendar/{entry_id}")
    def calendar_delete(entry_id: int, user=Depends(current_user), conn=Depends(db)):
        with conn.cursor() as cur:
            cur.execute("""SELECT e.entry_id FROM calendar_entries e JOIN meal_plans p ON p.plan_id=e.plan_id
                           WHERE e.entry_id=%s AND p.user_id=%s FOR UPDATE OF e""", (entry_id, user["user_id"]))
            if not cur.fetchone():
                raise HTTPException(404, "Meal not found")
            cur.execute("DELETE FROM nutrition_logs WHERE entry_id=%s", (entry_id,))
            cur.execute("DELETE FROM calendar_entries WHERE entry_id=%s", (entry_id,))
        conn.commit()
        return {"ok": True}

    # ============================ dashboard + nutrition ============================
    @router.get("/api/summary")
    def summary(date_: date | None = Query(default=None, alias="date"), user=Depends(current_user), conn=Depends(db)):
        uid = user["user_id"]
        d = date_ or date.today()
        monday, sunday = L.week_bounds(d)
        with conn.cursor() as cur:
            s = _settings(cur, uid)
            cur.execute(ENTRY_SQL + " WHERE p.user_id=%s AND e.meal_date BETWEEN %s AND %s " + ENTRY_ORDER,
                        (uid, monday, sunday))
            week_entries = cur.fetchall()
            cur.execute("""SELECT log_date, SUM(calories)::float AS calories, SUM(protein_g)::float AS protein_g,
                                  SUM(carbs_g)::float AS carbs_g, SUM(fat_g)::float AS fat_g
                           FROM nutrition_logs WHERE user_id=%s AND log_date BETWEEN %s AND %s GROUP BY log_date""",
                        (uid, monday, sunday))
            logs = {r["log_date"]: r for r in cur.fetchall()}
            cur.execute("SELECT COUNT(*) AS n FROM inventory_items WHERE user_id=%s", (uid,))
            pantry = cur.fetchone()["n"]
            cur.execute("SELECT glasses FROM water_logs WHERE user_id=%s AND log_date=%s", (uid, d))
            w = cur.fetchone()
        today_entries = [e for e in week_entries if e["meal_date"] == d]
        eaten = logs.get(d, {})
        days, labels = [], ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        for i in range(7):
            day = monday + timedelta(days=i)
            days.append({"date": day, "label": labels[i],
                         "planned_calories": round(sum(e["calories"] for e in week_entries if e["meal_date"] == day), 1),
                         "eaten_calories": round((logs.get(day) or {}).get("calories", 0.0), 1)})
        planned_days = [x["planned_calories"] for x in days if x["planned_calories"] > 0]
        return {
            "date": d, "week_start": monday, "week_end": sunday, "first_name": user["first_name"],
            "goals": {"calories": s["calorie_goal"], **_macro_goals(s["calorie_goal"]),
                      "weekly_budget": s["weekly_budget"], "primary_goal": s["primary_goal"]},
            "eaten": {k: round(eaten.get(k, 0.0), 1) for k in ("calories", "protein_g", "carbs_g", "fat_g")},
            "today": {"planned_count": len(today_entries),
                      "eaten_count": sum(1 for e in today_entries if e["is_completed"]),
                      "planned_calories": round(sum(e["calories"] for e in today_entries), 1),
                      "meals": today_entries},
            "week": {"days": days, "meals_planned": len(week_entries),
                     "est_cost": round(sum(e["cost"] for e in week_entries), 2),
                     "avg_daily_calories": round(sum(planned_days) / len(planned_days), 0) if planned_days else 0},
            "pantry_count": pantry, "water_glasses": w["glasses"] if w else 0,
        }

    # ============================ water tracker ============================
    @router.get("/api/water")
    def water_get(date_: date | None = Query(default=None, alias="date"), user=Depends(current_user), conn=Depends(db)):
        d = date_ or date.today()
        with conn.cursor() as cur:
            cur.execute("SELECT glasses FROM water_logs WHERE user_id=%s AND log_date=%s", (user["user_id"], d))
            row = cur.fetchone()
        return {"date": d, "glasses": row["glasses"] if row else 0}

    @router.put("/api/water")
    def water_set(body: WaterIn, user=Depends(current_user), conn=Depends(db)):
        d = body.log_date or date.today()
        _check_date(d)
        with conn.cursor() as cur:
            cur.execute("""INSERT INTO water_logs (user_id, log_date, glasses) VALUES (%s,%s,%s)
                           ON CONFLICT (user_id, log_date) DO UPDATE SET glasses=EXCLUDED.glasses""",
                        (user["user_id"], d, body.glasses))
        conn.commit()
        return {"date": d, "glasses": body.glasses}

    # ============================ UC-04 preferences ============================
    @router.get("/api/preferences")
    def prefs_get(user=Depends(current_user), conn=Depends(db)):
        uid = user["user_id"]
        with conn.cursor() as cur:
            cur.execute("SELECT first_name, last_name, email, household_size FROM users WHERE user_id=%s", (uid,))
            u = cur.fetchone()
            s = _settings(cur, uid)
            diet, allergens = L.split_preferences(_pref_names(cur, uid))
        return {**u, "diet_type": diet, "allergens": allergens, **{k: s[k] for k in
                ("primary_goal", "calorie_goal", "weekly_budget", "meals_per_day")}}

    @router.put("/api/preferences")
    def prefs_save(body: PrefsIn, user=Depends(current_user), conn=Depends(db)):
        uid = user["user_id"]
        email = body.email.lower()
        allergens = list(dict.fromkeys(body.allergens))
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM users WHERE email=%s AND user_id<>%s", (email, uid))
            if cur.fetchone():
                raise HTTPException(409, "That email is already used by another account")
            try:
                cur.execute("""UPDATE users SET first_name=%s, last_name=%s, email=%s, household_size=%s
                               WHERE user_id=%s""",
                            (body.first_name.strip(), body.last_name.strip(), email, body.household_size, uid))
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                raise HTTPException(409, "That email is already used by another account")
            cur.execute("""INSERT INTO user_settings (user_id, primary_goal, calorie_goal, weekly_budget, meals_per_day)
                           VALUES (%s,%s,%s,%s,%s)
                           ON CONFLICT (user_id) DO UPDATE SET primary_goal=EXCLUDED.primary_goal,
                              calorie_goal=EXCLUDED.calorie_goal, weekly_budget=EXCLUDED.weekly_budget,
                              meals_per_day=EXCLUDED.meals_per_day""",
                        (uid, body.primary_goal, body.calorie_goal, body.weekly_budget, body.meals_per_day))
            names = ([L.DIET_ROW[body.diet_type]] if body.diet_type in L.DIET_ROW else []) + \
                    [L.ALLERGEN_ROW[a] for a in allergens]
            cur.execute("DELETE FROM user_dietary_preferences WHERE user_id=%s", (uid,))
            if names:
                cur.execute("""INSERT INTO user_dietary_preferences (user_id, preference_id)
                               SELECT %s, preference_id FROM dietary_preferences WHERE name = ANY(%s::text[])""",
                            (uid, names))
            # keep the Recommendations page in step with these choices (UC-04 -> recommendations)
            cur.execute("""INSERT INTO recommendation_settings (user_id, diet, allergies) VALUES (%s,%s,%s)
                           ON CONFLICT (user_id) DO UPDATE SET diet=EXCLUDED.diet, allergies=EXCLUDED.allergies""",
                        (uid, L.REC_DIET.get(body.diet_type, "any"), sorted({L.REC_ALLERGEN[a] for a in allergens})))
        conn.commit()
        return {"ok": True}

    @router.post("/api/password")
    def change_password(body: PasswordIn, user=Depends(current_user), session_id: str | None = Cookie(default=None),
                        conn=Depends(db)):
        if len(body.new_password.encode()) > 72:
            raise HTTPException(422, "Password must be 72 bytes or fewer")
        with conn.cursor() as cur:
            cur.execute("SELECT password_hash FROM users WHERE user_id=%s", (user["user_id"],))
            row = cur.fetchone()
            if not bcrypt.checkpw(body.current_password.encode(), row["password_hash"].encode()):
                raise HTTPException(400, "Current password is incorrect")
            new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
            cur.execute("UPDATE users SET password_hash=%s WHERE user_id=%s", (new_hash, user["user_id"]))
            if session_id:      # sign out every other device
                cur.execute("UPDATE user_sessions SET revoked=TRUE WHERE user_id=%s AND session_id::text<>%s",
                            (user["user_id"], session_id))
        conn.commit()
        return {"ok": True}

    # ============================ UC-08 inventory edit + notifications ============================
    @router.patch("/api/inventory/{item_id}")
    def inventory_update(item_id: int, body: InventoryPatch, user=Depends(current_user), conn=Depends(db)):
        changes = body.model_dump(exclude_unset=True)
        if not changes:
            raise HTTPException(400, "Nothing to update")
        for required in ("quantity", "unit"):
            if required in changes and changes[required] is None:
                raise HTTPException(400, f"{required} cannot be empty")
        sets, params = [], []
        for col in ("quantity", "unit", "expiration_date"):
            if col in changes:
                sets.append(f"{col}=%s")
                params.append(changes[col].strip() if col == "unit" else changes[col])
        with conn.cursor() as cur:
            cur.execute("UPDATE inventory_items SET " + ", ".join(sets) + ", updated_at=NOW() "
                        "WHERE item_id=%s AND user_id=%s RETURNING item_id", params + [item_id, user["user_id"]])
            if not cur.fetchone():
                raise HTTPException(404, "Item not found")
        conn.commit()
        return {"ok": True}

    @router.get("/api/notifications")
    def notifications(today: date | None = None, user=Depends(current_user), conn=Depends(db)):
        uid = user["user_id"]
        with conn.cursor() as cur:
            refresh_expiry_notifications(cur, uid, today or date.today())
            cur.execute("""SELECT notification_id, message, is_read, created_at FROM notifications
                           WHERE user_id=%s ORDER BY is_read, created_at DESC, notification_id DESC LIMIT 20""", (uid,))
            rows = cur.fetchall()
        conn.commit()
        return rows

    @router.patch("/api/notifications/{notification_id}/read")
    def notification_read(notification_id: int, user=Depends(current_user), conn=Depends(db)):
        with conn.cursor() as cur:
            cur.execute("UPDATE notifications SET is_read=TRUE WHERE notification_id=%s AND user_id=%s "
                        "RETURNING notification_id", (notification_id, user["user_id"]))
            if not cur.fetchone():
                raise HTTPException(404, "Notification not found")
        conn.commit()
        return {"ok": True}

    # ============================ UC-09 grocery list from the plan + delivery ============================
    @router.get("/api/grocery/preview")
    def grocery_preview(start: date, end: date, user=Depends(current_user), conn=Depends(db)):
        with conn.cursor() as cur:
            return _grocery_preview(cur, user["user_id"], start, end)

    # ============================ goal- and calendar-aware recommendations ============================
    def _recommend(cur, uid, limit=12, focus="all"):
        cur.execute("SELECT diet, allergies, max_cost::float AS max_cost FROM recommendation_settings WHERE user_id=%s", (uid,))
        rs = cur.fetchone() or {"diet": "any", "allergies": [], "max_cost": 8.0}
        st = _settings(cur, uid)
        cur.execute("SELECT goal_type, target_value::float AS target_value, current_value::float AS current_value, "
                    "start_value::float AS start_value, label, unit FROM goals WHERE user_id=%s AND status='active'", (uid,))
        goals = [dict(g) for g in cur.fetchall()]
        targets = L.goal_targets(goals, st["calorie_goal"], st["meals_per_day"], st["primary_goal"])
        cur.execute("""SELECT ii.ingredient_id, g.name, ii.expiration_date FROM inventory_items ii
                       JOIN ingredients g ON g.ingredient_id = ii.ingredient_id
                       WHERE ii.user_id=%s AND ii.quantity > 0""", (uid,))
        pantry = {r["ingredient_id"]: (r["name"], r["expiration_date"]) for r in cur.fetchall()}
        monday, sunday = L.week_bounds(date.today())
        cur.execute("""SELECT DISTINCT r.title FROM calendar_entries e JOIN meal_plans p ON p.plan_id=e.plan_id
                       JOIN recipes r ON r.recipe_id=e.recipe_id
                       WHERE p.user_id=%s AND e.meal_date BETWEEN %s AND %s""", (uid, monday, sunday))
        planned = {r["title"] for r in cur.fetchall()}
        cur.execute("SELECT " + RECIPE_COLS + """, array_agg(i.name ORDER BY i.name) AS ingredient_names,
                           array_agg(ri.ingredient_id) AS ingredient_ids
                    FROM recipes r JOIN recipe_ingredients ri ON ri.recipe_id=r.recipe_id
                    JOIN ingredients i ON i.ingredient_id=ri.ingredient_id
                    WHERE r.is_approved GROUP BY r.recipe_id""")
        diet = rs["diet"]
        banned = {L.RECIPE_ALLERGEN_FOR.get(a, a) for a in (rs["allergies"] or [])}
        out = []
        today = date.today()
        for r in cur.fetchall():
            tags, allergens = set(r["tags"] or []), set(r["allergens"] or [])
            if diet in ("vegetarian", "vegan") and diet not in tags and not (diet == "vegetarian" and "vegan" in tags):
                continue
            if diet == "high-protein" and "high-protein" not in tags and r["protein_g"] < 25:
                continue
            if diet == "gluten-free" and "gluten" in allergens:
                continue
            if banned & allergens or r["cost_per_serving"] > rs["max_cost"]:
                continue
            hits = []
            have, missing, expiring = [], [], []
            for iid, name in zip(r["ingredient_ids"], r["ingredient_names"]):
                if iid not in pantry:
                    missing.append(name)
                else:
                    have.append(name)
                    if pantry[iid][1] and (pantry[iid][1] - today).days <= 3:
                        expiring.append(name)
                if iid in pantry:
                    exp = pantry[iid][1]
                    hits.append((pantry[iid][0], bool(exp and (exp - today).days <= 3)))
            hits.sort(key=lambda h: not h[1])
            score, reasons = L.score_recipe(r, targets, hits, planned)
            out.append({"recipe_id": r["recipe_id"], "id": r["recipe_id"], "name": r["title"], "emoji": r["emoji"],
                        "description": r["description"], "tags": list(tags), "allergens": list(allergens),
                        "ingredients": r["ingredient_names"], "minutes": r["minutes"], "cost": r["cost_per_serving"],
                        "protein": r["protein_g"], "calories": r["calories"], "base_servings": r["base_servings"],
                        "score": round(score, 1), "reasons": reasons,
                        "fits_goal": any("goal" in x or "target" in x for x in reasons),
                        "have": have, "missing": missing, "expiring": expiring,
                        "pantry_pct": round(100 * len(have) / max(1, len(have) + len(missing)))})
        out.sort(key=lambda m: (-m["score"], m["cost"]))
        if focus == "pantry":
            out = [m for m in out if m["have"]]
            out.sort(key=lambda m: (-len(m["expiring"]), -m["pantry_pct"], -m["score"]))
        elif focus == "goals":
            out = [m for m in out if m["fits_goal"]]
        cur.execute("""SELECT g.name, ii.expiration_date FROM inventory_items ii
                       JOIN ingredients g ON g.ingredient_id=ii.ingredient_id
                       WHERE ii.user_id=%s AND ii.quantity > 0""", (uid,))
        prow = cur.fetchall()
        pantry_info = {"items": len(prow),
                       "expiring": sorted(r["name"] for r in prow if r["expiration_date"] and (r["expiration_date"] - today).days <= 3)}
        goal_cards = [{"goal_type": g["goal_type"], "label": g["label"], "target_value": g["target_value"],
                       "current_value": g["current_value"], "unit": g["unit"],
                       "progress": L.goal_progress(g["goal_type"], g["start_value"], g["current_value"], g["target_value"])}
                      for g in goals]
        return {"meals": out[:limit], "count": len(out), "focus": focus, "pantry": pantry_info, "settings": {"diet": rs["diet"], "allergies": rs["allergies"] or [], "max_cost": rs["max_cost"]},
                "goals": goal_cards, "per_meal_calories": round(targets["per_meal_calories"]),
                "per_meal_protein": round(targets["per_meal_protein"]) if targets["per_meal_protein"] else None,
                "note": "Costs and nutrition are estimates per serving. Check ingredient labels and cross-contact risks for allergies."}

    @router.get("/api/recommendations/meals")
    def recommended_meals(focus: str = "all", user=Depends(current_user), conn=Depends(db)):
        if focus not in ("all", "pantry", "goals"):
            raise HTTPException(400, "focus must be all, pantry or goals")
        with conn.cursor() as cur:
            return _recommend(cur, user["user_id"], focus=focus)

    # ============================ budget overview (budgets + grocery list + orders) ============================
    @router.get("/api/budget/overview")
    def budget_overview(user=Depends(current_user), conn=Depends(db)):
        uid = user["user_id"]
        today = date.today()
        with conn.cursor() as cur:
            cur.execute("""SELECT budget_id, period_start, period_end, limit_amount::float AS limit_amount,
                                  spent_amount::float AS manual_spent FROM budgets
                           WHERE user_id=%s ORDER BY period_start DESC, budget_id DESC LIMIT 30""", (uid,))
            rows = cur.fetchall()
            cur.execute("""SELECT COALESCE(SUM(estimated_price),0)::float AS amt, COUNT(*) AS n FROM grocery_list_items
                           WHERE user_id=%s AND NOT purchased""", (uid,))
            on_list = cur.fetchone()
            budgets = []
            for b in rows:
                cur.execute("""SELECT COALESCE(SUM(estimated_price),0)::float AS amt FROM grocery_list_items
                               WHERE user_id=%s AND purchased AND created_at::date BETWEEN %s AND %s""",
                            (uid, b["period_start"], b["period_end"]))
                bought = cur.fetchone()["amt"]
                cur.execute("""SELECT COALESCE(SUM(total_cost),0)::float AS amt FROM grocery_orders
                               WHERE user_id=%s AND status IN ('placed','shipped','delivered')
                                 AND created_at::date BETWEEN %s AND %s""",
                            (uid, b["period_start"], b["period_end"]))
                ordered = cur.fetchone()["amt"]
                spent = round(b["manual_spent"] + bought + ordered, 2)
                lim = b["limit_amount"]
                budgets.append({"budget_id": b["budget_id"], "period_start": b["period_start"], "period_end": b["period_end"],
                                "limit": lim, "manual": round(b["manual_spent"], 2), "groceries": round(bought, 2),
                                "orders": round(ordered, 2), "spent": spent, "remaining": round(lim - spent, 2),
                                "pct": round(100 * spent / lim) if lim else 0,
                                "current": b["period_start"] <= today <= b["period_end"]})
            cur.execute("SELECT weekly_budget::float AS wk FROM user_settings WHERE user_id=%s", (uid,))
            w = cur.fetchone()
        current = next((b for b in budgets if b["current"]), None)
        return {"budgets": budgets, "current": current, "on_list_total": round(on_list["amt"], 2), "on_list_count": on_list["n"],
                "weekly_budget": w["wk"] if w else 100.0,
                "after_list": round(current["remaining"] - on_list["amt"], 2) if current else None}

    # ============================ shopping suggestions from the calendar ============================
    @router.get("/api/grocery/suggestions")
    def grocery_suggestions(start: date, end: date, user=Depends(current_user), conn=Depends(db)):
        uid = user["user_id"]
        with conn.cursor() as cur:
            plan = _grocery_preview(cur, uid, start, end)
            cur.execute("""SELECT ri.ingredient_id, r.title, e.meal_date FROM calendar_entries e
                           JOIN meal_plans p ON p.plan_id=e.plan_id JOIN recipes r ON r.recipe_id=e.recipe_id
                           JOIN recipe_ingredients ri ON ri.recipe_id=r.recipe_id
                           WHERE p.user_id=%s AND e.meal_date BETWEEN %s AND %s AND NOT e.is_completed
                           ORDER BY e.meal_date""", (uid, start, end))
            used = {}
            for r in cur.fetchall():
                used.setdefault(r["ingredient_id"], []).append(f'{r["title"]} ({r["meal_date"].strftime("%a")})')
            cur.execute("SELECT lower(name) AS n, lower(unit) AS u FROM grocery_list_items WHERE user_id=%s AND NOT purchased", (uid,))
            on_list = {(r["n"], r["u"]) for r in cur.fetchall()}
            needed = []
            for i in plan["items"]:
                needed.append({**i, "used_in": used.get(i["ingredient_id"], []),
                               "on_list": (i["name"].lower(), i["unit"].lower()) in on_list})
            cur.execute("""SELECT ii.ingredient_id, g.name, g.price_per_unit::float AS price, ii.quantity::float AS quantity,
                                  ii.unit, ii.expiration_date FROM inventory_items ii
                           JOIN ingredients g ON g.ingredient_id=ii.ingredient_id WHERE ii.user_id=%s""", (uid,))
            running_low = []
            for r in cur.fetchall():
                expired = r["expiration_date"] and r["expiration_date"] < date.today()
                low = r["quantity"] <= 2
                if not (low or expired):
                    continue
                why = "Expired - replace it" if expired else f'Only {r["quantity"]:g} {r["unit"]} left'
                if r["ingredient_id"] in used:
                    why += " and you need it for " + ", ".join(used[r["ingredient_id"]][:2])
                running_low.append({"ingredient_id": r["ingredient_id"], "name": r["name"], "unit": r["unit"], "price": r["price"],
                                    "reason": why, "on_list": (r["name"].lower(), r["unit"].lower()) in on_list,
                                    "needed_for_plan": r["ingredient_id"] in used})
            running_low.sort(key=lambda x: not x["needed_for_plan"])
            ideas = _recommend(cur, uid, limit=3)["meals"]
        return {"start": start, "end": end, "needed": needed, "running_low": running_low,
                "meal_ideas": [{"recipe_id": m["recipe_id"], "name": m["name"], "emoji": m["emoji"], "calories": m["calories"],
                                "reasons": m["reasons"][:2]} for m in ideas],
                "total_cost": plan["total_cost"], "warning": plan["warning"], "planned_meals": len({t for v in used.values() for t in v}) > 0}

    class AddFromPlanIn(BaseModel):
        start: date
        end: date
        ingredient_ids: list[int] | None = None

    @router.post("/api/grocery/add-from-plan")
    def add_from_plan(body: AddFromPlanIn, user=Depends(current_user), conn=Depends(db)):
        uid = user["user_id"]
        with conn.cursor() as cur:
            plan = _grocery_preview(cur, uid, body.start, body.end)
            added = merged = 0
            for i in plan["items"]:
                if body.ingredient_ids is not None and i["ingredient_id"] not in body.ingredient_ids:
                    continue
                cur.execute("""SELECT item_id FROM grocery_list_items WHERE user_id=%s AND NOT purchased
                               AND lower(name)=lower(%s) AND lower(unit)=lower(%s) LIMIT 1""", (uid, i["name"], i["unit"]))
                row = cur.fetchone()
                if row:
                    cur.execute("""UPDATE grocery_list_items SET quantity = GREATEST(quantity, %s),
                                   estimated_price = GREATEST(estimated_price, %s) WHERE item_id=%s""",
                                (i["to_buy"], i["line_cost"], row["item_id"]))
                    merged += 1
                else:
                    cur.execute("""INSERT INTO grocery_list_items (user_id, name, quantity, unit, estimated_price)
                                   VALUES (%s,%s,%s,%s,%s)""", (uid, i["name"], i["to_buy"], i["unit"], i["line_cost"]))
                    added += 1
        conn.commit()
        return {"added": added, "merged": merged}

    def _send_order(conn, uid, order_id):
        with conn.cursor() as cur:
            cur.execute("""SELECT o.order_id, o.delivery_address, o.delivery_date, o.total_cost::float AS total_cost, o.status
                           FROM grocery_orders o WHERE o.order_id=%s AND o.user_id=%s""", (order_id, uid))
            o = cur.fetchone()
            if not o:
                raise HTTPException(404, "Order not found")
            if o["status"] != "draft":
                raise HTTPException(400, "Only draft orders can be sent")
            cur.execute("""SELECT i.name, oi.quantity::float AS quantity, oi.unit, oi.unit_price::float AS unit_price
                           FROM grocery_order_items oi JOIN ingredients i ON i.ingredient_id=oi.ingredient_id
                           WHERE oi.order_id=%s ORDER BY i.name""", (order_id,))
            o["items"] = cur.fetchall()
        try:
            result = submit_to_delivery_service(o)
        except DeliveryError:
            raise HTTPException(502, f"Delivery service unavailable. Your order #{order_id} was saved as a draft; "
                                     "use Send again to retry.")
        with conn.cursor() as cur:
            cur.execute("UPDATE grocery_orders SET status=%s WHERE order_id=%s", (result["status"], order_id))
        conn.commit()
        return {"order_id": order_id, "status": result["status"], "confirmation": result["confirmation"],
                "simulated": result["simulated"], "total_cost": o["total_cost"]}

    @router.post("/api/grocery/orders", status_code=201)
    def grocery_order_create(body: OrderIn, user=Depends(current_user), conn=Depends(db)):
        uid = user["user_id"]
        if body.delivery_date < date.today() - timedelta(days=1):
            raise HTTPException(400, "Delivery date cannot be in the past")
        with conn.cursor() as cur:
            preview = _grocery_preview(cur, uid, body.start, body.end)
            if not preview["items"]:
                raise HTTPException(400, "Nothing to order: your pantry already covers this meal plan")
            cur.execute("SELECT plan_id FROM meal_plans WHERE user_id=%s AND start_date<=%s AND end_date>=%s "
                        "ORDER BY plan_id LIMIT 1", (uid, body.start, body.start))
            plan = cur.fetchone()
            cur.execute("""INSERT INTO grocery_orders (user_id, plan_id, status, delivery_address, delivery_date, total_cost)
                           VALUES (%s,%s,'draft',%s,%s,%s) RETURNING order_id""",
                        (uid, plan["plan_id"] if plan else None, body.delivery_address.strip(),
                         body.delivery_date, preview["total_cost"]))
            order_id = cur.fetchone()["order_id"]
            for it in preview["items"]:
                cur.execute("""INSERT INTO grocery_order_items (order_id, ingredient_id, quantity, unit, unit_price)
                               VALUES (%s,%s,%s,%s,%s)""",
                            (order_id, it["ingredient_id"], it["to_buy"], it["unit"], it["unit_price"]))
        conn.commit()                      # the order is stored BEFORE the outside service is called
        result = _send_order(conn, uid, order_id)
        return {**result, "warning": preview["warning"]}

    @router.post("/api/grocery/orders/{order_id}/send")
    def grocery_order_send(order_id: int, user=Depends(current_user), conn=Depends(db)):
        return _send_order(conn, user["user_id"], order_id)

    @router.get("/api/grocery/orders")
    def grocery_orders(user=Depends(current_user), conn=Depends(db)):
        with conn.cursor() as cur:
            cur.execute("""SELECT o.order_id, o.status, o.total_cost::float AS total_cost, o.delivery_address,
                                  o.delivery_date, o.created_at,
                                  (SELECT COUNT(*) FROM grocery_order_items oi WHERE oi.order_id=o.order_id) AS item_count
                           FROM grocery_orders o WHERE o.user_id=%s ORDER BY o.order_id DESC LIMIT 20""",
                        (user["user_id"],))
            return cur.fetchall()

    return router

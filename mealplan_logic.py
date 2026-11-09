"""Pure helper functions for the MealMate AI Sprint 4 API (no database, no web framework).

Keeping the rules here makes them easy to test and easy to explain in the report:
  * week_bounds      - which Monday-Sunday meal plan a date belongs to
  * scale_quantity   - UC-07 recipe scaling (new = base x target / base_servings, 2 decimals)
  * diet_sql         - UC-04/UC-05 how a saved diet type filters recipes
  * allergen / diet maps between the Preferences page and the database
  * grocery_shortfall - UC-09 required ingredients minus what is in the pantry
"""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

MEAL_TYPES = ("breakfast", "lunch", "dinner", "snack")
EXPIRY_DAYS = 3                      # "expiring soon" window (UC-08)
PAGE_SIZE = 20                       # recipes per page (UC-05)

DIET_TYPES = ("Balanced", "Vegetarian", "Vegan", "Pescatarian", "Low Carb", "High Protein")
ALLERGEN_CHIPS = ("Peanuts", "Dairy", "Shellfish", "Gluten", "Soy")
GOALS = ("Maintain weight", "Lose weight", "Gain weight", "Build muscle", "Eat healthier")

# Preferences page label -> row name in dietary_preferences (UC-04 stores them there)
DIET_ROW = {"Vegetarian": "Vegetarian", "Vegan": "Vegan", "Pescatarian": "Pescatarian",
            "Low Carb": "Low Carb", "High Protein": "High Protein"}
ALLERGEN_ROW = {"Peanuts": "Peanut Allergy", "Dairy": "Dairy Allergy", "Shellfish": "Shellfish Allergy",
                "Gluten": "Gluten Allergy", "Soy": "Soy Allergy"}
# Preferences label -> token stored in recipes.allergens
ALLERGEN_TOKEN = {"Peanuts": "peanuts", "Dairy": "dairy", "Shellfish": "shellfish",
                  "Gluten": "gluten", "Soy": "soy"}
# Preferences label -> value used by the older Recommendations page
REC_DIET = {"Vegetarian": "vegetarian", "Vegan": "vegan", "High Protein": "high-protein"}
REC_ALLERGEN = {"Peanuts": "peanuts", "Dairy": "dairy", "Shellfish": "shellfish",
                "Gluten": "wheat", "Soy": "soy"}


def money(x):
    return Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def round2(x):
    """Round half up to 2 decimals (R-07)."""
    return Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def scale_quantity(base_qty, base_servings, target_servings):
    """new quantity = base quantity x (target servings / base servings), rounded to 2 decimals."""
    base_servings = Decimal(str(base_servings))
    if base_servings <= 0:
        raise ValueError("base servings must be above zero")
    return round2(Decimal(str(base_qty)) * Decimal(str(target_servings)) / base_servings)


def week_bounds(d):
    """Monday and Sunday of the week that contains date d."""
    monday = d - timedelta(days=d.weekday())
    return monday, monday + timedelta(days=6)


def week_plan_name(monday):
    return "Week of " + monday.strftime("%b %d, %Y").replace(" 0", " ")


def diet_sql(diet_type):
    """SQL fragment (no parameters) that keeps only recipes matching a saved diet type."""
    return {
        "Vegetarian": "'vegetarian' = ANY(r.tags)",
        "Vegan": "'vegan' = ANY(r.tags)",
        "Pescatarian": "r.tags && ARRAY['vegetarian','pescatarian']::text[]",
        "High Protein": "r.protein_g >= 25",
        "Low Carb": "r.carbs_g <= 35",
    }.get(diet_type)          # Balanced / unknown -> None (no filter)


def split_preferences(rows):
    """rows = names stored in user_dietary_preferences -> (diet_type, [allergen chips])."""
    names = set(rows)
    diet = "Balanced"
    for label, row in DIET_ROW.items():
        if row in names:
            diet = label
            break
    allergens = [label for label, row in ALLERGEN_ROW.items() if row in names]
    return diet, allergens


def escape_like(text):
    return text.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def grocery_shortfall(needs, pantry):
    """needs:  {key: {"ingredient_id","name","unit","qty","price"}}  (already scaled to the servings planned)
    pantry: {ingredient_id: (quantity, unit)}
    Returns a list of items to buy. Pantry stock only counts when its unit matches the recipe's unit."""
    out = []
    for _, n in sorted(needs.items(), key=lambda kv: kv[1]["name"].lower()):
        iid = n["ingredient_id"]
        have, have_unit = pantry.get(iid, (Decimal("0"), n["unit"]))
        in_stock = Decimal(str(have)) if str(have_unit).lower() == str(n["unit"]).lower() else Decimal("0")
        need = round2(n["qty"])
        to_buy = max(Decimal("0"), need - in_stock)
        if to_buy > 0:
            price = Decimal(str(n["price"]))
            out.append({"ingredient_id": iid, "name": n["name"], "unit": n["unit"],
                        "needed": need, "in_stock": round2(in_stock), "to_buy": round2(to_buy),
                        "unit_price": money(price), "line_cost": money(to_buy * price)})
    return out


def deduct_inventory(have_qty, have_unit, need_qty, need_unit):
    """UC-08: subtract a completed meal's ingredient from the pantry.
    Returns (new_quantity, used) or None when the units differ (nothing is changed)."""
    if str(have_unit).lower() != str(need_unit).lower():
        return None
    have = Decimal(str(have_qty))
    need = Decimal(str(need_qty))
    used = min(have, need)
    return round2(have - used), round2(used)


# ---------------------------------------------------------------- goals (Sprint 4 update)
GOAL_TYPES = ("weight_loss", "weight_gain", "maintain", "calorie", "protein", "custom")
GOAL_UNITS = {"weight_loss": "lbs", "weight_gain": "lbs", "maintain": "lbs", "calorie": "kcal/day", "protein": "g/day"}


def validate_goal(goal_type, start_value, target_value, current_value):
    """Return an error message when the numbers do not fit the goal type, otherwise None."""
    if goal_type not in GOAL_TYPES:
        return "Invalid goal type"
    if goal_type == "weight_loss" and not (start_value is not None and target_value < start_value):
        return "For weight loss, the target weight must be lower than your starting weight."
    if goal_type == "weight_gain" and not (start_value is not None and target_value > start_value):
        return "For weight gain, the target weight must be higher than your starting weight."
    if goal_type == "calorie" and not (500 <= target_value <= 10000):
        return "Daily calorie target must be between 500 and 10,000."
    if goal_type == "protein" and not (10 <= target_value <= 500):
        return "Daily protein target must be between 10 and 500 g."
    return None


def goal_progress(goal_type, start_value, current_value, target_value):
    """Percent complete (0-100) for the progress bar.
    weight_loss / weight_gain : how far current has moved from start toward target
    maintain                  : 100 while within 2 percent of the target weight, then falls away
    calorie / protein / custom: current (average so far) compared with the daily target"""
    t, c = float(target_value), float(current_value)
    s = float(start_value) if start_value is not None else None
    if goal_type in ("weight_loss", "weight_gain"):
        pct = (s - c) / (s - t) * 100 if s is not None and s != t else 0
    elif goal_type == "maintain" and t > 0:
        pct = 100 - max(0.0, abs(c - t) / t * 100 - 2) * 10
    elif t > 0:
        pct = c / t * 100
    else:
        pct = 0
    return round(max(0.0, min(100.0, pct)), 1)


# ---------------------------------------------------------------- recommendations (goals + pantry + calendar)
RECIPE_ALLERGEN_FOR = {"peanuts": "peanuts", "tree-nuts": "tree-nuts", "dairy": "dairy", "eggs": "eggs",
                       "fish": "fish", "shellfish": "shellfish", "soy": "soy", "wheat": "gluten", "sesame": "sesame"}


def goal_targets(active_goals, calorie_goal, meals_per_day, primary_goal=None):
    """Per-meal targets that the saved goals imply. Returns a dict (all keys optional)."""
    meals = max(1, int(meals_per_day or 3))
    t = {"per_meal_calories": float(calorie_goal) / meals, "direction": None, "per_meal_protein": None, "labels": []}
    if primary_goal == "Lose weight":
        t["direction"] = "lose"
    elif primary_goal in ("Gain weight", "Build muscle"):
        t["direction"] = "gain"
    for g in active_goals:
        gt, val = g["goal_type"], float(g["target_value"])
        if gt == "weight_loss":
            t["direction"] = "lose"; t["labels"].append("weight-loss goal")
        elif gt == "weight_gain":
            t["direction"] = "gain"; t["labels"].append("weight-gain goal")
        elif gt == "maintain":
            t["direction"] = t["direction"] or "maintain"; t["labels"].append("maintain-weight goal")
        elif gt == "calorie":
            t["per_meal_calories"] = val / meals; t["labels"].append("daily calorie goal")
        elif gt == "protein":
            t["per_meal_protein"] = val / meals; t["labels"].append("daily protein goal")
    return t


def score_recipe(r, targets, pantry_hits, planned_titles):
    """Return (score, reasons) for one recipe. Higher is better.
    pantry_hits: list of (ingredient name, expiring_soon bool) the user already owns."""
    score, reasons = 0.0, []
    cal, pro = float(r["calories"]), float(r["protein_g"])
    per_meal = targets["per_meal_calories"]
    d = targets["direction"]
    if d == "lose":
        if cal <= per_meal * 1.05:
            score += 3; reasons.append(f"Light enough for your weight-loss goal ({round(cal)} kcal, target about {round(per_meal)} per meal)")
        else:
            score -= 2
    elif d == "gain":
        if cal >= per_meal * 0.95:
            score += 3; reasons.append(f"Hearty enough to support weight gain ({round(cal)} kcal)")
        else:
            score -= 1
    elif abs(cal - per_meal) <= per_meal * 0.25:
        score += 2; reasons.append(f"Close to your per-meal calorie target ({round(cal)} of about {round(per_meal)} kcal)")
    if targets["per_meal_protein"]:
        if pro >= targets["per_meal_protein"]:
            score += 3; reasons.append(f"{round(pro)} g protein meets your daily protein goal (about {round(targets['per_meal_protein'])} g per meal)")
        else:
            score -= 1
    elif d == "gain" and pro >= 25:
        score += 1; reasons.append(f"{round(pro)} g protein helps build muscle")
    for name, soon in pantry_hits[:3]:
        score += 2 if soon else 1
        reasons.append(f"Uses {name} from your pantry" + (" (expires soon)" if soon else ""))
    if r["title"] in planned_titles:
        score -= 3
        reasons.append("Already on your calendar this week")
    return score, reasons

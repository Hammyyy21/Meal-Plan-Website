"""Create the demo accounts (one admin, one regular user) - safe to run repeatedly.

The app only lets people register as 'user', so the admin account has to be created
here.  Passwords come from environment variables so they are never stored in GitHub.

  DATABASE_URL="postgresql://...sslmode=require" \
  ADMIN_PASSWORD="choose-one" DEMO_PASSWORD="choose-one" python seed_demo.py

Existing accounts are left alone.  Use --reset-passwords to overwrite their passwords.

Add --sample-data to also fill the demo user's account (pantry, budget, goal, grocery list, preferences,
a week of meals, favorites, water) so every page has something to show.  It only fills a demo user whose
calendar and pantry are empty, so running it again never duplicates anything.  Needs schema_v4.sql applied.
"""
import os
import sys

import bcrypt
import psycopg2

ACCOUNTS = [
    # email,                 first,   last,   role,    password env var
    ("admin@mealplan-demo.com",  "Admin", "Demo",  "admin", "ADMIN_PASSWORD"),
    ("demo@mealplan-demo.com",   "Demo",  "User",  "user",  "DEMO_PASSWORD"),
]
reset_pw = "--reset-passwords" in sys.argv
sample = "--sample-data" in sys.argv
dsn = os.getenv("DATABASE_URL", "dbname=mealplan user=postgres password=postgres host=localhost")


def col(row, i):
    """Value i of a fetched row (works for both tuple rows and dict rows)."""
    return row[i] if isinstance(row, (tuple, list)) else list(row.values())[i]


def fill_sample_data(cur, email):
    """Give the demo user realistic data in every Sprint 3 / Sprint 4 table (idempotent)."""
    from datetime import date, timedelta
    cur.execute("SELECT user_id FROM users WHERE email=%s", (email,))
    uid = col(cur.fetchone(), 0)
    cur.execute("SELECT (SELECT COUNT(*) FROM inventory_items WHERE user_id=%s) AS inv_n, "
                "(SELECT COUNT(*) FROM calendar_entries e JOIN meal_plans p ON p.plan_id=e.plan_id WHERE p.user_id=%s) AS cal_n", (uid, uid))
    _r = cur.fetchone(); inv_n, cal_n = col(_r, 0), col(_r, 1)
    if inv_n or cal_n:
        print("sample data skipped (demo user already has pantry or calendar data)")
        return
    today = date.today()
    monday = today - timedelta(days=today.weekday())

    # profile + settings + preferences (UC-04)
    cur.execute("UPDATE users SET household_size=2 WHERE user_id=%s", (uid,))
    cur.execute("""INSERT INTO user_settings (user_id, primary_goal, calorie_goal, weekly_budget, meals_per_day)
                   VALUES (%s,'Eat healthier',2000,100,3)
                   ON CONFLICT (user_id) DO UPDATE SET primary_goal=EXCLUDED.primary_goal""", (uid,))
    cur.execute("""INSERT INTO user_dietary_preferences (user_id, preference_id)
                   SELECT %s, preference_id FROM dietary_preferences WHERE name='High Protein'
                   ON CONFLICT DO NOTHING""", (uid,))

    # pantry (UC-08): one item expires tomorrow so the notification shows up
    pantry = [("Chicken Breast", 3, "lbs", 1), ("Brown Rice", 4, "cups", 60), ("Eggs", 12, "items", 10),
              ("Greek Yogurt", 2, "cups", 2), ("Mixed Greens", 6, "cups", 4), ("Avocado", 3, "items", 3)]
    for name, qty, unit, days in pantry:
        cur.execute("SELECT ingredient_id FROM ingredients WHERE lower(name)=lower(%s)", (name,))
        row = cur.fetchone()
        if row:
            cur.execute("""INSERT INTO inventory_items (user_id, ingredient_id, quantity, unit, expiration_date)
                           VALUES (%s,%s,%s,%s,%s)""", (uid, col(row, 0), qty, unit, today + timedelta(days=days)))

    # budget, goal, grocery list (Sprint 3 pages)
    cur.execute("INSERT INTO budgets (user_id, period_start, period_end, limit_amount, spent_amount) VALUES (%s,%s,%s,100,34.50)",
                (uid, monday, monday + timedelta(days=6)))
    cur.execute("""INSERT INTO goals (user_id, goal_type, target_value, current_value, start_value, unit, target_date)
                   VALUES (%s,'weight_loss',150,158,165,'lbs',%s)""", (uid, today + timedelta(days=60)))
    for name, qty, unit, price in [("Bananas", 6, "pcs", 2.4), ("Olive oil", 1, "bottle", 8.99), ("Oats", 2, "lbs", 5.5)]:
        cur.execute("INSERT INTO grocery_list_items (user_id, name, quantity, unit, estimated_price) VALUES (%s,%s,%s,%s,%s)",
                    (uid, name, qty, unit, price))

    # one meal plan week + calendar entries (UC-06); meals before today are marked eaten with a nutrition log
    cur.execute("INSERT INTO meal_plans (user_id, plan_name, start_date, end_date) VALUES (%s,%s,%s,%s) RETURNING plan_id",
                (uid, "Week of " + monday.strftime("%b %d, %Y").replace(" 0", " "), monday, monday + timedelta(days=6)))
    plan_id = col(cur.fetchone(), 0)
    menu = [(0, "breakfast", "Greek Yogurt Berry Bowl"), (0, "dinner", "Salmon Rice Bowl"),
            (1, "lunch", "Grilled Chicken Power Bowl"), (2, "breakfast", "Avocado Egg Toast"),
            (3, "dinner", "Chicken Tacos"), (4, "lunch", "Caesar Salad"), (5, "dinner", "Veggie Tofu Stir-Fry")]
    for offset, mtype, title in menu:
        d = monday + timedelta(days=offset)
        cur.execute("SELECT recipe_id, base_servings, calories, protein_g, carbs_g, fat_g FROM recipes WHERE lower(title)=lower(%s)", (title,))
        r = cur.fetchone()
        if not r:
            continue
        r = [col(r, i) for i in range(6)]
        servings = 2
        eaten = d < today
        cur.execute("""INSERT INTO calendar_entries (plan_id, recipe_id, meal_date, meal_type, servings, is_completed)
                       VALUES (%s,%s,%s,%s,%s,%s) RETURNING entry_id""", (plan_id, r[0], d, mtype, servings, eaten))
        entry_id = col(cur.fetchone(), 0)
        if eaten:
            cur.execute("""INSERT INTO nutrition_logs (user_id, entry_id, log_date, calories, protein_g, carbs_g, fat_g)
                           VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                        (uid, entry_id, d, r[2] * servings, r[3] * servings, r[4] * servings, r[5] * servings))

    # favorites + water (Sprint 4)
    cur.execute("""INSERT INTO recipe_favorites (user_id, recipe_id)
                   SELECT %s, recipe_id FROM recipes WHERE title IN ('Salmon Rice Bowl','Chicken Tacos')
                   ON CONFLICT DO NOTHING""", (uid,))
    cur.execute("""INSERT INTO water_logs (user_id, log_date, glasses) VALUES (%s,%s,5)
                   ON CONFLICT (user_id, log_date) DO NOTHING""", (uid, today))
    print("sample data added for", email)


conn = psycopg2.connect(dsn)
try:
    with conn.cursor() as cur:
        for email, first, last, role, env in ACCOUNTS:
            password = os.getenv(env, "")
            if len(password.encode()) < 8:
                sys.exit(f"Set {env} (at least 8 characters) before running.")
            h = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            cur.execute("SELECT user_id FROM users WHERE email=%s", (email,))
            row = cur.fetchone()
            if row is None:
                cur.execute("""INSERT INTO users (role_id, first_name, last_name, email, password_hash)
                               VALUES ((SELECT role_id FROM roles WHERE role_name=%s), %s,%s,%s,%s)""",
                            (role, first, last, email, h))
                print(f"created {role:5} {email}")
            elif reset_pw:
                cur.execute("UPDATE users SET password_hash=%s, account_status='active' WHERE email=%s", (h, email))
                print(f"password reset for {email}")
            else:
                print(f"exists  {role:5} {email} (unchanged)")
        if sample:
            fill_sample_data(cur, "demo@mealplan-demo.com")
    conn.commit()
finally:
    conn.close()

"""Create the demo accounts (one admin, one regular user) - safe to run repeatedly.

The app only lets people register as 'user', so the admin account has to be created
here.  Passwords come from environment variables so they are never stored in GitHub.

  DATABASE_URL="postgresql://...sslmode=require" \
  ADMIN_PASSWORD="choose-one" DEMO_PASSWORD="choose-one" python seed_demo.py

Existing accounts are left alone.  Use --reset-passwords to overwrite their passwords.
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
dsn = os.getenv("DATABASE_URL", "dbname=mealplan user=postgres password=postgres host=localhost")

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
    conn.commit()
finally:
    conn.close()

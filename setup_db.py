"""Create / update every Meal Plan Tracker table from schema_v3.sql.

Safe by default: schema_v3.sql only uses CREATE ... IF NOT EXISTS, so running this
again never deletes data and is fine against the live Neon database.

  Local:   DB_PASSWORD=... python setup_db.py
  Neon:    DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" python setup_db.py
  Wipe a LOCAL dev DB first:   python setup_db.py --reset   (asks you to type RESET)
"""
import getpass
import os
import sys

import psycopg2

HERE = os.path.dirname(os.path.abspath(__file__))
EXPECTED_TABLES = 22
reset = "--reset" in sys.argv

url = os.getenv("DATABASE_URL")
if url:
    target = "DATABASE_URL"
    connect = lambda: psycopg2.connect(url)
    is_local = ("localhost" in url) or ("127.0.0.1" in url)
else:
    host = os.getenv("DB_HOST", "localhost")
    target = f"{os.getenv('DB_USER', 'postgres')}@{host}/{os.getenv('DB_NAME', 'mealplan')}"
    pw = os.getenv("DB_PASSWORD") or getpass.getpass("Database password: ")
    connect = lambda: psycopg2.connect(
        dbname=os.getenv("DB_NAME", "mealplan"), user=os.getenv("DB_USER", "postgres"),
        password=pw, host=host, port=os.getenv("DB_PORT", "5432"))
    is_local = host in ("localhost", "127.0.0.1")

if reset:
    if not is_local:
        sys.exit("Refusing --reset on a non-local database (it would delete every user).")
    if input("This deletes ALL data in the local database. Type RESET to continue: ") != "RESET":
        sys.exit("Cancelled.")

try:
    conn = connect()
except psycopg2.OperationalError as e:
    sys.exit(f"Could not connect to {target}:\n{e}")
print(f"Connected to {target}")

try:
    with conn.cursor() as cur:
        if reset:
            cur.execute(open(os.path.join(HERE, "reset_dev.sql"), encoding="utf-8").read())
            print("Old tables dropped.")
        cur.execute(open(os.path.join(HERE, "schema_v3.sql"), encoding="utf-8").read())
    conn.commit()
    with conn.cursor() as cur:
        cur.execute("SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema='public' ORDER BY table_name")
        tables = [r[0] for r in cur.fetchall()]
    print(f"schema_v3.sql applied. {len(tables)} tables:")
    for t in tables:
        print("  -", t)
    if len(tables) < EXPECTED_TABLES:
        print(f"WARNING: expected {EXPECTED_TABLES} tables.")
except Exception as e:
    conn.rollback()
    sys.exit(f"Error (nothing was changed):\n{e}")
finally:
    conn.close()

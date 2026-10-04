"""Connect to PostgreSQL and create all Meal Plan Tracker tables from schema.sql.
"""
import getpass
import os
import sys

import psycopg2

DB_NAME = os.getenv("DB_NAME", "mealplan")       
DB_USER = os.getenv("DB_USER", "postgres")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_PASSWORD = os.getenv("DB_PASSWORD") or getpass.getpass(f"Password for {DB_USER}: ")

SCHEMA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")

try:
    conn = psycopg2.connect(dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD,
                            host=DB_HOST, port=DB_PORT)
except psycopg2.OperationalError as e:
    sys.exit(f"Could not connect:\n{e}")

print(f"Connected to '{DB_NAME}' on {DB_HOST}:{DB_PORT} as {DB_USER}")

with open(SCHEMA_FILE, encoding="utf-8") as f:
    sql = f.read()

try:
    with conn.cursor() as cur:
        cur.execute(sql)          # runs the whole script
    conn.commit()
    print("schema.sql executed successfully.")

    with conn.cursor() as cur:
        cur.execute("""SELECT table_name FROM information_schema.tables
                       WHERE table_schema = 'public' ORDER BY table_name""")
        tables = [r[0] for r in cur.fetchall()]
    print(f"\n{len(tables)} tables created:")
    for t in tables:
        print("  -", t)
except Exception as e:
    conn.rollback()
    sys.exit(f"Error running schema.sql (nothing was changed):\n{e}")
finally:
    conn.close()

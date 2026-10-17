"""Meal Plan Tracker - Sprint 2 user management backend (FastAPI + PostgreSQL)."""
import os, uuid
from datetime import datetime, timedelta

import bcrypt
import psycopg2
import psycopg2.extras
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

DB_DSN = os.getenv("DATABASE_URL", "dbname=mealplan user=postgres password=postgres host=localhost")
SESSION_HOURS = 8
app = FastAPI(title="Meal Plan Tracker API")


def db():
    conn = psycopg2.connect(DB_DSN, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()


class RegisterIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(default="", max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def current_user(session_id: str | None = Cookie(default=None), conn=Depends(db)):
    """Basic session handling: look up a non-revoked, non-expired session cookie."""
    if not session_id:
        raise HTTPException(401, "Not logged in")
    with conn.cursor() as cur:
        cur.execute(
            """SELECT u.user_id, u.first_name, u.last_name, u.email, r.role_name
               FROM user_sessions s JOIN users u ON u.user_id = s.user_id
               JOIN roles r ON r.role_id = u.role_id
               WHERE s.session_id = %s AND NOT s.revoked AND s.expires_at > NOW()
                 AND u.account_status = 'active'""", (session_id,))
        user = cur.fetchone()
    if not user:
        raise HTTPException(401, "Session expired")
    return user


def admin_only(user=Depends(current_user)):
    if user["role_name"] != "admin":
        raise HTTPException(403, "Admin access required")
    return user


@app.post("/api/register", status_code=201)
def register(body: RegisterIn, conn=Depends(db)):
    pw = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM users WHERE email = %s", (body.email.lower(),))
        if cur.fetchone():
            raise HTTPException(409, "Email already registered")
        cur.execute(
            """INSERT INTO users (role_id, first_name, last_name, email, password_hash)
               VALUES ((SELECT role_id FROM roles WHERE role_name='user'), %s,%s,%s,%s)
               RETURNING user_id""",
            (body.first_name, body.last_name, body.email.lower(), pw))
        uid = cur.fetchone()["user_id"]
    conn.commit()
    return {"user_id": uid, "message": "Account created"}


@app.post("/api/login")
def login(body: LoginIn, response: Response, conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute("SELECT user_id, password_hash, account_status FROM users WHERE email=%s",
                    (body.email.lower(),))
        u = cur.fetchone()
        if not u or not bcrypt.checkpw(body.password.encode(), u["password_hash"].encode()):
            raise HTTPException(401, "Invalid email or password")
        if u["account_status"] != "active":
            raise HTTPException(403, "Account is not active")
        sid = str(uuid.uuid4())
        cur.execute("INSERT INTO user_sessions (session_id, user_id, expires_at) VALUES (%s,%s,%s)",
                    (sid, u["user_id"], datetime.utcnow() + timedelta(hours=SESSION_HOURS)))
        cur.execute("UPDATE users SET last_login_at = NOW() WHERE user_id=%s", (u["user_id"],))
    conn.commit()
    response.set_cookie("session_id", sid, httponly=True, samesite="lax", max_age=SESSION_HOURS * 3600)
    return {"message": "Logged in"}


@app.post("/api/logout")
def logout(response: Response, session_id: str | None = Cookie(default=None), conn=Depends(db)):
    if session_id:
        with conn.cursor() as cur:
            cur.execute("UPDATE user_sessions SET revoked = TRUE WHERE session_id = %s", (session_id,))
        conn.commit()
    response.delete_cookie("session_id")
    return {"message": "Logged out"}


@app.get("/api/me")
def me(user=Depends(current_user)):
    return user


@app.get("/api/admin/users")
def list_users(_=Depends(admin_only), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute("""SELECT u.user_id, u.email, r.role_name, u.account_status, u.created_at
                       FROM users u JOIN roles r ON r.role_id=u.role_id ORDER BY u.user_id""")
        return cur.fetchall()


@app.patch("/api/admin/users/{user_id}/status")
def set_status(user_id: int, status: str, _=Depends(admin_only), conn=Depends(db)):
    if status not in ("active", "suspended"):
        raise HTTPException(400, "status must be 'active' or 'suspended'")
    with conn.cursor() as cur:
        cur.execute("UPDATE users SET account_status=%s WHERE user_id=%s", (status, user_id))
    conn.commit()
    return {"user_id": user_id, "account_status": status}


# SPRINT3_BUDGET_GOALS_API
from datetime import date
from decimal import Decimal

class BudgetIn(BaseModel):
    period_start: date
    period_end: date
    limit_amount: Decimal = Field(gt=0)
    spent_amount: Decimal = Field(default=0, ge=0)

class GoalIn(BaseModel):
    goal_type: str
    target_value: Decimal = Field(gt=0)
    current_value: Decimal = Field(default=0, ge=0)
    unit: str = Field(min_length=1, max_length=20)
    target_date: date | None = None

@app.get('/api/budgets')
def get_budgets(user=Depends(current_user), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute('SELECT budget_id, period_start, period_end, limit_amount, spent_amount FROM budgets WHERE user_id=%s ORDER BY period_start DESC', (user['user_id'],))
        return cur.fetchall()

@app.post('/api/budgets', status_code=201)
def add_budget(body: BudgetIn, user=Depends(current_user), conn=Depends(db)):
    if body.period_end < body.period_start:
        raise HTTPException(400, 'End date must be on or after start date')
    with conn.cursor() as cur:
        cur.execute('INSERT INTO budgets (user_id, period_start, period_end, limit_amount, spent_amount) VALUES (%s,%s,%s,%s,%s) RETURNING budget_id', (user['user_id'],body.period_start,body.period_end,body.limit_amount,body.spent_amount))
        result=cur.fetchone()
    conn.commit()
    return result

@app.delete('/api/budgets/{budget_id}')
def delete_budget(budget_id:int, user=Depends(current_user), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute('DELETE FROM budgets WHERE budget_id=%s AND user_id=%s RETURNING budget_id',(budget_id,user['user_id']))
        deleted=cur.fetchone()
    if not deleted: raise HTTPException(404,'Budget not found')
    conn.commit()
    return {'message':'Deleted'}

@app.get('/api/goals')
def get_goals(user=Depends(current_user), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute('SELECT goal_id, goal_type, target_value, current_value, unit, start_date, target_date, status FROM goals WHERE user_id=%s ORDER BY goal_id DESC', (user['user_id'],))
        return cur.fetchall()

@app.post('/api/goals', status_code=201)
def add_goal(body: GoalIn, user=Depends(current_user), conn=Depends(db)):
    if body.goal_type not in ('weight_loss','weight_gain','maintain','calorie','protein','custom'):
        raise HTTPException(400,'Invalid goal type')
    with conn.cursor() as cur:
        cur.execute('INSERT INTO goals (user_id,goal_type,target_value,current_value,unit,target_date) VALUES (%s,%s,%s,%s,%s,%s) RETURNING goal_id',(user['user_id'],body.goal_type,body.target_value,body.current_value,body.unit,body.target_date))
        result=cur.fetchone()
    conn.commit()
    return result

@app.patch('/api/goals/{goal_id}')
def update_goal(goal_id:int, current_value:Decimal=0, user=Depends(current_user), conn=Depends(db)):
    if current_value<0: raise HTTPException(400,'Progress cannot be negative')
    with conn.cursor() as cur:
        cur.execute('UPDATE goals SET current_value=%s WHERE goal_id=%s AND user_id=%s RETURNING goal_id',(current_value,goal_id,user['user_id']))
        updated=cur.fetchone()
    if not updated: raise HTTPException(404,'Goal not found')
    conn.commit()
    return updated

@app.delete('/api/goals/{goal_id}')
def delete_goal(goal_id:int, user=Depends(current_user), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute('DELETE FROM goals WHERE goal_id=%s AND user_id=%s RETURNING goal_id',(goal_id,user['user_id']))
        deleted=cur.fetchone()
    if not deleted: raise HTTPException(404,'Goal not found')
    conn.commit()
    return {'message':'Deleted'}

app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "frontend"), html=True))

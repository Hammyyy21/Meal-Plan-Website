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


# SPRINT3 GROCERY LIST API
class GroceryItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(gt=0, le=100000)
    unit: str = Field(min_length=1, max_length=30)
    estimated_price: float = Field(ge=0, le=1000000)

class GroceryCheckedIn(BaseModel):
    purchased: bool

@app.get("/api/grocery-items")
def grocery_list(user=Depends(current_user), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute("SELECT item_id, name, quantity::float AS quantity, unit, estimated_price::float AS estimated_price, purchased FROM grocery_list_items WHERE user_id=%s ORDER BY item_id DESC", (user["user_id"],))
        return cur.fetchall()

@app.post("/api/grocery-items", status_code=201)
def grocery_add(body: GroceryItemIn, user=Depends(current_user), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute("INSERT INTO grocery_list_items (user_id,name,quantity,unit,estimated_price) VALUES (%s,%s,%s,%s,%s) RETURNING item_id", (user["user_id"], body.name.strip(), body.quantity, body.unit.strip(), body.estimated_price))
        item_id = cur.fetchone()["item_id"]
    conn.commit()
    return {"item_id":item_id}

@app.patch("/api/grocery-items/{item_id}")
def grocery_check(item_id: int, body: GroceryCheckedIn, user=Depends(current_user), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute("UPDATE grocery_list_items SET purchased=%s WHERE item_id=%s AND user_id=%s RETURNING item_id", (body.purchased, item_id, user["user_id"]))
        if not cur.fetchone():
            raise HTTPException(404, "Item not found")
    conn.commit()
    return {"ok":True}

@app.delete("/api/grocery-items/{item_id}")
def grocery_delete(item_id: int, user=Depends(current_user), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM grocery_list_items WHERE item_id=%s AND user_id=%s RETURNING item_id", (item_id, user["user_id"]))
        if not cur.fetchone():
            raise HTTPException(404, "Item not found")
    conn.commit()
    return {"ok":True}
# END SPRINT3 GROCERY LIST API


# SPRINT3_AI_CHATBOT_API
import json
import urllib.request
import urllib.error

class ChatPromptIn(BaseModel):
    message: str = Field(min_length=1, max_length=1500)
    chat_session_id: int | None = None

@app.get('/api/chat/sessions')
def chat_sessions(user=Depends(current_user), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute("""SELECT s.chat_session_id, s.started_at,
                (SELECT message_text FROM chat_messages m WHERE m.chat_session_id=s.chat_session_id ORDER BY message_id ASC LIMIT 1) AS preview
                FROM chat_sessions s WHERE s.user_id=%s ORDER BY s.started_at DESC LIMIT 30""", (user['user_id'],))
        return cur.fetchall()

@app.get('/api/chat/sessions/{chat_session_id}/messages')
def chat_history(chat_session_id:int, user=Depends(current_user), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute('SELECT 1 FROM chat_sessions WHERE chat_session_id=%s AND user_id=%s', (chat_session_id,user['user_id']))
        if not cur.fetchone(): raise HTTPException(404,'Chat not found')
        cur.execute('SELECT sender,message_text,sent_at FROM chat_messages WHERE chat_session_id=%s ORDER BY message_id ASC LIMIT 100', (chat_session_id,))
        return cur.fetchall()

@app.post('/api/chat/message')
def chat_message(body:ChatPromptIn, user=Depends(current_user), conn=Depends(db)):
    key=os.getenv('OPENAI_API_KEY','').strip()
    if not key:
        raise HTTPException(503,'AI chatbot is not configured yet. Add OPENAI_API_KEY in Render Environment.')
    message=body.message.strip()
    if not message: raise HTTPException(400,'Enter a message')
    with conn.cursor() as cur:
        if body.chat_session_id is not None:
            cur.execute('SELECT 1 FROM chat_sessions WHERE chat_session_id=%s AND user_id=%s', (body.chat_session_id,user['user_id']))
            if not cur.fetchone(): raise HTTPException(404,'Chat not found')
            session_id=body.chat_session_id
        else:
            cur.execute('INSERT INTO chat_sessions(user_id) VALUES (%s) RETURNING chat_session_id',(user['user_id'],))
            session_id=cur.fetchone()['chat_session_id']
        cur.execute('SELECT sender,message_text FROM chat_messages WHERE chat_session_id=%s ORDER BY message_id DESC LIMIT 12',(session_id,))
        history=list(reversed(cur.fetchall()))
    messages=[{'role':'system','content': 'You are MealPlan Assistant, a friendly practical meal-planning helper. Help with recipes, grocery lists, budget-conscious meals and general nutrition. Be clear and concise. Do not claim access to the user’s actual pantry, budget, or health records. Do not diagnose medical conditions or prescribe diets. Ask about allergies before recommending risky ingredients. Never claim nutritional estimates are exact.'}]
    for item in history:
        messages.append({'role':'assistant' if item['sender']=='bot' else 'user','content':item['message_text']})
    messages.append({'role':'user','content':message})
    payload=json.dumps({'model':os.getenv('OPENAI_MODEL','gpt-4o-mini'),'messages':messages,'max_tokens':500}).encode('utf-8')
    req=urllib.request.Request('https://api.openai.com/v1/chat/completions',data=payload,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=35) as response:
            result=json.load(response)
        reply=result['choices'][0]['message']['content'].strip()
        if not reply: raise ValueError('Empty AI response')
    except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError,ValueError,KeyError,IndexError) as exc:
        # Do not return API error bodies, which may expose provider/account details.
        raise HTTPException(502,'AI service unavailable. Check API key, billing, and Render logs, then retry.') from exc
    with conn.cursor() as cur:
        cur.execute('INSERT INTO chat_messages(chat_session_id,sender,message_text) VALUES (%s,%s,%s)',(session_id,'user',message))
        cur.execute('INSERT INTO chat_messages(chat_session_id,sender,message_text) VALUES (%s,%s,%s)',(session_id,'bot',reply))
    conn.commit()
    return {'chat_session_id':session_id,'reply':reply}
# END SPRINT3_AI_CHATBOT_API


# SPRINT3_RECOMMENDATIONS_API
from typing import Literal

# Curated, approximate examples. Allergens are explicit and exclusions are conservative.
MEAL_CATALOG = [
    {"id":1,"name":"Chicken & Brown Rice Bowl","description":"Grilled chicken, brown rice, broccoli and olive oil.","tags":["high-protein","gluten-free"],"allergens":[],"ingredients":["chicken","brown rice","broccoli","olive oil"],"minutes":30,"cost":4.50,"protein":42,"calories":520},
    {"id":2,"name":"Black Bean Burrito Bowl","description":"Rice, black beans, peppers, salsa and avocado.","tags":["vegan","vegetarian","gluten-free"],"allergens":[],"ingredients":["rice","black beans","bell peppers","salsa","avocado"],"minutes":20,"cost":3.20,"protein":17,"calories":480},
    {"id":3,"name":"Salmon & Sweet Potato","description":"Baked salmon, roasted sweet potato and spinach.","tags":["high-protein","gluten-free"],"allergens":["fish"],"ingredients":["salmon","sweet potato","spinach"],"minutes":35,"cost":7.50,"protein":36,"calories":540},
    {"id":4,"name":"Lentil Vegetable Soup","description":"Lentils, carrots, celery and tomatoes simmered together.","tags":["vegan","vegetarian","gluten-free"],"allergens":[],"ingredients":["lentils","carrots","celery","tomatoes"],"minutes":40,"cost":2.80,"protein":19,"calories":350},
    {"id":5,"name":"Turkey Lettuce Wraps","description":"Seasoned ground turkey in crisp lettuce with vegetables.","tags":["high-protein","gluten-free"],"allergens":[],"ingredients":["ground turkey","lettuce","carrots","cucumber"],"minutes":25,"cost":4.80,"protein":34,"calories":390},
    {"id":6,"name":"Greek Yogurt Berry Bowl","description":"Greek yogurt, berries and oats.","tags":["vegetarian","high-protein"],"allergens":["dairy"],"ingredients":["greek yogurt","berries","oats"],"minutes":5,"cost":2.90,"protein":24,"calories":320},
    {"id":7,"name":"Chickpea Spinach Curry","description":"Chickpeas, spinach and tomatoes with curry spices, served over rice.","tags":["vegan","vegetarian","gluten-free"],"allergens":[],"ingredients":["chickpeas","spinach","tomatoes","rice"],"minutes":30,"cost":3.60,"protein":16,"calories":450},
    {"id":8,"name":"Egg & Potato Breakfast Skillet","description":"Eggs, potatoes, bell peppers and onions.","tags":["vegetarian","gluten-free"],"allergens":["eggs"],"ingredients":["eggs","potatoes","bell peppers","onions"],"minutes":20,"cost":2.70,"protein":21,"calories":430},
]

class RecommendationSettingsIn(BaseModel):
    diet: Literal['any','vegetarian','vegan','high-protein','gluten-free'] = 'any'
    allergies: list[Literal['peanuts','tree-nuts','dairy','eggs','fish','shellfish','soy','wheat','sesame']] = Field(default_factory=list)
    max_cost: float = Field(default=8, gt=0, le=1000)

@app.get('/api/recommendations/settings')
def recommendation_settings(user=Depends(current_user), conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute('SELECT diet,allergies,max_cost FROM recommendation_settings WHERE user_id=%s',(user['user_id'],))
        item=cur.fetchone()
    if not item: return {'diet':'any','allergies':[],'max_cost':8.0}
    return {'diet':item['diet'],'allergies':item['allergies'],'max_cost':float(item['max_cost'])}

@app.put('/api/recommendations/settings')
def save_recommendation_settings(body:RecommendationSettingsIn,user=Depends(current_user),conn=Depends(db)):
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO recommendation_settings(user_id,diet,allergies,max_cost) VALUES (%s,%s,%s,%s)
            ON CONFLICT(user_id) DO UPDATE SET diet=EXCLUDED.diet,allergies=EXCLUDED.allergies,max_cost=EXCLUDED.max_cost""",
            (user['user_id'],body.diet,list(set(body.allergies)),body.max_cost))
    conn.commit()
    return {'ok':True}

@app.get('/api/recommendations/meals')
def recommended_meals(user=Depends(current_user),conn=Depends(db)):
    settings=recommendation_settings(user,conn)
    diet=settings['diet']; allergies=set(settings['allergies']); budget=settings['max_cost']
    # Explicit allergy labels; curated meals only. Not a guarantee against cross-contact.
    meals=[m for m in MEAL_CATALOG if (diet=='any' or diet in m['tags'])
           and not (allergies & set(m['allergens'])) and m['cost']<=budget]
    meals=sorted(meals,key=lambda m:(0 if diet!='any' and diet in m['tags'] else 1,m['cost']))
    return {'meals':meals,'count':len(meals),'settings':settings,'note':'Costs and nutrition are estimates per serving. Check ingredient labels and cross-contact risks for allergies.'}
# END SPRINT3_RECOMMENDATIONS_API

app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "frontend"), html=True))

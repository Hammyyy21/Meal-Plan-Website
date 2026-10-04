-- =====================================================================
-- Meal Plan Tracker - Group 5 - Sprint 2
-- Database: PostgreSQL 15+
-- Run:  psql -U postgres -c "CREATE DATABASE mealplan;"
--       psql -U postgres -d mealplan -f schema.sql
-- =====================================================================

DROP TABLE IF EXISTS chat_messages, chat_sessions, notifications,
    recommendations, nutrition_logs, budgets, goals, grocery_order_items,
    grocery_orders, inventory_items, calendar_entries, meal_plans,
    recipe_ingredients, recipes, ingredients, user_dietary_preferences,
    dietary_preferences, user_sessions, users, roles CASCADE;

-- ---------------------------------------------------------------------
-- 1. Login / Logout module + role management
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    role_id     SERIAL PRIMARY KEY,
    role_name   VARCHAR(20) NOT NULL UNIQUE      -- 'user', 'admin'
);

CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    role_id        INT          NOT NULL REFERENCES roles(role_id),
    first_name     VARCHAR(50)  NOT NULL,
    last_name      VARCHAR(50)  NOT NULL,
    email          VARCHAR(120) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,         -- bcrypt hash, never plain text
    account_status VARCHAR(15)  NOT NULL DEFAULT 'active'
                   CHECK (account_status IN ('active','suspended','deleted')),
    household_size INT          NOT NULL DEFAULT 1 CHECK (household_size > 0),
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_login_at  TIMESTAMP
);

CREATE TABLE user_sessions (
    session_id   UUID PRIMARY KEY,
    user_id      INT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMP NOT NULL,
    revoked      BOOLEAN   NOT NULL DEFAULT FALSE  -- set TRUE on logout
);

-- ---------------------------------------------------------------------
-- 2. Dietary preferences
-- ---------------------------------------------------------------------
CREATE TABLE dietary_preferences (
    preference_id   SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,   -- Vegan, Gluten-Free, Nut Allergy...
    pref_type       VARCHAR(15) NOT NULL CHECK (pref_type IN ('diet','allergy','dislike'))
);

CREATE TABLE user_dietary_preferences (
    user_id        INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    preference_id  INT NOT NULL REFERENCES dietary_preferences(preference_id),
    PRIMARY KEY (user_id, preference_id)
);

-- ---------------------------------------------------------------------
-- 3. Recipe database (+ portion scaling base data)
-- ---------------------------------------------------------------------
CREATE TABLE ingredients (
    ingredient_id    SERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL UNIQUE,
    default_unit     VARCHAR(20)  NOT NULL,
    calories_per_unit NUMERIC(8,2) NOT NULL DEFAULT 0,
    protein_g        NUMERIC(8,2) NOT NULL DEFAULT 0,
    carbs_g          NUMERIC(8,2) NOT NULL DEFAULT 0,
    fat_g            NUMERIC(8,2) NOT NULL DEFAULT 0,
    price_per_unit   NUMERIC(8,2) NOT NULL DEFAULT 0
);

CREATE TABLE recipes (
    recipe_id      SERIAL PRIMARY KEY,
    created_by     INT REFERENCES users(user_id) ON DELETE SET NULL,
    title          VARCHAR(150) NOT NULL,
    instructions   TEXT         NOT NULL,
    base_servings  INT          NOT NULL DEFAULT 1 CHECK (base_servings > 0),  -- portion scaling
    prep_minutes   INT,
    cook_minutes   INT,
    is_approved    BOOLEAN      NOT NULL DEFAULT FALSE,   -- admin moderation
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE recipe_ingredients (
    recipe_id      INT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    ingredient_id  INT NOT NULL REFERENCES ingredients(ingredient_id),
    quantity       NUMERIC(8,2) NOT NULL CHECK (quantity > 0),  -- for base_servings
    unit           VARCHAR(20)  NOT NULL,
    PRIMARY KEY (recipe_id, ingredient_id)
);

-- ---------------------------------------------------------------------
-- 4. Interactive calendar (meal plans)
-- ---------------------------------------------------------------------
CREATE TABLE meal_plans (
    plan_id     SERIAL PRIMARY KEY,
    user_id     INT          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    plan_name   VARCHAR(100) NOT NULL,
    start_date  DATE         NOT NULL,
    end_date    DATE         NOT NULL,
    CHECK (end_date >= start_date)
);

CREATE TABLE calendar_entries (
    entry_id    SERIAL PRIMARY KEY,
    plan_id     INT  NOT NULL REFERENCES meal_plans(plan_id) ON DELETE CASCADE,
    recipe_id   INT  NOT NULL REFERENCES recipes(recipe_id),
    meal_date   DATE NOT NULL,
    meal_type   VARCHAR(10) NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
    servings    NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (servings > 0),   -- scaled portion
    is_completed BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------
-- 5. Inventory tracker
-- ---------------------------------------------------------------------
CREATE TABLE inventory_items (
    item_id        SERIAL PRIMARY KEY,
    user_id        INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    ingredient_id  INT NOT NULL REFERENCES ingredients(ingredient_id),
    quantity       NUMERIC(8,2) NOT NULL CHECK (quantity >= 0),
    unit           VARCHAR(20)  NOT NULL,
    expiration_date DATE,
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, ingredient_id)
);

-- ---------------------------------------------------------------------
-- 6. Grocery delivery
-- ---------------------------------------------------------------------
CREATE TABLE grocery_orders (
    order_id       SERIAL PRIMARY KEY,
    user_id        INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    plan_id        INT REFERENCES meal_plans(plan_id) ON DELETE SET NULL,
    status         VARCHAR(15) NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','placed','shipped','delivered','cancelled')),
    delivery_address VARCHAR(255),
    delivery_date  DATE,
    total_cost     NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE grocery_order_items (
    order_item_id  SERIAL PRIMARY KEY,
    order_id       INT NOT NULL REFERENCES grocery_orders(order_id) ON DELETE CASCADE,
    ingredient_id  INT NOT NULL REFERENCES ingredients(ingredient_id),
    quantity       NUMERIC(8,2) NOT NULL CHECK (quantity > 0),
    unit           VARCHAR(20)  NOT NULL,
    unit_price     NUMERIC(8,2) NOT NULL
);

-- ---------------------------------------------------------------------
-- 7. Goal tracking
-- ---------------------------------------------------------------------
CREATE TABLE goals (
    goal_id        SERIAL PRIMARY KEY,
    user_id        INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    goal_type      VARCHAR(20) NOT NULL
                   CHECK (goal_type IN ('weight_loss','weight_gain','maintain','calorie','protein','custom')),
    target_value   NUMERIC(8,2) NOT NULL,
    current_value  NUMERIC(8,2) NOT NULL DEFAULT 0,
    unit           VARCHAR(20)  NOT NULL,
    start_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    target_date    DATE,
    status         VARCHAR(12) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','achieved','abandoned'))
);

-- ---------------------------------------------------------------------
-- 8. Budget planning
-- ---------------------------------------------------------------------
CREATE TABLE budgets (
    budget_id      SERIAL PRIMARY KEY,
    user_id        INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    period_start   DATE NOT NULL,
    period_end     DATE NOT NULL,
    limit_amount   NUMERIC(10,2) NOT NULL CHECK (limit_amount > 0),
    spent_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
    CHECK (period_end >= period_start)
);

-- ---------------------------------------------------------------------
-- 9. Nutritional analysis dashboard
-- ---------------------------------------------------------------------
CREATE TABLE nutrition_logs (
    log_id      SERIAL PRIMARY KEY,
    user_id     INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    entry_id    INT  REFERENCES calendar_entries(entry_id) ON DELETE SET NULL,
    log_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    calories    NUMERIC(8,2) NOT NULL DEFAULT 0,
    protein_g   NUMERIC(8,2) NOT NULL DEFAULT 0,
    carbs_g     NUMERIC(8,2) NOT NULL DEFAULT 0,
    fat_g       NUMERIC(8,2) NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- 10. Personalized recommendations
-- ---------------------------------------------------------------------
CREATE TABLE recommendations (
    recommendation_id SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    recipe_id  INT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    reason     VARCHAR(255),
    score      NUMERIC(4,3),
    status     VARCHAR(10) NOT NULL DEFAULT 'new'
               CHECK (status IN ('new','accepted','dismissed')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 11. Chatbot
-- ---------------------------------------------------------------------
CREATE TABLE chat_sessions (
    chat_session_id SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
    message_id      SERIAL PRIMARY KEY,
    chat_session_id INT NOT NULL REFERENCES chat_sessions(chat_session_id) ON DELETE CASCADE,
    sender          VARCHAR(10) NOT NULL CHECK (sender IN ('user','bot')),
    message_text    TEXT NOT NULL,
    sent_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Notification service (from context diagram)
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    message    VARCHAR(255) NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Indexes for common lookups
-- ---------------------------------------------------------------------
CREATE INDEX idx_calendar_date    ON calendar_entries(meal_date);
CREATE INDEX idx_inventory_expiry ON inventory_items(expiration_date);
CREATE INDEX idx_nutrition_user_date ON nutrition_logs(user_id, log_date);
CREATE INDEX idx_sessions_user    ON user_sessions(user_id);

-- ---------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------
INSERT INTO roles (role_name) VALUES ('user'), ('admin');

INSERT INTO dietary_preferences (name, pref_type) VALUES
  ('Vegetarian','diet'), ('Vegan','diet'), ('Gluten-Free','diet'),
  ('Keto','diet'), ('Peanut Allergy','allergy'), ('Dairy Allergy','allergy');

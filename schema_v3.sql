-- =====================================================================
-- Meal Plan Tracker (MealMate AI) - Group 5 - Sprint 3
-- Database: PostgreSQL 15+   (local PostgreSQL or Neon)
--
-- ONE script that builds the whole database (22 tables).
--   * Safe to run again and again: nothing is dropped, nothing is deleted.
--   * Safe to run against the live Neon database.
--   * Includes the two Sprint 3 tables that used to live in separate
--     migration files: grocery_list_items and recommendation_settings.
--
-- Run:  psql "$DATABASE_URL" -f schema_v3.sql
--   or: python setup_db.py
--
-- To wipe and rebuild a LOCAL dev database only, see reset_dev.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Login / Logout module + role management
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    role_id     SERIAL PRIMARY KEY,
    role_name   VARCHAR(20) NOT NULL UNIQUE      -- 'user', 'admin'
);

CREATE TABLE IF NOT EXISTS users (
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

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id   UUID PRIMARY KEY,
    user_id      INT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMP NOT NULL,
    revoked      BOOLEAN   NOT NULL DEFAULT FALSE  -- set TRUE on logout
);

-- ---------------------------------------------------------------------
-- 2. Dietary preferences
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dietary_preferences (
    preference_id   SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,   -- Vegan, Gluten-Free, Nut Allergy...
    pref_type       VARCHAR(15) NOT NULL CHECK (pref_type IN ('diet','allergy','dislike'))
);

CREATE TABLE IF NOT EXISTS user_dietary_preferences (
    user_id        INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    preference_id  INT NOT NULL REFERENCES dietary_preferences(preference_id),
    PRIMARY KEY (user_id, preference_id)
);

-- ---------------------------------------------------------------------
-- 3. Recipe database (+ portion scaling base data)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
    ingredient_id    SERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL UNIQUE,
    default_unit     VARCHAR(20)  NOT NULL,
    calories_per_unit NUMERIC(8,2) NOT NULL DEFAULT 0,
    protein_g        NUMERIC(8,2) NOT NULL DEFAULT 0,
    carbs_g          NUMERIC(8,2) NOT NULL DEFAULT 0,
    fat_g            NUMERIC(8,2) NOT NULL DEFAULT 0,
    price_per_unit   NUMERIC(8,2) NOT NULL DEFAULT 0
);

-- Sprint 3: category lets the Inventory page filter (produce / protein / dairy / grains / other)
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'other';

CREATE TABLE IF NOT EXISTS recipes (
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

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    recipe_id      INT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    ingredient_id  INT NOT NULL REFERENCES ingredients(ingredient_id),
    quantity       NUMERIC(8,2) NOT NULL CHECK (quantity > 0),  -- for base_servings
    unit           VARCHAR(20)  NOT NULL,
    PRIMARY KEY (recipe_id, ingredient_id)
);

-- ---------------------------------------------------------------------
-- 4. Interactive calendar (meal plans)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_plans (
    plan_id     SERIAL PRIMARY KEY,
    user_id     INT          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    plan_name   VARCHAR(100) NOT NULL,
    start_date  DATE         NOT NULL,
    end_date    DATE         NOT NULL,
    CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS calendar_entries (
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
CREATE TABLE IF NOT EXISTS inventory_items (
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
CREATE TABLE IF NOT EXISTS grocery_orders (
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

CREATE TABLE IF NOT EXISTS grocery_order_items (
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
CREATE TABLE IF NOT EXISTS goals (
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
CREATE TABLE IF NOT EXISTS budgets (
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
CREATE TABLE IF NOT EXISTS nutrition_logs (
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
CREATE TABLE IF NOT EXISTS recommendations (
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
CREATE TABLE IF NOT EXISTS chat_sessions (
    chat_session_id SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    message_id      SERIAL PRIMARY KEY,
    chat_session_id INT NOT NULL REFERENCES chat_sessions(chat_session_id) ON DELETE CASCADE,
    sender          VARCHAR(10) NOT NULL CHECK (sender IN ('user','bot')),
    message_text    TEXT NOT NULL,
    sent_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Notification service (from context diagram)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    message    VARCHAR(255) NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Indexes for common lookups
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_calendar_date    ON calendar_entries(meal_date);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory_items(expiration_date);
CREATE INDEX IF NOT EXISTS idx_nutrition_user_date ON nutrition_logs(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON user_sessions(user_id);

-- ---------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------
INSERT INTO roles (role_name) VALUES ('user'), ('admin')
  ON CONFLICT (role_name) DO NOTHING;

INSERT INTO dietary_preferences (name, pref_type) VALUES
  ('Vegetarian','diet'), ('Vegan','diet'), ('Gluten-Free','diet'),
  ('Keto','diet'), ('Peanut Allergy','allergy'), ('Dairy Allergy','allergy')
  ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- 12. Sprint 3 additions
-- ---------------------------------------------------------------------
-- Manual grocery list (Grocery List feature)
CREATE TABLE IF NOT EXISTS grocery_list_items (
    item_id         SERIAL PRIMARY KEY,
    user_id         INT           NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name            VARCHAR(120)  NOT NULL,
    quantity        NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    unit            VARCHAR(30)   NOT NULL,
    estimated_price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (estimated_price >= 0),
    purchased       BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- One row of recommendation preferences per user (Personalized Recommendations)
CREATE TABLE IF NOT EXISTS recommendation_settings (
    user_id    INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    diet       VARCHAR(20)   NOT NULL DEFAULT 'any',
    allergies  TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    max_cost   NUMERIC(10,2) NOT NULL DEFAULT 8 CHECK (max_cost > 0)
);

-- ---------------------------------------------------------------------
-- Extra indexes: every API query below filters by these columns
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS grocery_list_items_user_idx ON grocery_list_items(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user        ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user          ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user  ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sess  ON chat_messages(chat_session_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user     ON meal_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_plan       ON calendar_entries(plan_id);
CREATE INDEX IF NOT EXISTS idx_users_status        ON users(account_status);

-- ---------------------------------------------------------------------
-- Hardening: make the database enforce the same rules as the API.
-- NOT VALID = enforced for new/changed rows, existing rows are not
-- re-checked, so this cannot fail on data that is already in Neon.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_settings_diet_chk') THEN
    ALTER TABLE recommendation_settings ADD CONSTRAINT recommendation_settings_diet_chk
      CHECK (diet IN ('any','vegetarian','vegan','high-protein','gluten-free')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budgets_spent_nonneg_chk') THEN
    ALTER TABLE budgets ADD CONSTRAINT budgets_spent_nonneg_chk
      CHECK (spent_amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goals_target_positive_chk') THEN
    ALTER TABLE goals ADD CONSTRAINT goals_target_positive_chk
      CHECK (target_value > 0 AND current_value >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_lower_chk') THEN
    ALTER TABLE users ADD CONSTRAINT users_email_lower_chk
      CHECK (email = lower(email)) NOT VALID;
  END IF;
END $$;

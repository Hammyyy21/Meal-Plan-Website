-- =====================================================================
-- Meal Plan Tracker (MealMate AI) - Group 5 - Sprint 4
-- Database: PostgreSQL 15+   (local PostgreSQL or Neon)
--
-- Run this AFTER schema_v3.sql.   psql "$DATABASE_URL" -f schema_v4.sql
--   * Safe to run again and again: nothing is dropped, nothing is deleted.
--   * Adds 3 tables (user_settings, recipe_favorites, water_logs) -> 25 tables total.
--   * Adds nutrition / tag columns to recipes and loads 13 starter recipes with
--     their ingredients, so Recipes, Calendar, Nutrition and the grocery list
--     work from the database instead of the browser.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Recipes: description, tags, allergens and nutrition PER SERVING
--    (recipe_ingredients quantities are for base_servings; see UC-07 scaling)
-- ---------------------------------------------------------------------
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS description      TEXT          NOT NULL DEFAULT '';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS emoji            VARCHAR(8)    NOT NULL DEFAULT '🍽️';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS tags             TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS allergens        TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS calories         NUMERIC(8,2)  NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS protein_g        NUMERIC(8,2)  NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS carbs_g          NUMERIC(8,2)  NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fat_g            NUMERIC(8,2)  NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cost_per_serving NUMERIC(8,2)  NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS recipes_title_uq ON recipes (lower(title));

-- ---------------------------------------------------------------------
-- 2. New tables
-- ---------------------------------------------------------------------
-- One row of personal goals per user (Preferences page, UC-04)
CREATE TABLE IF NOT EXISTS user_settings (
    user_id        INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    primary_goal   VARCHAR(30)   NOT NULL DEFAULT 'Maintain weight',
    calorie_goal   INT           NOT NULL DEFAULT 2000 CHECK (calorie_goal BETWEEN 500 AND 10000),
    weekly_budget  NUMERIC(10,2) NOT NULL DEFAULT 100  CHECK (weekly_budget >= 0),
    meals_per_day  INT           NOT NULL DEFAULT 3    CHECK (meals_per_day BETWEEN 1 AND 6)
);

-- Heart button on the Recipes page
CREATE TABLE IF NOT EXISTS recipe_favorites (
    user_id    INT       NOT NULL REFERENCES users(user_id)     ON DELETE CASCADE,
    recipe_id  INT       NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, recipe_id)
);

-- Hydration tracker on the Nutrition page
CREATE TABLE IF NOT EXISTS water_logs (
    user_id  INT  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    glasses  INT  NOT NULL DEFAULT 0 CHECK (glasses BETWEEN 0 AND 20),
    PRIMARY KEY (user_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_recipes_tags       ON recipes USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_favorites_user     ON recipe_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_grocery_orders_user ON grocery_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_user     ON inventory_items(user_id);

-- ---------------------------------------------------------------------
-- 3. Extra dietary preference rows (Preferences page -> user_dietary_preferences)
-- ---------------------------------------------------------------------
INSERT INTO dietary_preferences (name, pref_type) VALUES
  ('Pescatarian','diet'), ('Low Carb','diet'), ('High Protein','diet'),
  ('Shellfish Allergy','allergy'), ('Gluten Allergy','allergy'), ('Soy Allergy','allergy')
  ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Starter ingredients (price and nutrition are rough estimates per unit)
--    columns: name, unit, kcal, protein g, carbs g, fat g, price $, category
-- ---------------------------------------------------------------------
INSERT INTO ingredients (name, default_unit, calories_per_unit, protein_g, carbs_g, fat_g, price_per_unit, category) VALUES
  ('Greek Yogurt','cups',130,17,9,0.7,1.20,'dairy'),
  ('Mixed Berries','cups',70,1,17,0.5,1.60,'produce'),
  ('Granola','cups',420,10,64,14,1.10,'grains'),
  ('Honey','tbsp',64,0,17,0,0.25,'other'),
  ('Chia Seeds','tbsp',60,2,5,4,0.30,'other'),
  ('Chicken Breast','lbs',500,95,0,11,3.80,'protein'),
  ('Brown Rice','cups',215,5,45,1.8,0.50,'grains'),
  ('Jasmine Rice','cups',205,4,45,0.4,0.50,'grains'),
  ('Avocado','items',240,3,13,22,1.00,'produce'),
  ('Mixed Greens','cups',10,1,2,0,0.60,'produce'),
  ('Corn','cups',130,5,29,2,0.60,'produce'),
  ('Salsa','cups',70,3,16,0,1.50,'other'),
  ('Pasta','oz',105,4,21,0.6,0.20,'grains'),
  ('Garlic','cloves',4,0.2,1,0,0.10,'produce'),
  ('Spinach','cups',7,0.9,1,0.1,0.70,'produce'),
  ('Parmesan Cheese','cups',420,38,4,28,3.00,'dairy'),
  ('Heavy Cream','cups',820,5,7,88,3.20,'dairy'),
  ('Olive Oil','tbsp',120,0,0,14,0.25,'other'),
  ('Whole Grain Bread','items',80,4,14,1,0.30,'grains'),
  ('Eggs','items',70,6,0.5,5,0.30,'protein'),
  ('Chili Flakes','tsp',6,0.3,1,0.3,0.05,'other'),
  ('Salmon Fillet','lbs',940,100,0,58,9.00,'protein'),
  ('Cucumber','items',45,2,11,0.3,0.80,'produce'),
  ('Sesame Seeds','tbsp',50,1.6,2,4.5,0.20,'other'),
  ('Tortilla Wrap','items',140,4,24,3,0.40,'grains'),
  ('Hummus','cups',400,20,36,24,2.50,'other'),
  ('Tomato','items',22,1,5,0.2,0.50,'produce'),
  ('Feta Cheese','cups',400,21,6,32,3.20,'dairy'),
  ('Tofu','oz',22,2.3,0.6,1.3,0.20,'protein'),
  ('Broccoli','cups',30,2.5,6,0.3,0.90,'produce'),
  ('Bell Peppers','items',35,1,8,0.3,0.80,'produce'),
  ('Soy Sauce','tbsp',10,1,1,0,0.10,'other'),
  ('Rolled Oats','cups',300,10,54,5,0.50,'grains'),
  ('Banana','items',105,1.3,27,0.4,0.30,'produce'),
  ('Turkey Slices','oz',30,5,0.5,1,0.45,'protein'),
  ('Corn Tortillas','items',55,1.4,11,0.7,0.20,'grains'),
  ('Shredded Cheese','cups',450,28,4,36,2.60,'dairy'),
  ('Lentils','cups',680,50,115,2,1.40,'grains'),
  ('Carrots','items',25,0.6,6,0.1,0.25,'produce'),
  ('Celery','items',10,0.4,2,0.1,0.30,'produce'),
  ('Diced Tomatoes','cups',40,2,9,0.4,1.00,'produce'),
  ('Onion','items',45,1.2,10,0.1,0.50,'produce'),
  ('Vegetable Broth','cups',15,0,3,0,0.40,'other'),
  ('Romaine Lettuce','cups',8,0.6,1.6,0.1,0.50,'produce'),
  ('Croutons','cups',120,3,22,2,0.80,'grains'),
  ('Caesar Dressing','tbsp',80,0.5,1,8,0.25,'other'),
  ('Zucchini','items',33,2.4,6,0.6,0.70,'produce')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Starter recipes. Nutrition and cost are PER SERVING (estimates).
--    Quantities in recipe_ingredients are for base_servings.
-- ---------------------------------------------------------------------
INSERT INTO recipes (title, description, emoji, tags, allergens, instructions, base_servings,
                     prep_minutes, cook_minutes, calories, protein_g, carbs_g, fat_g, cost_per_serving, is_approved)
SELECT v.title, v.description, v.emoji, v.tags, v.allergens, v.instructions, v.base_servings,
       v.prep, v.cook, v.cal, v.p, v.c, v.f, v.cost, TRUE
FROM (VALUES
  ('Greek Yogurt Berry Bowl','Greek yogurt, fresh berries, granola, honey, and chia seeds.','🫐',
    ARRAY['breakfast','high-protein','vegetarian','quick'], ARRAY['dairy','gluten'],
    '1. Spoon the yogurt into a bowl. 2. Top with berries and granola. 3. Drizzle with honey and sprinkle chia seeds.',
    1, 10, 0, 380, 28, 45, 9, 2.90),
  ('Grilled Chicken Power Bowl','Chicken, brown rice, avocado, greens, corn, and fresh salsa.','🥗',
    ARRAY['lunch','dinner','high-protein','gluten-free'], ARRAY[]::text[],
    '1. Cook the rice. 2. Grill the chicken 6-7 minutes per side and slice. 3. Build bowls with rice, greens, corn, avocado, chicken and salsa.',
    2, 10, 15, 540, 46, 48, 17, 4.50),
  ('Creamy Garlic Pasta','Pasta tossed with garlic, spinach, parmesan, and herbs.','🍝',
    ARRAY['dinner','vegetarian'], ARRAY['gluten','dairy'],
    '1. Boil the pasta. 2. Saute garlic in olive oil, add spinach and cream. 3. Toss with pasta and parmesan.',
    2, 5, 15, 610, 22, 78, 24, 3.40),
  ('Avocado Egg Toast','Whole grain toast topped with avocado, egg, and chili flakes.','🥑',
    ARRAY['breakfast','vegetarian','quick'], ARRAY['eggs','gluten'],
    '1. Toast the bread. 2. Fry or poach the eggs. 3. Mash the avocado on the toast, add the eggs and chili flakes.',
    1, 5, 7, 420, 21, 32, 24, 2.60),
  ('Salmon Rice Bowl','Salmon, jasmine rice, cucumber, avocado, and sesame.','🐟',
    ARRAY['dinner','high-protein','gluten-free','pescatarian'], ARRAY['fish','sesame'],
    '1. Cook the rice. 2. Pan-sear the salmon 4 minutes per side. 3. Serve over rice with cucumber, avocado and sesame seeds.',
    2, 10, 20, 590, 40, 58, 20, 7.10),
  ('Mediterranean Wrap','Hummus, spinach, tomato, cucumber, feta, and herbs.','🌯',
    ARRAY['lunch','vegetarian','quick'], ARRAY['gluten','dairy','sesame'],
    '1. Spread hummus on the wrap. 2. Add spinach, tomato, cucumber and feta. 3. Roll tightly and slice.',
    1, 15, 0, 450, 19, 52, 18, 3.30),
  ('Veggie Tofu Stir-Fry','Crispy tofu, broccoli and peppers in a soy glaze over rice.','🥦',
    ARRAY['dinner','vegan','vegetarian','quick'], ARRAY['soy'],
    '1. Cook the rice. 2. Brown the cubed tofu in a hot pan. 3. Add broccoli and peppers, then soy sauce. Serve over rice.',
    2, 10, 15, 410, 22, 40, 18, 3.80),
  ('Oatmeal and Berries','Warm rolled oats with banana, berries and chia seeds.','🥣',
    ARRAY['breakfast','vegan','vegetarian','quick'], ARRAY[]::text[],
    '1. Simmer the oats in water for 5 minutes. 2. Top with sliced banana, berries and chia seeds.',
    1, 2, 8, 350, 10, 60, 7, 1.90),
  ('Turkey Wrap','Sliced turkey, greens and tomato in a soft tortilla.','🌯',
    ARRAY['lunch','high-protein','quick'], ARRAY['gluten'],
    '1. Lay turkey, greens and tomato on the tortilla. 2. Roll tightly and slice in half.',
    1, 10, 0, 510, 34, 45, 20, 4.10),
  ('Chicken Tacos','Seasoned chicken in corn tortillas with salsa, greens and cheese.','🌮',
    ARRAY['dinner','high-protein'], ARRAY['dairy'],
    '1. Cook and shred the chicken. 2. Warm the tortillas. 3. Fill with chicken, greens, salsa and cheese.',
    2, 10, 15, 650, 36, 60, 28, 4.90),
  ('Lentil Vegetable Soup','Lentils, carrots, celery and tomatoes simmered together.','🍲',
    ARRAY['dinner','lunch','vegan','vegetarian','gluten-free'], ARRAY[]::text[],
    '1. Saute the onion, carrots and celery. 2. Add lentils, tomatoes and broth. 3. Simmer 30 minutes.',
    4, 10, 30, 350, 19, 55, 4, 2.80),
  ('Caesar Salad','Romaine, grilled chicken, parmesan, croutons and Caesar dressing.','🥬',
    ARRAY['lunch','quick'], ARRAY['dairy','eggs','gluten','fish'],
    '1. Grill and slice the chicken. 2. Toss romaine with dressing. 3. Top with chicken, parmesan and croutons.',
    1, 10, 5, 450, 18, 25, 30, 3.60),
  ('Grilled Chicken and Veggies','Grilled chicken breast with zucchini and bell peppers.','🍗',
    ARRAY['dinner','high-protein','gluten-free'], ARRAY[]::text[],
    '1. Season the chicken and vegetables with olive oil. 2. Grill the chicken 7 minutes per side. 3. Grill the vegetables until tender.',
    2, 10, 20, 590, 48, 20, 30, 5.20)
) AS v(title, description, emoji, tags, allergens, instructions, base_servings, prep, cook, cal, p, c, f, cost)
WHERE NOT EXISTS (SELECT 1 FROM recipes r WHERE lower(r.title) = lower(v.title));

INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
SELECT r.recipe_id, i.ingredient_id, v.qty, v.unit
FROM (VALUES
  ('Greek Yogurt Berry Bowl','Greek Yogurt',1,'cups'), ('Greek Yogurt Berry Bowl','Mixed Berries',0.5,'cups'),
  ('Greek Yogurt Berry Bowl','Granola',0.25,'cups'),   ('Greek Yogurt Berry Bowl','Honey',1,'tbsp'),
  ('Greek Yogurt Berry Bowl','Chia Seeds',1,'tbsp'),
  ('Grilled Chicken Power Bowl','Chicken Breast',1,'lbs'), ('Grilled Chicken Power Bowl','Brown Rice',1,'cups'),
  ('Grilled Chicken Power Bowl','Avocado',1,'items'),      ('Grilled Chicken Power Bowl','Mixed Greens',2,'cups'),
  ('Grilled Chicken Power Bowl','Corn',0.5,'cups'),        ('Grilled Chicken Power Bowl','Salsa',0.25,'cups'),
  ('Creamy Garlic Pasta','Pasta',8,'oz'),            ('Creamy Garlic Pasta','Garlic',3,'cloves'),
  ('Creamy Garlic Pasta','Spinach',2,'cups'),        ('Creamy Garlic Pasta','Parmesan Cheese',0.5,'cups'),
  ('Creamy Garlic Pasta','Heavy Cream',0.5,'cups'),  ('Creamy Garlic Pasta','Olive Oil',1,'tbsp'),
  ('Avocado Egg Toast','Whole Grain Bread',2,'items'), ('Avocado Egg Toast','Avocado',1,'items'),
  ('Avocado Egg Toast','Eggs',2,'items'),              ('Avocado Egg Toast','Chili Flakes',0.25,'tsp'),
  ('Salmon Rice Bowl','Salmon Fillet',1,'lbs'),  ('Salmon Rice Bowl','Jasmine Rice',1,'cups'),
  ('Salmon Rice Bowl','Cucumber',1,'items'),     ('Salmon Rice Bowl','Avocado',1,'items'),
  ('Salmon Rice Bowl','Sesame Seeds',1,'tbsp'),
  ('Mediterranean Wrap','Tortilla Wrap',1,'items'), ('Mediterranean Wrap','Hummus',0.25,'cups'),
  ('Mediterranean Wrap','Spinach',1,'cups'),        ('Mediterranean Wrap','Tomato',1,'items'),
  ('Mediterranean Wrap','Cucumber',0.5,'items'),    ('Mediterranean Wrap','Feta Cheese',0.25,'cups'),
  ('Veggie Tofu Stir-Fry','Tofu',14,'oz'),          ('Veggie Tofu Stir-Fry','Broccoli',2,'cups'),
  ('Veggie Tofu Stir-Fry','Bell Peppers',2,'items'),('Veggie Tofu Stir-Fry','Soy Sauce',2,'tbsp'),
  ('Veggie Tofu Stir-Fry','Brown Rice',1,'cups'),
  ('Oatmeal and Berries','Rolled Oats',0.5,'cups'), ('Oatmeal and Berries','Mixed Berries',0.5,'cups'),
  ('Oatmeal and Berries','Banana',1,'items'),       ('Oatmeal and Berries','Chia Seeds',1,'tbsp'),
  ('Turkey Wrap','Tortilla Wrap',1,'items'),  ('Turkey Wrap','Turkey Slices',4,'oz'),
  ('Turkey Wrap','Mixed Greens',1,'cups'),    ('Turkey Wrap','Tomato',1,'items'),
  ('Chicken Tacos','Chicken Breast',1,'lbs'),  ('Chicken Tacos','Corn Tortillas',6,'items'),
  ('Chicken Tacos','Salsa',0.5,'cups'),        ('Chicken Tacos','Shredded Cheese',0.5,'cups'),
  ('Chicken Tacos','Mixed Greens',1,'cups'),
  ('Lentil Vegetable Soup','Lentils',1,'cups'),        ('Lentil Vegetable Soup','Carrots',3,'items'),
  ('Lentil Vegetable Soup','Celery',2,'items'),        ('Lentil Vegetable Soup','Diced Tomatoes',1,'cups'),
  ('Lentil Vegetable Soup','Onion',1,'items'),         ('Lentil Vegetable Soup','Vegetable Broth',4,'cups'),
  ('Caesar Salad','Romaine Lettuce',2,'cups'),  ('Caesar Salad','Chicken Breast',0.25,'lbs'),
  ('Caesar Salad','Parmesan Cheese',0.25,'cups'), ('Caesar Salad','Croutons',0.5,'cups'),
  ('Caesar Salad','Caesar Dressing',2,'tbsp'),
  ('Grilled Chicken and Veggies','Chicken Breast',1,'lbs'), ('Grilled Chicken and Veggies','Zucchini',2,'items'),
  ('Grilled Chicken and Veggies','Bell Peppers',2,'items'), ('Grilled Chicken and Veggies','Olive Oil',1,'tbsp')
) AS v(title, ing, qty, unit)
JOIN recipes     r ON lower(r.title) = lower(v.title)
JOIN ingredients i ON lower(i.name)  = lower(v.ing)
ON CONFLICT (recipe_id, ingredient_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. Hardening: the database enforces the same rules as the API
--    (NOT VALID = new/changed rows are checked, existing rows are not re-checked)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_nutrition_chk') THEN
    ALTER TABLE recipes ADD CONSTRAINT recipes_nutrition_chk
      CHECK (calories >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0 AND cost_per_serving >= 0) NOT VALID;
  END IF;
END $$;

-- ---- Goals: each goal type has its own fields (start value for weight goals, a label for custom goals)
ALTER TABLE goals ADD COLUMN IF NOT EXISTS start_value NUMERIC(8,2);
ALTER TABLE goals ADD COLUMN IF NOT EXISTS label VARCHAR(80);
-- Older goals have no start value: use the saved value so weight goals can show progress from here on.
UPDATE goals SET start_value = current_value
 WHERE start_value IS NULL AND goal_type IN ('weight_loss','weight_gain','maintain') AND current_value > 0;

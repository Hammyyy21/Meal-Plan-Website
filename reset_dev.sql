-- =====================================================================
-- DEV ONLY - DESTROYS ALL DATA.  Never run this against Neon / Render.
-- Drops every Meal Plan Tracker table so schema_v3.sql can rebuild them.
--   psql -U postgres -d mealplan -f reset_dev.sql -f schema_v3.sql
-- =====================================================================
DROP TABLE IF EXISTS recommendation_settings, grocery_list_items,
    chat_messages, chat_sessions, notifications,
    recommendations, nutrition_logs, budgets, goals, grocery_order_items,
    grocery_orders, inventory_items, calendar_entries, meal_plans,
    recipe_ingredients, recipes, ingredients, user_dietary_preferences,
    dietary_preferences, user_sessions, users, roles CASCADE;

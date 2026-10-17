-- Run once against Neon; safe to rerun, does not delete existing data.
CREATE TABLE IF NOT EXISTS grocery_list_items (
  item_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(30) NOT NULL,
  estimated_price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (estimated_price >= 0),
  purchased BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS grocery_list_items_user_idx ON grocery_list_items(user_id);

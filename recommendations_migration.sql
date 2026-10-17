-- Safe, additive migration. Do NOT rerun schema.sql against Neon.
CREATE TABLE IF NOT EXISTS recommendation_settings (
    user_id INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    diet VARCHAR(20) NOT NULL DEFAULT 'any',
    allergies TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    max_cost NUMERIC(10,2) NOT NULL DEFAULT 8 CHECK(max_cost > 0)
);

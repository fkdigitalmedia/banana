-- categories table first (referenced by recipes)
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- recipes
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'IMPORTED' CHECK(status IN ('IMPORTED','PROCESSING','GENERATED','VALIDATED','DRAFT','PUBLISHED','FAILED')),
  source_url TEXT,
  source_domain TEXT,
  hero_image_key TEXT,
  prep_time INTEGER,
  cook_time INTEGER,
  total_time INTEGER,
  servings TEXT,
  category_id INTEGER REFERENCES categories(id),
  cuisine TEXT,
  keywords TEXT,
  equipment TEXT,
  nutrition TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);

-- ingredients
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  quantity TEXT,
  unit TEXT,
  name TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- instructions
CREATE TABLE IF NOT EXISTS instructions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction TEXT NOT NULL
);

-- recipe_content (AI-generated editorial)
CREATE TABLE IF NOT EXISTS recipe_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL UNIQUE REFERENCES recipes(id) ON DELETE CASCADE,
  introduction TEXT,
  why_this_recipe TEXT,
  ingredient_guidance TEXT,
  cooking_guidance TEXT,
  tips TEXT,
  variations TEXT,
  serving_suggestions TEXT,
  storage TEXT,
  faq TEXT,
  full_article TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- recipe_seo
CREATE TABLE IF NOT EXISTS recipe_seo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL UNIQUE REFERENCES recipes(id) ON DELETE CASCADE,
  seo_title TEXT,
  meta_description TEXT,
  canonical_url TEXT,
  og_title TEXT,
  og_description TEXT
);

-- generation_jobs
CREATE TABLE IF NOT EXISTS generation_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER REFERENCES recipes(id),
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  current_stage TEXT,
  error_message TEXT,
  stage_results TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_recipes_slug ON recipes(slug);
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category_id);
CREATE INDEX IF NOT EXISTS idx_recipes_published_at ON recipes(published_at);
CREATE INDEX IF NOT EXISTS idx_ingredients_recipe ON ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_instructions_recipe ON instructions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_recipe ON generation_jobs(recipe_id);

-- seed default categories
INSERT OR IGNORE INTO categories (name, slug, description) VALUES
  ('Bread', 'bread', 'Homemade bread recipes'),
  ('Breakfast', 'breakfast', 'Morning recipes to start your day'),
  ('Baking', 'baking', 'Baked goods and pastries'),
  ('Desserts', 'desserts', 'Sweet treats and desserts'),
  ('Cookies', 'cookies', 'Cookie recipes for every occasion'),
  ('Cakes', 'cakes', 'Layer cakes, sheet cakes, and more'),
  ('Muffins', 'muffins', 'Muffin recipes sweet and savory');

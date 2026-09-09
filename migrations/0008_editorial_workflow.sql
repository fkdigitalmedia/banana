-- Migration 0008: Editorial Review & Approval Workflow
-- Adds REVIEW_REQUIRED, APPROVED, UNPUBLISHED states, stale tracking, and revision log

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS recipes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('IMPORTED','PROCESSING','GENERATED','VALIDATED','DRAFT','REVIEW_REQUIRED','APPROVED','PUBLISHED','UNPUBLISHED','FAILED')),
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
  published_at TEXT,
  original_image_url TEXT,
  yield_text TEXT,
  extraction_method TEXT,
  extraction_confidence TEXT,
  raw_extraction_data TEXT,
  fact_sheet TEXT,
  notes TEXT,
  image_status TEXT DEFAULT 'PENDING',
  image_prompt TEXT,
  image_provider TEXT,
  image_model TEXT,
  image_width INTEGER,
  image_height INTEGER,
  image_generated_at TEXT,
  image_error TEXT,
  quality_status TEXT DEFAULT 'QUALITY_PENDING',
  quality_score INTEGER DEFAULT 0,
  quality_report TEXT,
  quality_checked_at TEXT,
  content_stale INTEGER DEFAULT 0,
  approved_at TEXT,
  approved_by TEXT
);

INSERT INTO recipes_new (
  id, title, slug, description, status, source_url, source_domain, hero_image_key,
  prep_time, cook_time, total_time, servings, category_id, cuisine, keywords,
  equipment, nutrition, created_at, updated_at, published_at,
  original_image_url, yield_text, extraction_method, extraction_confidence,
  raw_extraction_data, fact_sheet, notes,
  image_status, image_prompt, image_provider, image_model, image_width,
  image_height, image_generated_at, image_error,
  quality_status, quality_score, quality_report, quality_checked_at
)
SELECT 
  id, title, slug, description, status, source_url, source_domain, hero_image_key,
  prep_time, cook_time, total_time, servings, category_id, cuisine, keywords,
  equipment, nutrition, created_at, updated_at, published_at,
  original_image_url, yield_text, extraction_method, extraction_confidence,
  raw_extraction_data, fact_sheet, notes,
  image_status, image_prompt, image_provider, image_model, image_width,
  image_height, image_generated_at, image_error,
  quality_status, quality_score, quality_report, quality_checked_at
FROM recipes;

DROP TABLE recipes;
ALTER TABLE recipes_new RENAME TO recipes;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_recipes_slug ON recipes(slug);
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category_id);
CREATE INDEX IF NOT EXISTS idx_recipes_published_at ON recipes(published_at);
CREATE INDEX IF NOT EXISTS idx_recipes_status_slug ON recipes(status, slug);
CREATE INDEX IF NOT EXISTS idx_recipes_status_pub ON recipes(status, published_at DESC);

PRAGMA foreign_keys=ON;

-- Revision tracking table for editorial audit log
CREATE TABLE IF NOT EXISTS recipe_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  changed_by TEXT NOT NULL DEFAULT 'admin',
  change_type TEXT NOT NULL, -- FACT_EDIT, CONTENT_EDIT, SECTION_REGENERATED, SEO_EDIT, IMAGE_REGENERATED, APPROVED, PUBLISHED, UNPUBLISHED
  notes TEXT,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipe_revisions_recipe ON recipe_revisions(recipe_id, changed_at DESC);

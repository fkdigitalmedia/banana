-- Migration 0011: Source Recipe Image Import & R2 Storage
-- Tracks source and generated recipe images, dimensions, file size, provenance, and rights status

CREATE TABLE IF NOT EXISTS recipe_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('SOURCE', 'GENERATED')),
  source_url TEXT,
  r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'DOWNLOADING', 'PROCESSING', 'UPLOADING', 'READY', 'FAILED')),
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  alt_text TEXT,
  image_rights_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK(image_rights_status IN ('UNKNOWN', 'REVIEW_REQUIRED', 'APPROVED')),
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recipe_images_recipe ON recipe_images(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_images_type ON recipe_images(type);
CREATE INDEX IF NOT EXISTS idx_recipe_images_status ON recipe_images(status);

-- Auxiliary image tracking columns on recipes
ALTER TABLE recipes ADD COLUMN hero_image_type TEXT DEFAULT 'SOURCE';
ALTER TABLE recipes ADD COLUMN source_image_r2_key TEXT;
ALTER TABLE recipes ADD COLUMN generated_image_key TEXT;
ALTER TABLE recipes ADD COLUMN source_image_status TEXT DEFAULT 'PENDING';
ALTER TABLE recipes ADD COLUMN image_rights_status TEXT DEFAULT 'REVIEW_REQUIRED';

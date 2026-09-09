-- Migration 0005: Technical SEO Redirects Table
-- Stores redirect history when recipe slugs change to prevent broken URLs and redirect chains.

CREATE TABLE IF NOT EXISTS recipe_redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_slug TEXT NOT NULL UNIQUE,
  target_slug TEXT NOT NULL,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  http_status INTEGER NOT NULL DEFAULT 301,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_redirects_old_slug ON recipe_redirects(old_slug);
CREATE INDEX IF NOT EXISTS idx_redirects_recipe_id ON recipe_redirects(recipe_id);

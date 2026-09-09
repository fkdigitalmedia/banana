-- Migration 0009: Internal Linking & Related Recipe Cache
-- Stores pre-computed deterministic related recipe IDs for high-speed public page rendering.

CREATE TABLE IF NOT EXISTS recipe_related_cache (
  recipe_id INTEGER PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  related_ids TEXT NOT NULL, -- JSON array of related recipe IDs: [id1, id2, ...]
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_related_cache_updated ON recipe_related_cache(updated_at);

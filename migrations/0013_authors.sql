-- Migration 0013: Author Profile and Social Media Links
-- Stores author identity, bio, avatar, and social platforms

CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'BananaBread Baker',
  role_title TEXT DEFAULT 'Head Baker & Recipe Developer',
  bio TEXT,
  avatar_url TEXT,
  avatar_r2_key TEXT,
  social_instagram TEXT,
  social_pinterest TEXT,
  social_youtube TEXT,
  social_facebook TEXT,
  social_twitter TEXT,
  website_url TEXT,
  email TEXT,
  is_default INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_authors_default ON authors(is_default);

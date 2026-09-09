-- Migration 0007: Production Hardening & Reliability
-- Safe to run after 0006_bulk_import.sql

-- Add distributed locking columns to generation_jobs
ALTER TABLE generation_jobs ADD COLUMN locked_at TEXT;
ALTER TABLE generation_jobs ADD COLUMN locked_by TEXT;

-- Composite indexes for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_generation_jobs_lock ON generation_jobs(status, locked_at);
CREATE INDEX IF NOT EXISTS idx_recipes_status_slug ON recipes(status, slug);
CREATE INDEX IF NOT EXISTS idx_recipes_status_pub ON recipes(status, published_at DESC);

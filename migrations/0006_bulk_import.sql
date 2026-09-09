-- Migration 0006: Bulk Recipe Import & Generation Queue
-- Creates tables to track bulk import batches and individual recipe queue items.

CREATE TABLE IF NOT EXISTS bulk_import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','PROCESSING','COMPLETED','COMPLETED_WITH_ERRORS','FAILED','CANCELLED')),
  total_count INTEGER NOT NULL DEFAULT 0,
  queued_count INTEGER NOT NULL DEFAULT 0,
  processing_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  concurrency_limit INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bulk_import_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bulk_job_id INTEGER NOT NULL REFERENCES bulk_import_jobs(id) ON DELETE CASCADE,
  pipeline_job_id INTEGER REFERENCES generation_jobs(id),
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','PROCESSING','COMPLETED','FAILED','CANCELLED','SKIPPED_DUPLICATE')),
  current_stage TEXT,
  recipe_id INTEGER REFERENCES recipes(id),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bulk_items_job_id ON bulk_import_items(bulk_job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_items_status ON bulk_import_items(status);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_status ON bulk_import_jobs(status);

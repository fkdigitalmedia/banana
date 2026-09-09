-- Migration 0004: Recipe Content Quality & Fact Consistency Engine
-- Adds quality assessment tracking columns to recipes table

ALTER TABLE recipes ADD COLUMN quality_status TEXT DEFAULT 'QUALITY_PENDING';
ALTER TABLE recipes ADD COLUMN quality_score INTEGER DEFAULT 0;
ALTER TABLE recipes ADD COLUMN quality_report TEXT;
ALTER TABLE recipes ADD COLUMN quality_checked_at TEXT;

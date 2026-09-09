-- Migration 0003: Recipe Image Generation with Runware FLUX.1 Schnell
-- Add image status and tracking columns to recipes

ALTER TABLE recipes ADD COLUMN image_status TEXT DEFAULT 'PENDING';
ALTER TABLE recipes ADD COLUMN image_prompt TEXT;
ALTER TABLE recipes ADD COLUMN image_provider TEXT;
ALTER TABLE recipes ADD COLUMN image_model TEXT;
ALTER TABLE recipes ADD COLUMN image_width INTEGER;
ALTER TABLE recipes ADD COLUMN image_height INTEGER;
ALTER TABLE recipes ADD COLUMN image_generated_at TEXT;
ALTER TABLE recipes ADD COLUMN image_error TEXT;

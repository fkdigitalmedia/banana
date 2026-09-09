-- Migration 0012: In-Article & Step Image Placement Tracking
-- Adds placement, step_number, and caption to recipe_images table

ALTER TABLE recipe_images ADD COLUMN placement TEXT DEFAULT 'ARTICLE';
ALTER TABLE recipe_images ADD COLUMN step_number INTEGER;
ALTER TABLE recipe_images ADD COLUMN caption TEXT;

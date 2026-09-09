-- Migration 0002: Extraction improvements. Safe to run after 0001.
ALTER TABLE recipes ADD COLUMN original_image_url TEXT;
ALTER TABLE recipes ADD COLUMN yield_text TEXT;
ALTER TABLE recipes ADD COLUMN extraction_method TEXT;
ALTER TABLE recipes ADD COLUMN extraction_confidence TEXT;
ALTER TABLE recipes ADD COLUMN raw_extraction_data TEXT;
ALTER TABLE recipes ADD COLUMN fact_sheet TEXT;
ALTER TABLE recipes ADD COLUMN notes TEXT;
ALTER TABLE ingredients ADD COLUMN original_text TEXT;

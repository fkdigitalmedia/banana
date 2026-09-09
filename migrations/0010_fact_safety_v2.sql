-- Migration 0010: Fact Safety Engine v2 & Claim Ledger
-- Adds prompt versioning and structured claim ledger audit records

ALTER TABLE recipes ADD COLUMN content_prompt_version TEXT DEFAULT 'v2';
ALTER TABLE recipes ADD COLUMN claim_ledger TEXT;
ALTER TABLE recipe_content ADD COLUMN content_prompt_version TEXT DEFAULT 'v2';

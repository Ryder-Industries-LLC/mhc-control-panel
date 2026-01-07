-- Migration 040: Add names columns to profiles
-- Adds IRL name (private), identity name (safe to display), and address_as terms

-- IRL Name - private, never displayed publicly
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS irl_name TEXT;

-- Identity Name - safe to use/display
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_name TEXT;

-- Address As - terms to address this person by (Sir, Pup, Master, etc.)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_as TEXT[] DEFAULT '{}';

-- Comments
COMMENT ON COLUMN profiles.irl_name IS 'Private IRL name - never display publicly';
COMMENT ON COLUMN profiles.identity_name IS 'Safe to use/display identity name';
COMMENT ON COLUMN profiles.address_as IS 'Terms to address this person by (Sir, Pup, Master, etc.)';

-- Migration 026: Add watch_list field to profiles
-- For tracking users you want to pay special attention to

-- Add watch_list boolean field (defaults to false)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS watch_list BOOLEAN DEFAULT false;

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_profiles_watch_list ON profiles (watch_list) WHERE watch_list = true;

-- Add comment
COMMENT ON COLUMN profiles.watch_list IS 'Users to pay special attention to - may or may not be following';

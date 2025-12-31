-- Migration: 034_add_social_links_column.sql
-- Description: Add social_links JSONB column to profiles table

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';

-- Create index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_profiles_social_links ON profiles USING gin(social_links);

COMMENT ON COLUMN profiles.social_links IS 'JSON object storing social media links: { "platform": "url", ... }';

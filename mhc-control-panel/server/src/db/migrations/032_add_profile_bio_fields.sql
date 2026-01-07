-- Migration 032: Add additional Chaturbate bio fields to profiles
-- Adds fields for displaying complete profile information

-- Real name from bio (if publicly shared)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS real_name TEXT;

-- Videos count (number of recorded videos)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS videos_count INTEGER DEFAULT 0;

-- About me text (full bio content)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS about_me TEXT;

-- Wish list URL or content
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wish_list TEXT;

-- Comments for documentation
COMMENT ON COLUMN profiles.real_name IS 'Real name from Chaturbate bio if publicly shared';
COMMENT ON COLUMN profiles.videos_count IS 'Number of recorded videos on profile';
COMMENT ON COLUMN profiles.about_me IS 'Full about me text from Chaturbate bio';
COMMENT ON COLUMN profiles.wish_list IS 'Wish list URL or content from bio';

-- Add follower and following tracking fields to profiles
-- follower: true if they are following me
-- following: true if I am following them

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS following BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS follower BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS following_checked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS follower_checked_at TIMESTAMP;

COMMENT ON COLUMN profiles.following IS 'True if I am following this broadcaster';
COMMENT ON COLUMN profiles.follower IS 'True if this broadcaster is following me';
COMMENT ON COLUMN profiles.following_checked_at IS 'Last time we checked if I am following them';
COMMENT ON COLUMN profiles.follower_checked_at IS 'Last time we checked if they are following me';

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_profiles_following ON profiles(following) WHERE following = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_follower ON profiles(follower) WHERE follower = TRUE;

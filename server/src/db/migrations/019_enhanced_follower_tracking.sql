-- Enhanced Follower/Following Tracking
-- Adds timestamps to track when users followed/unfollowed

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS following_since TIMESTAMP,
  ADD COLUMN IF NOT EXISTS follower_since TIMESTAMP,
  ADD COLUMN IF NOT EXISTS unfollowed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS unfollower_at TIMESTAMP;

COMMENT ON COLUMN profiles.following_since IS 'When I started following this user (first time)';
COMMENT ON COLUMN profiles.follower_since IS 'When this user started following me (first time)';
COMMENT ON COLUMN profiles.unfollowed_at IS 'When I unfollowed this user (NULL if currently following)';
COMMENT ON COLUMN profiles.unfollower_at IS 'When this user unfollowed me (NULL if currently a follower)';

-- Create index for unfollowed queries (for Unfollowed tab)
CREATE INDEX IF NOT EXISTS idx_profiles_unfollower_at
  ON profiles(unfollower_at)
  WHERE unfollower_at IS NOT NULL;

-- Create index for currently following
CREATE INDEX IF NOT EXISTS idx_profiles_following_active
  ON profiles(following, following_since)
  WHERE following = TRUE;

-- Create index for currently followers
CREATE INDEX IF NOT EXISTS idx_profiles_follower_active
  ON profiles(follower, follower_since)
  WHERE follower = TRUE;

-- Update existing records to set timestamps if they exist
-- (Best effort - sets to last update time if no timestamp exists)
UPDATE profiles
SET following_since = following_checked_at
WHERE following = TRUE AND following_since IS NULL AND following_checked_at IS NOT NULL;

UPDATE profiles
SET follower_since = follower_checked_at
WHERE follower = TRUE AND follower_since IS NULL AND follower_checked_at IS NOT NULL;

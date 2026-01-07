-- Migration 020: Add User Categorization (Subs, Friends, Bans)
-- Adds friend tier system, renames in_service_date, adds last_service_date and banned_at

-- Add friend tier (1-4, nullable)
-- Tier 1: Special - always get attention
-- Tier 2: Tippers - current or past tippers
-- Tier 3: Regulars - regulars in room or broadcasters that visit
-- Tier 4: Drive-by - remembered drive-by friends
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS friend_tier INTEGER
  CHECK (friend_tier IS NULL OR friend_tier BETWEEN 1 AND 4);

-- Rename in_service_date -> first_service_date
-- This column tracks when someone first became a subscriber
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'in_service_date') THEN
    ALTER TABLE profiles RENAME COLUMN in_service_date TO first_service_date;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'first_service_date') THEN
    ALTER TABLE profiles ADD COLUMN first_service_date DATE;
  END IF;
END $$;

-- Add last_service_date for tracking when subscription ended
-- Auto-filled when unchecking Active Sub
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_service_date DATE;

-- Add banned_at timestamp for tracking when user banned me
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_profiles_friend_tier
  ON profiles(friend_tier)
  WHERE friend_tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_subs
  ON profiles(first_service_date)
  WHERE first_service_date IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN profiles.friend_tier IS 'Friend tier: 1=Special, 2=Tippers, 3=Regulars, 4=Drive-by';
COMMENT ON COLUMN profiles.first_service_date IS 'Date when user first became a subscriber';
COMMENT ON COLUMN profiles.last_service_date IS 'Date when subscription ended (auto-set when unchecking active_sub)';
COMMENT ON COLUMN profiles.banned_at IS 'Timestamp when user banned me';

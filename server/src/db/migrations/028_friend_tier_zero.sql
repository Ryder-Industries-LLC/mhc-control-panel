-- Migration 028: Allow tier 0 for friends (unclassified)
-- Tier 0 means the user needs to be classified into a tier

-- Drop the existing check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_friend_tier_check;

-- Add new check constraint that allows 0-4
ALTER TABLE profiles ADD CONSTRAINT profiles_friend_tier_check
  CHECK (friend_tier IS NULL OR (friend_tier >= 0 AND friend_tier <= 4));

-- Update comment to document tier meanings
COMMENT ON COLUMN profiles.friend_tier IS 'Friend tier: 0=unclassified, 1=closest, 2=close, 3=acquaintance, 4=distant';

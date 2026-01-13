-- Migration 082: Add room_banned flag to profiles
-- MHC-1104: Room Banned flag indicates the model's room has been banned at site level
-- This is separate from banned_me (they banned you) and banned_by_me (you banned them)

-- Add room_banned boolean field (manual toggle - indicates model's room is site-banned)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS room_banned BOOLEAN DEFAULT FALSE;

-- Add partial index for efficient filtering (only index TRUE values)
CREATE INDEX IF NOT EXISTS idx_profiles_room_banned ON profiles (room_banned) WHERE room_banned = TRUE;

-- Add comment
COMMENT ON COLUMN profiles.room_banned IS 'Manual flag indicating the model''s room has been banned at site level (different from banned_me/banned_by_me)';

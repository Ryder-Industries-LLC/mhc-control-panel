-- Add banned_by_me flag to profiles table
-- This tracks when the user has banned someone (opposite of banned_me which tracks when someone banned the user)

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS banned_by_me BOOLEAN DEFAULT FALSE;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_profiles_banned_by_me ON profiles (banned_by_me) WHERE banned_by_me = TRUE;

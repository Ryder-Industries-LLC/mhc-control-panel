-- Migration 083: Create seen_with table for profile associations
-- MHC-1105: Allows adding usernames associated with a profile ("Seen With")
-- Uses normalized relational pattern consistent with other profile metadata

-- Create seen_with junction table
CREATE TABLE IF NOT EXISTS profile_seen_with (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seen_with_username VARCHAR(255) NOT NULL,
  -- Optional reference to the other person's record if they exist in our database
  seen_with_person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT,

  -- Ensure no duplicate entries for the same profile/username combination
  CONSTRAINT unique_profile_seen_with UNIQUE (profile_id, seen_with_username)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_seen_with_profile_id ON profile_seen_with (profile_id);
CREATE INDEX IF NOT EXISTS idx_seen_with_username ON profile_seen_with (seen_with_username);
CREATE INDEX IF NOT EXISTS idx_seen_with_person_id ON profile_seen_with (seen_with_person_id);

-- Add comments
COMMENT ON TABLE profile_seen_with IS 'Tracks usernames associated with a profile - curated list of people seen together';
COMMENT ON COLUMN profile_seen_with.seen_with_username IS 'Username of the associated person (case-insensitive, stored lowercase)';
COMMENT ON COLUMN profile_seen_with.seen_with_person_id IS 'Optional FK to persons table if the username exists in our database';

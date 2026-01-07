-- Migration 063: Profile usernames history table
-- Maps usernames to person_id with history tracking for symlink creation

CREATE TABLE IF NOT EXISTS profile_usernames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  username VARCHAR(255) NOT NULL,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Each username can only map to one person_id (unique constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_usernames_username
ON profile_usernames(LOWER(username));

-- Index for looking up all usernames for a person
CREATE INDEX IF NOT EXISTS idx_profile_usernames_person_id
ON profile_usernames(person_id);

-- Index for finding current username for a person
CREATE INDEX IF NOT EXISTS idx_profile_usernames_current
ON profile_usernames(person_id) WHERE is_current = TRUE;

-- Backfill from existing persons table
INSERT INTO profile_usernames (person_id, username, first_seen_at, last_seen_at, is_current, created_at)
SELECT
  id as person_id,
  username,
  created_at as first_seen_at,
  NOW() as last_seen_at,
  TRUE as is_current,
  created_at
FROM persons
WHERE username IS NOT NULL
ON CONFLICT (LOWER(username)) DO UPDATE SET
  last_seen_at = EXCLUDED.last_seen_at;

COMMENT ON TABLE profile_usernames IS 'Maps usernames to person_id with history tracking - used for symlink creation during storage transfers';
COMMENT ON COLUMN profile_usernames.is_current IS 'TRUE if this is the current username for the person';
COMMENT ON COLUMN profile_usernames.first_seen_at IS 'When this username was first associated with the person';
COMMENT ON COLUMN profile_usernames.last_seen_at IS 'Last time this username was verified as current';

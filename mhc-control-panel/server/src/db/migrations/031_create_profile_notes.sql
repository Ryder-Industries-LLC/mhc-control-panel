-- Migration 031: Create profile_notes table
-- Stores historical notes for profiles with timestamps for edit/delete tracking

CREATE TABLE IF NOT EXISTS profile_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_profile_notes_profile_id ON profile_notes(profile_id);
CREATE INDEX idx_profile_notes_created_at ON profile_notes(created_at DESC);

-- Comments
COMMENT ON TABLE profile_notes IS 'Historical notes for profiles with timestamps';
COMMENT ON COLUMN profile_notes.content IS 'Note content text';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_profile_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_profile_notes_updated_at
  BEFORE UPDATE ON profile_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_notes_updated_at();

-- Migrate existing notes from profiles table
-- Each existing note becomes a single entry in the new table
INSERT INTO profile_notes (profile_id, content, created_at, updated_at)
SELECT id, notes, COALESCE(updated_at, NOW()), COALESCE(updated_at, NOW())
FROM profiles
WHERE notes IS NOT NULL AND notes != '';

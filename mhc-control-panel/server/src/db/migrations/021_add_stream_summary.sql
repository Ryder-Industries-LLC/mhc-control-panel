-- Migration 021: Add Stream Summary Field
-- Adds a field for post-broadcast notes/summary

-- Add stream_summary field to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stream_summary TEXT;

-- Add comment for documentation
COMMENT ON COLUMN profiles.stream_summary IS 'Post-broadcast summary/notes about the stream';

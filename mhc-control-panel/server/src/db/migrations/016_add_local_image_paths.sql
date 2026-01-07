-- Add local image path columns to broadcast_sessions table
-- This allows us to store downloaded images locally instead of relying on ephemeral URLs

ALTER TABLE broadcast_sessions
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS image_path_360x270 TEXT;

COMMENT ON COLUMN broadcast_sessions.image_path IS 'Local file path for saved thumbnail image';
COMMENT ON COLUMN broadcast_sessions.image_path_360x270 IS 'Local file path for saved 360x270 image';

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_image_paths
  ON broadcast_sessions(person_id, observed_at DESC)
  WHERE image_path IS NOT NULL;

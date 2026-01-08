-- Migration 067: Add username column to profile_images for efficient path generation
-- This supports the new username-based storage path structure:
-- /images/people/{username}/{auto|uploads|snaps|profile}/

-- Add username column to profile_images for denormalized path generation
ALTER TABLE profile_images ADD COLUMN IF NOT EXISTS username VARCHAR(255);

-- Backfill username from persons table
UPDATE profile_images pi
SET username = p.username
FROM persons p
WHERE pi.person_id = p.id AND pi.username IS NULL;

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS idx_profile_images_username ON profile_images(username);

-- Add legacy_file_path column to preserve old paths during migration
ALTER TABLE profile_images ADD COLUMN IF NOT EXISTS legacy_file_path TEXT;

-- Add constraint for valid source types (add affiliate_api if not present)
-- First check if constraint exists and drop it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_profile_images_source'
  ) THEN
    ALTER TABLE profile_images DROP CONSTRAINT chk_profile_images_source;
  END IF;
END $$;

-- No constraint on source - allow any value for flexibility

-- Add comment
COMMENT ON COLUMN profile_images.username IS 'Denormalized username for efficient path generation';
COMMENT ON COLUMN profile_images.legacy_file_path IS 'Original file path before migration to username-based structure';

-- Migration 060: Add storage provider columns to profile_images
-- Tracks which storage backend holds each image and enables content verification

ALTER TABLE profile_images
ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(20) NOT NULL DEFAULT 'docker';

ALTER TABLE profile_images
ADD COLUMN IF NOT EXISTS sha256 VARCHAR(64);

-- Add constraint to ensure valid storage provider values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_profile_images_storage_provider'
  ) THEN
    ALTER TABLE profile_images
    ADD CONSTRAINT chk_profile_images_storage_provider
    CHECK (storage_provider IN ('docker', 'ssd', 's3'));
  END IF;
END $$;

-- Index for efficient queries by storage provider
CREATE INDEX IF NOT EXISTS idx_profile_images_storage_provider
ON profile_images(storage_provider);

-- Index for finding images needing SHA256 backfill
CREATE INDEX IF NOT EXISTS idx_profile_images_sha256_null
ON profile_images(id) WHERE sha256 IS NULL;

COMMENT ON COLUMN profile_images.storage_provider IS 'Storage backend: docker, ssd, s3';
COMMENT ON COLUMN profile_images.sha256 IS 'SHA-256 hash for content verification during transfers';

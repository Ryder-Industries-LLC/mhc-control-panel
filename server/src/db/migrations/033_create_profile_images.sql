-- Migration: 033_create_profile_images.sql
-- Description: Create profile_images table for storing manually uploaded images

CREATE TABLE IF NOT EXISTS profile_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  original_filename TEXT,
  source VARCHAR(50) NOT NULL DEFAULT 'manual_upload',
  description TEXT,
  captured_at TIMESTAMP,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  file_size INTEGER,
  mime_type VARCHAR(100),
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for efficient lookups by person
CREATE INDEX IF NOT EXISTS idx_profile_images_person_id ON profile_images(person_id);

-- Index for sorting by upload date
CREATE INDEX IF NOT EXISTS idx_profile_images_uploaded_at ON profile_images(uploaded_at DESC);

-- Add constraint to validate source values
ALTER TABLE profile_images
ADD CONSTRAINT chk_profile_images_source
CHECK (source IN ('manual_upload', 'screensnap', 'external', 'imported'));

COMMENT ON TABLE profile_images IS 'Stores manually uploaded images for profiles (screensnaps, external sources)';
COMMENT ON COLUMN profile_images.source IS 'Source type: manual_upload, screensnap, external, imported';
COMMENT ON COLUMN profile_images.captured_at IS 'When the image was originally captured (if known)';
COMMENT ON COLUMN profile_images.uploaded_at IS 'When the image was uploaded to the system';

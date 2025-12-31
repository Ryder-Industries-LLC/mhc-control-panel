-- Migration: 037_add_profile_images_is_current.sql
-- Description: Add is_current column to profile_images for designating the primary/current image

-- Add is_current column (default false)
ALTER TABLE profile_images
ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT FALSE;

-- Create a partial unique index to ensure only one current image per person
-- This allows multiple is_current=false but only one is_current=true per person_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_images_current_per_person
ON profile_images(person_id)
WHERE is_current = TRUE;

COMMENT ON COLUMN profile_images.is_current IS 'Whether this image is the current/primary image for the profile';

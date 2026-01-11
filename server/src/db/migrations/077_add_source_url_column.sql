-- Migration: Add source_url column to profile_images
-- This stores the original URL from which the image was downloaded
-- Useful for deduplication and troubleshooting

ALTER TABLE profile_images ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Add index for faster duplicate detection
CREATE INDEX IF NOT EXISTS idx_profile_images_source_url ON profile_images(source_url) WHERE source_url IS NOT NULL;

-- Add comment
COMMENT ON COLUMN profile_images.source_url IS 'Original URL from which the image/video was downloaded';

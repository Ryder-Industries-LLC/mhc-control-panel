-- Migration: 051_add_media_type_and_videos.sql
-- Description: Add media_type column to profile_images for video support,
--              add has_videos indicator to profiles, and add video settings

-- Add media_type to profile_images (image, video)
ALTER TABLE profile_images
ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) DEFAULT 'image';

-- Add video duration column (seconds)
ALTER TABLE profile_images
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Add photoset_id for grouping related media from same photoset
ALTER TABLE profile_images
ADD COLUMN IF NOT EXISTS photoset_id TEXT;

-- Add title/caption for media items
ALTER TABLE profile_images
ADD COLUMN IF NOT EXISTS title TEXT;

-- Update source constraint to include 'profile' as valid source
ALTER TABLE profile_images DROP CONSTRAINT IF EXISTS chk_profile_images_source;
ALTER TABLE profile_images
ADD CONSTRAINT chk_profile_images_source
CHECK (source IN ('manual_upload', 'screensnap', 'external', 'imported', 'profile'));

-- Add constraint for valid media types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_profile_images_media_type'
  ) THEN
    ALTER TABLE profile_images
    ADD CONSTRAINT chk_profile_images_media_type
    CHECK (media_type IN ('image', 'video'));
  END IF;
END $$;

-- Add has_videos indicator to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS has_videos BOOLEAN DEFAULT FALSE;

-- Index for media type queries
CREATE INDEX IF NOT EXISTS idx_profile_images_media_type ON profile_images(media_type);

-- Index for photoset grouping
CREATE INDEX IF NOT EXISTS idx_profile_images_photoset_id ON profile_images(photoset_id);

-- Add video upload settings
INSERT INTO app_settings (key, value, description)
VALUES ('max_video_size_bytes', '524288000', 'Maximum video file size in bytes (default 500MB)')
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN profile_images.media_type IS 'Type of media: image or video';
COMMENT ON COLUMN profile_images.duration_seconds IS 'Duration in seconds for video files';
COMMENT ON COLUMN profile_images.photoset_id IS 'ID of the photoset this media belongs to (for grouping)';
COMMENT ON COLUMN profile_images.title IS 'Title or caption of the media item';
COMMENT ON COLUMN profiles.has_videos IS 'Whether this profile has any videos stored';

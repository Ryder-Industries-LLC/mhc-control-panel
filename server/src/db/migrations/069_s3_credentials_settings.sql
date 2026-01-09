-- Migration 069: Add S3 credentials and storage settings
-- Adds access key and secret key settings for S3 authentication
-- Adds SSD host path and total bytes settings for correct disk space display
-- Updates prefix default from profiles/ to mhc/media/ for full media storage

INSERT INTO app_settings (key, value, description) VALUES
  ('storage.external.s3_access_key_id', '""', 'AWS S3 access key ID'),
  ('storage.external.s3_secret_access_key', '""', 'AWS S3 secret access key'),
  ('storage.local.ssd_host_path', '"/Volumes/Imago/MHC-Control_Panel/media"', 'Host filesystem path to SSD (for display in UI)'),
  ('storage.local.ssd_total_bytes', '4000000000000', 'Total SSD capacity in bytes (4TB default)')
ON CONFLICT (key) DO NOTHING;

-- Update the default prefix for new installations (existing values unchanged)
UPDATE app_settings
SET value = '"mhc/media/"', description = 'S3 key prefix for all media files'
WHERE key = 'storage.external.s3_prefix' AND value = '"profiles/"';

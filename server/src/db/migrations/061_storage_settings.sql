-- Migration 061: Storage configuration settings
-- Configures global storage mode, local providers, and external S3 settings

INSERT INTO app_settings (key, value, description) VALUES
  -- Global storage mode: local (Docker/SSD) or remote (S3)
  ('storage.global_mode', '"local"', 'Global storage mode: local or remote'),

  -- Local storage configuration
  ('storage.local.mode', '"auto"', 'Local storage mode: auto (prefer SSD), ssd, docker'),
  ('storage.local.ssd_enabled', 'true', 'Enable SSD storage provider'),
  ('storage.local.docker_enabled', 'true', 'Enable Docker volume storage provider'),
  ('storage.local.ssd_path', '"/mnt/ssd/mhc-images"', 'Path to SSD mount point'),
  ('storage.local.docker_path', '"/app/data/images"', 'Path to Docker volume'),

  -- External S3 storage configuration
  ('storage.external.enabled', 'false', 'Enable external S3 storage'),
  ('storage.external.s3_bucket', '""', 'S3 bucket name'),
  ('storage.external.s3_region', '"us-east-1"', 'AWS S3 region'),
  ('storage.external.s3_prefix', '"profiles/"', 'S3 key prefix for all images'),
  ('storage.external.cache_enabled', 'true', 'Enable local cache for S3 files'),
  ('storage.external.cache_max_size_mb', '5000', 'Maximum local cache size in MB')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE app_settings IS 'Application-wide settings including storage configuration';

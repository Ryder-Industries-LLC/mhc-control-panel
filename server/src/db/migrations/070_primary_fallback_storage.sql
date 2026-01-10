-- Migration 070: Primary/Fallback storage configuration
-- Replaces legacy globalMode with explicit primary and fallback storage selection

INSERT INTO app_settings (key, value, description) VALUES
  ('storage.primary_storage', '"ssd"', 'Primary storage provider: docker, ssd, or s3'),
  ('storage.fallback_storage', '"docker"', 'Fallback storage provider: docker, ssd, s3, or none')
ON CONFLICT (key) DO NOTHING;

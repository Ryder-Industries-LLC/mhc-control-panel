-- Migration 050: Image Upload Size Settings
-- Configurable size limits for different image upload types

-- Insert default image upload settings (20MB = 20971520 bytes)
INSERT INTO app_settings (key, value, description) VALUES
  ('image_upload_limit_manual', '20971520', 'Maximum file size in bytes for manual image uploads (default 20MB)'),
  ('image_upload_limit_external', '20971520', 'Maximum file size in bytes for external URL image imports (default 20MB)'),
  ('image_upload_limit_screenshot', '20971520', 'Maximum file size in bytes for screenshot captures (default 20MB)')
ON CONFLICT (key) DO NOTHING;

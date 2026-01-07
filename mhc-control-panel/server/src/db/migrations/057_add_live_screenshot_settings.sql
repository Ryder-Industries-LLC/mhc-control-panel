-- Add settings for live screenshot capture job
-- This job captures screenshots from live Following users at a configurable interval

INSERT INTO app_settings (key, value, description)
VALUES (
  'live_screenshot_interval_minutes',
  '30',
  'Interval in minutes between screenshot captures for live Following users'
) ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, description)
VALUES (
  'live_screenshot_enabled',
  'true',
  'Enable/disable automatic live screenshot capture'
) ON CONFLICT (key) DO NOTHING;

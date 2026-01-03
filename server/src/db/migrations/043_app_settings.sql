-- Migration 043: App Settings
-- Configurable application settings for broadcast session management

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO app_settings (key, value, description) VALUES
  ('broadcast_merge_gap_minutes', '30', 'Maximum gap in minutes between broadcast segments to merge into single session'),
  ('ai_summary_delay_minutes', 'null', 'Override delay before AI summary generation (null = use merge_gap_minutes)')
ON CONFLICT (key) DO NOTHING;

-- Trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION update_app_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_app_settings_updated_at();

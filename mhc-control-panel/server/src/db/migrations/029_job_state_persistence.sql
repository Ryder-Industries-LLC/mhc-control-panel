-- Migration 029: Job State Persistence
-- Store job configurations and running state across container restarts

CREATE TABLE IF NOT EXISTS job_state (
  id SERIAL PRIMARY KEY,
  job_name VARCHAR(50) UNIQUE NOT NULL,

  -- Running state
  is_running BOOLEAN DEFAULT false,
  is_paused BOOLEAN DEFAULT false,

  -- Configuration (stored as JSONB for flexibility)
  config JSONB DEFAULT '{}',

  -- Statistics (optional, for continuity)
  stats JSONB DEFAULT '{}',

  -- Timestamps
  last_started_at TIMESTAMP WITH TIME ZONE,
  last_stopped_at TIMESTAMP WITH TIME ZONE,
  last_run_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_job_state_job_name ON job_state(job_name);
CREATE INDEX IF NOT EXISTS idx_job_state_is_running ON job_state(is_running) WHERE is_running = true;

-- Insert default state for all jobs
INSERT INTO job_state (job_name, config) VALUES
  ('affiliate', '{"intervalMinutes": 5, "gender": null, "limit": 500, "enabled": true}'),
  ('cbhours', '{"intervalMinutes": 30, "batchSize": 50, "enabled": true, "targetFollowing": true}'),
  ('profile-scrape', '{"intervalMinutes": 15, "maxProfilesPerRun": 50, "delayBetweenProfiles": 5000, "refreshDays": 7, "enabled": true, "prioritizeFollowing": true}'),
  ('statbate', '{"intervalMinutes": 360}')
ON CONFLICT (job_name) DO NOTHING;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_job_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_job_state_updated_at ON job_state;
CREATE TRIGGER trigger_job_state_updated_at
  BEFORE UPDATE ON job_state
  FOR EACH ROW
  EXECUTE FUNCTION update_job_state_updated_at();

-- Comments
COMMENT ON TABLE job_state IS 'Persists job configuration and running state across container restarts';
COMMENT ON COLUMN job_state.job_name IS 'Unique identifier for the job (affiliate, cbhours, profile-scrape, statbate)';
COMMENT ON COLUMN job_state.is_running IS 'Whether the job should be running (restored on startup)';
COMMENT ON COLUMN job_state.config IS 'Job-specific configuration as JSON';
COMMENT ON COLUMN job_state.stats IS 'Job statistics for continuity across restarts';

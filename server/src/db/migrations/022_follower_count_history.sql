-- Migration: Track follower count changes over time
-- This allows us to see follower growth/decline trends for models

CREATE TABLE IF NOT EXISTS follower_count_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  follower_count INTEGER NOT NULL,
  previous_count INTEGER,  -- Store previous count to easily calculate delta
  delta INTEGER,  -- Net change from previous record (calculated on insert)
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source VARCHAR(30) DEFAULT 'affiliate_api',  -- 'affiliate_api', 'cbhours', 'manual'

  -- Prevent duplicate entries for same person at same timestamp
  CONSTRAINT unique_person_timestamp UNIQUE (person_id, recorded_at)
);

-- Index for efficient queries by person and time
CREATE INDEX IF NOT EXISTS idx_follower_history_person_time
  ON follower_count_history(person_id, recorded_at DESC);

-- Index for finding recent records
CREATE INDEX IF NOT EXISTS idx_follower_history_recorded_at
  ON follower_count_history(recorded_at DESC);

-- Index for finding records with significant changes
CREATE INDEX IF NOT EXISTS idx_follower_history_delta
  ON follower_count_history(delta) WHERE delta IS NOT NULL AND delta != 0;

COMMENT ON TABLE follower_count_history IS 'Tracks follower count changes over time for trend analysis';
COMMENT ON COLUMN follower_count_history.delta IS 'Change from previous recorded count (positive = gained, negative = lost)';
COMMENT ON COLUMN follower_count_history.source IS 'Data source: affiliate_api, cbhours, or manual entry';

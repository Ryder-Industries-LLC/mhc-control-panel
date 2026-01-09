-- Migration 068: System Stats History
-- Store periodic snapshots of system statistics for historical analysis and trend tracking

CREATE TABLE IF NOT EXISTS system_stats_history (
  id SERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Store all stats as JSONB for flexibility and future extensibility
  -- This approach allows stats schema to evolve without migrations
  stats JSONB NOT NULL,

  -- Collection metadata
  collection_duration_ms INTEGER, -- How long the collection took

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient time-range queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_system_stats_history_recorded_at
  ON system_stats_history(recorded_at DESC);

-- GIN index for JSONB queries (searching within stats)
CREATE INDEX IF NOT EXISTS idx_system_stats_history_stats
  ON system_stats_history USING GIN (stats);

-- Comments for documentation
COMMENT ON TABLE system_stats_history IS 'Historical snapshots of system statistics captured periodically for trend analysis';
COMMENT ON COLUMN system_stats_history.stats IS 'JSONB containing all system stats (user_segments, database, media, snapshots_by_source, activity, queue)';
COMMENT ON COLUMN system_stats_history.collection_duration_ms IS 'Time taken to collect all stats in milliseconds';
COMMENT ON COLUMN system_stats_history.recorded_at IS 'Timestamp when the snapshot was taken';

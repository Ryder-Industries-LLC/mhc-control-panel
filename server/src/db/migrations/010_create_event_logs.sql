-- Create event_logs table for storing raw Events API events
CREATE TABLE IF NOT EXISTS event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method VARCHAR(50) NOT NULL,
  broadcaster VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  raw_event JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by timestamp
CREATE INDEX IF NOT EXISTS idx_event_logs_timestamp ON event_logs(timestamp DESC);

-- Index for querying by method
CREATE INDEX IF NOT EXISTS idx_event_logs_method ON event_logs(method);

-- Index for querying by broadcaster
CREATE INDEX IF NOT EXISTS idx_event_logs_broadcaster ON event_logs(broadcaster);

-- Index for querying by username
CREATE INDEX IF NOT EXISTS idx_event_logs_username ON event_logs(username);

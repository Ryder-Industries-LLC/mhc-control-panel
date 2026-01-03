-- Migration 045: Event Linkage
-- Add segment_id and session_id to event_logs for rollup computation

-- Add columns to event_logs
ALTER TABLE event_logs
  ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES broadcast_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES broadcast_sessions_v2(id) ON DELETE SET NULL;

-- Indexes for efficient rollup queries
CREATE INDEX IF NOT EXISTS idx_event_logs_segment_id ON event_logs(segment_id)
  WHERE segment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_logs_session_id ON event_logs(session_id)
  WHERE session_id IS NOT NULL;

-- Composite index for rollup queries by session and method
CREATE INDEX IF NOT EXISTS idx_event_logs_session_method ON event_logs(session_id, method)
  WHERE session_id IS NOT NULL;

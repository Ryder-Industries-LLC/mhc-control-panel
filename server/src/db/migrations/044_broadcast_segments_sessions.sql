-- Migration 044: Broadcast Segments and Sessions V2
-- New data model for proper session management with segment stitching

-- Broadcast Sessions V2: Stitched segments with rollups
-- Created FIRST because segments reference it
CREATE TABLE IF NOT EXISTS broadcast_sessions_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,  -- NULL = active session
  last_event_at TIMESTAMPTZ NOT NULL,
  finalize_at TIMESTAMPTZ,  -- When AI summary can run (last_event_at + merge_gap)
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_finalize', 'finalized')),

  -- Rollups (computed from events)
  total_tokens INTEGER DEFAULT 0,
  followers_gained INTEGER DEFAULT 0,
  peak_viewers INTEGER DEFAULT 0,
  avg_viewers NUMERIC(10,2) DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,

  -- AI Summary
  ai_summary TEXT,
  ai_summary_status VARCHAR(20) DEFAULT 'pending'
    CHECK (ai_summary_status IN ('pending', 'generating', 'generated', 'failed')),
  ai_summary_generated_at TIMESTAMPTZ,

  -- Metadata
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  room_subject TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Broadcast Segments: Individual start→stop periods
CREATE TABLE IF NOT EXISTS broadcast_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,  -- NULL = still active
  session_id UUID REFERENCES broadcast_sessions_v2(id) ON DELETE SET NULL,
  source VARCHAR(20) DEFAULT 'events_api'
    CHECK (source IN ('events_api', 'manual', 'migration')),

  -- Reference to original event IDs for debugging
  start_event_id UUID,
  end_event_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for broadcast_sessions_v2
CREATE INDEX IF NOT EXISTS idx_sessions_v2_started_at ON broadcast_sessions_v2(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_v2_status ON broadcast_sessions_v2(status);
CREATE INDEX IF NOT EXISTS idx_sessions_v2_finalize_at ON broadcast_sessions_v2(finalize_at)
  WHERE status = 'pending_finalize';

-- Indexes for broadcast_segments
CREATE INDEX IF NOT EXISTS idx_segments_started_at ON broadcast_segments(started_at);
CREATE INDEX IF NOT EXISTS idx_segments_session_id ON broadcast_segments(session_id);
CREATE INDEX IF NOT EXISTS idx_segments_ended_at ON broadcast_segments(ended_at)
  WHERE ended_at IS NULL;

-- Trigger to update updated_at on sessions
CREATE OR REPLACE FUNCTION update_broadcast_sessions_v2_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_broadcast_sessions_v2_updated_at
  BEFORE UPDATE ON broadcast_sessions_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_broadcast_sessions_v2_updated_at();

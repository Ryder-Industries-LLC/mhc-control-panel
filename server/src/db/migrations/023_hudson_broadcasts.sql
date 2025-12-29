-- Migration 023: Hudson Broadcasts Table
-- Track YOUR OWN broadcast sessions with notes/summaries

CREATE TABLE IF NOT EXISTS hudson_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,  -- Calculated on end, or manually set

  -- Stats (captured from affiliate API / events)
  peak_viewers INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  followers_gained INTEGER DEFAULT 0,

  -- Content
  summary TEXT,  -- Short summary of the broadcast
  notes TEXT,    -- Detailed notes (markdown supported)
  tags TEXT[] DEFAULT '{}',
  room_subject TEXT,  -- Initial room subject when started

  -- Metadata
  auto_detected BOOLEAN DEFAULT FALSE,  -- Was this auto-detected or manually created?
  source VARCHAR(30) DEFAULT 'manual',  -- 'events_api', 'affiliate_api', 'manual'

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hudson_broadcasts_started_at
  ON hudson_broadcasts(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_hudson_broadcasts_ended_at
  ON hudson_broadcasts(ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_hudson_broadcasts_tags
  ON hudson_broadcasts USING GIN(tags);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_hudson_broadcasts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_hudson_broadcasts_updated_at ON hudson_broadcasts;
CREATE TRIGGER trigger_hudson_broadcasts_updated_at
  BEFORE UPDATE ON hudson_broadcasts
  FOR EACH ROW
  EXECUTE FUNCTION update_hudson_broadcasts_updated_at();

-- Comments
COMMENT ON TABLE hudson_broadcasts IS 'Tracks Hudson''s broadcast sessions with summaries and notes';
COMMENT ON COLUMN hudson_broadcasts.auto_detected IS 'TRUE if session was auto-detected via Events/Affiliate API';
COMMENT ON COLUMN hudson_broadcasts.source IS 'How this broadcast was created: events_api, affiliate_api, or manual';
COMMENT ON COLUMN hudson_broadcasts.duration_minutes IS 'Duration in minutes, calculated from started_at/ended_at or manually set';

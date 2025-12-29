-- Migration 024: Broadcast Summaries Table
-- AI-generated stream summaries following Master Hudson's format

CREATE TABLE IF NOT EXISTS broadcast_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES hudson_broadcasts(id) ON DELETE CASCADE,

  -- Structured data (for display/filtering)
  theme VARCHAR(255),
  tokens_received INTEGER DEFAULT 0,
  tokens_per_hour DECIMAL(10,2),
  max_viewers INTEGER,
  unique_viewers INTEGER,
  avg_watch_time_seconds INTEGER,
  new_followers INTEGER DEFAULT 0,
  lost_followers INTEGER DEFAULT 0,
  net_followers INTEGER DEFAULT 0,

  -- Lists (stored as arrays for querying)
  room_subject_variants TEXT[] DEFAULT '{}',
  visitors_stayed TEXT[] DEFAULT '{}',
  visitors_quick TEXT[] DEFAULT '{}',
  visitors_banned TEXT[] DEFAULT '{}',
  top_tippers JSONB DEFAULT '[]',  -- [{username, tokens}]
  top_lovers_board JSONB DEFAULT '[]',  -- [{rank, username, tokens}] - cumulative from transcript

  -- AI-generated narrative sections (markdown)
  overall_vibe TEXT,
  engagement_summary TEXT,
  tracking_notes TEXT,
  private_dynamics TEXT,
  opportunities TEXT,
  chat_highlights TEXT,
  themes_moments TEXT,
  overall_summary TEXT,

  -- Full rendered markdown (for copy/paste)
  full_markdown TEXT,

  -- Input data (for regeneration)
  transcript_text TEXT,  -- Store the raw transcript for regeneration

  -- Metadata
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ai_model VARCHAR(50),
  generation_tokens_used INTEGER,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one summary per broadcast
  UNIQUE(broadcast_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_broadcast_summaries_broadcast_id
  ON broadcast_summaries(broadcast_id);

CREATE INDEX IF NOT EXISTS idx_broadcast_summaries_generated_at
  ON broadcast_summaries(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcast_summaries_theme
  ON broadcast_summaries(theme);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_broadcast_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_broadcast_summaries_updated_at ON broadcast_summaries;
CREATE TRIGGER trigger_broadcast_summaries_updated_at
  BEFORE UPDATE ON broadcast_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_broadcast_summaries_updated_at();

-- Comments
COMMENT ON TABLE broadcast_summaries IS 'AI-generated stream summaries for Hudson broadcasts';
COMMENT ON COLUMN broadcast_summaries.theme IS 'Short theme/title extracted from the stream content';
COMMENT ON COLUMN broadcast_summaries.top_lovers_board IS 'Cumulative top tippers board extracted from transcript notices';
COMMENT ON COLUMN broadcast_summaries.transcript_text IS 'Raw transcript stored for potential regeneration';
COMMENT ON COLUMN broadcast_summaries.full_markdown IS 'Complete rendered markdown summary for copy/paste';

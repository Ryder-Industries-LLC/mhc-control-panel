-- Create broadcast_sessions table for tracking online broadcast data from Affiliate API
CREATE TABLE IF NOT EXISTS broadcast_sessions (
  id SERIAL PRIMARY KEY,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,

  -- Session timing
  observed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  seconds_online INTEGER NOT NULL,
  session_start TIMESTAMP, -- Calculated: observed_at - seconds_online

  -- Show details
  current_show VARCHAR(50), -- public, private, group, away
  room_subject TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Metrics
  num_users INTEGER NOT NULL DEFAULT 0,
  num_followers INTEGER NOT NULL DEFAULT 0,
  is_hd BOOLEAN DEFAULT false,

  -- Technical
  image_url TEXT,
  image_url_360x270 TEXT,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Index for efficient lookups
  CONSTRAINT unique_observation UNIQUE (person_id, observed_at)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_person_id ON broadcast_sessions(person_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_observed_at ON broadcast_sessions(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_session_start ON broadcast_sessions(session_start DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_person_session ON broadcast_sessions(person_id, session_start DESC);

-- Index for tag searches
CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_tags ON broadcast_sessions USING GIN(tags);

COMMENT ON TABLE broadcast_sessions IS 'Tracks online broadcast snapshots from Chaturbate Affiliate API';
COMMENT ON COLUMN broadcast_sessions.seconds_online IS 'Seconds broadcaster has been online at observation time';
COMMENT ON COLUMN broadcast_sessions.session_start IS 'Calculated session start time (observed_at - seconds_online)';
COMMENT ON COLUMN broadcast_sessions.observed_at IS 'When this snapshot was captured from the API';

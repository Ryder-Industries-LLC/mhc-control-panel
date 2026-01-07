-- Room presence table to track who is currently in the room during a broadcast
-- This allows cross-process communication between worker (events) and web (SSE)

CREATE TABLE IF NOT EXISTS room_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  entered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  session_id TEXT,
  user_data JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(person_id) -- Only one entry per person at a time
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_room_presence_session ON room_presence(session_id);
CREATE INDEX IF NOT EXISTS idx_room_presence_entered ON room_presence(entered_at);

-- Track current broadcast session for presence
CREATE TABLE IF NOT EXISTS room_presence_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton row
  current_session_id TEXT,
  broadcast_started_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insert singleton row
INSERT INTO room_presence_state (id, current_session_id, broadcast_started_at, updated_at)
VALUES (1, NULL, NULL, NOW())
ON CONFLICT (id) DO NOTHING;

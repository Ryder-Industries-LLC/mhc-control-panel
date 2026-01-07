-- Create stream_sessions table
CREATE TABLE stream_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL DEFAULT 'chaturbate',
  broadcaster VARCHAR(255) NOT NULL DEFAULT 'hudson_cage',
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'LIVE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT stream_sessions_status_check CHECK (status IN ('LIVE', 'ENDED'))
);

-- Create indexes
CREATE INDEX idx_stream_sessions_status ON stream_sessions(status);
CREATE INDEX idx_stream_sessions_started_at ON stream_sessions(started_at DESC);
CREATE INDEX idx_stream_sessions_broadcaster ON stream_sessions(broadcaster);

-- Add updated_at trigger
CREATE TRIGGER update_stream_sessions_updated_at
  BEFORE UPDATE ON stream_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

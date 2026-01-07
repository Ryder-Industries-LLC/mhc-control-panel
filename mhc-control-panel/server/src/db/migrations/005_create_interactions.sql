-- Create interactions table
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  stream_session_id UUID REFERENCES stream_sessions(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  source VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT interactions_type_check CHECK (type IN (
    'CHAT_MESSAGE',
    'PRIVATE_MESSAGE',
    'TIP_EVENT',
    'PROFILE_PASTE',
    'CHAT_IMPORT',
    'MANUAL_NOTE',
    'FOLLOW',
    'UNFOLLOW',
    'USER_ENTER',
    'USER_LEAVE',
    'FANCLUB_JOIN',
    'MEDIA_PURCHASE'
  )),
  CONSTRAINT interactions_source_check CHECK (source IN ('cb_events', 'statbate_plus', 'manual'))
);

-- Create indexes
CREATE INDEX idx_interactions_person_id ON interactions(person_id);
CREATE INDEX idx_interactions_timestamp ON interactions(timestamp DESC);
CREATE INDEX idx_interactions_session_id ON interactions(stream_session_id);
CREATE INDEX idx_interactions_type ON interactions(type);
CREATE INDEX idx_interactions_source ON interactions(source);

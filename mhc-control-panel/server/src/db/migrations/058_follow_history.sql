-- Migration 058: Follow History Table
-- Dedicated follow/unfollow history tracking for comprehensive audit trail

CREATE TABLE IF NOT EXISTS follow_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('following', 'follower')),
  action VARCHAR(20) NOT NULL CHECK (action IN ('follow', 'unfollow')),
  source VARCHAR(50) NOT NULL CHECK (source IN ('events_api', 'profile_scrape', 'list_scrape', 'manual_import')),
  event_id UUID REFERENCES event_logs(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for looking up history by person
CREATE INDEX IF NOT EXISTS idx_follow_history_person_id ON follow_history(person_id);

-- Index for filtering by direction (following vs follower)
CREATE INDEX IF NOT EXISTS idx_follow_history_direction ON follow_history(direction);

-- Index for chronological queries
CREATE INDEX IF NOT EXISTS idx_follow_history_created_at ON follow_history(created_at DESC);

-- Composite index for common queries filtering by both direction and action
CREATE INDEX IF NOT EXISTS idx_follow_history_direction_action ON follow_history(direction, action);

COMMENT ON TABLE follow_history IS 'Tracks all follow/unfollow events from any source';
COMMENT ON COLUMN follow_history.direction IS 'Whether this is about who I follow (following) or who follows me (follower)';
COMMENT ON COLUMN follow_history.action IS 'Whether this was a follow or unfollow action';
COMMENT ON COLUMN follow_history.source IS 'Where this event was detected: events_api, profile_scrape, list_scrape, or manual_import';
COMMENT ON COLUMN follow_history.event_id IS 'Reference to event_logs if this came from Events API';

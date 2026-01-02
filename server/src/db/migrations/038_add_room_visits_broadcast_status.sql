-- Migration: 038_add_room_visits_broadcast_status.sql
-- Description: Add column to track if visit occurred during a broadcast

-- Add is_broadcasting column to room_visits
ALTER TABLE room_visits ADD COLUMN IF NOT EXISTS is_broadcasting BOOLEAN DEFAULT TRUE;

-- Add session_id to link visit to a specific broadcast session (nullable for offline visits)
ALTER TABLE room_visits ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES stream_sessions(id) ON DELETE SET NULL;

-- Index for filtering by broadcast status
CREATE INDEX IF NOT EXISTS idx_room_visits_is_broadcasting ON room_visits(is_broadcasting);

-- Update comment
COMMENT ON COLUMN room_visits.is_broadcasting IS 'Whether the broadcaster was live when this visit occurred';
COMMENT ON COLUMN room_visits.session_id IS 'The stream session during which this visit occurred (null for offline visits)';

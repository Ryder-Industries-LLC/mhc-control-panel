-- Migration: 035_create_room_visits.sql
-- Description: Create room_visits table for tracking when users visit your room

CREATE TABLE IF NOT EXISTS room_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  visited_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Optional: track context about the visit
  event_id TEXT,  -- Reference to the events API event if available
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for efficient lookups by person
CREATE INDEX IF NOT EXISTS idx_room_visits_person_id ON room_visits(person_id);

-- Index for sorting by visit date
CREATE INDEX IF NOT EXISTS idx_room_visits_visited_at ON room_visits(visited_at DESC);

-- Composite index for checking recent visits by a person (deduplication)
CREATE INDEX IF NOT EXISTS idx_room_visits_person_recent ON room_visits(person_id, visited_at DESC);

-- Add visit_count column to persons table for quick access
ALTER TABLE persons ADD COLUMN IF NOT EXISTS room_visit_count INTEGER NOT NULL DEFAULT 0;

-- Add last_visit_at column to persons table
ALTER TABLE persons ADD COLUMN IF NOT EXISTS last_room_visit_at TIMESTAMP;

COMMENT ON TABLE room_visits IS 'Tracks each time a user enters your room during a broadcast';
COMMENT ON COLUMN room_visits.visited_at IS 'When the user entered the room';
COMMENT ON COLUMN room_visits.event_id IS 'Reference to the Events API event that triggered this visit';
COMMENT ON COLUMN persons.room_visit_count IS 'Total number of times this user has visited your room';
COMMENT ON COLUMN persons.last_room_visit_at IS 'Most recent time this user visited your room';

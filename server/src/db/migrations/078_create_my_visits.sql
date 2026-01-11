-- Migration: Create my_visits table
-- Tracks when the broadcaster visits other users' rooms
-- This is the inverse of room_visits (which tracks when others visit you)

CREATE TABLE IF NOT EXISTS my_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient lookups by person
CREATE INDEX IF NOT EXISTS idx_my_visits_person_id ON my_visits(person_id);
CREATE INDEX IF NOT EXISTS idx_my_visits_visited_at ON my_visits(visited_at DESC);

-- Add columns to persons table for quick access to visit counts
ALTER TABLE persons ADD COLUMN IF NOT EXISTS my_visit_count INTEGER DEFAULT 0;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS last_my_visit_at TIMESTAMPTZ;

-- Comment for clarity
COMMENT ON TABLE my_visits IS 'Tracks when the broadcaster visits other users rooms (inverse of room_visits)';
COMMENT ON COLUMN my_visits.person_id IS 'The person whose room was visited';
COMMENT ON COLUMN my_visits.visited_at IS 'When the visit occurred';
COMMENT ON COLUMN my_visits.notes IS 'Optional notes about the visit';

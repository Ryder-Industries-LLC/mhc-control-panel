-- Create watchlist_members table
CREATE TABLE watchlist_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT watchlist_members_unique UNIQUE(watchlist_id, person_id)
);

-- Create indexes
CREATE INDEX idx_watchlist_members_watchlist_id ON watchlist_members(watchlist_id);
CREATE INDEX idx_watchlist_members_person_id ON watchlist_members(person_id);

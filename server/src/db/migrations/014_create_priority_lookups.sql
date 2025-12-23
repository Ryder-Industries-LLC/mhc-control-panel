-- Migration 014: Create priority_lookups table
-- Priority lookup queue for Affiliate API feed processing

CREATE TABLE IF NOT EXISTS priority_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  priority_level INTEGER NOT NULL CHECK (priority_level IN (1, 2)),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'active')),
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  last_checked_at TIMESTAMP,
  notes TEXT,
  UNIQUE(username)
);

-- Index for quick lookups by priority and status
CREATE INDEX IF NOT EXISTS idx_priority_lookups_priority_status ON priority_lookups(priority_level, status);
CREATE INDEX IF NOT EXISTS idx_priority_lookups_status ON priority_lookups(status);
CREATE INDEX IF NOT EXISTS idx_priority_lookups_username ON priority_lookups(username);

-- Comments
COMMENT ON TABLE priority_lookups IS 'Priority lookup queue for Affiliate API feed processing';
COMMENT ON COLUMN priority_lookups.priority_level IS '1 = Initial population (one-time), 2 = Frequent tracking (every poll)';
COMMENT ON COLUMN priority_lookups.status IS 'pending = not yet found, completed = found and processed (priority 1), active = actively tracking (priority 2)';
COMMENT ON COLUMN priority_lookups.last_checked_at IS 'Last time this user was checked in the feed';

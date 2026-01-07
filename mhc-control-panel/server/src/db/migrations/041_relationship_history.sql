-- Migration 041: Create relationship_history table
-- Tracks changes to status, roles, since_date, until_date (NOT traits - too noisy)

CREATE TABLE IF NOT EXISTS relationship_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,

  -- Field being tracked with CHECK constraint
  field_name VARCHAR(30) NOT NULL
    CHECK (field_name IN ('status', 'since_date', 'until_date', 'roles')),

  -- JSONB for flexible value storage
  -- status: "Occasional" | "Active" | etc.
  -- roles: ["Sub","Friend"] (always sorted)
  -- dates: "2026-01-01" (ISO date string)
  old_value JSONB,
  new_value JSONB,

  -- Optional note about why this change was made
  change_note TEXT,

  -- When the change occurred
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Who made the change (username or 'system'/'migration')
  changed_by VARCHAR(100) DEFAULT 'system',

  -- Source of the change for auditing
  event_source VARCHAR(20) DEFAULT 'ui'
    CHECK (event_source IN ('ui', 'migration', 'api', 'system'))
);

-- Indexes for efficient history queries
CREATE INDEX idx_relhist_relationship_id ON relationship_history(relationship_id);
CREATE INDEX idx_relhist_relationship_changed_at ON relationship_history(relationship_id, changed_at DESC);
CREATE INDEX idx_relhist_field_name ON relationship_history(field_name);

-- Comments
COMMENT ON TABLE relationship_history IS 'History of relationship changes - status, roles, dates only';
COMMENT ON COLUMN relationship_history.field_name IS 'status, since_date, until_date, or roles';
COMMENT ON COLUMN relationship_history.old_value IS 'Previous value as JSONB - roles always stored sorted';
COMMENT ON COLUMN relationship_history.new_value IS 'New value as JSONB - roles always stored sorted';
COMMENT ON COLUMN relationship_history.event_source IS 'ui, migration, api, or system';

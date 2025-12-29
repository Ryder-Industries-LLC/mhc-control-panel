-- Migration 030: Create service_relationships table
-- Tracks Sub and Dom relationships with granular levels and types

CREATE TABLE IF NOT EXISTS service_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Relationship type: 'sub' (they are my sub) or 'dom' (they are my dom)
  service_role VARCHAR(10) NOT NULL CHECK (service_role IN ('sub', 'dom')),

  -- Service levels vary by role:
  -- Sub levels: Current, Potential, Decommissioned, Banished, Paused
  -- Dom levels: Potential, Actively Serving, Ended, Paused
  service_level VARCHAR(30) NOT NULL,

  -- Types stored as array (multi-select)
  -- Sub types: pup, boi, brat, etc.
  -- Dom types: Intellectual, Aggressive, TokenDaddy, etc.
  service_types TEXT[] DEFAULT '{}',

  -- Relationship timeline
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,

  -- Optional notes specific to this relationship
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- One active relationship per profile per role
  -- (a person can be both my sub AND my dom, but only one sub relationship and one dom relationship)
  CONSTRAINT unique_profile_role UNIQUE (profile_id, service_role)
);

-- Indexes for efficient queries
CREATE INDEX idx_service_rel_profile ON service_relationships(profile_id);
CREATE INDEX idx_service_rel_role ON service_relationships(service_role);
CREATE INDEX idx_service_rel_level ON service_relationships(service_level);
CREATE INDEX idx_service_rel_role_level ON service_relationships(service_role, service_level);

-- Comments
COMMENT ON TABLE service_relationships IS 'Tracks Sub and Dom relationship data for profiles';
COMMENT ON COLUMN service_relationships.service_role IS 'sub = they are my sub, dom = they are my dom';
COMMENT ON COLUMN service_relationships.service_level IS 'Sub: Current/Potential/Decommissioned/Banished/Paused, Dom: Potential/Actively Serving/Ended/Paused';
COMMENT ON COLUMN service_relationships.service_types IS 'Multi-select types: pup/boi/brat for subs, Intellectual/Aggressive/TokenDaddy for doms';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_service_relationships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_service_relationships_updated_at
  BEFORE UPDATE ON service_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_service_relationships_updated_at();

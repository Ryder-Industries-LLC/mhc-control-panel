-- Migration 039: Create unified relationships system
-- Merges Dom, Sub, Friend into a single Relationship model with history tracking

-- Ensure UUID function is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- SEED TABLES (Suggestions only, no FK constraints)
-- ============================================

-- Seed/suggestion table for relationship traits
CREATE TABLE IF NOT EXISTS relationship_traits_seed (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  category VARCHAR(20) NOT NULL CHECK (category IN ('dom', 'sub', 'friend', 'general')),
  display_order INTEGER DEFAULT 0
);

-- Insert seed traits
INSERT INTO relationship_traits_seed (name, category, display_order) VALUES
  -- Dom traits
  ('Intellectual', 'dom', 1),
  ('Aggressive', 'dom', 2),
  ('TokenDaddy', 'dom', 3),
  ('Daddy', 'dom', 4),
  ('Master', 'dom', 5),
  ('Sir', 'dom', 6),
  -- Sub traits
  ('Pup', 'sub', 1),
  ('Boi', 'sub', 2),
  ('Brat', 'sub', 3),
  ('Slave', 'sub', 4),
  ('Servant', 'sub', 5),
  ('Pet', 'sub', 6),
  -- Friend traits (tier indicators)
  ('T1 Special', 'friend', 1),
  ('T2 Regular', 'friend', 2),
  ('T3 Tipper', 'friend', 3),
  ('T4 Drive-By', 'friend', 4)
ON CONFLICT (name) DO NOTHING;

-- Seed/suggestion table for address terms
CREATE TABLE IF NOT EXISTS address_terms_seed (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0
);

-- Insert seed address terms
INSERT INTO address_terms_seed (name, display_order) VALUES
  ('Sir', 1),
  ('Master', 2),
  ('Daddy', 3),
  ('Pup', 4),
  ('Boi', 5),
  ('Boy', 6),
  ('Slave', 7),
  ('Pet', 8),
  ('Good Boy', 9),
  ('Brat', 10)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE relationship_traits_seed IS 'Suggestion catalog for relationship traits - users can enter any trait';
COMMENT ON TABLE address_terms_seed IS 'Suggestion catalog for address terms - users can enter any term';

-- ============================================
-- RELATIONSHIPS TABLE (One per profile, created on first save)
-- ============================================

CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Roles: Multi-select array (Dom, Sub, Friend, Custom)
  roles TEXT[] NOT NULL DEFAULT '{}',

  -- Freeform text when 'Custom' is in roles (cleared when Custom removed)
  custom_role_label TEXT,

  -- Status with CHECK constraint
  status VARCHAR(30) NOT NULL DEFAULT 'Potential'
    CHECK (status IN ('Potential', 'Occasional', 'Active', 'On Hold', 'Inactive', 'Decommissioned', 'Banished')),

  -- Traits: Multi-select with custom values allowed
  traits TEXT[] DEFAULT '{}',

  -- Date-only fields for relationship timeline
  since_date DATE,
  until_date DATE,

  -- Optional notes
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- One relationship per profile
  CONSTRAINT unique_profile_relationship UNIQUE (profile_id)
);

-- Indexes for common queries
-- NOTE: profile_id already indexed via UNIQUE constraint
CREATE INDEX idx_relationships_status ON relationships(status);
CREATE INDEX idx_relationships_roles_gin ON relationships USING GIN (roles);
CREATE INDEX idx_relationships_traits_gin ON relationships USING GIN (traits);

-- Comments
COMMENT ON TABLE relationships IS 'Unified relationship data - one record per profile, created on first save';
COMMENT ON COLUMN relationships.roles IS 'Multi-select: Dom, Sub, Friend, Custom - always stored sorted';
COMMENT ON COLUMN relationships.custom_role_label IS 'Freeform text when Custom is in roles, NULL otherwise';
COMMENT ON COLUMN relationships.status IS 'Potential, Occasional, Active, On Hold, Inactive, Decommissioned, Banished';
COMMENT ON COLUMN relationships.traits IS 'Multi-select traits with custom values allowed';
COMMENT ON COLUMN relationships.since_date IS 'When relationship started (DATE only, no time)';
COMMENT ON COLUMN relationships.until_date IS 'When relationship ended (DATE only, no time)';

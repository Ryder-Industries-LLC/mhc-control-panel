-- Migration 042: Migrate data from legacy tables to unified relationships
-- Migrates service_relationships (sub/dom) and friend_tier to new relationships table
-- Creates initial history entries for migrated data

-- ============================================
-- STATUS MAPPING:
-- Sub: Current -> Active, Occasional -> Occasional, Potential -> Potential,
--      Decommissioned -> Decommissioned, Banished -> Banished, Paused -> On Hold
-- Dom: Actively Serving -> Active, Potential -> Potential,
--      Ended -> Inactive, Paused -> On Hold
-- ============================================

-- Helper function to map old status to new status
CREATE OR REPLACE FUNCTION map_legacy_status(old_level VARCHAR, role VARCHAR) RETURNS VARCHAR AS $$
BEGIN
  CASE old_level
    WHEN 'Current' THEN RETURN 'Active';
    WHEN 'Actively Serving' THEN RETURN 'Active';
    WHEN 'Occasional' THEN RETURN 'Occasional';
    WHEN 'Potential' THEN RETURN 'Potential';
    WHEN 'Paused' THEN RETURN 'On Hold';
    WHEN 'Ended' THEN RETURN 'Inactive';
    WHEN 'Decommissioned' THEN RETURN 'Decommissioned';
    WHEN 'Banished' THEN RETURN 'Banished';
    ELSE RETURN 'Potential';
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Helper function to determine "winning" status when merging
-- Priority: Active > Occasional > Potential > On Hold > Inactive > Decommissioned > Banished
CREATE OR REPLACE FUNCTION higher_status(status1 VARCHAR, status2 VARCHAR) RETURNS VARCHAR AS $$
DECLARE
  priority1 INTEGER;
  priority2 INTEGER;
BEGIN
  -- Higher number = higher priority (Active wins)
  priority1 := CASE status1
    WHEN 'Active' THEN 7
    WHEN 'Occasional' THEN 6
    WHEN 'Potential' THEN 5
    WHEN 'On Hold' THEN 4
    WHEN 'Inactive' THEN 3
    WHEN 'Decommissioned' THEN 2
    WHEN 'Banished' THEN 1
    ELSE 0
  END;
  priority2 := CASE status2
    WHEN 'Active' THEN 7
    WHEN 'Occasional' THEN 6
    WHEN 'Potential' THEN 5
    WHEN 'On Hold' THEN 4
    WHEN 'Inactive' THEN 3
    WHEN 'Decommissioned' THEN 2
    WHEN 'Banished' THEN 1
    ELSE 0
  END;

  IF priority1 >= priority2 THEN
    RETURN status1;
  ELSE
    RETURN status2;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- MIGRATE DATA
-- ============================================

-- Step 1: Create unified relationship records from service_relationships
-- First pass: Sub relationships
INSERT INTO relationships (profile_id, roles, status, traits, since_date, until_date, notes, created_at, updated_at)
SELECT
  sr.profile_id,
  ARRAY['Sub']::TEXT[],
  map_legacy_status(sr.service_level, 'sub'),
  COALESCE(sr.service_types, '{}'),
  sr.started_at::DATE,
  sr.ended_at::DATE,
  sr.notes,
  sr.created_at,
  sr.updated_at
FROM service_relationships sr
WHERE sr.service_role = 'sub'
ON CONFLICT (profile_id) DO NOTHING;

-- Second pass: Dom relationships (update existing or insert new)
INSERT INTO relationships (profile_id, roles, status, traits, since_date, until_date, notes, created_at, updated_at)
SELECT
  sr.profile_id,
  ARRAY['Dom']::TEXT[],
  map_legacy_status(sr.service_level, 'dom'),
  COALESCE(sr.service_types, '{}'),
  sr.started_at::DATE,
  sr.ended_at::DATE,
  sr.notes,
  sr.created_at,
  sr.updated_at
FROM service_relationships sr
WHERE sr.service_role = 'dom'
ON CONFLICT (profile_id) DO UPDATE SET
  -- Merge roles (add Dom to existing roles)
  roles = array_cat(relationships.roles, ARRAY['Dom']::TEXT[]),
  -- Use higher status
  status = higher_status(relationships.status, map_legacy_status(EXCLUDED.status, 'dom')),
  -- Merge traits (combine both)
  traits = (SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(array_cat(relationships.traits, EXCLUDED.traits)))),
  -- Use earliest since_date
  since_date = LEAST(relationships.since_date, EXCLUDED.since_date),
  -- Use latest until_date
  until_date = GREATEST(relationships.until_date, EXCLUDED.until_date),
  -- Concatenate notes if both exist
  notes = CASE
    WHEN relationships.notes IS NOT NULL AND EXCLUDED.notes IS NOT NULL
    THEN relationships.notes || E'\n\n---\n\n' || EXCLUDED.notes
    ELSE COALESCE(relationships.notes, EXCLUDED.notes)
  END,
  updated_at = NOW();

-- Step 2: Add Friend role based on friend_tier
-- friend_tier 1 = T1 Special, 2 = T2 Regular, 3 = T3 Tipper, 4 = T4 Drive-By
INSERT INTO relationships (profile_id, roles, status, traits)
SELECT
  p.id,
  ARRAY['Friend']::TEXT[],
  'Active',
  ARRAY[
    CASE p.friend_tier
      WHEN 1 THEN 'T1 Special'
      WHEN 2 THEN 'T2 Regular'
      WHEN 3 THEN 'T3 Tipper'
      WHEN 4 THEN 'T4 Drive-By'
    END
  ]::TEXT[]
FROM profiles p
WHERE p.friend_tier IS NOT NULL AND p.friend_tier BETWEEN 1 AND 4
ON CONFLICT (profile_id) DO UPDATE SET
  -- Add Friend to existing roles if not already present
  roles = CASE
    WHEN 'Friend' = ANY(relationships.roles) THEN relationships.roles
    ELSE array_append(relationships.roles, 'Friend')
  END,
  -- Add tier trait
  traits = (SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(array_cat(
    relationships.traits,
    ARRAY[CASE EXCLUDED.traits[1]
      WHEN 'T1 Special' THEN 'T1 Special'
      WHEN 'T2 Regular' THEN 'T2 Regular'
      WHEN 'T3 Tipper' THEN 'T3 Tipper'
      WHEN 'T4 Drive-By' THEN 'T4 Drive-By'
    END]::TEXT[]
  )))),
  updated_at = NOW();

-- Step 3: Sort roles arrays and remove duplicates
UPDATE relationships
SET roles = (SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(roles) ORDER BY 1));

-- Step 4: Sort traits arrays and remove duplicates
UPDATE relationships
SET traits = (SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(traits) WHERE unnest IS NOT NULL AND unnest != '' ORDER BY 1));

-- ============================================
-- SEED HISTORY ENTRIES
-- ============================================

-- Insert status history entry for each migrated relationship
INSERT INTO relationship_history (relationship_id, field_name, old_value, new_value, change_note, changed_by, event_source)
SELECT
  r.id,
  'status',
  NULL,
  to_jsonb(r.status),
  'Imported from legacy tables',
  'migration_042',
  'migration'
FROM relationships r;

-- Insert roles history entry for each migrated relationship
INSERT INTO relationship_history (relationship_id, field_name, old_value, new_value, change_note, changed_by, event_source)
SELECT
  r.id,
  'roles',
  NULL,
  to_jsonb(r.roles),
  'Imported from legacy tables',
  'migration_042',
  'migration'
FROM relationships r;

-- Insert since_date history entry for relationships that have it set
INSERT INTO relationship_history (relationship_id, field_name, old_value, new_value, change_note, changed_by, event_source)
SELECT
  r.id,
  'since_date',
  NULL,
  to_jsonb(r.since_date::TEXT),
  'Imported from legacy tables',
  'migration_042',
  'migration'
FROM relationships r
WHERE r.since_date IS NOT NULL;

-- Insert until_date history entry for relationships that have it set
INSERT INTO relationship_history (relationship_id, field_name, old_value, new_value, change_note, changed_by, event_source)
SELECT
  r.id,
  'until_date',
  NULL,
  to_jsonb(r.until_date::TEXT),
  'Imported from legacy tables',
  'migration_042',
  'migration'
FROM relationships r
WHERE r.until_date IS NOT NULL;

-- ============================================
-- CLEANUP
-- ============================================

-- Drop helper functions
DROP FUNCTION IF EXISTS map_legacy_status(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS higher_status(VARCHAR, VARCHAR);

-- Comments
COMMENT ON TABLE relationships IS 'Unified relationship data - migrated from service_relationships and friend_tier';

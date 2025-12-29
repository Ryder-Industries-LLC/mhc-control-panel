-- Migration 025: Rename hudson_broadcasts to my_broadcasts
-- Generic naming for future multi-broadcaster support

-- 1. Rename the table
ALTER TABLE hudson_broadcasts RENAME TO my_broadcasts;

-- 2. Rename indexes
ALTER INDEX IF EXISTS idx_hudson_broadcasts_started_at RENAME TO idx_my_broadcasts_started_at;
ALTER INDEX IF EXISTS idx_hudson_broadcasts_ended_at RENAME TO idx_my_broadcasts_ended_at;
ALTER INDEX IF EXISTS idx_hudson_broadcasts_tags RENAME TO idx_my_broadcasts_tags;

-- 3. Drop and recreate the trigger function with new name
DROP TRIGGER IF EXISTS trigger_hudson_broadcasts_updated_at ON my_broadcasts;
DROP FUNCTION IF EXISTS update_hudson_broadcasts_updated_at();

CREATE OR REPLACE FUNCTION update_my_broadcasts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_my_broadcasts_updated_at
  BEFORE UPDATE ON my_broadcasts
  FOR EACH ROW
  EXECUTE FUNCTION update_my_broadcasts_updated_at();

-- 4. Update table comment
COMMENT ON TABLE my_broadcasts IS 'Tracks broadcaster''s own broadcast sessions with summaries and notes';

-- 5. The foreign key in broadcast_summaries is maintained automatically since it references the table by OID
-- PostgreSQL handles this - the FK constraint will still work after the table rename

-- Note: No data migration needed - the rename preserves all existing data

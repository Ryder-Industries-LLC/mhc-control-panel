-- Migration 027: Drop foreign key constraint on broadcast_summaries
-- Allow summaries to reference broadcasts from either my_broadcasts or stream_sessions

-- Find and drop the foreign key constraint
-- The constraint was originally named when referencing hudson_broadcasts
DO $$
DECLARE
    constraint_name text;
BEGIN
    -- Find the foreign key constraint name
    SELECT tc.constraint_name INTO constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'broadcast_summaries'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'broadcast_id';

    -- Drop it if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE broadcast_summaries DROP CONSTRAINT %I', constraint_name);
        RAISE NOTICE 'Dropped foreign key constraint: %', constraint_name;
    ELSE
        RAISE NOTICE 'No foreign key constraint found on broadcast_summaries.broadcast_id';
    END IF;
END $$;

-- Add comment explaining the change
COMMENT ON COLUMN broadcast_summaries.broadcast_id IS 'References a broadcast from either my_broadcasts or stream_sessions table';

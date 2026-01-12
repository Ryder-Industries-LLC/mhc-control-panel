-- Migration: Add from_username, to_username columns to chaturbate_dm_raw_data
-- This makes the message direction explicit rather than inferring from is_from_me

-- Add from_username column
ALTER TABLE chaturbate_dm_raw_data
ADD COLUMN IF NOT EXISTS from_username VARCHAR(255);

-- Add to_username column
ALTER TABLE chaturbate_dm_raw_data
ADD COLUMN IF NOT EXISTS to_username VARCHAR(255);

-- Add thread_id to reference dm_scrape_state
ALTER TABLE chaturbate_dm_raw_data
ADD COLUMN IF NOT EXISTS thread_id UUID;

-- Add foreign key constraint
ALTER TABLE chaturbate_dm_raw_data
ADD CONSTRAINT chaturbate_dm_raw_data_thread_id_fkey
FOREIGN KEY (thread_id) REFERENCES dm_scrape_state(id) ON DELETE SET NULL;

-- Create index on thread_id
CREATE INDEX IF NOT EXISTS idx_dm_raw_thread_id ON chaturbate_dm_raw_data(thread_id);

-- Create indexes on from/to for filtering
CREATE INDEX IF NOT EXISTS idx_dm_raw_from_username ON chaturbate_dm_raw_data(from_username);
CREATE INDEX IF NOT EXISTS idx_dm_raw_to_username ON chaturbate_dm_raw_data(to_username);

-- Populate from_username and to_username for existing records
-- When is_from_me = true: from = broadcaster (hudson_cage), to = thread_username
-- When is_from_me = false: from = thread_username, to = broadcaster (hudson_cage)
-- Note: The broadcaster username comes from env var, but for migration we'll use a placeholder
-- The service will populate these correctly going forward

UPDATE chaturbate_dm_raw_data
SET
  from_username = CASE WHEN is_from_me THEN 'hudson_cage' ELSE thread_username END,
  to_username = CASE WHEN is_from_me THEN thread_username ELSE 'hudson_cage' END
WHERE from_username IS NULL;

-- Update thread_id for existing records
UPDATE chaturbate_dm_raw_data dm
SET thread_id = ds.id
FROM dm_scrape_state ds
WHERE dm.thread_username = ds.thread_username
AND dm.thread_id IS NULL;

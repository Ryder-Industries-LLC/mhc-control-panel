-- Cleanup Duplicate Interactions
-- This script removes duplicate interactions that were created before deduplication was added
-- to all event handlers in events-client.ts
--
-- Duplicates are identified as rows with the same:
-- - person_id
-- - type
-- - content
-- - timestamp within the same minute (truncated to minute)
--
-- The script keeps the FIRST occurrence (lowest id) and deletes the rest.

-- First, let's see how many duplicates exist
SELECT
  'Before cleanup' as status,
  COUNT(*) as total_interactions,
  (SELECT COUNT(*) FROM (
    SELECT person_id, type, content, DATE_TRUNC('minute', created_at) as minute
    FROM interactions
    WHERE source = 'cb_events'
    GROUP BY person_id, type, content, DATE_TRUNC('minute', created_at)
    HAVING COUNT(*) > 1
  ) dups) as duplicate_groups;

-- Show breakdown by type
SELECT
  type,
  COUNT(*) as duplicate_count
FROM (
  SELECT
    i.type,
    i.id,
    ROW_NUMBER() OVER (
      PARTITION BY i.person_id, i.type, i.content, DATE_TRUNC('minute', i.created_at)
      ORDER BY i.id
    ) as rn
  FROM interactions i
  WHERE i.source = 'cb_events'
) ranked
WHERE rn > 1
GROUP BY type
ORDER BY duplicate_count DESC;

-- Delete duplicates, keeping the first occurrence (lowest id)
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY person_id, type, content, DATE_TRUNC('minute', created_at)
      ORDER BY id
    ) as rn
  FROM interactions
  WHERE source = 'cb_events'
)
DELETE FROM interactions
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Show results after cleanup
SELECT
  'After cleanup' as status,
  COUNT(*) as total_interactions,
  (SELECT COUNT(*) FROM (
    SELECT person_id, type, content, DATE_TRUNC('minute', created_at) as minute
    FROM interactions
    WHERE source = 'cb_events'
    GROUP BY person_id, type, content, DATE_TRUNC('minute', created_at)
    HAVING COUNT(*) > 1
  ) dups) as remaining_duplicate_groups;

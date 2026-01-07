-- Cleanup Duplicate Event Logs
-- This script removes duplicate event_logs that were created before deduplication was added
--
-- Duplicates are identified as rows with the same:
-- - method
-- - username
-- - timestamp within the same minute (truncated to minute)
--
-- The script keeps the FIRST occurrence (lowest id) and deletes the rest.

-- First, let's see how many duplicates exist
SELECT
  'Before cleanup' as status,
  COUNT(*) as total_events,
  (SELECT COUNT(*) FROM (
    SELECT method, username, DATE_TRUNC('minute', created_at) as minute
    FROM event_logs
    GROUP BY method, username, DATE_TRUNC('minute', created_at)
    HAVING COUNT(*) > 1
  ) dups) as duplicate_groups;

-- Show breakdown by method
SELECT
  method,
  COUNT(*) as duplicate_count
FROM (
  SELECT
    e.method,
    e.id,
    ROW_NUMBER() OVER (
      PARTITION BY e.method, e.username, DATE_TRUNC('minute', e.created_at)
      ORDER BY e.id
    ) as rn
  FROM event_logs e
) ranked
WHERE rn > 1
GROUP BY method
ORDER BY duplicate_count DESC;

-- Delete duplicates, keeping the first occurrence (lowest id)
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY method, username, DATE_TRUNC('minute', created_at)
      ORDER BY id
    ) as rn
  FROM event_logs
)
DELETE FROM event_logs
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Show results after cleanup
SELECT
  'After cleanup' as status,
  COUNT(*) as total_events,
  (SELECT COUNT(*) FROM (
    SELECT method, username, DATE_TRUNC('minute', created_at) as minute
    FROM event_logs
    GROUP BY method, username, DATE_TRUNC('minute', created_at)
    HAVING COUNT(*) > 1
  ) dups) as remaining_duplicate_groups;

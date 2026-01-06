-- Migration 059: Backfill follow_history from event_logs
-- This migration populates follow_history with historical follow/unfollow events

-- Step 1: Insert follow events from event_logs
INSERT INTO follow_history (person_id, direction, action, source, event_id, created_at)
SELECT
  p.id as person_id,
  'follower' as direction,
  'follow' as action,
  'events_api' as source,
  el.id as event_id,
  el.created_at
FROM event_logs el
JOIN persons p ON LOWER(p.username) = LOWER(el.username)
WHERE el.method = 'follow'
  AND NOT EXISTS (
    -- Avoid duplicates if already backfilled
    SELECT 1 FROM follow_history fh
    WHERE fh.event_id = el.id
  );

-- Step 2: Insert unfollow events from event_logs
INSERT INTO follow_history (person_id, direction, action, source, event_id, created_at)
SELECT
  p.id as person_id,
  'follower' as direction,
  'unfollow' as action,
  'events_api' as source,
  el.id as event_id,
  el.created_at
FROM event_logs el
JOIN persons p ON LOWER(p.username) = LOWER(el.username)
WHERE el.method = 'unfollow'
  AND NOT EXISTS (
    -- Avoid duplicates if already backfilled
    SELECT 1 FROM follow_history fh
    WHERE fh.event_id = el.id
  );

-- Step 3: Update profiles.follower based on the most recent action per person
-- First, mark all users who have a follow event as followers
UPDATE profiles p
SET
  follower = TRUE,
  follower_since = subq.first_follow,
  follower_checked_at = NOW()
FROM (
  SELECT
    fh.person_id,
    MIN(fh.created_at) FILTER (WHERE fh.action = 'follow') as first_follow,
    MAX(fh.created_at) as last_action,
    (SELECT action FROM follow_history fh2
     WHERE fh2.person_id = fh.person_id AND fh2.direction = 'follower'
     ORDER BY fh2.created_at DESC LIMIT 1) as current_status
  FROM follow_history fh
  WHERE fh.direction = 'follower'
  GROUP BY fh.person_id
) subq
WHERE p.person_id = subq.person_id
  AND subq.current_status = 'follow';

-- Step 4: Mark users whose most recent action is unfollow
UPDATE profiles p
SET
  follower = FALSE,
  unfollower_at = subq.last_unfollow,
  follower_checked_at = NOW()
FROM (
  SELECT
    fh.person_id,
    MAX(fh.created_at) FILTER (WHERE fh.action = 'unfollow') as last_unfollow,
    (SELECT action FROM follow_history fh2
     WHERE fh2.person_id = fh.person_id AND fh2.direction = 'follower'
     ORDER BY fh2.created_at DESC LIMIT 1) as current_status
  FROM follow_history fh
  WHERE fh.direction = 'follower'
  GROUP BY fh.person_id
) subq
WHERE p.person_id = subq.person_id
  AND subq.current_status = 'unfollow';

-- Step 5: Ensure profiles exist for all persons with follow history
INSERT INTO profiles (person_id, follower, follower_since, follower_checked_at)
SELECT DISTINCT
  fh.person_id,
  TRUE,
  MIN(fh.created_at),
  NOW()
FROM follow_history fh
WHERE fh.direction = 'follower'
  AND fh.action = 'follow'
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.person_id = fh.person_id)
GROUP BY fh.person_id
ON CONFLICT (person_id) DO NOTHING;

COMMENT ON TABLE follow_history IS 'Tracks all follow/unfollow events from any source - backfilled from event_logs on 2026-01-06';

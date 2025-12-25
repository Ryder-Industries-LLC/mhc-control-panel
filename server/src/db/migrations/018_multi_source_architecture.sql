-- Multi-Source Data Architecture Migration
-- Renames broadcast_sessions to affiliate_api_snapshots and adds CBHours tables

-- Step 1: Rename broadcast_sessions to affiliate_api_snapshots
ALTER TABLE IF EXISTS broadcast_sessions RENAME TO affiliate_api_snapshots;
ALTER INDEX IF EXISTS idx_broadcast_sessions_person_id RENAME TO idx_affiliate_api_snapshots_person_id;
ALTER INDEX IF EXISTS idx_broadcast_sessions_observed_at RENAME TO idx_affiliate_api_snapshots_observed_at;

COMMENT ON TABLE affiliate_api_snapshots IS 'Snapshots from Chaturbate Affiliate API - captured when models are online';

-- Step 2: Create CBHours live stats table
CREATE TABLE IF NOT EXISTS cbhours_live_stats (
  id SERIAL PRIMARY KEY,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  checked_at TIMESTAMP NOT NULL,

  -- Status
  room_status TEXT, -- 'Online' | 'Offline'

  -- Profile
  gender TEXT,
  is_new BOOLEAN,

  -- Rankings (unique to CBHours)
  rank INTEGER,
  grank INTEGER,

  -- Metrics
  viewers INTEGER,
  followers INTEGER,

  -- Stream data
  current_show TEXT,
  room_subject TEXT,
  tags TEXT[],

  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT cbhours_live_stats_unique UNIQUE(person_id, checked_at)
);

CREATE INDEX IF NOT EXISTS idx_cbhours_live_stats_person_id ON cbhours_live_stats(person_id);
CREATE INDEX IF NOT EXISTS idx_cbhours_live_stats_checked_at ON cbhours_live_stats(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_cbhours_live_stats_room_status ON cbhours_live_stats(room_status) WHERE room_status = 'Online';

COMMENT ON TABLE cbhours_live_stats IS 'Live stats from CBHours API - updated every minute';
COMMENT ON COLUMN cbhours_live_stats.rank IS 'Overall site rank';
COMMENT ON COLUMN cbhours_live_stats.grank IS 'Gender-specific rank';
COMMENT ON COLUMN cbhours_live_stats.followers IS 'Follower count from CBHours tracking';

-- Step 3: Create CBHours activity table for historical tracking
CREATE TABLE IF NOT EXISTS cbhours_activity (
  id SERIAL PRIMARY KEY,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  timestamp TIMESTAMP NOT NULL,

  -- 3-minute segment data
  show_type TEXT, -- '_public', '_private', '_ticket', '_group', etc.
  rank INTEGER,
  grank INTEGER,
  followers INTEGER,
  viewers INTEGER,
  gender TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT cbhours_activity_unique UNIQUE(person_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_cbhours_activity_person_id ON cbhours_activity(person_id);
CREATE INDEX IF NOT EXISTS idx_cbhours_activity_timestamp ON cbhours_activity(timestamp DESC);

COMMENT ON TABLE cbhours_activity IS 'Historical 3-minute activity segments from CBHours API - up to 60 days';

-- Step 4: Add source metadata to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS affiliate_last_updated TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cbhours_last_updated TIMESTAMP,
  ADD COLUMN IF NOT EXISTS has_cbhours_trophy BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN profiles.affiliate_last_updated IS 'Last time we got data from Affiliate API for this person';
COMMENT ON COLUMN profiles.cbhours_last_updated IS 'Last time we got data from CBHours API for this person';
COMMENT ON COLUMN profiles.has_cbhours_trophy IS 'Whether this model has trophy/calendar icon (required for CBHours)';

-- Step 5: Create aggregation view for current person state
CREATE OR REPLACE VIEW v_person_current_state AS
SELECT
  p.id,
  p.username,
  p.platform,
  p.role,
  p.is_excluded,
  p.first_seen_at,
  p.last_seen_at,

  -- Profile data (priority: affiliate → profiles)
  COALESCE(
    (SELECT display_name FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1),
    pr.display_name
  ) as display_name,

  COALESCE(
    (SELECT age FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1),
    pr.age
  ) as age,

  COALESCE(
    (SELECT gender FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1),
    (SELECT gender FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1),
    pr.gender
  ) as gender,

  COALESCE(
    (SELECT location FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1),
    pr.location
  ) as location,

  COALESCE(
    (SELECT country FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1),
    pr.country
  ) as country,

  -- Current status (priority: affiliate recent → cbhours)
  COALESCE(
    (SELECT current_show FROM affiliate_api_snapshots
     WHERE person_id = p.id AND observed_at > NOW() - INTERVAL '10 minutes'
     ORDER BY observed_at DESC LIMIT 1),
    (SELECT CASE WHEN room_status = 'Online' THEN current_show ELSE NULL END
     FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1)
  ) as current_show,

  COALESCE(
    (SELECT room_subject FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1),
    (SELECT room_subject FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1)
  ) as room_subject,

  -- Metrics (priority: cbhours → affiliate for followers, viewers from both)
  COALESCE(
    (SELECT followers FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1),
    (SELECT num_followers FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1)
  ) as followers,

  COALESCE(
    (SELECT viewers FROM cbhours_live_stats
     WHERE person_id = p.id AND room_status = 'Online'
     ORDER BY checked_at DESC LIMIT 1),
    (SELECT num_users FROM affiliate_api_snapshots
     WHERE person_id = p.id AND observed_at > NOW() - INTERVAL '10 minutes'
     ORDER BY observed_at DESC LIMIT 1)
  ) as viewers,

  -- Rankings (only from cbhours)
  (SELECT rank FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1) as rank,
  (SELECT grank FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1) as grank,

  -- Tags (priority: affiliate → cbhours)
  COALESCE(
    (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1),
    (SELECT tags FROM cbhours_live_stats WHERE person_id = p.id ORDER BY checked_at DESC LIMIT 1)
  ) as tags,

  -- Images (affiliate only)
  (SELECT COALESCE(image_path_360x270, image_url_360x270)
   FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as image_url,

  (SELECT image_path_360x270
   FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as image_path,

  -- Following/Follower flags
  pr.following,
  pr.follower,
  pr.following_checked_at,
  pr.follower_checked_at,

  -- Counts
  (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
  (SELECT COUNT(*) FROM snapshots WHERE person_id = p.id) as snapshot_count,

  -- Source freshness
  (SELECT MAX(observed_at) FROM affiliate_api_snapshots WHERE person_id = p.id) as affiliate_last_seen,
  (SELECT MAX(checked_at) FROM cbhours_live_stats WHERE person_id = p.id) as cbhours_last_seen,
  pr.has_cbhours_trophy,

  -- Determine source
  COALESCE(
    (SELECT source FROM snapshots WHERE person_id = p.id ORDER BY created_at ASC LIMIT 1),
    (SELECT source FROM interactions WHERE person_id = p.id ORDER BY created_at ASC LIMIT 1),
    'manual'
  ) as source

FROM persons p
LEFT JOIN profiles pr ON pr.person_id = p.id
WHERE p.is_excluded = FALSE;

COMMENT ON VIEW v_person_current_state IS 'Aggregated current state for each person from all data sources with priority-based fallbacks';

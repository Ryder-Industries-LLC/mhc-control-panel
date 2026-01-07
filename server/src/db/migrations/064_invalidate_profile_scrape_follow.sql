-- Migration 064: Invalidate Profile Scrape Follow Data
--
-- Context: The profile scrape follow detection was checking for button EXISTENCE
-- rather than button VISIBILITY. This caused false positives because both
-- follow and unfollow buttons exist in the DOM, but only one is visible at a time.
--
-- This migration invalidates profile_scrape-derived follow data so the fixed
-- detector can recalculate on the next scrape job run.
--
-- IMPORTANT: This does NOT touch events_api or list_scrape records.

-- Step 1: Reset browser_scraped_at for profiles that had profile_scrape follow history
-- This forces the profile-scrape job to re-scrape these profiles
UPDATE profiles p
SET
  browser_scraped_at = NULL,
  following_checked_at = NULL
WHERE EXISTS (
  SELECT 1 FROM follow_history fh
  WHERE fh.person_id = p.person_id
    AND fh.source = 'profile_scrape'
    AND fh.direction = 'following'
);

-- Log how many profiles were affected
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO affected_count
  FROM profiles p
  WHERE p.browser_scraped_at IS NULL
    AND EXISTS (
      SELECT 1 FROM follow_history fh
      WHERE fh.person_id = p.person_id
        AND fh.source = 'profile_scrape'
        AND fh.direction = 'following'
    );

  RAISE NOTICE 'Migration 064: Reset % profiles for re-scraping with fixed follow detector', affected_count;
END $$;

COMMENT ON TABLE profiles IS 'Profile data for persons - follow detection fixed in migration 064';

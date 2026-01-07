-- Migration 066: Delete Erroneous Profile Scrape Unfollow Entries
--
-- Context: The profile scrape follow detection was checking for button EXISTENCE
-- rather than button VISIBILITY (getComputedStyle). This caused false unfollow
-- detections because both follow and unfollow buttons exist in the DOM, but only
-- one is visible at a time.
--
-- Migration 064 reset profiles for re-scraping with the fixed detector.
-- This migration removes the erroneous unfollow history entries that were
-- created by the buggy detection logic.
--
-- IMPORTANT: Only deletes 'unfollow' actions from 'profile_scrape' source.
-- Does NOT touch events_api, list_scrape, or manual_import records.
-- Does NOT touch 'follow' actions from profile_scrape.

-- Log count before deletion
DO $$
DECLARE
  count_before INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_before
  FROM follow_history
  WHERE source = 'profile_scrape'
    AND action = 'unfollow';

  RAISE NOTICE 'Migration 066: Found % profile_scrape unfollow entries to delete', count_before;
END $$;

-- Delete the erroneous unfollow entries
DELETE FROM follow_history
WHERE source = 'profile_scrape'
  AND action = 'unfollow';

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 066: Deleted erroneous profile_scrape unfollow entries';
END $$;

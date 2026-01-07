-- Migration: 054_cleanup_chaturbate_twitter_links
-- Description: Remove Chaturbate's own Twitter accounts from social_links
-- These were incorrectly scraped from profile pages

-- Remove twitter links that point to Chaturbate's own accounts
UPDATE profiles
SET social_links = social_links - 'twitter',
    updated_at = NOW()
WHERE social_links->>'twitter' ILIKE '%twitter.com/cbupdatenews%'
   OR social_links->>'twitter' ILIKE '%twitter.com/chaturbate%'
   OR social_links->>'twitter' ILIKE '%x.com/cbupdatenews%'
   OR social_links->>'twitter' ILIKE '%x.com/chaturbate%';

-- Log how many were cleaned up (will show in migration output)
DO $$
DECLARE
  cleaned_count INTEGER;
BEGIN
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RAISE NOTICE 'Cleaned up % profiles with Chaturbate Twitter links', cleaned_count;
END $$;

-- Update profiles table to store Chaturbate Affiliate API data
-- This migration adds fields available from the public Affiliate API

-- Only run if profiles table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    -- Add Affiliate API fields
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country VARCHAR(2); -- ISO alpha-2 country code
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT false;

    -- Rename/clarify existing fields to match Affiliate API
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_detail TEXT; -- Full location string from profile scraping (Phase 2)
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday_public VARCHAR(10); -- YYYY-MM-DD from Affiliate API if public

    -- Add fields for authenticated scraping (Phase 2)
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interested_in TEXT; -- Women, Men, Couples, Trans
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS body_type TEXT; -- ATHLETIC, SLIM, etc.
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smoke_drink TEXT; -- YES/YES, NO/NO, etc.
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS body_decorations TEXT; -- TATTOO, PIERCING, etc.

    -- Add data source tracking
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_source VARCHAR(50) DEFAULT 'affiliate_api'; -- affiliate_api, scrape, manual
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_online TIMESTAMP; -- Last time seen in Affiliate API

    -- Update comments
    COMMENT ON COLUMN profiles.location IS 'Location from user bio (may differ from country)';
    COMMENT ON COLUMN profiles.location_detail IS 'Full location string from authenticated scraping';
    COMMENT ON COLUMN profiles.country IS 'ISO alpha-2 country code from Affiliate API';
    COMMENT ON COLUMN profiles.birthday_public IS 'Public birthday from Affiliate API (YYYY-MM-DD)';
    COMMENT ON COLUMN profiles.is_new IS 'New broadcaster flag from Affiliate API';
    COMMENT ON COLUMN profiles.last_seen_online IS 'Last time broadcaster was seen online in Affiliate API';
  END IF;
END $$;

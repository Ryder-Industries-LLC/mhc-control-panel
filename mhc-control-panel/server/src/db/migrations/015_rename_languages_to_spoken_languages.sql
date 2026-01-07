-- Rename languages column to spoken_languages to match Affiliate API field name
-- This ensures consistency with the data coming from Chaturbate's API

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'languages'
  ) THEN
    ALTER TABLE profiles RENAME COLUMN languages TO spoken_languages;

    COMMENT ON COLUMN profiles.spoken_languages IS 'Languages spoken by broadcaster (from Affiliate API)';
  END IF;
END $$;

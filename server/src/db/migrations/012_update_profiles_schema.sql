-- Update profiles table schema
-- Remove sexual_orientation (replaced by interested_in which already exists)
-- Remove hair_color, eye_color, weight
-- Rename languages to spoken_languages
-- Add country, data_source, last_seen_online, location_detail, birthday_public, smoke_drink, body_decorations

-- Drop columns we don't need
ALTER TABLE profiles DROP COLUMN IF EXISTS sexual_orientation;
ALTER TABLE profiles DROP COLUMN IF EXISTS hair_color;
ALTER TABLE profiles DROP COLUMN IF EXISTS eye_color;
ALTER TABLE profiles DROP COLUMN IF EXISTS weight;

-- Rename languages to spoken_languages
ALTER TABLE profiles RENAME COLUMN languages TO spoken_languages;

-- Change spoken_languages from TEXT[] to TEXT (since affiliate API returns a single string)
ALTER TABLE profiles ALTER COLUMN spoken_languages TYPE TEXT USING array_to_string(spoken_languages, ', ');
ALTER TABLE profiles ALTER COLUMN spoken_languages SET DEFAULT NULL;

-- Add new columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_detail TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday_public TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smoke_drink TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS body_decorations TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'scraper';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_online TIMESTAMP;

-- Create profiles table for scraped Chaturbate profile data
CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,

  -- Basic Info
  display_name TEXT,
  bio TEXT,
  location TEXT,
  age INTEGER,

  -- Physical Attributes
  gender TEXT,
  sexual_orientation TEXT,
  interested_in TEXT,
  body_type TEXT,
  ethnicity TEXT,
  hair_color TEXT,
  eye_color TEXT,
  height TEXT,
  weight TEXT,

  -- Arrays
  languages TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',

  -- Photos (JSONB array of {url, isPrimary})
  photos JSONB DEFAULT '[]',

  -- Tip Menu (JSONB array of {item, tokens})
  tip_menu JSONB DEFAULT '[]',

  -- Goal Info
  goal_description TEXT,
  goal_tokens INTEGER,
  goal_progress INTEGER,

  -- Social Links (JSONB array of {platform, url})
  social_links JSONB DEFAULT '[]',

  -- Fanclub
  fanclub_price INTEGER,
  fanclub_count INTEGER,

  -- Metadata
  last_broadcast TIMESTAMP,
  scraped_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Ensure one profile per person at a time (can store historical via snapshots later)
  UNIQUE(person_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_profiles_person_id ON profiles(person_id);
CREATE INDEX IF NOT EXISTS idx_profiles_scraped_at ON profiles(scraped_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

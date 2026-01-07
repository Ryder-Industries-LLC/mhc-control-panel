-- Add rating column to profiles table
-- Rating scale: 0=Not Rated, 1=Don't Like, 2=Meh, 3=Potential, 4=Yum, 5=HOT AF

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 0;

-- Add constraint to enforce valid range (0-5)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_rating_range'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT chk_rating_range CHECK (rating >= 0 AND rating <= 5);
  END IF;
END $$;

-- Add index for sorting/filtering by rating (partial index for rated profiles only)
CREATE INDEX IF NOT EXISTS idx_profiles_rating ON profiles (rating) WHERE rating > 0;

COMMENT ON COLUMN profiles.rating IS 'User rating: 0=Not Rated, 1=Don''t Like, 2=Meh, 3=Potential, 4=Yum, 5=HOT AF';

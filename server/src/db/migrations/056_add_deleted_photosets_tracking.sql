-- Track deleted photosets to prevent re-downloading during profile scrapes
-- When a user deletes an image from a photoset, we record the photoset_id here
-- so the scraper knows not to re-download it

CREATE TABLE IF NOT EXISTS deleted_photosets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  photoset_id VARCHAR(255) NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(person_id, photoset_id)
);

-- Index for fast lookups during scraping
CREATE INDEX IF NOT EXISTS idx_deleted_photosets_lookup
  ON deleted_photosets (person_id, photoset_id);

COMMENT ON TABLE deleted_photosets IS 'Tracks photosets that were deleted by user to prevent re-downloading during rescrape';

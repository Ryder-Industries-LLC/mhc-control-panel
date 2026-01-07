-- Create person_aliases table
CREATE TABLE person_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  alias VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL DEFAULT 'chaturbate',
  valid_from TIMESTAMP NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT person_aliases_unique UNIQUE(alias, platform, valid_from)
);

-- Create indexes
CREATE INDEX idx_person_aliases_person_id ON person_aliases(person_id);
CREATE INDEX idx_person_aliases_alias ON person_aliases(alias);
CREATE INDEX idx_person_aliases_current ON person_aliases(valid_to) WHERE valid_to IS NULL;
CREATE INDEX idx_person_aliases_platform ON person_aliases(platform);

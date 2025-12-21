-- Create persons table
CREATE TABLE persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL DEFAULT 'chaturbate',
  role VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
  rid INTEGER,
  did INTEGER,
  first_seen_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL,
  is_excluded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT persons_username_platform_unique UNIQUE(username, platform),
  CONSTRAINT persons_role_check CHECK (role IN ('MODEL', 'VIEWER', 'BOTH', 'UNKNOWN'))
);

-- Create indexes
CREATE INDEX idx_persons_username ON persons(username);
CREATE INDEX idx_persons_role ON persons(role);
CREATE INDEX idx_persons_excluded ON persons(is_excluded);
CREATE INDEX idx_persons_rid ON persons(rid) WHERE rid IS NOT NULL;
CREATE INDEX idx_persons_did ON persons(did) WHERE did IS NOT NULL;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_persons_updated_at
  BEFORE UPDATE ON persons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create attributes table
CREATE TABLE attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  key VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  confidence VARCHAR(20) NOT NULL,
  evidence_type VARCHAR(50),
  evidence_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT attributes_confidence_check CHECK (confidence IN ('low', 'medium', 'high')),
  CONSTRAINT attributes_evidence_type_check CHECK (evidence_type IN ('snapshot', 'interaction', 'manual', NULL))
);

-- Create indexes
CREATE INDEX idx_attributes_person_id ON attributes(person_id);
CREATE INDEX idx_attributes_key ON attributes(key);
CREATE INDEX idx_attributes_evidence ON attributes(evidence_type, evidence_id) WHERE evidence_type IS NOT NULL;

-- Add updated_at trigger
CREATE TRIGGER update_attributes_updated_at
  BEFORE UPDATE ON attributes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

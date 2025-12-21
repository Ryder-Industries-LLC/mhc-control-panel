-- Create snapshots table
CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  source VARCHAR(50) NOT NULL,
  captured_at TIMESTAMP NOT NULL,
  raw_payload JSONB NOT NULL,
  normalized_metrics JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT snapshots_unique UNIQUE(person_id, source, captured_at),
  CONSTRAINT snapshots_source_check CHECK (source IN ('statbate_member', 'statbate_model', 'cb_stats', 'manual'))
);

-- Create indexes
CREATE INDEX idx_snapshots_person_id ON snapshots(person_id);
CREATE INDEX idx_snapshots_captured_at ON snapshots(captured_at DESC);
CREATE INDEX idx_snapshots_person_source ON snapshots(person_id, source, captured_at DESC);
CREATE INDEX idx_snapshots_source ON snapshots(source);

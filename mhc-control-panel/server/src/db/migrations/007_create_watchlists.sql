-- Create watchlists table
CREATE TABLE watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_watchlists_name ON watchlists(name);

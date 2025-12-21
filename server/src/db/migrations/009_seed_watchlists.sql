-- Seed default watchlists
INSERT INTO watchlists (name, description) VALUES
  ('Friends', 'Trusted and friendly users'),
  ('Known Streamers', 'Models I recognize or have interacted with'),
  ('Ones to Watch', 'Interesting users to track'),
  ('Banned But Craved', 'Users I want to monitor despite restrictions'),
  ('Excluded', 'Users excluded from all stats and summaries')
ON CONFLICT (name) DO NOTHING;

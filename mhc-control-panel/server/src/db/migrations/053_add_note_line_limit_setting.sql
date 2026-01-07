-- Add note line limit setting
-- This controls how many lines of a note are shown before "Read More" is displayed

INSERT INTO app_settings (key, value, description)
VALUES ('note_line_limit', '6', 'Number of lines to show before "Read More" link appears on notes')
ON CONFLICT (key) DO NOTHING;

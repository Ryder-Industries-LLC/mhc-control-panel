-- Migration 074: Create user profiles table
-- Extended profile data for users (social links, cam site usernames, preferences)

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Social links as JSONB array of {platform, url, username}
  -- Example: [{"platform": "twitter", "username": "@user", "url": "https://twitter.com/user"}]
  social_links JSONB DEFAULT '[]',

  -- Cam site usernames as JSONB array of {site, username}
  -- Example: [{"site": "chaturbate", "username": "model123"}, {"site": "stripchat", "username": "model456"}]
  cam_site_usernames JSONB DEFAULT '[]',

  -- Profile content
  bio TEXT,
  location VARCHAR(100),
  timezone VARCHAR(50),

  -- Display preferences
  theme VARCHAR(50) DEFAULT 'midnight',
  email_notifications BOOLEAN DEFAULT TRUE,
  push_notifications BOOLEAN DEFAULT FALSE,

  -- Privacy settings
  profile_visibility VARCHAR(20) DEFAULT 'private',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT profile_visibility_check CHECK (profile_visibility IN ('public', 'members', 'private'))
);

-- Profile changes audit log
CREATE TABLE user_profile_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_name VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP DEFAULT NOW(),
  ip_address INET
);

-- Indexes
CREATE INDEX idx_user_profile_changes_user ON user_profile_changes(user_id);
CREATE INDEX idx_user_profile_changes_date ON user_profile_changes(changed_at DESC);

-- Update trigger for profiles
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE user_profiles IS 'Extended profile information for users';
COMMENT ON COLUMN user_profiles.social_links IS 'Array of social media links [{platform, username, url}]';
COMMENT ON COLUMN user_profiles.cam_site_usernames IS 'Array of cam site accounts [{site, username}]';
COMMENT ON TABLE user_profile_changes IS 'Audit log of profile field changes';

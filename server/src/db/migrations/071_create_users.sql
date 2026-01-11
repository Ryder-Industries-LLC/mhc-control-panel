-- Migration 071: Create users table
-- Supports multiple authentication methods: email/password, Google OAuth, subscriber ID, username

-- Create auth method enum type
CREATE TYPE auth_method AS ENUM (
  'email_password',
  'google_oauth',
  'apple_oauth',
  'facebook_oauth',
  'github_oauth',
  'subscriber_id',
  'username_password'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Primary login method (locked after initial signup)
  auth_method auth_method NOT NULL,

  -- Email-based auth (nullable for subscriber_id/username methods)
  email VARCHAR(255) UNIQUE,
  email_verified BOOLEAN DEFAULT FALSE,
  email_verification_token VARCHAR(255),
  email_verification_expires TIMESTAMP,

  -- Password auth (bcrypt hash)
  password_hash VARCHAR(255),
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,

  -- OAuth identifiers (nullable based on auth_method)
  google_id VARCHAR(255) UNIQUE,
  apple_id VARCHAR(255) UNIQUE,
  facebook_id VARCHAR(255) UNIQUE,
  github_id VARCHAR(255) UNIQUE,

  -- Alternative login identifiers
  subscriber_id VARCHAR(50) UNIQUE,
  username VARCHAR(50) UNIQUE,

  -- Profile data
  display_name VARCHAR(100),
  avatar_url TEXT,

  -- Linked CB username (from existing persons table)
  linked_person_id UUID REFERENCES persons(id) ON DELETE SET NULL,

  -- Security tracking
  last_login_at TIMESTAMP,
  last_login_ip INET,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,

  -- 2FA status
  totp_enabled BOOLEAN DEFAULT FALSE,
  totp_verified_at TIMESTAMP,

  -- Account status
  is_active BOOLEAN DEFAULT TRUE,
  deactivated_at TIMESTAMP,
  deactivated_reason VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints to ensure proper auth method data
  CONSTRAINT users_email_required_for_email_auth
    CHECK (auth_method != 'email_password' OR email IS NOT NULL),
  CONSTRAINT users_google_id_required_for_google_auth
    CHECK (auth_method != 'google_oauth' OR google_id IS NOT NULL),
  CONSTRAINT users_apple_id_required_for_apple_auth
    CHECK (auth_method != 'apple_oauth' OR apple_id IS NOT NULL),
  CONSTRAINT users_facebook_id_required_for_facebook_auth
    CHECK (auth_method != 'facebook_oauth' OR facebook_id IS NOT NULL),
  CONSTRAINT users_github_id_required_for_github_auth
    CHECK (auth_method != 'github_oauth' OR github_id IS NOT NULL),
  CONSTRAINT users_subscriber_id_required
    CHECK (auth_method != 'subscriber_id' OR subscriber_id IS NOT NULL),
  CONSTRAINT users_username_required
    CHECK (auth_method != 'username_password' OR username IS NOT NULL)
);

-- Indexes for common lookups
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL;
CREATE INDEX idx_users_subscriber_id ON users(subscriber_id) WHERE subscriber_id IS NOT NULL;
CREATE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;
CREATE INDEX idx_users_linked_person ON users(linked_person_id) WHERE linked_person_id IS NOT NULL;
CREATE INDEX idx_users_auth_method ON users(auth_method);
CREATE INDEX idx_users_is_active ON users(is_active) WHERE is_active = TRUE;

-- Add updated_at trigger
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts supporting multiple authentication methods';
COMMENT ON COLUMN users.auth_method IS 'Primary authentication method chosen at signup (immutable)';
COMMENT ON COLUMN users.subscriber_id IS 'For users without email who use a subscriber/member ID';
COMMENT ON COLUMN users.linked_person_id IS 'Links user to their broadcaster persona in persons table';
COMMENT ON COLUMN users.totp_enabled IS 'Whether 2FA via TOTP is enabled for this user';

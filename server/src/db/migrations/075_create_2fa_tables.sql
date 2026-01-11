-- Migration 075: Create 2FA (Two-Factor Authentication) tables
-- TOTP devices, recovery codes, and trusted devices

-- TOTP devices (authenticator apps)
-- Users can have multiple devices for backup
CREATE TABLE user_totp_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Device identification
  name VARCHAR(100) NOT NULL DEFAULT 'Authenticator',

  -- TOTP secret (encrypted at rest using TOTP_ENCRYPTION_KEY)
  secret_encrypted TEXT NOT NULL,

  -- Verification status
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,

  -- Usage tracking
  last_used_at TIMESTAMP,
  use_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),

  -- Each device name must be unique per user
  CONSTRAINT unique_device_name_per_user UNIQUE (user_id, name)
);

-- Recovery codes (one-time backup codes)
-- Generated when 2FA is enabled, 10 codes by default
CREATE TABLE user_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Code stored as bcrypt hash for security
  code_hash VARCHAR(255) NOT NULL,

  -- Usage tracking
  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP,
  used_ip INET,

  -- Generation batch (to invalidate old codes when regenerating)
  batch_id UUID NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Trusted devices ("remember this device for 30 days")
CREATE TABLE user_trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Device identification (signed token stored in cookie)
  device_token VARCHAR(255) NOT NULL UNIQUE,

  -- Device fingerprint for additional validation
  device_fingerprint VARCHAR(255),

  -- User-friendly device name (parsed from user agent)
  device_name VARCHAR(100),

  -- User agent for display in settings
  user_agent TEXT,

  -- Trust period
  trusted_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,

  -- Token rotation tracking
  last_rotated_at TIMESTAMP DEFAULT NOW(),
  rotation_count INTEGER DEFAULT 0,

  -- IP tracking for security monitoring
  trusted_ip INET,
  last_used_ip INET,
  last_used_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_totp_devices_user ON user_totp_devices(user_id);
CREATE INDEX idx_totp_devices_verified ON user_totp_devices(user_id, is_verified) WHERE is_verified = TRUE;

CREATE INDEX idx_recovery_codes_user ON user_recovery_codes(user_id);
CREATE INDEX idx_recovery_codes_unused ON user_recovery_codes(user_id, is_used) WHERE is_used = FALSE;
CREATE INDEX idx_recovery_codes_batch ON user_recovery_codes(batch_id);

CREATE INDEX idx_trusted_devices_user ON user_trusted_devices(user_id);
CREATE INDEX idx_trusted_devices_token ON user_trusted_devices(device_token);
CREATE INDEX idx_trusted_devices_expires ON user_trusted_devices(expires_at);
-- Note: Partial index with NOW() not allowed - queries will filter by expires_at at runtime
CREATE INDEX idx_trusted_devices_user_expires ON user_trusted_devices(user_id, expires_at);

-- Comments
COMMENT ON TABLE user_totp_devices IS 'TOTP authenticator devices (Google Authenticator, Authy, etc.)';
COMMENT ON COLUMN user_totp_devices.secret_encrypted IS 'AES-256 encrypted TOTP secret';
COMMENT ON COLUMN user_totp_devices.is_verified IS 'Device is only active after user confirms with a valid code';

COMMENT ON TABLE user_recovery_codes IS 'One-time recovery codes for 2FA bypass';
COMMENT ON COLUMN user_recovery_codes.code_hash IS 'Bcrypt hash of the recovery code';
COMMENT ON COLUMN user_recovery_codes.batch_id IS 'Groups codes generated together; used to invalidate old batches';

COMMENT ON TABLE user_trusted_devices IS 'Devices trusted to skip 2FA for 30 days';
COMMENT ON COLUMN user_trusted_devices.device_token IS 'Signed token stored in HttpOnly cookie';
COMMENT ON COLUMN user_trusted_devices.last_rotated_at IS 'Token is rotated periodically for security';

-- Function to cleanup expired trusted devices
CREATE OR REPLACE FUNCTION cleanup_expired_trusted_devices()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_trusted_devices
  WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_trusted_devices IS 'Removes expired trusted devices';

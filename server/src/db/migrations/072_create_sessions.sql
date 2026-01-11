-- Migration 072: Create user sessions table
-- Server-side session storage with CSRF protection

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Session identification (256-bit random token)
  session_token VARCHAR(255) NOT NULL UNIQUE,

  -- Device/client info for session management UI
  user_agent TEXT,
  ip_address INET,
  device_fingerprint VARCHAR(255),

  -- Session lifecycle
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,

  -- Session state
  is_active BOOLEAN DEFAULT TRUE,
  revoked_at TIMESTAMP,
  revoked_reason VARCHAR(100),

  -- 2FA state for this session
  totp_verified BOOLEAN DEFAULT FALSE,
  totp_verified_at TIMESTAMP,

  -- CSRF protection token (unique per session)
  csrf_token VARCHAR(255) NOT NULL
);

-- Indexes for common operations
CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_active ON user_sessions(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_cleanup ON user_sessions(expires_at, is_active);

-- Comments for documentation
COMMENT ON TABLE user_sessions IS 'Server-side session storage for authenticated users';
COMMENT ON COLUMN user_sessions.session_token IS '256-bit cryptographically random session identifier';
COMMENT ON COLUMN user_sessions.csrf_token IS 'CSRF protection token validated on state-changing requests';
COMMENT ON COLUMN user_sessions.totp_verified IS 'Whether 2FA has been verified for this session';
COMMENT ON COLUMN user_sessions.revoked_reason IS 'Reason for session revocation (user_logout, admin_revoke, security_event, etc.)';

-- Function to cleanup expired sessions (call periodically via cron/job)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_sessions
  WHERE expires_at < NOW() - INTERVAL '7 days'
    OR (is_active = FALSE AND revoked_at < NOW() - INTERVAL '7 days');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_sessions IS 'Removes expired and revoked sessions older than 7 days';

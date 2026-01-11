import { query, getClient } from '../../db/client.js';
import { logger } from '../../config/logger.js';
import crypto from 'crypto';

export interface Session {
  id: string;
  userId: string;
  sessionToken: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  isActive: boolean;
  revokedAt: Date | null;
  revokedReason: string | null;
  totpVerified: boolean;
  totpVerifiedAt: Date | null;
  csrfToken: string;
}

export interface CreateSessionOptions {
  requires2FA?: boolean;
  expiresInHours?: number;
  deviceFingerprint?: string;
}

export class SessionService {
  private static readonly DEFAULT_EXPIRY_HOURS = 24 * 7; // 7 days
  private static readonly ROLLING_RENEWAL_HOURS = 1; // Renew after 1 hour of inactivity

  /**
   * Generate a cryptographically secure token
   */
  static generateToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Create a new session
   */
  static async create(
    userId: string,
    ip: string,
    userAgent: string,
    options: CreateSessionOptions = {}
  ): Promise<Session> {
    const sessionToken = this.generateToken(32);
    const csrfToken = this.generateToken(32);
    const expiresIn = options.expiresInHours || this.DEFAULT_EXPIRY_HOURS;

    const result = await query<any>(
      `INSERT INTO user_sessions (
        user_id, session_token, user_agent, ip_address,
        device_fingerprint, expires_at, csrf_token, totp_verified
      )
      VALUES ($1, $2, $3, $4::inet, $5, NOW() + INTERVAL '${expiresIn} hours', $6, $7)
      RETURNING *`,
      [
        userId,
        sessionToken,
        userAgent,
        ip || null,
        options.deviceFingerprint || null,
        csrfToken,
        !options.requires2FA
      ]
    );

    const session = this.mapRow(result.rows[0]);
    logger.info('Session created', { userId, sessionId: session.id });
    return session;
  }

  /**
   * Get session by token
   */
  static async getByToken(token: string): Promise<Session | null> {
    const result = await query<any>(
      `SELECT * FROM user_sessions
       WHERE session_token = $1
         AND is_active = TRUE
         AND expires_at > NOW()`,
      [token]
    );

    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get session by ID
   */
  static async getById(id: string): Promise<Session | null> {
    const result = await query<any>(
      'SELECT * FROM user_sessions WHERE id = $1',
      [id]
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Update last active time (for rolling renewal)
   */
  static async touch(sessionId: string): Promise<void> {
    await query(
      `UPDATE user_sessions
       SET last_active_at = NOW(),
           expires_at = GREATEST(expires_at, NOW() + INTERVAL '${this.DEFAULT_EXPIRY_HOURS} hours')
       WHERE id = $1 AND is_active = TRUE`,
      [sessionId]
    );
  }

  /**
   * Check if session needs renewal based on last activity
   */
  static needsRenewal(session: Session): boolean {
    const hoursSinceActive = (Date.now() - session.lastActiveAt.getTime()) / (1000 * 60 * 60);
    return hoursSinceActive > this.ROLLING_RENEWAL_HOURS;
  }

  /**
   * Rotate session token (security measure after login, privilege change, etc.)
   */
  static async rotate(oldToken: string): Promise<Session | null> {
    const newToken = this.generateToken(32);
    const newCsrfToken = this.generateToken(32);

    const result = await query<any>(
      `UPDATE user_sessions
       SET session_token = $1,
           csrf_token = $2,
           last_active_at = NOW()
       WHERE session_token = $3 AND is_active = TRUE
       RETURNING *`,
      [newToken, newCsrfToken, oldToken]
    );

    if (!result.rows[0]) return null;

    const session = this.mapRow(result.rows[0]);
    logger.info('Session rotated', { sessionId: session.id });
    return session;
  }

  /**
   * Mark session as 2FA verified
   */
  static async mark2FAVerified(sessionId: string): Promise<void> {
    await query(
      `UPDATE user_sessions
       SET totp_verified = TRUE, totp_verified_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );
    logger.info('Session 2FA verified', { sessionId });
  }

  /**
   * Revoke a session by token
   */
  static async revoke(token: string, reason: string): Promise<boolean> {
    const result = await query(
      `UPDATE user_sessions
       SET is_active = FALSE, revoked_at = NOW(), revoked_reason = $1
       WHERE session_token = $2 AND is_active = TRUE`,
      [reason, token]
    );
    const revoked = (result.rowCount ?? 0) > 0;
    if (revoked) {
      logger.info('Session revoked', { reason });
    }
    return revoked;
  }

  /**
   * Revoke a session by ID (for user to revoke from sessions list)
   */
  static async revokeById(sessionId: string, userId: string, reason: string): Promise<boolean> {
    const result = await query(
      `UPDATE user_sessions
       SET is_active = FALSE, revoked_at = NOW(), revoked_reason = $1
       WHERE id = $2 AND user_id = $3 AND is_active = TRUE`,
      [reason, sessionId, userId]
    );
    const revoked = (result.rowCount ?? 0) > 0;
    if (revoked) {
      logger.info('Session revoked by ID', { sessionId, reason });
    }
    return revoked;
  }

  /**
   * Revoke all sessions for a user
   */
  static async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
    let queryText = `
      UPDATE user_sessions
      SET is_active = FALSE, revoked_at = NOW(), revoked_reason = 'logout_all'
      WHERE user_id = $1 AND is_active = TRUE
    `;
    const params: any[] = [userId];

    if (exceptSessionId) {
      queryText += ' AND id != $2';
      params.push(exceptSessionId);
    }

    const result = await query(queryText, params);
    const count = result.rowCount ?? 0;
    logger.info('Revoked all sessions for user', { userId, count });
    return count;
  }

  /**
   * Get all active sessions for a user
   */
  static async getActiveForUser(userId: string): Promise<Session[]> {
    const result = await query<any>(
      `SELECT * FROM user_sessions
       WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
       ORDER BY last_active_at DESC`,
      [userId]
    );
    return result.rows.map(this.mapRow);
  }

  /**
   * Cleanup expired sessions
   */
  static async cleanup(): Promise<number> {
    const result = await query(
      `DELETE FROM user_sessions
       WHERE expires_at < NOW() - INTERVAL '7 days'
         OR (is_active = FALSE AND revoked_at < NOW() - INTERVAL '7 days')`
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info('Cleaned up expired sessions', { count });
    }
    return count;
  }

  /**
   * Map database row to Session interface
   */
  private static mapRow(row: any): Session {
    return {
      id: row.id,
      userId: row.user_id,
      sessionToken: row.session_token,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      deviceFingerprint: row.device_fingerprint,
      createdAt: new Date(row.created_at),
      lastActiveAt: new Date(row.last_active_at),
      expiresAt: new Date(row.expires_at),
      isActive: row.is_active,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      revokedReason: row.revoked_reason,
      totpVerified: row.totp_verified,
      totpVerifiedAt: row.totp_verified_at ? new Date(row.totp_verified_at) : null,
      csrfToken: row.csrf_token
    };
  }
}

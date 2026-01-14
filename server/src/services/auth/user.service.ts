import { query, getClient } from '../../db/client.js';
import { logger } from '../../config/logger.js';
import bcrypt from 'bcrypt';

export type AuthMethod =
  | 'email_password'
  | 'google_oauth'
  | 'apple_oauth'
  | 'facebook_oauth'
  | 'github_oauth'
  | 'subscriber_id'
  | 'username_password';

export interface User {
  id: string;
  authMethod: AuthMethod;
  email: string | null;
  emailVerified: boolean;
  googleId: string | null;
  appleId: string | null;
  facebookId: string | null;
  githubId: string | null;
  subscriberId: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  linkedPersonId: string | null;
  totpEnabled: boolean;
  totpVerifiedAt: Date | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Internal fields (not exposed to API)
  passwordHash?: string;
  lockedUntil?: Date | null;
  failedLoginAttempts?: number;
}

export interface CreateUserInput {
  authMethod: AuthMethod;
  email?: string;
  emailVerified?: boolean;
  password?: string;
  googleId?: string;
  appleId?: string;
  facebookId?: string;
  githubId?: string;
  subscriberId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  linkedPersonId?: string;
}

export interface UpdateUserInput {
  displayName?: string;
  avatarUrl?: string;
  email?: string;
  emailVerified?: boolean;
  googleId?: string;
}

const SALT_ROUNDS = 12;

export class UserService {
  /**
   * Hash a password
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verify a password against a hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Create a new user
   */
  static async create(input: CreateUserInput): Promise<User> {
    const passwordHash = input.password
      ? await this.hashPassword(input.password)
      : null;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Create the user
      const userResult = await client.query<any>(
        `INSERT INTO users (
          auth_method, email, email_verified, password_hash,
          google_id, apple_id, facebook_id, github_id,
          subscriber_id, username, display_name, avatar_url,
          linked_person_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          input.authMethod,
          input.email?.toLowerCase() || null,
          input.emailVerified || false,
          passwordHash,
          input.googleId || null,
          input.appleId || null,
          input.facebookId || null,
          input.githubId || null,
          input.subscriberId || null,
          input.username?.toLowerCase() || null,
          input.displayName || null,
          input.avatarUrl || null,
          input.linkedPersonId || null
        ]
      );

      const user = this.mapRow(userResult.rows[0]);

      // Create user profile
      await client.query(
        'INSERT INTO user_profiles (user_id) VALUES ($1)',
        [user.id]
      );

      // Assign default member role
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = 'member'`,
        [user.id]
      );

      await client.query('COMMIT');

      logger.info('User created', { userId: user.id, authMethod: input.authMethod });
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find user by ID
   */
  static async getById(id: string): Promise<User | null> {
    const result = await query<any>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Find user by email
   */
  static async findByEmail(email: string): Promise<User | null> {
    const result = await query<any>(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0], true);
  }

  /**
   * Find user by Google ID
   */
  static async findByGoogleId(googleId: string): Promise<User | null> {
    const result = await query<any>(
      'SELECT * FROM users WHERE google_id = $1',
      [googleId]
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Find user by Apple ID
   */
  static async findByAppleId(appleId: string): Promise<User | null> {
    const result = await query<any>(
      'SELECT * FROM users WHERE apple_id = $1',
      [appleId]
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Find user by subscriber ID
   */
  static async findBySubscriberId(subscriberId: string): Promise<User | null> {
    const result = await query<any>(
      'SELECT * FROM users WHERE subscriber_id = $1',
      [subscriberId]
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0], true);
  }

  /**
   * Find user by username
   */
  static async findByUsername(username: string): Promise<User | null> {
    const result = await query<any>(
      'SELECT * FROM users WHERE username = $1',
      [username.toLowerCase()]
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0], true);
  }

  /**
   * Update user profile
   */
  static async update(id: string, updates: UpdateUserInput): Promise<User | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.displayName !== undefined) {
      setClauses.push(`display_name = $${paramIndex}`);
      values.push(updates.displayName);
      paramIndex++;
    }

    if (updates.avatarUrl !== undefined) {
      setClauses.push(`avatar_url = $${paramIndex}`);
      values.push(updates.avatarUrl);
      paramIndex++;
    }

    if (updates.email !== undefined) {
      setClauses.push(`email = $${paramIndex}`);
      values.push(updates.email?.toLowerCase() || null);
      paramIndex++;
    }

    if (updates.emailVerified !== undefined) {
      setClauses.push(`email_verified = $${paramIndex}`);
      values.push(updates.emailVerified);
      paramIndex++;
    }

    if (updates.googleId !== undefined) {
      setClauses.push(`google_id = $${paramIndex}`);
      values.push(updates.googleId);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const result = await query<any>(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (!result.rows[0]) return null;
    logger.info('User updated', { userId: id });
    return this.mapRow(result.rows[0]);
  }

  /**
   * Update password
   */
  static async updatePassword(id: string, newPassword: string): Promise<boolean> {
    const passwordHash = await this.hashPassword(newPassword);
    const result = await query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Record failed login attempt
   */
  static async recordFailedLogin(userId: string, lockoutMinutes = 30): Promise<void> {
    await query(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts + 1 >= 5
             THEN NOW() + INTERVAL '${lockoutMinutes} minutes'
             ELSE locked_until
           END
       WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Reset failed login attempts
   */
  static async resetFailedAttempts(userId: string): Promise<void> {
    await query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [userId]
    );
  }

  /**
   * Update last login timestamp
   */
  static async updateLastLogin(userId: string, ip: string): Promise<void> {
    await query(
      'UPDATE users SET last_login_at = NOW(), last_login_ip = $1::inet WHERE id = $2',
      [ip || null, userId]
    );
  }

  /**
   * Check if user account is locked
   */
  static isLocked(user: User): boolean {
    return !!(user.lockedUntil && user.lockedUntil > new Date());
  }

  /**
   * Enable TOTP for user
   */
  static async enableTotp(userId: string): Promise<void> {
    await query(
      'UPDATE users SET totp_enabled = TRUE, totp_verified_at = NOW() WHERE id = $1',
      [userId]
    );
    logger.info('TOTP enabled for user', { userId });
  }

  /**
   * Disable TOTP for user
   */
  static async disableTotp(userId: string): Promise<void> {
    await query(
      'UPDATE users SET totp_enabled = FALSE, totp_verified_at = NULL WHERE id = $1',
      [userId]
    );
    logger.info('TOTP disabled for user', { userId });
  }

  /**
   * Get user's roles
   */
  static async getRoles(userId: string): Promise<string[]> {
    const result = await query<{ name: string }>(
      `SELECT r.name
       FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1
       ORDER BY r.priority DESC`,
      [userId]
    );
    return result.rows.map(r => r.name);
  }

  /**
   * Get user's permissions (derived from roles)
   */
  static async getPermissions(userId: string): Promise<string[]> {
    const result = await query<{ name: string }>(
      `SELECT DISTINCT p.name
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = $1`,
      [userId]
    );
    return result.rows.map(p => p.name);
  }

  /**
   * Check if user has specific permission
   */
  static async hasPermission(userId: string, permission: string): Promise<boolean> {
    const result = await query<{ has_permission: boolean }>(
      `SELECT EXISTS(
        SELECT 1 FROM permissions p
        JOIN role_permissions rp ON rp.permission_id = p.id
        JOIN user_roles ur ON ur.role_id = rp.role_id
        WHERE ur.user_id = $1 AND p.name = $2
      ) as has_permission`,
      [userId, permission]
    );
    return result.rows[0]?.has_permission || false;
  }

  /**
   * Check if user has specific role
   */
  static async hasRole(userId: string, role: string): Promise<boolean> {
    const result = await query<{ has_role: boolean }>(
      `SELECT EXISTS(
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1 AND r.name = $2
      ) as has_role`,
      [userId, role]
    );
    return result.rows[0]?.has_role || false;
  }

  /**
   * Assign role to user
   */
  static async assignRole(userId: string, roleName: string, assignedBy?: string): Promise<boolean> {
    const result = await query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by)
       SELECT $1, r.id, $3
       FROM roles r WHERE r.name = $2
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roleName, assignedBy || null]
    );
    const assigned = (result.rowCount ?? 0) > 0;
    if (assigned) {
      logger.info('Role assigned to user', { userId, role: roleName, assignedBy });
    }
    return assigned;
  }

  /**
   * Remove role from user
   */
  static async removeRole(userId: string, roleName: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM user_roles
       WHERE user_id = $1
         AND role_id = (SELECT id FROM roles WHERE name = $2)`,
      [userId, roleName]
    );
    const removed = (result.rowCount ?? 0) > 0;
    if (removed) {
      logger.info('Role removed from user', { userId, role: roleName });
    }
    return removed;
  }

  /**
   * Get all users (with pagination)
   */
  static async getAll(limit = 50, offset = 0): Promise<{ users: User[]; total: number }> {
    const countResult = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM users WHERE is_active = TRUE'
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await query<any>(
      `SELECT * FROM users
       WHERE is_active = TRUE
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      users: result.rows.map(r => this.mapRow(r)),
      total
    };
  }

  /**
   * Deactivate user account
   */
  static async deactivate(userId: string, reason?: string): Promise<boolean> {
    const result = await query(
      `UPDATE users
       SET is_active = FALSE, deactivated_at = NOW(), deactivated_reason = $2
       WHERE id = $1`,
      [userId, reason || null]
    );
    const deactivated = (result.rowCount ?? 0) > 0;
    if (deactivated) {
      logger.info('User deactivated', { userId, reason });
    }
    return deactivated;
  }

  /**
   * Map database row to User interface
   */
  private static mapRow(row: any, includeSecrets = false): User {
    const user: User = {
      id: row.id,
      authMethod: row.auth_method,
      email: row.email,
      emailVerified: row.email_verified,
      googleId: row.google_id,
      appleId: row.apple_id,
      facebookId: row.facebook_id,
      githubId: row.github_id,
      subscriberId: row.subscriber_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      linkedPersonId: row.linked_person_id,
      totpEnabled: row.totp_enabled,
      totpVerifiedAt: row.totp_verified_at ? new Date(row.totp_verified_at) : null,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : null,
      lastLoginIp: row.last_login_ip,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };

    if (includeSecrets) {
      user.passwordHash = row.password_hash;
      user.lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
      user.failedLoginAttempts = row.failed_login_attempts;
    }

    return user;
  }
}

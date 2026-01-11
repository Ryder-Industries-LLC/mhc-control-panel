import { query, getClient } from '../../db/client.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { TOTP, generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// otplib v13 TOTP instance
const totp = new TOTP();

export interface TotpDevice {
  id: string;
  userId: string;
  name: string;
  isVerified: boolean;
  verifiedAt: Date | null;
  lastUsedAt: Date | null;
  useCount: number;
  createdAt: Date;
}

export interface TotpSetupResult {
  secret: string;
  qrCode: string;
  manualEntryKey: string;
  deviceId: string;
}

export interface RecoveryCode {
  id: string;
  isUsed: boolean;
  usedAt: Date | null;
}

export interface TrustedDevice {
  id: string;
  deviceName: string | null;
  trustedAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
}

const SALT_ROUNDS = 10;
const TRUSTED_DEVICE_DAYS = 30;
const RECOVERY_CODE_COUNT = 10;

export class TotpService {
  /**
   * Encrypt a TOTP secret for storage
   */
  private static encryptSecret(secret: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(env.TOTP_ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Return iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a TOTP secret
   */
  private static decryptSecret(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(env.TOTP_ENCRYPTION_KEY, 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Generate a new TOTP secret and QR code for setup
   */
  static async beginSetup(userId: string, deviceName = 'Authenticator'): Promise<TotpSetupResult> {
    // Generate secret (20 bytes = 160 bits, standard for TOTP)
    const secret = generateSecret({ length: 20 });

    // Store encrypted secret (not yet verified)
    const encryptedSecret = this.encryptSecret(secret);

    const result = await query<any>(
      `INSERT INTO user_totp_devices (user_id, name, secret_encrypted, is_verified)
       VALUES ($1, $2, $3, FALSE)
       ON CONFLICT (user_id, name)
       DO UPDATE SET secret_encrypted = EXCLUDED.secret_encrypted, is_verified = FALSE, verified_at = NULL
       RETURNING id`,
      [userId, deviceName, encryptedSecret]
    );

    const deviceId = result.rows[0].id;

    // Generate OTP auth URL
    const otpAuthUrl = generateURI({
      secret,
      issuer: 'MHC Control Panel',
      label: 'MHC User'
    });

    // Generate QR code as data URL
    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    logger.info('TOTP setup initiated', { userId, deviceId });

    return {
      secret,
      qrCode,
      manualEntryKey: secret,
      deviceId
    };
  }

  /**
   * Verify a TOTP code to complete setup
   */
  static async completeSetup(userId: string, deviceId: string, code: string): Promise<{ success: boolean; recoveryCodes?: string[] }> {
    // Get the device
    const deviceResult = await query<any>(
      `SELECT * FROM user_totp_devices WHERE id = $1 AND user_id = $2 AND is_verified = FALSE`,
      [deviceId, userId]
    );

    if (!deviceResult.rows[0]) {
      return { success: false };
    }

    const device = deviceResult.rows[0];
    const secret = this.decryptSecret(device.secret_encrypted);

    // Verify the code
    const isValid = verifySync({ token: code, secret });

    if (!isValid) {
      return { success: false };
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Mark device as verified
      await client.query(
        `UPDATE user_totp_devices SET is_verified = TRUE, verified_at = NOW() WHERE id = $1`,
        [deviceId]
      );

      // Generate recovery codes
      const recoveryCodes = await this.generateRecoveryCodes(client, userId);

      // Enable TOTP on user
      await client.query(
        `UPDATE users SET totp_enabled = TRUE, totp_verified_at = NOW() WHERE id = $1`,
        [userId]
      );

      await client.query('COMMIT');

      logger.info('TOTP setup completed', { userId, deviceId });

      return { success: true, recoveryCodes };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate recovery codes for a user
   */
  private static async generateRecoveryCodes(client: any, userId: string): Promise<string[]> {
    const batchId = crypto.randomUUID();
    const codes: string[] = [];

    // Delete any existing unused codes
    await client.query(
      `DELETE FROM user_recovery_codes WHERE user_id = $1`,
      [userId]
    );

    // Generate new codes
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      // Generate a readable code (e.g., XXXX-XXXX-XXXX)
      const code = [
        crypto.randomBytes(2).toString('hex').toUpperCase(),
        crypto.randomBytes(2).toString('hex').toUpperCase(),
        crypto.randomBytes(2).toString('hex').toUpperCase()
      ].join('-');

      codes.push(code);

      // Store hashed code
      const codeHash = await bcrypt.hash(code, SALT_ROUNDS);
      await client.query(
        `INSERT INTO user_recovery_codes (user_id, code_hash, batch_id)
         VALUES ($1, $2, $3)`,
        [userId, codeHash, batchId]
      );
    }

    return codes;
  }

  /**
   * Regenerate recovery codes
   */
  static async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const codes = await this.generateRecoveryCodes(client, userId);
      await client.query('COMMIT');
      logger.info('Recovery codes regenerated', { userId });
      return codes;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify a TOTP code for login
   */
  static async verifyCode(userId: string, code: string): Promise<boolean> {
    // Get all verified devices for user
    const result = await query<any>(
      `SELECT id, secret_encrypted FROM user_totp_devices
       WHERE user_id = $1 AND is_verified = TRUE`,
      [userId]
    );

    for (const device of result.rows) {
      const secret = this.decryptSecret(device.secret_encrypted);
      const isValid = verifySync({ token: code, secret });

      if (isValid) {
        // Update usage stats
        await query(
          `UPDATE user_totp_devices
           SET last_used_at = NOW(), use_count = use_count + 1
           WHERE id = $1`,
          [device.id]
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Use a recovery code
   */
  static async useRecoveryCode(userId: string, code: string, ip?: string): Promise<boolean> {
    // Get all unused recovery codes
    const result = await query<any>(
      `SELECT id, code_hash FROM user_recovery_codes
       WHERE user_id = $1 AND is_used = FALSE`,
      [userId]
    );

    for (const row of result.rows) {
      const isValid = await bcrypt.compare(code.toUpperCase(), row.code_hash);

      if (isValid) {
        // Mark code as used
        await query(
          `UPDATE user_recovery_codes
           SET is_used = TRUE, used_at = NOW(), used_ip = $2::inet
           WHERE id = $1`,
          [row.id, ip || null]
        );

        logger.info('Recovery code used', { userId });
        return true;
      }
    }

    return false;
  }

  /**
   * Get remaining recovery codes count
   */
  static async getRemainingRecoveryCodeCount(userId: string): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM user_recovery_codes
       WHERE user_id = $1 AND is_used = FALSE`,
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Trust a device for 30 days
   */
  static async trustDevice(
    userId: string,
    fingerprint: string,
    userAgent?: string,
    ip?: string
  ): Promise<string> {
    const deviceToken = crypto.randomBytes(32).toString('hex');
    const deviceName = this.parseDeviceName(userAgent || '');

    await query(
      `INSERT INTO user_trusted_devices (
        user_id, device_token, device_fingerprint, device_name,
        user_agent, expires_at, trusted_ip
      )
      VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '${TRUSTED_DEVICE_DAYS} days', $6::inet)`,
      [userId, deviceToken, fingerprint, deviceName, userAgent || null, ip || null]
    );

    logger.info('Device trusted', { userId, deviceName });
    return deviceToken;
  }

  /**
   * Check if a device is trusted
   */
  static async isDeviceTrusted(userId: string, deviceToken: string): Promise<boolean> {
    const result = await query<{ id: string }>(
      `SELECT id FROM user_trusted_devices
       WHERE user_id = $1 AND device_token = $2 AND expires_at > NOW()`,
      [userId, deviceToken]
    );

    if (result.rows[0]) {
      // Update last used
      await query(
        `UPDATE user_trusted_devices SET last_used_at = NOW() WHERE id = $1`,
        [result.rows[0].id]
      );
      return true;
    }

    return false;
  }

  /**
   * Rotate a trusted device token
   */
  static async rotateTrustedDeviceToken(oldToken: string): Promise<string | null> {
    const newToken = crypto.randomBytes(32).toString('hex');

    const result = await query<any>(
      `UPDATE user_trusted_devices
       SET device_token = $1, last_rotated_at = NOW(), rotation_count = rotation_count + 1
       WHERE device_token = $2 AND expires_at > NOW()
       RETURNING id`,
      [newToken, oldToken]
    );

    if (!result.rows[0]) return null;
    return newToken;
  }

  /**
   * Revoke a trusted device
   */
  static async revokeTrustedDevice(userId: string, deviceId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM user_trusted_devices WHERE id = $1 AND user_id = $2`,
      [deviceId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get all trusted devices for a user
   */
  static async getTrustedDevices(userId: string): Promise<TrustedDevice[]> {
    const result = await query<any>(
      `SELECT id, device_name, trusted_at, expires_at, last_used_at
       FROM user_trusted_devices
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY trusted_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      deviceName: row.device_name,
      trustedAt: new Date(row.trusted_at),
      expiresAt: new Date(row.expires_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null
    }));
  }

  /**
   * Get TOTP devices for a user
   */
  static async getDevices(userId: string): Promise<TotpDevice[]> {
    const result = await query<any>(
      `SELECT id, user_id, name, is_verified, verified_at, last_used_at, use_count, created_at
       FROM user_totp_devices
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      isVerified: row.is_verified,
      verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
      useCount: row.use_count,
      createdAt: new Date(row.created_at)
    }));
  }

  /**
   * Delete a TOTP device
   */
  static async deleteDevice(userId: string, deviceId: string): Promise<boolean> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Delete the device
      const result = await client.query(
        `DELETE FROM user_totp_devices WHERE id = $1 AND user_id = $2`,
        [deviceId, userId]
      );

      // Check if any verified devices remain
      const remainingResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM user_totp_devices
         WHERE user_id = $1 AND is_verified = TRUE`,
        [userId]
      );

      const remainingCount = parseInt(remainingResult.rows[0].count, 10);

      // If no verified devices remain, disable TOTP
      if (remainingCount === 0) {
        await client.query(
          `UPDATE users SET totp_enabled = FALSE, totp_verified_at = NULL WHERE id = $1`,
          [userId]
        );
        logger.info('TOTP disabled due to no remaining devices', { userId });
      }

      await client.query('COMMIT');
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Parse a user-friendly device name from user agent
   */
  private static parseDeviceName(userAgent: string): string {
    if (!userAgent) return 'Unknown Device';

    // Simple parsing - could be enhanced with a proper UA parser library
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('iPad')) return 'iPad';
    if (userAgent.includes('Android')) return 'Android Device';
    if (userAgent.includes('Mac OS')) return 'Mac';
    if (userAgent.includes('Windows')) return 'Windows PC';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Chrome')) return 'Chrome Browser';
    if (userAgent.includes('Firefox')) return 'Firefox Browser';
    if (userAgent.includes('Safari')) return 'Safari Browser';

    return 'Unknown Device';
  }
}

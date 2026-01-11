import { logger } from '../../config/logger.js';
import { SessionService, Session, CreateSessionOptions } from './session.service.js';
import { UserService, User } from './user.service.js';
import { TotpService } from './totp.service.js';

export interface LoginResult {
  success: boolean;
  user?: User;
  session?: Session;
  requires2FA?: boolean;
  error?: string;
}

export interface GoogleUserInfo {
  sub: string;        // Google user ID
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
}

export class AuthService {
  /**
   * Login with email and password
   */
  static async loginWithPassword(
    email: string,
    password: string,
    ip: string,
    userAgent: string
  ): Promise<LoginResult> {
    const user = await UserService.findByEmail(email);

    if (!user) {
      // Timing attack prevention - still do password work
      await UserService.hashPassword(password);
      return { success: false, error: 'Invalid credentials' };
    }

    // Check auth method
    if (user.authMethod !== 'email_password') {
      return { success: false, error: `Please sign in with ${this.formatAuthMethod(user.authMethod)}` };
    }

    // Check if account is locked
    if (UserService.isLocked(user)) {
      return { success: false, error: 'Account temporarily locked. Try again later.' };
    }

    // Check if account is active
    if (!user.isActive) {
      return { success: false, error: 'Account has been deactivated' };
    }

    // Verify password
    if (!user.passwordHash) {
      return { success: false, error: 'Invalid credentials' };
    }

    const isValid = await UserService.verifyPassword(password, user.passwordHash);

    if (!isValid) {
      await UserService.recordFailedLogin(user.id);
      return { success: false, error: 'Invalid credentials' };
    }

    // Reset failed attempts on successful password verification
    await UserService.resetFailedAttempts(user.id);

    // Check if 2FA is required
    if (user.totpEnabled) {
      // Create a session that requires 2FA completion
      const session = await SessionService.create(user.id, ip, userAgent, {
        requires2FA: true
      });
      return { success: true, user, session, requires2FA: true };
    }

    // Create full session
    const session = await SessionService.create(user.id, ip, userAgent);
    await UserService.updateLastLogin(user.id, ip);

    return { success: true, user, session };
  }

  /**
   * Login with subscriber ID and password
   */
  static async loginWithSubscriberId(
    subscriberId: string,
    password: string,
    ip: string,
    userAgent: string
  ): Promise<LoginResult> {
    const user = await UserService.findBySubscriberId(subscriberId);

    if (!user) {
      await UserService.hashPassword(password);
      return { success: false, error: 'Invalid credentials' };
    }

    if (user.authMethod !== 'subscriber_id') {
      return { success: false, error: `Please sign in with ${this.formatAuthMethod(user.authMethod)}` };
    }

    if (UserService.isLocked(user)) {
      return { success: false, error: 'Account temporarily locked. Try again later.' };
    }

    if (!user.isActive) {
      return { success: false, error: 'Account has been deactivated' };
    }

    if (!user.passwordHash) {
      return { success: false, error: 'Invalid credentials' };
    }

    const isValid = await UserService.verifyPassword(password, user.passwordHash);

    if (!isValid) {
      await UserService.recordFailedLogin(user.id);
      return { success: false, error: 'Invalid credentials' };
    }

    await UserService.resetFailedAttempts(user.id);

    if (user.totpEnabled) {
      const session = await SessionService.create(user.id, ip, userAgent, {
        requires2FA: true
      });
      return { success: true, user, session, requires2FA: true };
    }

    const session = await SessionService.create(user.id, ip, userAgent);
    await UserService.updateLastLogin(user.id, ip);

    return { success: true, user, session };
  }

  /**
   * Login with username and password
   */
  static async loginWithUsername(
    username: string,
    password: string,
    ip: string,
    userAgent: string
  ): Promise<LoginResult> {
    const user = await UserService.findByUsername(username);

    if (!user) {
      await UserService.hashPassword(password);
      return { success: false, error: 'Invalid credentials' };
    }

    if (user.authMethod !== 'username_password') {
      return { success: false, error: `Please sign in with ${this.formatAuthMethod(user.authMethod)}` };
    }

    if (UserService.isLocked(user)) {
      return { success: false, error: 'Account temporarily locked. Try again later.' };
    }

    if (!user.isActive) {
      return { success: false, error: 'Account has been deactivated' };
    }

    if (!user.passwordHash) {
      return { success: false, error: 'Invalid credentials' };
    }

    const isValid = await UserService.verifyPassword(password, user.passwordHash);

    if (!isValid) {
      await UserService.recordFailedLogin(user.id);
      return { success: false, error: 'Invalid credentials' };
    }

    await UserService.resetFailedAttempts(user.id);

    if (user.totpEnabled) {
      const session = await SessionService.create(user.id, ip, userAgent, {
        requires2FA: true
      });
      return { success: true, user, session, requires2FA: true };
    }

    const session = await SessionService.create(user.id, ip, userAgent);
    await UserService.updateLastLogin(user.id, ip);

    return { success: true, user, session };
  }

  /**
   * Login/signup with Google OAuth
   */
  static async loginWithGoogle(
    googleUser: GoogleUserInfo,
    ip: string,
    userAgent: string
  ): Promise<LoginResult> {
    let user = await UserService.findByGoogleId(googleUser.sub);

    if (!user) {
      // Check if email already exists with different auth method
      const existingUser = await UserService.findByEmail(googleUser.email);
      if (existingUser) {
        return {
          success: false,
          error: 'Email already registered with different login method'
        };
      }

      // Create new user
      user = await UserService.create({
        authMethod: 'google_oauth',
        googleId: googleUser.sub,
        email: googleUser.email,
        emailVerified: googleUser.email_verified,
        displayName: googleUser.name,
        avatarUrl: googleUser.picture || undefined
      });

      logger.info('New user created via Google OAuth', { userId: user.id });
    } else {
      // Update profile info from Google if changed
      if (user.displayName !== googleUser.name || user.avatarUrl !== googleUser.picture) {
        await UserService.update(user.id, {
          displayName: googleUser.name,
          avatarUrl: googleUser.picture
        });
      }
    }

    if (!user.isActive) {
      return { success: false, error: 'Account has been deactivated' };
    }

    // Check if 2FA is required
    if (user.totpEnabled) {
      // Check for trusted device
      // TODO: Implement trusted device check
      const session = await SessionService.create(user.id, ip, userAgent, {
        requires2FA: true
      });
      return { success: true, user, session, requires2FA: true };
    }

    const session = await SessionService.create(user.id, ip, userAgent);
    await UserService.updateLastLogin(user.id, ip);

    return { success: true, user, session };
  }

  /**
   * Complete 2FA verification for a session
   */
  static async verify2FA(
    sessionId: string,
    code: string,
    trustDevice: boolean = false,
    deviceFingerprint?: string
  ): Promise<LoginResult> {
    const session = await SessionService.getById(sessionId);
    if (!session || !session.isActive) {
      return { success: false, error: 'Invalid or expired session' };
    }

    if (session.totpVerified) {
      return { success: false, error: 'Session already verified' };
    }

    const user = await UserService.getById(session.userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Try TOTP code first
    let isValid = await TotpService.verifyCode(user.id, code);

    // If not valid, try recovery code
    if (!isValid) {
      isValid = await TotpService.useRecoveryCode(user.id, code, session.ipAddress || undefined);
    }

    if (!isValid) {
      return { success: false, error: 'Invalid 2FA code' };
    }

    // Mark session as 2FA verified
    await SessionService.mark2FAVerified(sessionId);

    // Trust device if requested
    if (trustDevice && deviceFingerprint) {
      await TotpService.trustDevice(user.id, deviceFingerprint, session.userAgent || undefined);
    }

    // Update last login
    await UserService.updateLastLogin(user.id, session.ipAddress || '');

    // Rotate session for security
    const newSession = await SessionService.rotate(session.sessionToken);

    return {
      success: true,
      user,
      session: newSession || session
    };
  }

  /**
   * Logout - invalidate session
   */
  static async logout(sessionToken: string): Promise<void> {
    await SessionService.revoke(sessionToken, 'user_logout');
  }

  /**
   * Logout all sessions for a user
   */
  static async logoutAll(userId: string, exceptSessionId?: string): Promise<number> {
    return SessionService.revokeAllForUser(userId, exceptSessionId);
  }

  /**
   * Format auth method for display
   */
  private static formatAuthMethod(method: string): string {
    const formats: Record<string, string> = {
      'email_password': 'email and password',
      'google_oauth': 'Google',
      'apple_oauth': 'Apple',
      'facebook_oauth': 'Facebook',
      'github_oauth': 'GitHub',
      'subscriber_id': 'subscriber ID',
      'username_password': 'username and password'
    };
    return formats[method] || method;
  }
}

import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth/auth.service.js';
import { UserService, CreateUserInput, AuthMethod } from '../services/auth/user.service.js';
import { SessionService } from '../services/auth/session.service.js';
import { TotpService } from '../services/auth/totp.service.js';
import { OAuthService } from '../services/auth/oauth.service.js';
import { requireAuth, require2FAForAction } from '../middleware/auth.middleware.js';
import { csrfProtection } from '../middleware/csrf.middleware.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

const router = Router();

// Cookie configuration
const getSessionCookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
  domain: env.COOKIE_DOMAIN || undefined
});

const getTrustedDeviceCookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
  domain: env.COOKIE_DOMAIN || undefined
});

/**
 * Helper to sanitize user for API response
 */
function sanitizeUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    authMethod: user.authMethod,
    totpEnabled: user.totpEnabled,
    createdAt: user.createdAt
  };
}

/**
 * Get client IP address
 */
function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
         req.socket.remoteAddress ||
         '';
}

// ============================================
// Authentication Endpoints
// ============================================

/**
 * POST /api/auth/login
 * Login with email/password, username/password, or subscriber_id/password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, username, subscriberId, password } = req.body;

    // Determine login method
    let result;
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    if (email && password) {
      result = await AuthService.loginWithPassword(email, password, ip, userAgent);
    } else if (username && password) {
      result = await AuthService.loginWithUsername(username, password, ip, userAgent);
    } else if (subscriberId && password) {
      result = await AuthService.loginWithSubscriberId(subscriberId, password, ip, userAgent);
    } else {
      res.status(400).json({ error: 'Email/username/subscriberId and password are required' });
      return;
    }

    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }

    // Set session cookie
    res.cookie('session_token', result.session!.sessionToken, getSessionCookieOptions());

    // If 2FA required, return partial response
    if (result.requires2FA) {
      res.json({
        requires2FA: true,
        sessionId: result.session!.id
      });
      return;
    }

    // Get roles and permissions
    const roles = await UserService.getRoles(result.user!.id);
    const permissions = await UserService.getPermissions(result.user!.id);

    res.json({
      user: sanitizeUser(result.user!),
      roles,
      permissions,
      csrfToken: result.session!.csrfToken
    });
  } catch (error) {
    logger.error('Login error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/google
 * Login/signup with Google OAuth
 */
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      res.status(400).json({ error: 'Google credential required' });
      return;
    }

    // Verify Google token
    const googleUser = await OAuthService.verifyGoogleToken(credential);
    if (!googleUser) {
      res.status(401).json({ error: 'Invalid Google credential' });
      return;
    }

    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    const result = await AuthService.loginWithGoogle(googleUser, ip, userAgent);

    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }

    res.cookie('session_token', result.session!.sessionToken, getSessionCookieOptions());

    if (result.requires2FA) {
      res.json({
        requires2FA: true,
        sessionId: result.session!.id
      });
      return;
    }

    const roles = await UserService.getRoles(result.user!.id);
    const permissions = await UserService.getPermissions(result.user!.id);

    res.json({
      user: sanitizeUser(result.user!),
      roles,
      permissions,
      csrfToken: result.session!.csrfToken
    });
  } catch (error) {
    logger.error('Google login error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Google login failed' });
  }
});

/**
 * POST /api/auth/signup
 * Create a new account
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { authMethod, email, username, subscriberId, password, displayName } = req.body;

    // Validate auth method
    const validMethods: AuthMethod[] = ['email_password', 'subscriber_id', 'username_password'];
    if (!validMethods.includes(authMethod)) {
      res.status(400).json({ error: 'Invalid authentication method' });
      return;
    }

    // Validate required fields based on method
    if (authMethod === 'email_password' && !email) {
      res.status(400).json({ error: 'Email is required for email/password authentication' });
      return;
    }
    if (authMethod === 'subscriber_id' && !subscriberId) {
      res.status(400).json({ error: 'Subscriber ID is required' });
      return;
    }
    if (authMethod === 'username_password' && !username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }
    if (!password || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    // Check for existing users
    if (email) {
      const existingEmail = await UserService.findByEmail(email);
      if (existingEmail) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }
    }
    if (username) {
      const existingUsername = await UserService.findByUsername(username);
      if (existingUsername) {
        res.status(409).json({ error: 'Username already taken' });
        return;
      }
    }
    if (subscriberId) {
      const existingSubId = await UserService.findBySubscriberId(subscriberId);
      if (existingSubId) {
        res.status(409).json({ error: 'Subscriber ID already registered' });
        return;
      }
    }

    // Create user
    const createInput: CreateUserInput = {
      authMethod,
      email: email || undefined,
      username: username || undefined,
      subscriberId: subscriberId || undefined,
      password,
      displayName: displayName || username || email?.split('@')[0] || subscriberId
    };

    const user = await UserService.create(createInput);

    // Auto-login after signup
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const session = await SessionService.create(user.id, ip, userAgent);

    await UserService.updateLastLogin(user.id, ip);

    res.cookie('session_token', session.sessionToken, getSessionCookieOptions());

    const roles = await UserService.getRoles(user.id);
    const permissions = await UserService.getPermissions(user.id);

    res.status(201).json({
      user: sanitizeUser(user),
      roles,
      permissions,
      csrfToken: session.csrfToken
    });
  } catch (error) {
    logger.error('Signup error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/verify-2fa
 * Complete 2FA verification
 */
router.post('/verify-2fa', async (req: Request, res: Response) => {
  try {
    const { sessionId, code, trustDevice, deviceFingerprint } = req.body;

    if (!sessionId || !code) {
      res.status(400).json({ error: 'Session ID and code are required' });
      return;
    }

    const result = await AuthService.verify2FA(
      sessionId,
      code,
      trustDevice || false,
      deviceFingerprint
    );

    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }

    // Set trusted device cookie if requested
    if (trustDevice && deviceFingerprint) {
      const ip = getClientIp(req);
      const userAgent = req.headers['user-agent'] || '';
      const deviceToken = await TotpService.trustDevice(
        result.user!.id,
        deviceFingerprint,
        userAgent,
        ip
      );
      res.cookie('trusted_device', deviceToken, getTrustedDeviceCookieOptions());
    }

    // Update session cookie if rotated
    if (result.session) {
      res.cookie('session_token', result.session.sessionToken, getSessionCookieOptions());
    }

    const roles = await UserService.getRoles(result.user!.id);
    const permissions = await UserService.getPermissions(result.user!.id);

    res.json({
      user: sanitizeUser(result.user!),
      roles,
      permissions,
      csrfToken: result.session?.csrfToken
    });
  } catch (error) {
    logger.error('2FA verification error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: '2FA verification failed' });
  }
});

/**
 * POST /api/auth/logout
 * Logout current session
 */
router.post('/logout', requireAuth, csrfProtection, async (req: Request, res: Response) => {
  try {
    const sessionToken = req.cookies?.session_token;
    if (sessionToken) {
      await AuthService.logout(sessionToken);
    }

    res.clearCookie('session_token');
    res.clearCookie('trusted_device');
    res.json({ success: true });
  } catch (error) {
    logger.error('Logout error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * POST /api/auth/logout-all
 * Logout all sessions except current
 */
router.post('/logout-all', requireAuth, csrfProtection, require2FAForAction(5), async (req: Request, res: Response) => {
  try {
    const count = await AuthService.logoutAll(req.user!.id, req.session!.id);
    res.json({ success: true, sessionsRevoked: count });
  } catch (error) {
    logger.error('Logout all error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to logout all sessions' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({
      user: sanitizeUser(req.user!),
      roles: req.userRoles,
      permissions: req.userPermissions,
      csrfToken: req.session!.csrfToken
    });
  } catch (error) {
    logger.error('Get current user error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * GET /api/auth/sessions
 * Get user's active sessions
 */
router.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessions = await SessionService.getActiveForUser(req.user!.id);

    res.json({
      sessions: sessions.map(s => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        isCurrent: s.id === req.session!.id
      }))
    });
  } catch (error) {
    logger.error('Get sessions error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

/**
 * DELETE /api/auth/sessions/:id
 * Revoke a specific session
 */
router.delete('/sessions/:id', requireAuth, csrfProtection, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent revoking current session through this endpoint
    if (id === req.session!.id) {
      res.status(400).json({ error: 'Use /logout to end current session' });
      return;
    }

    const revoked = await SessionService.revokeById(id, req.user!.id, 'user_revoked');

    if (!revoked) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Revoke session error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// ============================================
// 2FA Management Endpoints
// ============================================

/**
 * POST /api/auth/2fa/setup
 * Begin 2FA setup - generates secret and QR code
 */
router.post('/2fa/setup', requireAuth, csrfProtection, async (req: Request, res: Response) => {
  try {
    const { deviceName } = req.body;

    const result = await TotpService.beginSetup(
      req.user!.id,
      deviceName || 'Authenticator'
    );

    res.json({
      qrCode: result.qrCode,
      manualEntryKey: result.manualEntryKey,
      deviceId: result.deviceId
    });
  } catch (error) {
    logger.error('2FA setup error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to start 2FA setup' });
  }
});

/**
 * POST /api/auth/2fa/verify
 * Complete 2FA setup by verifying code
 */
router.post('/2fa/verify', requireAuth, csrfProtection, async (req: Request, res: Response) => {
  try {
    const { deviceId, code } = req.body;

    if (!deviceId || !code) {
      res.status(400).json({ error: 'Device ID and code are required' });
      return;
    }

    const result = await TotpService.completeSetup(req.user!.id, deviceId, code);

    if (!result.success) {
      res.status(400).json({ error: 'Invalid verification code' });
      return;
    }

    res.json({
      success: true,
      recoveryCodes: result.recoveryCodes
    });
  } catch (error) {
    logger.error('2FA verify error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
});

/**
 * GET /api/auth/2fa/devices
 * Get user's TOTP devices
 */
router.get('/2fa/devices', requireAuth, async (req: Request, res: Response) => {
  try {
    const devices = await TotpService.getDevices(req.user!.id);
    res.json({ devices });
  } catch (error) {
    logger.error('Get 2FA devices error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

/**
 * DELETE /api/auth/2fa/devices/:id
 * Remove a TOTP device
 */
router.delete('/2fa/devices/:id', requireAuth, csrfProtection, require2FAForAction(5), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await TotpService.deleteDevice(req.user!.id, id);

    if (!deleted) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete 2FA device error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

/**
 * POST /api/auth/2fa/recovery-codes
 * Regenerate recovery codes
 */
router.post('/2fa/recovery-codes', requireAuth, csrfProtection, require2FAForAction(5), async (req: Request, res: Response) => {
  try {
    const codes = await TotpService.regenerateRecoveryCodes(req.user!.id);
    res.json({ recoveryCodes: codes });
  } catch (error) {
    logger.error('Regenerate recovery codes error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to regenerate recovery codes' });
  }
});

/**
 * GET /api/auth/2fa/recovery-codes/count
 * Get remaining recovery code count
 */
router.get('/2fa/recovery-codes/count', requireAuth, async (req: Request, res: Response) => {
  try {
    const count = await TotpService.getRemainingRecoveryCodeCount(req.user!.id);
    res.json({ remaining: count });
  } catch (error) {
    logger.error('Get recovery code count error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get recovery code count' });
  }
});

/**
 * GET /api/auth/2fa/trusted-devices
 * Get trusted devices
 */
router.get('/2fa/trusted-devices', requireAuth, async (req: Request, res: Response) => {
  try {
    const devices = await TotpService.getTrustedDevices(req.user!.id);
    res.json({ devices });
  } catch (error) {
    logger.error('Get trusted devices error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get trusted devices' });
  }
});

/**
 * DELETE /api/auth/2fa/trusted-devices/:id
 * Revoke a trusted device
 */
router.delete('/2fa/trusted-devices/:id', requireAuth, csrfProtection, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const revoked = await TotpService.revokeTrustedDevice(req.user!.id, id);

    if (!revoked) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Revoke trusted device error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to revoke device' });
  }
});

// ============================================
// OAuth Configuration
// ============================================

/**
 * GET /api/auth/config
 * Get auth configuration for frontend
 */
router.get('/config', (req: Request, res: Response) => {
  res.json({
    googleEnabled: OAuthService.isGoogleConfigured(),
    googleClientId: env.GOOGLE_CLIENT_ID || null
  });
});

export default router;

import { Request, Response, NextFunction } from 'express';
import { SessionService, Session } from '../services/auth/session.service.js';
import { UserService, User } from '../services/auth/user.service.js';
import { TotpService } from '../services/auth/totp.service.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

// Extend Express Request type to include auth properties
declare global {
  namespace Express {
    interface Request {
      session?: Session;
      user?: User;
      userRoles?: string[];
      userPermissions?: string[];
    }
  }
}

/**
 * Load session from cookie (does not require auth - just loads if present)
 * This should be applied globally to all routes
 */
export async function loadSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionToken = req.cookies?.session_token;

  if (!sessionToken) {
    next();
    return;
  }

  try {
    const session = await SessionService.getByToken(sessionToken);

    if (!session) {
      // Clear invalid cookie
      res.clearCookie('session_token');
      next();
      return;
    }

    // Rolling session renewal - extend if active more than 1 hour ago
    if (SessionService.needsRenewal(session)) {
      await SessionService.touch(session.id);
    }

    req.session = session;

    // Load user and permissions
    const user = await UserService.getById(session.userId);
    if (user && user.isActive) {
      req.user = user;
      req.userRoles = await UserService.getRoles(user.id);
      req.userPermissions = await UserService.getPermissions(user.id);
    } else {
      // User deactivated or not found - invalidate session
      await SessionService.revoke(sessionToken, 'user_invalid');
      res.clearCookie('session_token');
    }

    next();
  } catch (error) {
    logger.error('Error loading session', {
      error: error instanceof Error ? error.message : String(error)
    });
    next();
  }
}

/**
 * Require authentication - returns 401 if not authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session || !req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Check if 2FA is required but not verified
  if (req.user.totpEnabled && !req.session.totpVerified) {
    res.status(403).json({
      error: '2FA verification required',
      requires2FA: true,
      sessionId: req.session.id
    });
    return;
  }

  next();
}

/**
 * Require specific role(s) - returns 403 if missing
 * User must have at least one of the specified roles
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !req.userRoles) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const hasRole = roles.some(role => req.userRoles!.includes(role));

    if (!hasRole) {
      logger.warn('Access denied - missing role', {
        userId: req.user.id,
        required: roles,
        actual: req.userRoles
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Require specific permission(s) - returns 403 if missing
 * User must have ALL specified permissions
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !req.userPermissions) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const hasAllPermissions = permissions.every(p => req.userPermissions!.includes(p));

    if (!hasAllPermissions) {
      logger.warn('Access denied - missing permission', {
        userId: req.user.id,
        required: permissions,
        missing: permissions.filter(p => !req.userPermissions!.includes(p))
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Require any of the specified permissions - returns 403 if none present
 * User must have at least ONE of the specified permissions
 */
export function requireAnyPermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !req.userPermissions) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const hasAnyPermission = permissions.some(p => req.userPermissions!.includes(p));

    if (!hasAnyPermission) {
      logger.warn('Access denied - missing all permissions', {
        userId: req.user.id,
        required: permissions
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Require fresh 2FA verification for sensitive actions
 * Even if session is 2FA verified, require re-verification if too old
 */
export function require2FAForAction(maxMinutes = 5) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session || !req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // If user doesn't have 2FA enabled, allow the action
    if (!req.user.totpEnabled) {
      next();
      return;
    }

    const lastVerified = req.session.totpVerifiedAt;
    if (!lastVerified) {
      res.status(403).json({
        error: '2FA verification required for this action',
        requireFresh2FA: true
      });
      return;
    }

    const minutesSinceVerification = (Date.now() - lastVerified.getTime()) / (1000 * 60);

    if (minutesSinceVerification > maxMinutes) {
      res.status(403).json({
        error: 'Please verify 2FA again for this action',
        requireFresh2FA: true
      });
      return;
    }

    next();
  };
}

/**
 * Check for trusted device cookie and skip 2FA if valid
 * This modifies the session to mark 2FA as verified if device is trusted
 */
export async function checkTrustedDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session || !req.user) {
    next();
    return;
  }

  // Only relevant if 2FA is enabled but not verified for this session
  if (!req.user.totpEnabled || req.session.totpVerified) {
    next();
    return;
  }

  const deviceToken = req.cookies?.trusted_device;
  if (!deviceToken) {
    next();
    return;
  }

  try {
    const isTrusted = await TotpService.isDeviceTrusted(req.user.id, deviceToken);

    if (isTrusted) {
      // Mark session as 2FA verified
      await SessionService.mark2FAVerified(req.session.id);
      req.session.totpVerified = true;

      // Optionally rotate the trusted device token
      const newToken = await TotpService.rotateTrustedDeviceToken(deviceToken);
      if (newToken) {
        res.cookie('trusted_device', newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          path: '/'
        });
      }
    }
  } catch (error) {
    logger.error('Error checking trusted device', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  next();
}

/**
 * Optional auth - loads session if present but doesn't require it
 * Useful for endpoints that behave differently for authenticated users
 */
export const optionalAuth = loadSession;

/**
 * API Key authentication for external clients (scripts, shortcuts, etc.)
 * Checks for X-API-Key header and validates against MHC_API_KEY env var
 * Returns true if valid API key, false otherwise
 */
export function validateApiKey(req: Request): boolean {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey || !env.MHC_API_KEY) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  if (apiKey.length !== env.MHC_API_KEY.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < apiKey.length; i++) {
    result |= apiKey.charCodeAt(i) ^ env.MHC_API_KEY.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Middleware that allows either session auth OR API key auth
 * Use this for endpoints that should be accessible by both web UI and external scripts
 */
export function requireAuthOrApiKey(req: Request, res: Response, next: NextFunction): void {
  // First check for valid API key
  if (validateApiKey(req)) {
    // API key is valid - mark request as API-authenticated
    (req as Request & { apiKeyAuth?: boolean }).apiKeyAuth = true;
    next();
    return;
  }

  // Fall back to session auth
  if (!req.session || !req.user) {
    res.status(401).json({ error: 'Authentication required. Provide session cookie or X-API-Key header.' });
    return;
  }

  // Check if 2FA is required but not verified
  if (req.user.totpEnabled && !req.session.totpVerified) {
    res.status(403).json({
      error: '2FA verification required',
      requires2FA: true,
      sessionId: req.session.id
    });
    return;
  }

  next();
}

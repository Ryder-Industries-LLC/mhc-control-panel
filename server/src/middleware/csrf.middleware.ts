import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';

/**
 * Validate CSRF token for state-changing requests (POST, PUT, DELETE, PATCH)
 * The CSRF token should be sent in the X-CSRF-Token header
 */
export function validateCsrf(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF validation for safe methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    next();
    return;
  }

  // Skip if no session (will fail auth check anyway)
  if (!req.session) {
    next();
    return;
  }

  // Get token from header or body
  const csrfToken = req.headers['x-csrf-token'] as string ||
                    req.body?._csrf ||
                    req.query?._csrf as string;

  if (!csrfToken) {
    logger.warn('CSRF validation failed - no token provided', {
      userId: req.user?.id,
      path: req.path,
      method: req.method
    });
    res.status(403).json({ error: 'CSRF token required' });
    return;
  }

  if (csrfToken !== req.session.csrfToken) {
    logger.warn('CSRF validation failed - token mismatch', {
      userId: req.user?.id,
      path: req.path,
      method: req.method
    });
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
}

/**
 * Provide CSRF token to client via response header
 * Client should read this and include it in subsequent requests
 */
export function provideCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (req.session) {
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
  }
  next();
}

/**
 * Combined middleware that validates CSRF on mutations and provides token
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Always provide token in response
  if (req.session) {
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
  }

  // Validate on state-changing requests
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    next();
    return;
  }

  // Skip validation if no session
  if (!req.session) {
    next();
    return;
  }

  const csrfToken = req.headers['x-csrf-token'] as string ||
                    req.body?._csrf ||
                    req.query?._csrf as string;

  if (!csrfToken || csrfToken !== req.session.csrfToken) {
    logger.warn('CSRF validation failed', {
      userId: req.user?.id,
      path: req.path,
      method: req.method,
      hasToken: !!csrfToken
    });
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
}

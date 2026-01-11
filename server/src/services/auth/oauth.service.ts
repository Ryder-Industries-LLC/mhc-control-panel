import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
}

export class OAuthService {
  private static googleClient: OAuth2Client | null = null;

  /**
   * Get Google OAuth client (lazy initialization)
   */
  private static getGoogleClient(): OAuth2Client | null {
    if (!env.GOOGLE_CLIENT_ID) {
      return null;
    }

    if (!this.googleClient) {
      this.googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    }

    return this.googleClient;
  }

  /**
   * Verify a Google ID token and extract user info
   */
  static async verifyGoogleToken(idToken: string): Promise<GoogleUserInfo | null> {
    const client = this.getGoogleClient();

    if (!client) {
      logger.warn('Google OAuth not configured - missing GOOGLE_CLIENT_ID');
      return null;
    }

    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID
      });

      const payload = ticket.getPayload();

      if (!payload) {
        logger.warn('Google token verification failed - no payload');
        return null;
      }

      // Ensure required fields are present
      if (!payload.sub || !payload.email) {
        logger.warn('Google token missing required fields');
        return null;
      }

      return {
        sub: payload.sub,
        email: payload.email,
        email_verified: payload.email_verified ?? false,
        name: payload.name || payload.email.split('@')[0],
        picture: payload.picture
      };
    } catch (error) {
      logger.error('Google token verification failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Check if Google OAuth is configured
   */
  static isGoogleConfigured(): boolean {
    return !!env.GOOGLE_CLIENT_ID;
  }
}

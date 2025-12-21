import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import type { StreamSession, Platform } from '../types/models.js';

export class SessionService {
  /**
   * Start a new stream session
   */
  static async start(broadcaster: string, platform: Platform = 'chaturbate'): Promise<StreamSession> {
    // Check if there's already an active session
    const existing = await this.getCurrentSession(broadcaster);
    if (existing) {
      logger.warn(`Session already active for ${broadcaster}, returning existing session`);
      return existing;
    }

    const result = await query<StreamSession>(
      `INSERT INTO stream_sessions (platform, broadcaster, started_at, status)
       VALUES ($1, $2, NOW(), 'LIVE')
       RETURNING *`,
      [platform, broadcaster]
    );

    logger.info(`Started session for ${broadcaster}: ${result.rows[0].id}`);
    return result.rows[0];
  }

  /**
   * End a stream session
   */
  static async end(sessionId: string): Promise<StreamSession | null> {
    const result = await query<StreamSession>(
      `UPDATE stream_sessions
       SET ended_at = NOW(), status = 'ENDED'
       WHERE id = $1
       RETURNING *`,
      [sessionId]
    );

    if (result.rows[0]) {
      logger.info(`Ended session: ${sessionId}`);
    }

    return result.rows[0] || null;
  }

  /**
   * Get current active session for a broadcaster
   */
  static async getCurrentSession(broadcaster: string): Promise<StreamSession | null> {
    const result = await query<StreamSession>(
      `SELECT * FROM stream_sessions
       WHERE broadcaster = $1 AND status = 'LIVE'
       ORDER BY started_at DESC
       LIMIT 1`,
      [broadcaster]
    );
    return result.rows[0] || null;
  }

  /**
   * Get session by ID
   */
  static async getById(sessionId: string): Promise<StreamSession | null> {
    const result = await query<StreamSession>(
      'SELECT * FROM stream_sessions WHERE id = $1',
      [sessionId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all sessions for a broadcaster
   */
  static async getByBroadcaster(
    broadcaster: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<StreamSession[]> {
    const { limit = 50, offset = 0 } = options || {};

    const result = await query<StreamSession>(
      `SELECT * FROM stream_sessions
       WHERE broadcaster = $1
       ORDER BY started_at DESC
       LIMIT $2 OFFSET $3`,
      [broadcaster, limit, offset]
    );
    return result.rows;
  }

  /**
   * Get session stats (total interactions, duration, etc.)
   */
  static async getSessionStats(sessionId: string): Promise<{
    totalInteractions: number;
    totalTips: number;
    uniqueUsers: number;
    durationMinutes: number | null;
  }> {
    const session = await this.getById(sessionId);
    if (!session) {
      return { totalInteractions: 0, totalTips: 0, uniqueUsers: 0, durationMinutes: null };
    }

    // Calculate duration
    const durationMinutes = session.ended_at
      ? (session.ended_at.getTime() - session.started_at.getTime()) / (1000 * 60)
      : null;

    // Get interaction stats
    const stats = await query<{
      total_interactions: string;
      total_tips: string;
      unique_users: string;
    }>(
      `SELECT
        COUNT(*) as total_interactions,
        COUNT(*) FILTER (WHERE type = 'TIP_EVENT') as total_tips,
        COUNT(DISTINCT person_id) as unique_users
       FROM interactions
       WHERE stream_session_id = $1`,
      [sessionId]
    );

    const row = stats.rows[0];

    return {
      totalInteractions: parseInt(row.total_interactions, 10),
      totalTips: parseInt(row.total_tips, 10),
      uniqueUsers: parseInt(row.unique_users, 10),
      durationMinutes,
    };
  }
}

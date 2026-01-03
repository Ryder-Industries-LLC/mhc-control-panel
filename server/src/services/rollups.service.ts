import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface Rollups {
  total_tokens: number;
  followers_gained: number;
  peak_viewers: number;
  avg_viewers: number;
  unique_visitors: number;
}

interface ViewerEvent {
  timestamp: Date;
  method: string;
  username: string;
}

export class RollupsService {
  /**
   * Compute rollups for a session from its linked events
   */
  static async computeRollups(sessionId: string): Promise<Rollups> {
    logger.debug(`Computing rollups for session ${sessionId}`);

    // Get token total from tip events
    const tokensResult = await query<{ total: string }>(
      `SELECT COALESCE(SUM((raw_event->'tip'->>'tokens')::int), 0) as total
       FROM event_logs
       WHERE session_id = $1 AND method = 'tip'`,
      [sessionId]
    );
    const total_tokens = parseInt(tokensResult.rows[0]?.total || '0', 10);

    // Get followers gained (follows - unfollows)
    const followersResult = await query<{ gained: string; lost: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE method = 'follow') as gained,
         COUNT(*) FILTER (WHERE method = 'unfollow') as lost
       FROM event_logs
       WHERE session_id = $1 AND method IN ('follow', 'unfollow')`,
      [sessionId]
    );
    const follows = parseInt(followersResult.rows[0]?.gained || '0', 10);
    const unfollows = parseInt(followersResult.rows[0]?.lost || '0', 10);
    const followers_gained = follows - unfollows;

    // Get unique visitors count
    const uniqueResult = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT raw_event->'user'->>'username') as count
       FROM event_logs
       WHERE session_id = $1 AND method = 'userEnter'`,
      [sessionId]
    );
    const unique_visitors = parseInt(uniqueResult.rows[0]?.count || '0', 10);

    // Compute peak and average viewers from enter/leave events
    const viewerMetrics = await this.computeViewerMetrics(sessionId);

    const rollups: Rollups = {
      total_tokens,
      followers_gained,
      peak_viewers: viewerMetrics.peak,
      avg_viewers: viewerMetrics.avg,
      unique_visitors,
    };

    logger.debug(`Rollups for ${sessionId}: tokens=${total_tokens}, followers=${followers_gained}, peak=${viewerMetrics.peak}, avg=${viewerMetrics.avg.toFixed(1)}, unique=${unique_visitors}`);

    return rollups;
  }

  /**
   * Compute peak and average viewers from userEnter/userLeave events
   * Uses concurrent viewer tracking across the session
   */
  static async computeViewerMetrics(sessionId: string): Promise<{ peak: number; avg: number }> {
    // Get all enter/leave events with username and timestamp
    const eventsResult = await query<ViewerEvent>(
      `SELECT
         timestamp,
         method,
         raw_event->'user'->>'username' as username
       FROM event_logs
       WHERE session_id = $1
         AND method IN ('userEnter', 'userLeave')
         AND raw_event->'user'->>'username' IS NOT NULL
       ORDER BY timestamp`,
      [sessionId]
    );

    const events = eventsResult.rows;

    if (events.length === 0) {
      return { peak: 0, avg: 0 };
    }

    // Track concurrent viewers over time
    const activeViewers = new Set<string>();
    const viewerCounts: { timestamp: Date; count: number }[] = [];

    for (const event of events) {
      if (event.method === 'userEnter') {
        activeViewers.add(event.username);
      } else if (event.method === 'userLeave') {
        activeViewers.delete(event.username);
      }

      viewerCounts.push({
        timestamp: event.timestamp,
        count: activeViewers.size,
      });
    }

    if (viewerCounts.length === 0) {
      return { peak: 0, avg: 0 };
    }

    // Calculate peak
    const peak = Math.max(...viewerCounts.map(v => v.count));

    // Calculate time-weighted average
    let totalTime = 0;
    let weightedSum = 0;

    for (let i = 0; i < viewerCounts.length - 1; i++) {
      const current = viewerCounts[i];
      const next = viewerCounts[i + 1];
      const duration = next.timestamp.getTime() - current.timestamp.getTime();

      if (duration > 0) {
        weightedSum += current.count * duration;
        totalTime += duration;
      }
    }

    const avg = totalTime > 0 ? weightedSum / totalTime : peak;

    return { peak, avg };
  }

  /**
   * Update a session with computed rollups
   */
  static async updateSessionRollups(sessionId: string, rollups: Rollups): Promise<void> {
    await query(
      `UPDATE broadcast_sessions_v2
       SET total_tokens = $2,
           followers_gained = $3,
           peak_viewers = $4,
           avg_viewers = $5,
           unique_visitors = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        sessionId,
        rollups.total_tokens,
        rollups.followers_gained,
        rollups.peak_viewers,
        rollups.avg_viewers,
        rollups.unique_visitors,
      ]
    );
    logger.debug(`Updated rollups for session ${sessionId}`);
  }

  /**
   * Compute and update rollups for a session
   */
  static async computeAndUpdateSession(sessionId: string): Promise<Rollups> {
    const rollups = await this.computeRollups(sessionId);
    await this.updateSessionRollups(sessionId, rollups);
    return rollups;
  }

  /**
   * Compute and update rollups for all sessions
   */
  static async computeAllRollups(): Promise<number> {
    const result = await query<{ id: string }>('SELECT id FROM broadcast_sessions_v2');

    let count = 0;
    for (const row of result.rows) {
      await this.computeAndUpdateSession(row.id);
      count++;
    }

    logger.info(`Computed rollups for ${count} sessions`);
    return count;
  }

  /**
   * Get aggregate stats across sessions for a date range
   */
  static async getAggregateStats(options?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    totalSessions: number;
    totalTokens: number;
    totalFollowers: number;
    avgViewers: number;
    peakViewers: number;
    totalMinutes: number;
  }> {
    const { startDate, endDate } = options || {};

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`started_at >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`started_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query<{
      total_sessions: string;
      total_tokens: string;
      total_followers: string;
      avg_viewers: string;
      peak_viewers: string;
      total_minutes: string;
    }>(
      `SELECT
         COUNT(*) as total_sessions,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(followers_gained), 0) as total_followers,
         COALESCE(AVG(NULLIF(avg_viewers, 0)), 0) as avg_viewers,
         COALESCE(MAX(peak_viewers), 0) as peak_viewers,
         COALESCE(SUM(
           EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60
         ), 0) as total_minutes
       FROM broadcast_sessions_v2
       ${whereClause}`,
      params
    );

    const row = result.rows[0];
    return {
      totalSessions: parseInt(row.total_sessions, 10),
      totalTokens: parseInt(row.total_tokens, 10),
      totalFollowers: parseInt(row.total_followers, 10),
      avgViewers: parseFloat(row.avg_viewers),
      peakViewers: parseInt(row.peak_viewers, 10),
      totalMinutes: parseFloat(row.total_minutes),
    };
  }
}

import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import type { OnlineRoom } from '../api/chaturbate/affiliate-client.js';

export interface BroadcastSession {
  id: number;
  person_id: string;
  observed_at: Date;
  seconds_online: number;
  session_start: Date;
  current_show: string;
  room_subject: string;
  tags: string[];
  num_users: number;
  num_followers: number;
  is_hd: boolean;
  image_url: string;
  image_url_360x270: string;
  created_at: Date;
}

export class BroadcastSessionService {
  /**
   * Record a broadcast session snapshot from Affiliate API
   */
  static async recordSession(personId: string, roomData: OnlineRoom): Promise<BroadcastSession> {
    const sql = `
      INSERT INTO broadcast_sessions (
        person_id, observed_at, seconds_online, session_start,
        current_show, room_subject, tags,
        num_users, num_followers, is_hd,
        image_url, image_url_360x270
      ) VALUES (
        $1, NOW(), $2, NOW() - make_interval(secs => $2::integer),
        $3, $4, $5,
        $6, $7, $8,
        $9, $10
      )
      ON CONFLICT (person_id, observed_at) DO UPDATE SET
        seconds_online = EXCLUDED.seconds_online,
        session_start = EXCLUDED.session_start,
        current_show = EXCLUDED.current_show,
        room_subject = EXCLUDED.room_subject,
        tags = EXCLUDED.tags,
        num_users = EXCLUDED.num_users,
        num_followers = EXCLUDED.num_followers,
        is_hd = EXCLUDED.is_hd,
        image_url = EXCLUDED.image_url,
        image_url_360x270 = EXCLUDED.image_url_360x270
      RETURNING *
    `;

    const values = [
      personId,
      roomData.seconds_online,
      roomData.current_show,
      roomData.room_subject,
      roomData.tags,
      roomData.num_users,
      roomData.num_followers,
      roomData.is_hd,
      roomData.image_url,
      roomData.image_url_360x270,
    ];

    try {
      const result = await query(sql, values);
      const row = result.rows[0];

      logger.info('Broadcast session recorded', {
        personId,
        username: roomData.username,
        secondsOnline: roomData.seconds_online,
        numUsers: roomData.num_users,
      });

      return this.mapRowToSession(row);
    } catch (error) {
      logger.error('Error recording broadcast session', { error, personId });
      throw error;
    }
  }

  /**
   * Get latest session for a broadcaster
   */
  static async getLatestSession(personId: string): Promise<BroadcastSession | null> {
    const sql = `
      SELECT * FROM broadcast_sessions
      WHERE person_id = $1
      ORDER BY observed_at DESC
      LIMIT 1
    `;

    try {
      const result = await query(sql, [personId]);
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      logger.error('Error getting latest session', { error, personId });
      throw error;
    }
  }

  /**
   * Get all sessions for a broadcaster
   */
  static async getSessionsByPerson(personId: string, limit = 100): Promise<BroadcastSession[]> {
    const sql = `
      SELECT * FROM broadcast_sessions
      WHERE person_id = $1
      ORDER BY observed_at DESC
      LIMIT $2
    `;

    try {
      const result = await query(sql, [personId, limit]);
      return result.rows.map(this.mapRowToSession);
    } catch (error) {
      logger.error('Error getting sessions by person', { error, personId });
      throw error;
    }
  }

  /**
   * Get sessions within a date range
   */
  static async getSessionsByDateRange(
    personId: string,
    startDate: Date,
    endDate: Date
  ): Promise<BroadcastSession[]> {
    const sql = `
      SELECT * FROM broadcast_sessions
      WHERE person_id = $1
        AND observed_at BETWEEN $2 AND $3
      ORDER BY observed_at DESC
    `;

    try {
      const result = await query(sql, [personId, startDate, endDate]);
      return result.rows.map(this.mapRowToSession);
    } catch (error) {
      logger.error('Error getting sessions by date range', { error, personId });
      throw error;
    }
  }

  /**
   * Get session statistics for a broadcaster
   */
  static async getSessionStats(personId: string, days = 30): Promise<{
    totalSessions: number;
    totalMinutesOnline: number;
    avgViewersPerSession: number;
    avgFollowersGained: number;
    mostUsedTags: Array<{ tag: string; count: number }>;
    peakViewers: number;
  }> {
    const sql = `
      WITH session_groups AS (
        SELECT
          person_id,
          session_start,
          MAX(seconds_online) as max_seconds,
          MAX(num_users) as peak_users,
          MAX(num_followers) as final_followers,
          MIN(num_followers) as initial_followers,
          array_agg(DISTINCT tag) FILTER (WHERE tag IS NOT NULL) as all_tags
        FROM broadcast_sessions, unnest(tags) as tag
        WHERE person_id = $1
          AND observed_at >= NOW() - INTERVAL '${days} days'
        GROUP BY person_id, session_start
      )
      SELECT
        COUNT(*) as total_sessions,
        SUM(max_seconds) / 60 as total_minutes_online,
        AVG(peak_users) as avg_viewers,
        AVG(final_followers - initial_followers) as avg_followers_gained,
        MAX(peak_users) as peak_viewers
      FROM session_groups
    `;

    try {
      const result = await query(sql, [personId]);
      const stats = result.rows[0];

      // Get most used tags separately
      const tagsSql = `
        SELECT tag, COUNT(*) as count
        FROM broadcast_sessions, unnest(tags) as tag
        WHERE person_id = $1
          AND observed_at >= NOW() - INTERVAL '${days} days'
        GROUP BY tag
        ORDER BY count DESC
        LIMIT 10
      `;

      const tagsResult = await query(tagsSql, [personId]);

      return {
        totalSessions: parseInt(stats.total_sessions, 10) || 0,
        totalMinutesOnline: parseInt(stats.total_minutes_online, 10) || 0,
        avgViewersPerSession: parseFloat(stats.avg_viewers) || 0,
        avgFollowersGained: parseFloat(stats.avg_followers_gained) || 0,
        mostUsedTags: tagsResult.rows.map(row => ({
          tag: row.tag,
          count: parseInt(row.count, 10),
        })),
        peakViewers: parseInt(stats.peak_viewers, 10) || 0,
      };
    } catch (error) {
      logger.error('Error getting session stats', { error, personId });
      throw error;
    }
  }

  /**
   * Map database row to BroadcastSession object
   */
  private static mapRowToSession(row: any): BroadcastSession {
    return {
      id: row.id,
      person_id: row.person_id,
      observed_at: row.observed_at,
      seconds_online: row.seconds_online,
      session_start: row.session_start,
      current_show: row.current_show,
      room_subject: row.room_subject,
      tags: row.tags || [],
      num_users: row.num_users,
      num_followers: row.num_followers,
      is_hd: row.is_hd,
      image_url: row.image_url,
      image_url_360x270: row.image_url_360x270,
      created_at: row.created_at,
    };
  }
}

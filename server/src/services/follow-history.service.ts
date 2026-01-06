import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export type FollowDirection = 'following' | 'follower';
export type FollowAction = 'follow' | 'unfollow';
export type FollowSource = 'events_api' | 'profile_scrape' | 'list_scrape' | 'manual_import';

export interface FollowHistoryRecord {
  id: string;
  person_id: string;
  direction: FollowDirection;
  action: FollowAction;
  source: FollowSource;
  event_id: string | null;
  created_at: Date;
}

export interface FollowHistoryWithUsername extends FollowHistoryRecord {
  username: string;
}

export interface RecordFollowHistoryParams {
  personId: string;
  direction: FollowDirection;
  action: FollowAction;
  source: FollowSource;
  eventId?: string;
}

export interface GetHistoryOptions {
  direction?: FollowDirection;
  action?: FollowAction;
  source?: FollowSource;
  limit?: number;
  offset?: number;
}

export class FollowHistoryService {
  /**
   * Record a follow/unfollow event in history
   */
  static async record(params: RecordFollowHistoryParams): Promise<FollowHistoryRecord> {
    const { personId, direction, action, source, eventId } = params;

    const result = await query(
      `INSERT INTO follow_history (person_id, direction, action, source, event_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [personId, direction, action, source, eventId || null]
    );

    logger.debug('Follow history recorded', {
      personId,
      direction,
      action,
      source,
    });

    return result.rows[0] as FollowHistoryRecord;
  }

  /**
   * Get follow history for a specific person
   */
  static async getByPerson(
    personId: string,
    direction?: FollowDirection
  ): Promise<FollowHistoryRecord[]> {
    let sql = `
      SELECT * FROM follow_history
      WHERE person_id = $1
    `;
    const params: (string | undefined)[] = [personId];

    if (direction) {
      sql += ` AND direction = $2`;
      params.push(direction);
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await query(sql, params);
    return result.rows as FollowHistoryRecord[];
  }

  /**
   * Get paginated follow history with optional filters
   */
  static async getAll(options: GetHistoryOptions = {}): Promise<{
    records: FollowHistoryWithUsername[];
    total: number;
  }> {
    const { direction, action, source, limit = 50, offset = 0 } = options;

    // Build WHERE clauses
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (direction) {
      conditions.push(`fh.direction = $${paramIndex++}`);
      params.push(direction);
    }

    if (action) {
      conditions.push(`fh.action = $${paramIndex++}`);
      params.push(action);
    }

    if (source) {
      conditions.push(`fh.source = $${paramIndex++}`);
      params.push(source);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM follow_history fh ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get records with username join
    const dataParams = [...params, limit, offset];
    const result = await query(
      `SELECT fh.*, p.username
       FROM follow_history fh
       JOIN persons p ON p.id = fh.person_id
       ${whereClause}
       ORDER BY fh.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      dataParams
    );

    return {
      records: result.rows as FollowHistoryWithUsername[],
      total,
    };
  }

  /**
   * Get the most recent action for a person in a given direction
   */
  static async getLatestAction(
    personId: string,
    direction: FollowDirection
  ): Promise<FollowHistoryRecord | null> {
    const result = await query(
      `SELECT * FROM follow_history
       WHERE person_id = $1 AND direction = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [personId, direction]
    );

    return (result.rows[0] as FollowHistoryRecord) || null;
  }

  /**
   * Check if an action was already recorded recently (to prevent duplicates)
   * Returns true if a matching record exists within the time window
   */
  static async hasRecentRecord(
    personId: string,
    direction: FollowDirection,
    action: FollowAction,
    withinMinutes: number = 5
  ): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM follow_history
       WHERE person_id = $1
         AND direction = $2
         AND action = $3
         AND created_at > NOW() - INTERVAL '${withinMinutes} minutes'
       LIMIT 1`,
      [personId, direction, action]
    );

    return result.rows.length > 0;
  }

  /**
   * Get summary statistics for follow history
   */
  static async getStats(): Promise<{
    totalFollows: number;
    totalUnfollows: number;
    followingFollows: number;
    followingUnfollows: number;
    followerFollows: number;
    followerUnfollows: number;
  }> {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE action = 'follow') as total_follows,
        COUNT(*) FILTER (WHERE action = 'unfollow') as total_unfollows,
        COUNT(*) FILTER (WHERE direction = 'following' AND action = 'follow') as following_follows,
        COUNT(*) FILTER (WHERE direction = 'following' AND action = 'unfollow') as following_unfollows,
        COUNT(*) FILTER (WHERE direction = 'follower' AND action = 'follow') as follower_follows,
        COUNT(*) FILTER (WHERE direction = 'follower' AND action = 'unfollow') as follower_unfollows
      FROM follow_history
    `);

    const row = result.rows[0];
    return {
      totalFollows: parseInt(row.total_follows, 10),
      totalUnfollows: parseInt(row.total_unfollows, 10),
      followingFollows: parseInt(row.following_follows, 10),
      followingUnfollows: parseInt(row.following_unfollows, 10),
      followerFollows: parseInt(row.follower_follows, 10),
      followerUnfollows: parseInt(row.follower_unfollows, 10),
    };
  }
}

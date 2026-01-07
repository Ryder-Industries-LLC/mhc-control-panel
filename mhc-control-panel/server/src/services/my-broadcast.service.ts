import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface MyBroadcast {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  duration_minutes: number | null;
  peak_viewers: number;
  total_tokens: number;
  followers_gained: number;
  summary: string | null;
  notes: string | null;
  tags: string[];
  room_subject: string | null;
  auto_detected: boolean;
  source: string;
  created_at: Date;
  updated_at: Date;
}

// Backwards compatibility alias
export type HudsonBroadcast = MyBroadcast;

export interface CreateBroadcastInput {
  started_at: Date;
  ended_at?: Date;
  duration_minutes?: number;
  peak_viewers?: number;
  total_tokens?: number;
  followers_gained?: number;
  summary?: string;
  notes?: string;
  tags?: string[];
  room_subject?: string;
  auto_detected?: boolean;
  source?: string;
}

export interface UpdateBroadcastInput {
  started_at?: Date;
  ended_at?: Date;
  duration_minutes?: number;
  peak_viewers?: number;
  total_tokens?: number;
  followers_gained?: number;
  summary?: string;
  notes?: string;
  tags?: string[];
  room_subject?: string;
}

export class MyBroadcastService {
  /**
   * Create a new broadcast record
   */
  static async create(input: CreateBroadcastInput): Promise<MyBroadcast> {
    const {
      started_at,
      ended_at,
      duration_minutes,
      peak_viewers = 0,
      total_tokens = 0,
      followers_gained = 0,
      summary,
      notes,
      tags = [],
      room_subject,
      auto_detected = false,
      source = 'manual',
    } = input;

    // Calculate duration if ended_at is provided but duration isn't
    let calcDuration = duration_minutes;
    if (ended_at && !calcDuration) {
      calcDuration = Math.round((ended_at.getTime() - started_at.getTime()) / (1000 * 60));
    }

    const result = await query(
      `INSERT INTO my_broadcasts (
        started_at, ended_at, duration_minutes,
        peak_viewers, total_tokens, followers_gained,
        summary, notes, tags, room_subject,
        auto_detected, source
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING *`,
      [
        started_at,
        ended_at || null,
        calcDuration || null,
        peak_viewers,
        total_tokens,
        followers_gained,
        summary || null,
        notes || null,
        tags,
        room_subject || null,
        auto_detected,
        source,
      ]
    );

    logger.info('Broadcast created', {
      id: result.rows[0].id,
      started_at,
      auto_detected,
      source,
    });

    return result.rows[0] as MyBroadcast;
  }

  /**
   * Update an existing broadcast
   */
  static async update(id: string, input: UpdateBroadcastInput): Promise<MyBroadcast | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.started_at !== undefined) {
      fields.push(`started_at = $${paramIndex++}`);
      values.push(input.started_at);
    }
    if (input.ended_at !== undefined) {
      fields.push(`ended_at = $${paramIndex++}`);
      values.push(input.ended_at);
    }
    if (input.duration_minutes !== undefined) {
      fields.push(`duration_minutes = $${paramIndex++}`);
      values.push(input.duration_minutes);
    }
    if (input.peak_viewers !== undefined) {
      fields.push(`peak_viewers = $${paramIndex++}`);
      values.push(input.peak_viewers);
    }
    if (input.total_tokens !== undefined) {
      fields.push(`total_tokens = $${paramIndex++}`);
      values.push(input.total_tokens);
    }
    if (input.followers_gained !== undefined) {
      fields.push(`followers_gained = $${paramIndex++}`);
      values.push(input.followers_gained);
    }
    if (input.summary !== undefined) {
      fields.push(`summary = $${paramIndex++}`);
      values.push(input.summary);
    }
    if (input.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(input.notes);
    }
    if (input.tags !== undefined) {
      fields.push(`tags = $${paramIndex++}`);
      values.push(input.tags);
    }
    if (input.room_subject !== undefined) {
      fields.push(`room_subject = $${paramIndex++}`);
      values.push(input.room_subject);
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);

    const result = await query(
      `UPDATE my_broadcasts SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    logger.info('Broadcast updated', { id });
    return result.rows[0] as MyBroadcast;
  }

  /**
   * End a broadcast (set ended_at and calculate duration)
   */
  static async endBroadcast(id: string, stats?: { peak_viewers?: number; total_tokens?: number; followers_gained?: number }): Promise<MyBroadcast | null> {
    const broadcast = await this.getById(id);
    if (!broadcast) {
      return null;
    }

    const ended_at = new Date();
    const duration_minutes = Math.round((ended_at.getTime() - broadcast.started_at.getTime()) / (1000 * 60));

    const result = await query(
      `UPDATE my_broadcasts SET
        ended_at = $2,
        duration_minutes = $3,
        peak_viewers = COALESCE($4, peak_viewers),
        total_tokens = COALESCE($5, total_tokens),
        followers_gained = COALESCE($6, followers_gained)
      WHERE id = $1
      RETURNING *`,
      [
        id,
        ended_at,
        duration_minutes,
        stats?.peak_viewers ?? null,
        stats?.total_tokens ?? null,
        stats?.followers_gained ?? null,
      ]
    );

    logger.info('Broadcast ended', { id, duration_minutes });
    return result.rows[0] as MyBroadcast;
  }

  /**
   * Get a broadcast by ID
   * Checks both my_broadcasts and stream_sessions tables
   */
  static async getById(id: string): Promise<MyBroadcast | null> {
    // First check my_broadcasts table
    const myBroadcastResult = await query(
      'SELECT * FROM my_broadcasts WHERE id = $1',
      [id]
    );

    if (myBroadcastResult.rows.length > 0) {
      return myBroadcastResult.rows[0] as MyBroadcast;
    }

    // Fall back to stream_sessions table
    const sessionResult = await query(
      `SELECT
        id,
        started_at,
        ended_at,
        CASE WHEN ended_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (ended_at - started_at)) / 60
          ELSE NULL
        END::integer as duration_minutes,
        0 as peak_viewers,
        0 as total_tokens,
        0 as followers_gained,
        NULL as summary,
        NULL as notes,
        ARRAY[]::text[] as tags,
        NULL as room_subject,
        true as auto_detected,
        'events_api' as source,
        started_at as created_at,
        COALESCE(ended_at, started_at) as updated_at
      FROM stream_sessions
      WHERE id = $1`,
      [id]
    );

    return sessionResult.rows[0] as MyBroadcast || null;
  }

  /**
   * Get all broadcasts with pagination
   * Combines my_broadcasts table with stream_sessions for the broadcaster
   */
  static async getAll(options?: { limit?: number; offset?: number; broadcaster?: string }): Promise<MyBroadcast[]> {
    const result = await this.getAllWithCount(options);
    return result.broadcasts;
  }

  /**
   * Get all broadcasts with pagination and total count
   * Combines my_broadcasts table with stream_sessions for the broadcaster
   * Supports optional date range filtering
   */
  static async getAllWithCount(options?: {
    limit?: number;
    offset?: number;
    broadcaster?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    broadcasts: MyBroadcast[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit = 50, offset = 0, broadcaster = 'hudson_cage', startDate, endDate } = options || {};

    // Build date filter conditions
    const dateFilter1 = startDate ? `AND started_at >= $4` : '';
    const dateFilter2 = endDate ? `AND started_at <= $5` : '';
    const dateFilter3 = startDate ? `AND started_at >= $4` : '';
    const dateFilter4 = endDate ? `AND started_at <= $5` : '';

    // Query combines my_broadcasts with stream_sessions (for the broadcaster)
    // Deduplicates broadcasts within 10 minutes, preferring manual entries and merging stats
    const result = await query(
      `WITH all_broadcasts AS (
        -- From my_broadcasts table
        SELECT
          id,
          started_at,
          ended_at,
          duration_minutes,
          peak_viewers,
          total_tokens,
          followers_gained,
          summary,
          notes,
          tags,
          room_subject,
          auto_detected,
          source,
          created_at,
          updated_at
        FROM my_broadcasts
        WHERE 1=1 ${dateFilter1} ${dateFilter2}

        UNION ALL

        -- From stream_sessions table (sessions belonging to the broadcaster)
        SELECT
          id,
          started_at,
          ended_at,
          CASE WHEN ended_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (ended_at - started_at)) / 60
            ELSE NULL
          END::integer as duration_minutes,
          0 as peak_viewers,
          0 as total_tokens,
          0 as followers_gained,
          NULL as summary,
          NULL as notes,
          ARRAY[]::text[] as tags,
          NULL as room_subject,
          true as auto_detected,
          'events_api' as source,
          started_at as created_at,
          COALESCE(ended_at, started_at) as updated_at
        FROM stream_sessions
        WHERE LOWER(broadcaster) = LOWER($3) ${dateFilter3} ${dateFilter4}
      ),
      -- Group broadcasts within 10 minutes of each other
      -- Use floor division to create 10-minute buckets
      with_bucket AS (
        SELECT *,
          FLOOR(EXTRACT(EPOCH FROM started_at) / 600) as time_bucket
        FROM all_broadcasts
      ),
      -- Deduplicate within each bucket, preferring manual entries
      deduped AS (
        SELECT DISTINCT ON (time_bucket)
          id, started_at, ended_at, duration_minutes,
          peak_viewers, total_tokens, followers_gained,
          summary, notes, tags, room_subject,
          auto_detected, source, created_at, updated_at
        FROM with_bucket
        ORDER BY time_bucket DESC, source = 'manual' DESC, started_at ASC
      )
      SELECT *, COUNT(*) OVER() as total_count
      FROM deduped
      ORDER BY started_at DESC
      LIMIT $1 OFFSET $2`,
      startDate && endDate
        ? [limit, offset, broadcaster, startDate, endDate]
        : startDate
          ? [limit, offset, broadcaster, startDate]
          : endDate
            ? [limit, offset, broadcaster, endDate]
            : [limit, offset, broadcaster]
    );

    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count || '0') : 0;
    const broadcasts = result.rows.map(row => {
      const { total_count, time_bucket, ...broadcast } = row;
      return broadcast;
    }) as MyBroadcast[];

    return {
      broadcasts,
      total,
      hasMore: offset + broadcasts.length < total,
    };
  }

  /**
   * Get broadcasts within a date range
   */
  static async getByDateRange(startDate: Date, endDate: Date): Promise<MyBroadcast[]> {
    const result = await query(
      `SELECT * FROM my_broadcasts
       WHERE started_at >= $1 AND started_at <= $2
       ORDER BY started_at DESC`,
      [startDate, endDate]
    );

    return result.rows as MyBroadcast[];
  }

  /**
   * Get the current active broadcast (no ended_at)
   */
  static async getCurrentBroadcast(): Promise<MyBroadcast | null> {
    const result = await query(
      `SELECT * FROM my_broadcasts
       WHERE ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1`
    );
    return result.rows[0] as MyBroadcast || null;
  }

  /**
   * Delete a broadcast
   */
  static async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM my_broadcasts WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length > 0) {
      logger.info('Broadcast deleted', { id });
      return true;
    }
    return false;
  }

  /**
   * Get summary statistics
   * Combines my_broadcasts with stream_sessions to match getAll behavior
   * Uses 10-minute buckets for deduplication (same as getAllWithCount)
   * Excludes zeros from averages for more accurate stats
   */
  static async getStats(days = 30, broadcaster = 'hudson_cage'): Promise<{
    totalBroadcasts: number;
    totalMinutes: number;
    avgDuration: number;
    totalTokens: number;
    avgViewers: number;
    peakViewers: number;
    totalFollowersGained: number;
  }> {
    // Use the same UNION logic as getAll to ensure consistent counts
    const result = await query(
      `WITH all_broadcasts AS (
        -- From my_broadcasts table
        SELECT
          id,
          started_at,
          duration_minutes,
          peak_viewers,
          total_tokens,
          followers_gained,
          source
        FROM my_broadcasts
        WHERE started_at >= NOW() - INTERVAL '1 day' * $1

        UNION ALL

        -- From stream_sessions table (sessions belonging to the broadcaster)
        SELECT
          id,
          started_at,
          CASE WHEN ended_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (ended_at - started_at)) / 60
            ELSE NULL
          END::integer as duration_minutes,
          0 as peak_viewers,
          0 as total_tokens,
          0 as followers_gained,
          'events_api' as source
        FROM stream_sessions
        WHERE LOWER(broadcaster) = LOWER($2)
          AND started_at >= NOW() - INTERVAL '1 day' * $1
      ),
      -- Group broadcasts within 10 minutes (same as getAllWithCount)
      with_bucket AS (
        SELECT *,
          FLOOR(EXTRACT(EPOCH FROM started_at) / 600) as time_bucket
        FROM all_broadcasts
      ),
      -- Deduplicate within each bucket, preferring manual entries
      deduped AS (
        SELECT DISTINCT ON (time_bucket)
          *
        FROM with_bucket
        ORDER BY time_bucket DESC, source = 'manual' DESC, started_at ASC
      )
      SELECT
        COUNT(*) as total_broadcasts,
        COALESCE(SUM(duration_minutes), 0) as total_minutes,
        COALESCE(AVG(duration_minutes), 0) as avg_duration,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        -- Exclude zeros from viewer average for more accurate stats
        COALESCE(AVG(NULLIF(peak_viewers, 0)), 0) as avg_viewers,
        COALESCE(MAX(peak_viewers), 0) as peak_viewers,
        COALESCE(SUM(followers_gained), 0) as total_followers_gained,
        -- Also count how many broadcasts have manual data for reference
        COUNT(*) FILTER (WHERE source = 'manual') as manual_count
      FROM deduped`,
      [days, broadcaster]
    );

    const stats = result.rows[0];
    return {
      totalBroadcasts: parseInt(stats.total_broadcasts || '0'),
      totalMinutes: parseInt(stats.total_minutes || '0'),
      avgDuration: parseFloat(stats.avg_duration || '0'),
      totalTokens: parseInt(stats.total_tokens || '0'),
      avgViewers: parseFloat(stats.avg_viewers || '0'),
      peakViewers: parseInt(stats.peak_viewers || '0'),
      totalFollowersGained: parseInt(stats.total_followers_gained || '0'),
    };
  }

  /**
   * Merge two broadcasts (combine stats, keep earlier start time)
   */
  static async mergeBroadcasts(id1: string, id2: string): Promise<MyBroadcast | null> {
    const [b1, b2] = await Promise.all([
      this.getById(id1),
      this.getById(id2),
    ]);

    if (!b1 || !b2) {
      return null;
    }

    // Determine which is earlier
    const earlier = b1.started_at < b2.started_at ? b1 : b2;
    const later = b1.started_at < b2.started_at ? b2 : b1;

    // Merge into the earlier one
    const merged = await this.update(earlier.id, {
      ended_at: later.ended_at || earlier.ended_at || undefined,
      duration_minutes: (earlier.duration_minutes || 0) + (later.duration_minutes || 0),
      peak_viewers: Math.max(earlier.peak_viewers, later.peak_viewers),
      total_tokens: earlier.total_tokens + later.total_tokens,
      followers_gained: earlier.followers_gained + later.followers_gained,
      notes: [earlier.notes, later.notes].filter(Boolean).join('\n\n---\n\n') || undefined,
      tags: [...new Set([...(earlier.tags || []), ...(later.tags || [])])],
    });

    // Delete the later one
    await this.delete(later.id);

    logger.info('Broadcasts merged', { kept: earlier.id, deleted: later.id });
    return merged;
  }
}

// Backwards compatibility - export HudsonBroadcastService as alias
export const HudsonBroadcastService = MyBroadcastService;

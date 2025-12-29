import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface HudsonBroadcast {
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

export class HudsonBroadcastService {
  /**
   * Create a new broadcast record
   */
  static async create(input: CreateBroadcastInput): Promise<HudsonBroadcast> {
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
      `INSERT INTO hudson_broadcasts (
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

    logger.info('Hudson broadcast created', {
      id: result.rows[0].id,
      started_at,
      auto_detected,
      source,
    });

    return result.rows[0] as HudsonBroadcast;
  }

  /**
   * Update an existing broadcast
   */
  static async update(id: string, input: UpdateBroadcastInput): Promise<HudsonBroadcast | null> {
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
      `UPDATE hudson_broadcasts SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    logger.info('Hudson broadcast updated', { id });
    return result.rows[0] as HudsonBroadcast;
  }

  /**
   * End a broadcast (set ended_at and calculate duration)
   */
  static async endBroadcast(id: string, stats?: { peak_viewers?: number; total_tokens?: number; followers_gained?: number }): Promise<HudsonBroadcast | null> {
    const broadcast = await this.getById(id);
    if (!broadcast) {
      return null;
    }

    const ended_at = new Date();
    const duration_minutes = Math.round((ended_at.getTime() - broadcast.started_at.getTime()) / (1000 * 60));

    const result = await query(
      `UPDATE hudson_broadcasts SET
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

    logger.info('Hudson broadcast ended', { id, duration_minutes });
    return result.rows[0] as HudsonBroadcast;
  }

  /**
   * Get a broadcast by ID
   */
  static async getById(id: string): Promise<HudsonBroadcast | null> {
    const result = await query(
      'SELECT * FROM hudson_broadcasts WHERE id = $1',
      [id]
    );
    return result.rows[0] as HudsonBroadcast || null;
  }

  /**
   * Get all broadcasts with pagination
   */
  static async getAll(options?: { limit?: number; offset?: number }): Promise<HudsonBroadcast[]> {
    const { limit = 50, offset = 0 } = options || {};

    const result = await query(
      `SELECT * FROM hudson_broadcasts
       ORDER BY started_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows as HudsonBroadcast[];
  }

  /**
   * Get broadcasts within a date range
   */
  static async getByDateRange(startDate: Date, endDate: Date): Promise<HudsonBroadcast[]> {
    const result = await query(
      `SELECT * FROM hudson_broadcasts
       WHERE started_at >= $1 AND started_at <= $2
       ORDER BY started_at DESC`,
      [startDate, endDate]
    );

    return result.rows as HudsonBroadcast[];
  }

  /**
   * Get the current active broadcast (no ended_at)
   */
  static async getCurrentBroadcast(): Promise<HudsonBroadcast | null> {
    const result = await query(
      `SELECT * FROM hudson_broadcasts
       WHERE ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1`
    );
    return result.rows[0] as HudsonBroadcast || null;
  }

  /**
   * Delete a broadcast
   */
  static async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM hudson_broadcasts WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length > 0) {
      logger.info('Hudson broadcast deleted', { id });
      return true;
    }
    return false;
  }

  /**
   * Get summary statistics
   */
  static async getStats(days = 30): Promise<{
    totalBroadcasts: number;
    totalMinutes: number;
    avgDuration: number;
    totalTokens: number;
    avgViewers: number;
    peakViewers: number;
    totalFollowersGained: number;
  }> {
    const result = await query(
      `SELECT
        COUNT(*) as total_broadcasts,
        COALESCE(SUM(duration_minutes), 0) as total_minutes,
        COALESCE(AVG(duration_minutes), 0) as avg_duration,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(peak_viewers), 0) as avg_viewers,
        COALESCE(MAX(peak_viewers), 0) as peak_viewers,
        COALESCE(SUM(followers_gained), 0) as total_followers_gained
       FROM hudson_broadcasts
       WHERE started_at >= NOW() - INTERVAL '1 day' * $1`,
      [days]
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
  static async mergeBroadcasts(id1: string, id2: string): Promise<HudsonBroadcast | null> {
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

    logger.info('Hudson broadcasts merged', { kept: earlier.id, deleted: later.id });
    return merged;
  }
}

import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface FollowerHistoryRecord {
  id: string;
  person_id: string;
  follower_count: number;
  previous_count: number | null;
  delta: number | null;
  recorded_at: Date;
  source: string;
}

export interface FollowerHistoryWithUsername extends FollowerHistoryRecord {
  username: string;
}

export interface FollowerGrowthStats {
  totalGrowth: number;
  averageDaily: number;
  maxGain: number;
  maxLoss: number;
  recordCount: number;
  firstCount: number | null;
  lastCount: number | null;
  periodDays: number;
}

export class FollowerHistoryService {
  /**
   * Record a follower count for a person
   * Automatically calculates delta from previous record
   */
  static async recordCount(
    personId: string,
    followerCount: number,
    source: string = 'affiliate_api'
  ): Promise<FollowerHistoryRecord | null> {
    try {
      // Get the most recent record to calculate delta
      const previousResult = await query(
        `SELECT follower_count FROM follower_count_history
         WHERE person_id = $1
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [personId]
      );

      const previousCount = previousResult.rows[0]?.follower_count ?? null;
      const delta = previousCount !== null ? followerCount - previousCount : null;

      // Only record if there's a change or no previous record
      if (previousCount !== null && delta === 0) {
        return null; // No change, skip recording
      }

      const result = await query(
        `INSERT INTO follower_count_history (person_id, follower_count, previous_count, delta, source)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (person_id, recorded_at) DO UPDATE
         SET follower_count = EXCLUDED.follower_count,
             previous_count = EXCLUDED.previous_count,
             delta = EXCLUDED.delta
         RETURNING *`,
        [personId, followerCount, previousCount, delta, source]
      );

      if (result.rows.length > 0) {
        logger.debug('Recorded follower count', {
          personId,
          followerCount,
          delta,
          source,
        });
        return result.rows[0] as FollowerHistoryRecord;
      }

      return null;
    } catch (error) {
      logger.error('Error recording follower count', { personId, followerCount, error });
      return null;
    }
  }

  /**
   * Get follower history for a person
   */
  static async getHistory(
    personId: string,
    days: number = 30,
    limit: number = 100
  ): Promise<FollowerHistoryRecord[]> {
    const result = await query(
      `SELECT * FROM follower_count_history
       WHERE person_id = $1
         AND recorded_at > NOW() - INTERVAL '1 day' * $2
       ORDER BY recorded_at DESC
       LIMIT $3`,
      [personId, days, limit]
    );

    return result.rows as FollowerHistoryRecord[];
  }

  /**
   * Get follower growth statistics for a person
   */
  static async getGrowthStats(personId: string, days: number = 30): Promise<FollowerGrowthStats> {
    const result = await query(
      `SELECT
         SUM(delta) as total_growth,
         MAX(delta) as max_gain,
         MIN(delta) as max_loss,
         COUNT(*) as record_count,
         MIN(follower_count) as min_count,
         MAX(follower_count) as max_count
       FROM follower_count_history
       WHERE person_id = $1
         AND recorded_at > NOW() - INTERVAL '1 day' * $2
         AND delta IS NOT NULL`,
      [personId, days]
    );

    // Get first and last counts
    const boundsResult = await query(
      `SELECT
         (SELECT follower_count FROM follower_count_history
          WHERE person_id = $1 AND recorded_at > NOW() - INTERVAL '1 day' * $2
          ORDER BY recorded_at ASC LIMIT 1) as first_count,
         (SELECT follower_count FROM follower_count_history
          WHERE person_id = $1 AND recorded_at > NOW() - INTERVAL '1 day' * $2
          ORDER BY recorded_at DESC LIMIT 1) as last_count`,
      [personId, days]
    );

    const stats = result.rows[0];
    const bounds = boundsResult.rows[0];

    const totalGrowth = parseInt(stats?.total_growth || '0');
    const recordCount = parseInt(stats?.record_count || '0');

    return {
      totalGrowth,
      averageDaily: days > 0 ? totalGrowth / days : 0,
      maxGain: parseInt(stats?.max_gain || '0'),
      maxLoss: parseInt(stats?.max_loss || '0'),
      recordCount,
      firstCount: bounds?.first_count ? parseInt(bounds.first_count) : null,
      lastCount: bounds?.last_count ? parseInt(bounds.last_count) : null,
      periodDays: days,
    };
  }

  /**
   * Get top movers (biggest gains or losses) across all models
   */
  static async getTopMovers(
    days: number = 7,
    limit: number = 10,
    direction: 'gainers' | 'losers' = 'gainers'
  ): Promise<Array<{ username: string; person_id: string; total_change: number; current_count: number }>> {
    const orderDirection = direction === 'gainers' ? 'DESC' : 'ASC';
    const filterCondition = direction === 'gainers' ? '> 0' : '< 0';

    const result = await query(
      `WITH period_changes AS (
         SELECT
           fh.person_id,
           SUM(fh.delta) as total_change,
           (SELECT follower_count FROM follower_count_history
            WHERE person_id = fh.person_id
            ORDER BY recorded_at DESC LIMIT 1) as current_count
         FROM follower_count_history fh
         WHERE fh.recorded_at > NOW() - INTERVAL '1 day' * $1
           AND fh.delta IS NOT NULL
         GROUP BY fh.person_id
         HAVING SUM(fh.delta) ${filterCondition}
       )
       SELECT
         p.username,
         pc.person_id,
         pc.total_change,
         pc.current_count
       FROM period_changes pc
       JOIN persons p ON p.id = pc.person_id
       ORDER BY pc.total_change ${orderDirection}
       LIMIT $2`,
      [days, limit]
    );

    return result.rows as Array<{ username: string; person_id: string; total_change: number; current_count: number }>;
  }

  /**
   * Get recent significant changes (models with notable follower changes)
   */
  static async getRecentChanges(
    minDelta: number = 100,
    limit: number = 20
  ): Promise<FollowerHistoryWithUsername[]> {
    const result = await query(
      `SELECT fh.*, p.username
       FROM follower_count_history fh
       JOIN persons p ON p.id = fh.person_id
       WHERE ABS(fh.delta) >= $1
       ORDER BY fh.recorded_at DESC
       LIMIT $2`,
      [minDelta, limit]
    );

    return result.rows as FollowerHistoryWithUsername[];
  }

  /**
   * Batch record follower counts for multiple persons
   * Used by polling jobs for efficiency
   */
  static async recordBatch(
    records: Array<{ personId: string; followerCount: number; source?: string }>
  ): Promise<{ recorded: number; skipped: number }> {
    let recorded = 0;
    let skipped = 0;

    for (const record of records) {
      const result = await this.recordCount(
        record.personId,
        record.followerCount,
        record.source || 'affiliate_api'
      );

      if (result) {
        recorded++;
      } else {
        skipped++;
      }
    }

    return { recorded, skipped };
  }

  /**
   * Get follower count time series for charting
   */
  static async getTimeSeries(
    personId: string,
    days: number = 30
  ): Promise<Array<{ date: string; count: number; delta: number | null }>> {
    const result = await query(
      `SELECT
         DATE(recorded_at) as date,
         MAX(follower_count) as count,
         SUM(delta) as delta
       FROM follower_count_history
       WHERE person_id = $1
         AND recorded_at > NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(recorded_at)
       ORDER BY date ASC`,
      [personId, days]
    );

    return result.rows.map((row) => ({
      date: row.date,
      count: parseInt(row.count),
      delta: row.delta ? parseInt(row.delta) : null,
    }));
  }

  /**
   * Get dashboard summary of follower changes
   * @param days Number of days to look back (supports 7, 14, 30, 60, 180, 365)
   * @param limit Number of results for top movers (default 10)
   */
  static async getDashboardSummary(
    days: number = 7,
    limit: number = 10
  ): Promise<{
    topGainers: Array<{ username: string; person_id: string; total_change: number; current_count: number }>;
    topLosers: Array<{ username: string; person_id: string; total_change: number; current_count: number }>;
    recentChanges: FollowerHistoryWithUsername[];
    totalTracked: number;
    totalWithChanges: number;
  }> {
    const [topGainers, topLosers, recentChanges, statsResult] = await Promise.all([
      this.getTopMovers(days, limit, 'gainers'),
      this.getTopMovers(days, limit, 'losers'),
      this.getRecentChanges(50, 20),
      query(
        `SELECT
           COUNT(DISTINCT person_id) as total_tracked,
           COUNT(DISTINCT person_id) FILTER (WHERE delta != 0) as with_changes
         FROM follower_count_history
         WHERE recorded_at > NOW() - INTERVAL '1 day' * $1`,
        [days]
      ),
    ]);

    return {
      topGainers,
      topLosers,
      recentChanges,
      totalTracked: parseInt(statsResult.rows[0]?.total_tracked || '0'),
      totalWithChanges: parseInt(statsResult.rows[0]?.with_changes || '0'),
    };
  }

  /**
   * Get recent changes with pagination and sorting
   * @param minDelta Minimum absolute delta to include
   * @param limit Number of results per page
   * @param offset Pagination offset
   * @param sortBy Sort column: 'date' or 'change'
   * @param sortOrder Sort direction: 'asc' or 'desc'
   */
  static async getRecentChangesPaginated(
    minDelta: number = 100,
    limit: number = 20,
    offset: number = 0,
    sortBy: 'date' | 'change' = 'date',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<{ changes: FollowerHistoryWithUsername[]; total: number }> {
    const orderColumn = sortBy === 'change' ? 'ABS(fh.delta)' : 'fh.recorded_at';
    const order = sortOrder.toUpperCase();

    const [changesResult, countResult] = await Promise.all([
      query(
        `SELECT fh.*, p.username
         FROM follower_count_history fh
         JOIN persons p ON p.id = fh.person_id
         WHERE ABS(fh.delta) >= $1
         ORDER BY ${orderColumn} ${order}
         LIMIT $2 OFFSET $3`,
        [minDelta, limit, offset]
      ),
      query(
        `SELECT COUNT(*) as total
         FROM follower_count_history fh
         WHERE ABS(fh.delta) >= $1`,
        [minDelta]
      ),
    ]);

    return {
      changes: changesResult.rows as FollowerHistoryWithUsername[],
      total: parseInt(countResult.rows[0]?.total || '0'),
    };
  }
}

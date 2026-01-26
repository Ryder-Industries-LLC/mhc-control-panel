/**
 * Stats Collection Service
 *
 * Collects comprehensive system statistics for historical tracking.
 * Stats are stored as JSONB in the system_stats_history table.
 */

import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

/**
 * Structure of collected stats snapshot
 */
export interface SystemStatsSnapshot {
  user_segments: {
    total_people: number;
    total_live_now: number;
    total_with_media: number;
    total_bans: number;
    following: number;
    followers: number;
    active_subs: number;
    active_doms: number;
    friends: number;
    watchlist: number;
    bans: number;
    ratings: {
      five_star: number;
      four_star: number;
      three_star: number;
      two_star: number;
      one_star: number;
      unrated: number;
    };
  };
  database: {
    size_bytes: number;
    total_persons: number;
    viewers_count: number;
    models_count: number;
  };
  media: {
    total_images: number;
    total_image_size_bytes: number;
    images_by_type: Record<string, { count: number; size_bytes: number }>;
    total_videos: number;
    total_video_size_bytes: number;
    users_with_media: number;
    users_with_video: number;
  };
  snapshots_by_source: Record<string, number>;
  activity: {
    snapshots_1h: number;
    snapshots_24h: number;
  };
  queue: {
    priority1_pending: number;
    priority2_active: number;
    failed_24h: number;
  };
}

export interface StatsHistoryRecord {
  id: number;
  recorded_at: string;
  stats: SystemStatsSnapshot;
  collection_duration_ms: number;
  created_at: string;
}

export class StatsCollectionService {
  /**
   * Collect all system stats and return as a structured object
   */
  static async collectStats(): Promise<SystemStatsSnapshot> {
    // Run all queries in parallel for performance
    const [
      databaseStats,
      personCounts,
      roleCounts,
      sourceCounts,
      segmentStats,
      ratingStats,
      recentActivity,
      mediaStats,
      mediaByType,
      queueStats,
      liveNowCount,
    ] = await Promise.all([
      // Database size
      query(`SELECT pg_database_size(current_database()) as db_size`),

      // Total persons count
      query(`SELECT COUNT(*) as total FROM persons`),

      // Persons by role
      query(`
        SELECT role, COUNT(*) as count
        FROM persons
        GROUP BY role
      `),

      // Snapshots by source
      query(`
        SELECT source, COUNT(*) as count
        FROM statbate_api_polling
        GROUP BY source
      `),

      // User segment counts
      query(`
        SELECT
          COUNT(*) FILTER (WHERE following = true) as following_count,
          COUNT(*) FILTER (WHERE follower = true) as follower_count,
          COUNT(*) FILTER (WHERE active_sub = true) as subs_count,
          (SELECT COUNT(*) FROM attribute_lookup WHERE attribute_key = 'banned_me' AND value = true) as banned_count,
          COUNT(*) FILTER (WHERE friend_tier IS NOT NULL) as friends_count,
          (SELECT COUNT(*) FROM attribute_lookup WHERE attribute_key = 'watch_list' AND value = true) as watchlist_count,
          (SELECT COUNT(DISTINCT profile_id) FROM service_relationships WHERE service_role = 'dom' AND service_level = 'Actively Serving') as active_doms_count
        FROM profiles
      `),

      // Ratings breakdown
      query(`
        SELECT
          COUNT(*) FILTER (WHERE rating = 5) as five_star,
          COUNT(*) FILTER (WHERE rating = 4) as four_star,
          COUNT(*) FILTER (WHERE rating = 3) as three_star,
          COUNT(*) FILTER (WHERE rating = 2) as two_star,
          COUNT(*) FILTER (WHERE rating = 1) as one_star,
          COUNT(*) FILTER (WHERE rating IS NULL) as unrated
        FROM profiles
      `),

      // Recent activity stats (last 24h and 1h)
      query(`
        SELECT
          COUNT(*) FILTER (WHERE captured_at > NOW() - INTERVAL '24 hours') as snapshots_24h,
          COUNT(*) FILTER (WHERE captured_at > NOW() - INTERVAL '1 hour') as snapshots_1h
        FROM statbate_api_polling
      `),

      // Media stats (images and videos) - uses media_locator (renamed from profile_images in migration 086)
      query(`
        SELECT
          COUNT(*) FILTER (WHERE media_type = 'image' OR media_type IS NULL) as image_count,
          COALESCE(SUM(file_size) FILTER (WHERE media_type = 'image' OR media_type IS NULL), 0) as image_total_size,
          COUNT(*) FILTER (WHERE media_type = 'video') as video_count,
          COALESCE(SUM(file_size) FILTER (WHERE media_type = 'video'), 0) as video_total_size,
          COUNT(DISTINCT person_id) as users_with_media,
          COUNT(DISTINCT person_id) FILTER (WHERE media_type = 'video') as users_with_video
        FROM media_locator
        WHERE file_size IS NOT NULL AND deleted_at IS NULL
      `),

      // Images by type breakdown - uses media_locator
      query(`
        SELECT
          COALESCE(source, 'unknown') as source_type,
          COUNT(*) as count,
          COALESCE(SUM(file_size), 0) as size_bytes
        FROM media_locator
        WHERE file_size IS NOT NULL AND deleted_at IS NULL AND (media_type = 'image' OR media_type IS NULL)
        GROUP BY source
      `),

      // Priority lookup queue stats - table may not exist, gracefully handle
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending' AND priority_level = 1) as priority1_pending,
          COUNT(*) FILTER (WHERE status = 'active' AND priority_level = 2) as priority2_active,
          COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours') as completed_24h
        FROM priority_lookups
      `).catch(() => ({ rows: [{ priority1_pending: 0, priority2_active: 0, completed_24h: 0 }] })),

      // Live now count (from cbhours_live_stats) - room_status column instead of is_online
      query(`
        SELECT COUNT(DISTINCT person_id) as live_count
        FROM cbhours_live_stats
        WHERE room_status = 'Online' AND checked_at > NOW() - INTERVAL '1 hour'
      `).catch(() => ({ rows: [{ live_count: 0 }] })),
    ]);

    // Build role counts
    const byRole: Record<string, number> = {};
    for (const row of roleCounts.rows) {
      byRole[row.role] = parseInt(row.count);
    }

    // Build source counts
    const bySource: Record<string, number> = {};
    for (const row of sourceCounts.rows) {
      bySource[row.source] = parseInt(row.count);
    }

    // Build images by type
    const imagesByType: Record<string, { count: number; size_bytes: number }> = {};
    for (const row of mediaByType.rows) {
      imagesByType[row.source_type] = {
        count: parseInt(row.count),
        size_bytes: parseInt(row.size_bytes),
      };
    }

    const stats: SystemStatsSnapshot = {
      user_segments: {
        total_people: parseInt(personCounts.rows[0]?.total || '0'),
        total_live_now: parseInt(liveNowCount.rows[0]?.live_count || '0'),
        total_with_media: parseInt(mediaStats.rows[0]?.users_with_media || '0'),
        total_bans: parseInt(segmentStats.rows[0]?.banned_count || '0'),
        following: parseInt(segmentStats.rows[0]?.following_count || '0'),
        followers: parseInt(segmentStats.rows[0]?.follower_count || '0'),
        active_subs: parseInt(segmentStats.rows[0]?.subs_count || '0'),
        active_doms: parseInt(segmentStats.rows[0]?.active_doms_count || '0'),
        friends: parseInt(segmentStats.rows[0]?.friends_count || '0'),
        watchlist: parseInt(segmentStats.rows[0]?.watchlist_count || '0'),
        bans: parseInt(segmentStats.rows[0]?.banned_count || '0'),
        ratings: {
          five_star: parseInt(ratingStats.rows[0]?.five_star || '0'),
          four_star: parseInt(ratingStats.rows[0]?.four_star || '0'),
          three_star: parseInt(ratingStats.rows[0]?.three_star || '0'),
          two_star: parseInt(ratingStats.rows[0]?.two_star || '0'),
          one_star: parseInt(ratingStats.rows[0]?.one_star || '0'),
          unrated: parseInt(ratingStats.rows[0]?.unrated || '0'),
        },
      },
      database: {
        size_bytes: parseInt(databaseStats.rows[0]?.db_size || '0'),
        total_persons: parseInt(personCounts.rows[0]?.total || '0'),
        viewers_count: byRole['VIEWER'] || 0,
        models_count: byRole['MODEL'] || 0,
      },
      media: {
        total_images: parseInt(mediaStats.rows[0]?.image_count || '0'),
        total_image_size_bytes: parseInt(mediaStats.rows[0]?.image_total_size || '0'),
        images_by_type: imagesByType,
        total_videos: parseInt(mediaStats.rows[0]?.video_count || '0'),
        total_video_size_bytes: parseInt(mediaStats.rows[0]?.video_total_size || '0'),
        users_with_media: parseInt(mediaStats.rows[0]?.users_with_media || '0'),
        users_with_video: parseInt(mediaStats.rows[0]?.users_with_video || '0'),
      },
      snapshots_by_source: bySource,
      activity: {
        snapshots_1h: parseInt(recentActivity.rows[0]?.snapshots_1h || '0'),
        snapshots_24h: parseInt(recentActivity.rows[0]?.snapshots_24h || '0'),
      },
      queue: {
        priority1_pending: parseInt(queueStats.rows[0]?.priority1_pending || '0'),
        priority2_active: parseInt(queueStats.rows[0]?.priority2_active || '0'),
        failed_24h: parseInt(queueStats.rows[0]?.failed_24h || '0'),
      },
    };

    return stats;
  }

  /**
   * Save a stats snapshot to the database
   */
  static async saveSnapshot(stats: SystemStatsSnapshot, durationMs: number): Promise<number> {
    const result = await query(
      `INSERT INTO system_stats_history (stats, collection_duration_ms)
       VALUES ($1, $2)
       RETURNING id`,
      [JSON.stringify(stats), durationMs]
    );
    return result.rows[0].id;
  }

  /**
   * Get stats history with optional date filtering
   */
  static async getHistory(options: {
    start?: Date;
    end?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ records: StatsHistoryRecord[]; total: number }> {
    const { start, end, limit = 100, offset = 0 } = options;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (start) {
      whereClause += ` AND recorded_at >= $${paramIndex++}`;
      params.push(start);
    }
    if (end) {
      whereClause += ` AND recorded_at <= $${paramIndex++}`;
      params.push(end);
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM system_stats_history ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get records
    const recordsResult = await query(
      `SELECT id, recorded_at, stats, collection_duration_ms, created_at
       FROM system_stats_history
       ${whereClause}
       ORDER BY recorded_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return {
      records: recordsResult.rows.map(row => ({
        id: row.id,
        recorded_at: row.recorded_at.toISOString(),
        stats: row.stats,
        collection_duration_ms: row.collection_duration_ms,
        created_at: row.created_at.toISOString(),
      })),
      total,
    };
  }

  /**
   * Get the latest stats snapshot
   */
  static async getLatest(): Promise<StatsHistoryRecord | null> {
    const result = await query(
      `SELECT id, recorded_at, stats, collection_duration_ms, created_at
       FROM system_stats_history
       ORDER BY recorded_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      recorded_at: row.recorded_at.toISOString(),
      stats: row.stats,
      collection_duration_ms: row.collection_duration_ms,
      created_at: row.created_at.toISOString(),
    };
  }

  /**
   * Calculate growth projection for a specific stat path
   */
  static async calculateGrowthProjection(options: {
    statPath: string;
    periodDays: number;
    projectToDays: number;
  }): Promise<{
    currentValue: number;
    averageGrowthPerDay: number;
    projectedValue: number;
    dataPoints: number;
  }> {
    const { statPath, periodDays, projectToDays } = options;

    // Get historical data for the period
    const result = await query(
      `SELECT
         recorded_at,
         stats #>> $1 as value
       FROM system_stats_history
       WHERE recorded_at >= NOW() - INTERVAL '1 day' * $2
       ORDER BY recorded_at ASC`,
      [`{${statPath.replace(/\./g, ',')}}`, periodDays]
    );

    if (result.rows.length < 2) {
      return {
        currentValue: 0,
        averageGrowthPerDay: 0,
        projectedValue: 0,
        dataPoints: result.rows.length,
      };
    }

    // Parse values
    const dataPoints = result.rows.map(row => ({
      timestamp: new Date(row.recorded_at).getTime(),
      value: parseFloat(row.value) || 0,
    }));

    // Calculate linear regression
    const n = dataPoints.length;
    const sumX = dataPoints.reduce((sum, p) => sum + p.timestamp, 0);
    const sumY = dataPoints.reduce((sum, p) => sum + p.value, 0);
    const sumXY = dataPoints.reduce((sum, p) => sum + p.timestamp * p.value, 0);
    const sumX2 = dataPoints.reduce((sum, p) => sum + p.timestamp * p.timestamp, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Current value (latest)
    const currentValue = dataPoints[dataPoints.length - 1].value;

    // Growth per day (slope is per ms, convert to per day)
    const msPerDay = 24 * 60 * 60 * 1000;
    const averageGrowthPerDay = slope * msPerDay;

    // Projected value
    const futureTimestamp = Date.now() + projectToDays * msPerDay;
    const projectedValue = slope * futureTimestamp + intercept;

    return {
      currentValue,
      averageGrowthPerDay,
      projectedValue: Math.max(0, projectedValue), // Don't allow negative projections
      dataPoints: n,
    };
  }

  /**
   * Get time-series data for a specific stat path (for charting)
   */
  static async getTimeSeries(options: {
    statPath: string;
    start?: Date;
    end?: Date;
    aggregation?: 'hourly' | 'daily';
  }): Promise<Array<{ timestamp: string; value: number }>> {
    const { statPath, start, end, aggregation = 'hourly' } = options;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [`{${statPath.replace(/\./g, ',')}}`];
    let paramIndex = 2;

    if (start) {
      whereClause += ` AND recorded_at >= $${paramIndex++}`;
      params.push(start);
    }
    if (end) {
      whereClause += ` AND recorded_at <= $${paramIndex++}`;
      params.push(end);
    }

    let groupBy = '';
    let selectTime = 'recorded_at';

    if (aggregation === 'daily') {
      selectTime = "date_trunc('day', recorded_at)";
      groupBy = `GROUP BY date_trunc('day', recorded_at)`;
    }

    const queryStr = aggregation === 'daily'
      ? `SELECT ${selectTime} as timestamp, AVG((stats #>> $1)::numeric) as value
         FROM system_stats_history
         ${whereClause}
         ${groupBy}
         ORDER BY timestamp ASC`
      : `SELECT recorded_at as timestamp, (stats #>> $1)::numeric as value
         FROM system_stats_history
         ${whereClause}
         ORDER BY recorded_at ASC`;

    const result = await query(queryStr, params);

    return result.rows.map(row => ({
      timestamp: new Date(row.timestamp).toISOString(),
      value: parseFloat(row.value) || 0,
    }));
  }
}

import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import { cbhoursClient, CBHoursLiveModel, CBHoursActivitySegment } from '../api/cbhours/cbhours-client.js';
import { PersonService } from './person.service.js';
import { FollowerHistoryService } from './follower-history.service.js';


export class CBHoursStatsService {
  /**
   * Record live stats for a model from CBHours API
   */
  static async recordLiveStats(username: string, stats: CBHoursLiveModel): Promise<void> {
    try {
      // Find or create person
      const person = await PersonService.findOrCreate({
        username: username.toLowerCase(),
        role: 'MODEL',
      });

      const sql = `
        INSERT INTO cbhours_live_stats (
          person_id, checked_at,
          room_status, gender, is_new,
          rank, grank,
          viewers, followers,
          current_show, room_subject, tags
        ) VALUES (
          $1, NOW(),
          $2, $3, $4,
          $5, $6,
          $7, $8,
          $9, $10, $11
        )
        ON CONFLICT (person_id, checked_at) DO UPDATE SET
          room_status = EXCLUDED.room_status,
          gender = EXCLUDED.gender,
          is_new = EXCLUDED.is_new,
          rank = EXCLUDED.rank,
          grank = EXCLUDED.grank,
          viewers = EXCLUDED.viewers,
          followers = EXCLUDED.followers,
          current_show = EXCLUDED.current_show,
          room_subject = EXCLUDED.room_subject,
          tags = EXCLUDED.tags
      `;

      await query(sql, [
        person.id,
        stats.room_status,
        stats.gender || null,
        stats.is_new || false,
        stats.rank || null,
        stats.grank || null,
        stats.viewers || null,
        stats.followers || null,
        stats.current_show || null,
        stats.room_subject || null,
        stats.tags || null,
      ]);

      // Update profile metadata
      await query(
        `INSERT INTO profiles (person_id, cbhours_last_updated, has_cbhours_trophy)
         VALUES ($1, NOW(), TRUE)
         ON CONFLICT (person_id) DO UPDATE SET
           cbhours_last_updated = NOW(),
           has_cbhours_trophy = TRUE`,
        [person.id]
      );

      // Record follower count history for trend tracking
      if (stats.followers && stats.followers > 0) {
        await FollowerHistoryService.recordCount(person.id, stats.followers, 'cbhours');
      }

      logger.debug('CBHours live stats recorded', {
        username,
        status: stats.room_status,
        rank: stats.rank,
        followers: stats.followers,
      });
    } catch (error) {
      logger.error('Error recording CBHours live stats', { error, username });
      throw error;
    }
  }

  /**
   * Record activity segment from CBHours API
   */
  static async recordActivitySegment(
    username: string,
    timestamp: string,
    segment: CBHoursActivitySegment
  ): Promise<void> {
    try {
      const person = await PersonService.findOrCreate({
        username: username.toLowerCase(),
        role: 'MODEL',
      });

      const sql = `
        INSERT INTO cbhours_activity (
          person_id, timestamp,
          show_type, rank, grank,
          followers, viewers, gender
        ) VALUES (
          $1, $2,
          $3, $4, $5,
          $6, $7, $8
        )
        ON CONFLICT (person_id, timestamp) DO UPDATE SET
          show_type = EXCLUDED.show_type,
          rank = EXCLUDED.rank,
          grank = EXCLUDED.grank,
          followers = EXCLUDED.followers,
          viewers = EXCLUDED.viewers,
          gender = EXCLUDED.gender
      `;

      await query(sql, [
        person.id,
        timestamp,
        segment.type,
        parseInt(segment.rank, 10) || null,
        parseInt(segment.grank, 10) || null,
        parseInt(segment.followers, 10) || null,
        parseInt(segment.viewers, 10) || null,
        segment.gender,
      ]);
    } catch (error) {
      logger.error('Error recording CBHours activity segment', { error, username, timestamp });
      throw error;
    }
  }

  /**
   * Fetch and store live stats for multiple models
   */
  static async fetchAndStoreLiveStats(usernames: string[]): Promise<{
    success: number;
    failed: number;
    online: number;
  }> {
    if (usernames.length === 0) {
      return { success: 0, failed: 0, online: 0 };
    }

    try {
      const stats = await cbhoursClient.getLiveStatsBatch(usernames);

      let success = 0;
      let failed = 0;
      let online = 0;

      for (const [username, modelStats] of Object.entries(stats)) {
        try {
          await this.recordLiveStats(username, modelStats);
          success++;
          if (modelStats.room_status === 'Online') {
            online++;
          }
        } catch (error) {
          logger.error('Error storing live stats for model', { username, error });
          failed++;
        }
      }

      logger.info('CBHours live stats batch complete', {
        total: usernames.length,
        success,
        failed,
        online,
      });

      return { success, failed, online };
    } catch (error) {
      logger.error('Error fetching CBHours live stats batch', { error });
      throw error;
    }
  }

  /**
   * Fetch and store activity history for a model
   */
  static async fetchAndStoreActivity(
    username: string,
    startDate: string,
    endDate: string
  ): Promise<{ segments: number; totalMinutes: number }> {
    try {
      const activity = await cbhoursClient.getActivity(username, startDate, endDate, true);

      if (!activity.details) {
        return { segments: 0, totalMinutes: 0 };
      }

      let segmentCount = 0;

      for (const [_date, segments] of Object.entries(activity.details)) {
        for (const segment of segments) {
          await this.recordActivitySegment(username, segment.timestamp, segment);
          segmentCount++;
        }
      }

      const totalMinutes = (activity.total_time?.hours || 0) * 60 + (activity.total_time?.minutes || 0);

      logger.info('CBHours activity history stored', {
        username,
        segments: segmentCount,
        totalMinutes,
        days: Object.keys(activity.activity || {}).length,
      });

      return { segments: segmentCount, totalMinutes };
    } catch (error: any) {
      if (error.message?.includes('trophy database')) {
        logger.debug('Model not in CBHours trophy database', { username });
        // Mark profile as not having trophy
        const person = await PersonService.findByUsername(username);
        if (person) {
          await query(
            `INSERT INTO profiles (person_id, has_cbhours_trophy)
             VALUES ($1, FALSE)
             ON CONFLICT (person_id) DO UPDATE SET has_cbhours_trophy = FALSE`,
            [person.id]
          );
        }
        return { segments: 0, totalMinutes: 0 };
      }

      logger.error('Error fetching CBHours activity', { error, username });
      throw error;
    }
  }

  /**
   * Get latest CBHours stats for a person
   */
  static async getLatestStats(personId: string): Promise<any | null> {
    const result = await query(
      `SELECT * FROM cbhours_live_stats
       WHERE person_id = $1
       ORDER BY checked_at DESC
       LIMIT 1`,
      [personId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get CBHours activity for a person in date range
   */
  static async getActivity(
    personId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    const result = await query(
      `SELECT * FROM cbhours_activity
       WHERE person_id = $1
         AND timestamp BETWEEN $2 AND $3
       ORDER BY timestamp ASC`,
      [personId, startDate, endDate]
    );

    return result.rows;
  }

  /**
   * Get follower count history for analytics
   */
  static async getFollowerHistory(
    personId: string,
    days = 30
  ): Promise<Array<{ timestamp: Date; followers: number }>> {
    const result = await query(
      `SELECT checked_at as timestamp, followers
       FROM cbhours_live_stats
       WHERE person_id = $1
         AND followers IS NOT NULL
         AND checked_at >= NOW() - INTERVAL '${days} days'
       ORDER BY checked_at ASC`,
      [personId]
    );

    return result.rows as Array<{ timestamp: Date; followers: number }>;
  }

  /**
   * Get rank history for analytics
   */
  static async getRankHistory(
    personId: string,
    days = 7
  ): Promise<Array<{ timestamp: Date; rank: number; grank: number }>> {
    const result = await query(
      `SELECT checked_at as timestamp, rank, grank
       FROM cbhours_live_stats
       WHERE person_id = $1
         AND rank IS NOT NULL
         AND checked_at >= NOW() - INTERVAL '${days} days'
       ORDER BY checked_at ASC`,
      [personId]
    );

    return result.rows as Array<{ timestamp: Date; rank: number; grank: number }>;
  }
}

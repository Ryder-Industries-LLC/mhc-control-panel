import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import type { OnlineRoom } from '../api/chaturbate/affiliate-client.js';
import { storageService } from './storage/storage.service.js';
import { MediaService } from './media.service.js';
import axios from 'axios';
import crypto from 'crypto';

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
  image_url_360x270: string;  // Original CB API field name
  legacy_image_url: string | null;
  deprecated_image_path: string | null;  // DEPRECATED: Path now lives in media_locator
  legacy_image_path: string | null;
  media_locator_id: string | null;  // FK to media_locator
  created_at: Date;
}

export class BroadcastSessionService {
  // Chaturbate placeholder image patterns and size
  private static readonly PLACEHOLDER_PATTERNS = ['no_image', 'noimage', 'placeholder', 'default_avatar'];
  private static readonly PLACEHOLDER_SIZE = 5045;
  private static readonly PLACEHOLDER_SIZE_TOLERANCE = 100;

  /**
   * Check if a URL points to a known placeholder image
   */
  private static isPlaceholderUrl(imageUrl: string): boolean {
    const lowerUrl = imageUrl.toLowerCase();
    return this.PLACEHOLDER_PATTERNS.some(pattern => lowerUrl.includes(pattern));
  }

  /**
   * Check if image data is a placeholder based on file size
   */
  private static isPlaceholderBySize(data: Buffer): boolean {
    return Math.abs(data.length - this.PLACEHOLDER_SIZE) <= this.PLACEHOLDER_SIZE_TOLERANCE;
  }

  /**
   * Download an image and save using MediaService.
   * Creates a media_locator record and returns both path and media_locator_id.
   */
  private static async downloadAndSaveImage(
    imageUrl: string,
    username: string,
    personId: string,
    _type: 'thumbnail' | 'full'
  ): Promise<{ path: string; mediaLocatorId: string } | null> {
    try {
      // Use MediaService to download and save - it handles:
      // - Placeholder URL detection
      // - Duplicate source URL check
      // - Placeholder size detection
      // - Storage write
      // - media_locator record creation
      const mediaRecord = await MediaService.downloadAndSaveMedia({
        url: imageUrl,
        username,
        personId,
        source: 'affiliate_api',
        mimeType: 'image/jpeg',
      });

      if (!mediaRecord) {
        return null;
      }

      return {
        path: mediaRecord.file_path,
        mediaLocatorId: mediaRecord.id,
      };
    } catch (error: any) {
      const errorInfo = error?.response?.status
        ? `HTTP ${error.response.status}`
        : error?.code || error?.message || 'Unknown error';
      logger.error('Failed to download affiliate image', { error: errorInfo, username, imageUrl });
      return null;
    }
  }

  /**
   * Record a broadcast session snapshot from Affiliate API
   *
   * This method intelligently handles session continuity:
   * - If a session with the same session_start exists (within 10 min tolerance), update it
   * - Otherwise, create a new session record
   */
  static async recordSession(personId: string, roomData: OnlineRoom): Promise<BroadcastSession> {
    // Calculate session start time from seconds_online
    const sessionStart = new Date(Date.now() - roomData.seconds_online * 1000);

    // Check if there's an existing session for this broadcast
    // We use a 10-minute tolerance to account for slight timing variations
    // Cast $2 to timestamptz to ensure proper interval arithmetic
    const existingSessionSql = `
      SELECT id, session_start FROM affiliate_api_polling
      WHERE person_id = $1
        AND session_start BETWEEN ($2::timestamptz - INTERVAL '10 minutes') AND ($2::timestamptz + INTERVAL '10 minutes')
      ORDER BY observed_at DESC
      LIMIT 1
    `;

    const existingResult = await query(existingSessionSql, [personId, sessionStart]);
    const existingSession = existingResult.rows[0];

    // Download image and create media_locator record
    const imageResult = await this.downloadAndSaveImage(roomData.image_url, roomData.username, personId, 'thumbnail');

    // Extract path and media_locator_id from result
    const imagePath = imageResult?.path ?? null;
    const mediaLocatorId = imageResult?.mediaLocatorId ?? null;

    // If we got a valid new image, use it; otherwise keep existing
    const shouldClearOldImage = imagePath !== null;

    let result;

    if (existingSession) {
      // Update the existing session with latest data
      // Note: After migration 086:
      // - image_url_360x270 = CB API field name
      // - deprecated_image_path = path (now lives in media_locator)
      // - media_locator_id = FK to media_locator
      const updateSql = `
        UPDATE affiliate_api_polling SET
          observed_at = NOW(),
          seconds_online = $2,
          current_show = $3,
          room_subject = $4,
          tags = $5,
          num_users = $6,
          num_followers = $7,
          is_hd = $8,
          image_url_360x270 = $9,
          deprecated_image_path = CASE WHEN $12 THEN $10 ELSE COALESCE($10, deprecated_image_path) END,
          media_locator_id = CASE WHEN $12 THEN $11 ELSE COALESCE($11, media_locator_id) END
        WHERE id = $1
        RETURNING *
      `;

      const updateValues = [
        existingSession.id,
        roomData.seconds_online,
        roomData.current_show,
        roomData.room_subject,
        roomData.tags,
        roomData.num_users,
        roomData.num_followers,
        roomData.is_hd,
        roomData.image_url,           // $9 - image_url_360x270
        imagePath,                     // $10 - deprecated_image_path
        mediaLocatorId,                // $11 - media_locator_id
        shouldClearOldImage,           // $12 - whether to replace old image with new one
      ];

      result = await query(updateSql, updateValues);

      logger.debug('Broadcast session updated', {
        personId,
        username: roomData.username,
        sessionId: existingSession.id,
        secondsOnline: roomData.seconds_online,
      });
    } else {
      // Create a new session
      // Note: After migration 086, using new column names
      const insertSql = `
        INSERT INTO affiliate_api_polling (
          person_id, observed_at, seconds_online, session_start,
          current_show, room_subject, tags,
          num_users, num_followers, is_hd,
          image_url_360x270, deprecated_image_path, media_locator_id
        ) VALUES (
          $1, NOW(), $2, $3,
          $4, $5, $6,
          $7, $8, $9,
          $10, $11, $12
        )
        RETURNING *
      `;

      const insertValues = [
        personId,
        roomData.seconds_online,
        sessionStart,
        roomData.current_show,
        roomData.room_subject,
        roomData.tags,
        roomData.num_users,
        roomData.num_followers,
        roomData.is_hd,
        roomData.image_url,   // $10 - image_url_360x270
        imagePath,            // $11 - deprecated_image_path
        mediaLocatorId,       // $12 - media_locator_id FK
      ];

      result = await query(insertSql, insertValues);

      logger.info('New broadcast session created', {
        personId,
        username: roomData.username,
        secondsOnline: roomData.seconds_online,
        numUsers: roomData.num_users,
        imageSaved: !!imagePath,
      });
    }

    return this.mapRowToSession(result.rows[0]);
  }

  /**
   * Get latest session for a broadcaster
   */
  static async getLatestSession(personId: string): Promise<BroadcastSession | null> {
    const sql = `
      SELECT * FROM affiliate_api_polling
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
      SELECT * FROM affiliate_api_polling
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
      SELECT * FROM affiliate_api_polling
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
        FROM affiliate_api_polling, unnest(tags) as tag
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
        FROM affiliate_api_polling, unnest(tags) as tag
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
      image_url_360x270: row.image_url_360x270,
      legacy_image_url: row.legacy_image_url,
      deprecated_image_path: row.deprecated_image_path,
      legacy_image_path: row.legacy_image_path,
      media_locator_id: row.media_locator_id,
      created_at: row.created_at,
    };
  }
}

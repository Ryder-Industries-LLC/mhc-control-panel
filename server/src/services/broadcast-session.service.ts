import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import type { OnlineRoom } from '../api/chaturbate/affiliate-client.js';
import { storageService } from './storage/storage.service.js';
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
  image_url: string;
  image_url_360x270: string;
  image_path: string | null;
  image_path_360x270: string | null;
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
   * Download an image and save using the new storage service
   */
  private static async downloadAndSaveImage(
    imageUrl: string,
    username: string,
    type: 'thumbnail' | 'full'
  ): Promise<string | null> {
    try {
      if (this.isPlaceholderUrl(imageUrl)) {
        logger.debug('Skipping placeholder image URL', { username, imageUrl });
        return null;
      }

      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (this.isPlaceholderBySize(response.data)) {
        logger.debug('Skipping placeholder image (detected by size)', { username, size: response.data.length });
        return null;
      }

      // Generate unique filename
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(imageUrl).digest('hex').substring(0, 8);
      const filename = `${timestamp}_${hash}.jpg`;

      // Use new storage service with username-based paths
      const result = await storageService.writeWithUsername(
        username,
        'affiliate_api', // Source type for affiliate polling thumbnails
        filename,
        Buffer.from(response.data),
        'image/jpeg'
      );

      if (result.success) {
        logger.debug('Affiliate image saved', { username, type, path: result.relativePath });
        return result.relativePath;
      } else {
        logger.warn('Failed to save affiliate image', { username, type, error: result.error });
        return null;
      }
    } catch (error: any) {
      // Extract meaningful error info from axios errors
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
      SELECT id, session_start FROM affiliate_api_snapshots
      WHERE person_id = $1
        AND session_start BETWEEN ($2::timestamptz - INTERVAL '10 minutes') AND ($2::timestamptz + INTERVAL '10 minutes')
      ORDER BY observed_at DESC
      LIMIT 1
    `;

    const existingResult = await query(existingSessionSql, [personId, sessionStart]);
    const existingSession = existingResult.rows[0];

    // Download image once (image_url and image_url_360x270 are identical from CB API)
    const imagePath = await this.downloadAndSaveImage(roomData.image_url, roomData.username, 'thumbnail');
    // Use same path for both columns for backward compatibility
    const imagePaths = { thumbnail: imagePath, full: imagePath };

    // If we got a valid new image, use it; otherwise keep as null (don't use placeholder URLs)
    const shouldClearOldImage = imagePaths.full !== null;

    let result;

    if (existingSession) {
      // Update the existing session with latest data
      // Always update image paths when we have a new valid image
      const updateSql = `
        UPDATE affiliate_api_snapshots SET
          observed_at = NOW(),
          seconds_online = $2,
          current_show = $3,
          room_subject = $4,
          tags = $5,
          num_users = $6,
          num_followers = $7,
          is_hd = $8,
          image_url = $9,
          image_url_360x270 = $10,
          image_path = CASE WHEN $13 THEN $11 ELSE COALESCE($11, image_path) END,
          image_path_360x270 = CASE WHEN $13 THEN $12 ELSE COALESCE($12, image_path_360x270) END
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
        roomData.image_url,
        roomData.image_url_360x270,
        imagePaths.thumbnail,
        imagePaths.full,
        shouldClearOldImage, // $13 - whether to replace old image with new one
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
      const insertSql = `
        INSERT INTO affiliate_api_snapshots (
          person_id, observed_at, seconds_online, session_start,
          current_show, room_subject, tags,
          num_users, num_followers, is_hd,
          image_url, image_url_360x270,
          image_path, image_path_360x270
        ) VALUES (
          $1, NOW(), $2, $3,
          $4, $5, $6,
          $7, $8, $9,
          $10, $11,
          $12, $13
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
        roomData.image_url,
        roomData.image_url_360x270,
        imagePaths.thumbnail,
        imagePaths.full,
      ];

      result = await query(insertSql, insertValues);

      logger.info('New broadcast session created', {
        personId,
        username: roomData.username,
        secondsOnline: roomData.seconds_online,
        numUsers: roomData.num_users,
        imageSaved: !!imagePaths.full,
      });
    }

    return this.mapRowToSession(result.rows[0]);
  }

  /**
   * Get latest session for a broadcaster
   */
  static async getLatestSession(personId: string): Promise<BroadcastSession | null> {
    const sql = `
      SELECT * FROM affiliate_api_snapshots
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
      SELECT * FROM affiliate_api_snapshots
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
      SELECT * FROM affiliate_api_snapshots
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
        FROM affiliate_api_snapshots, unnest(tags) as tag
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
        FROM affiliate_api_snapshots, unnest(tags) as tag
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
      image_path: row.image_path,
      image_path_360x270: row.image_path_360x270,
      created_at: row.created_at,
    };
  }
}

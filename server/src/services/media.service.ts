/**
 * MediaService - Consolidated service for ALL media operations
 *
 * This is the single source of truth for media handling in the application.
 * All media operations (download, save, retrieve, delete) should go through this service.
 *
 * Table: media_locator (formerly profile_images)
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import { storageService } from './storage/storage.service.js';

// ============================================================================
// Types
// ============================================================================

export type MediaType = 'image' | 'video';
export type MediaSource = 'manual_upload' | 'screensnap' | 'following_snap' | 'affiliate_api' | 'external' | 'imported' | 'profile';

export interface MediaRecord {
  id: string;
  person_id: string;
  file_path: string;
  original_filename: string | null;
  source: MediaSource;
  description: string | null;
  captured_at: Date | null;
  uploaded_at: Date;
  file_size: number | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  is_primary: boolean;
  is_favorite: boolean;
  created_at: Date;
  media_type: MediaType;
  duration_seconds: number | null;
  photoset_id: string | null;
  title: string | null;
  source_url: string | null;
  sha256: string | null;
  deleted_at: Date | null;
  storage_provider: 'docker' | 'ssd' | 's3';
  username: string | null;
}

export interface MediaDownloadOptions {
  url: string;
  username: string;
  personId: string;
  source: MediaSource;
  mimeType?: string;
}

export interface MediaQueryOptions {
  source?: MediaSource;
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

export interface CreateMediaRecordOptions {
  personId: string;
  filePath: string;
  originalFilename?: string;
  source?: MediaSource;
  description?: string;
  capturedAt?: Date;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  mediaType?: MediaType;
  durationSeconds?: number;
  photosetId?: string;
  title?: string;
  username?: string;
  storageProvider?: 'docker' | 'ssd' | 's3';
  sourceUrl?: string;
}

export interface UpdateMediaRecordOptions {
  description?: string;
  source?: MediaSource;
  capturedAt?: Date;
  title?: string;
}

export interface DuplicateGroup {
  sha256: string;
  count: number;
  ids: string[];
  keepId: string;
  duplicateIds: string[];
}

// ============================================================================
// MediaService
// ============================================================================

export class MediaService {
  // Chaturbate placeholder image patterns and sizes
  private static readonly PLACEHOLDER_PATTERNS = ['no_image', 'noimage', 'placeholder', 'default_avatar'];
  private static readonly PLACEHOLDER_SIZE = 5045;
  private static readonly PLACEHOLDER_SIZE_TOLERANCE = 100;
  private static readonly PLACEHOLDER_SIZE_564 = 564; // Another known CB placeholder size

  // Legacy storage directory (for backward compatibility)
  private static readonly LEGACY_STORAGE_DIR = path.join(process.cwd(), 'data', 'images', 'profiles');

  // ============================================================================
  // Core Operations
  // ============================================================================

  /**
   * Download media from URL and save to storage, creating a media_locator record
   */
  static async downloadAndSaveMedia(options: MediaDownloadOptions): Promise<MediaRecord | null> {
    const { url, username, personId, source, mimeType = 'image/jpeg' } = options;

    try {
      // Check for placeholder URL patterns
      if (this.isMediaPlaceholder(url)) {
        logger.debug('Skipping placeholder media URL', { username, url });
        return null;
      }

      // Check if we already have this source URL to avoid duplicates
      const hasUrl = await this.hasMediaSourceUrl(personId, url);
      if (hasUrl) {
        logger.debug('Media already downloaded (duplicate source URL)', { username, url });
        return null;
      }

      // Download the media
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const data = Buffer.from(response.data);

      // Check if downloaded data is a placeholder by size
      if (this.isMediaPlaceholder(data)) {
        logger.debug('Skipping placeholder media (detected by size)', { username, size: data.length });
        return null;
      }

      // Generate unique filename
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
      const ext = this.getExtensionFromMimeType(mimeType);
      const filename = `${username}_${timestamp}_${hash}${ext}`;

      // Save to storage
      const result = await storageService.writeWithUsername(
        username,
        source,
        filename,
        data,
        mimeType
      );

      if (!result.success) {
        logger.warn('Failed to save media', { username, source, error: result.error });
        return null;
      }

      // Create media_locator record
      const mediaRecord = await this.createMediaRecord({
        personId,
        filePath: result.relativePath,
        originalFilename: filename,
        source,
        capturedAt: new Date(),
        fileSize: result.size,
        mimeType,
        username,
        storageProvider: result.provider || 's3',
        sourceUrl: url,
      });

      logger.debug('Media downloaded and saved', {
        username,
        source,
        path: result.relativePath,
        mediaId: mediaRecord.id,
      });

      return mediaRecord;
    } catch (error: any) {
      const errorInfo = error?.response?.status
        ? `HTTP ${error.response.status}`
        : error?.code || error?.message || 'Unknown error';
      logger.error('Failed to download media', { error: errorInfo, username, url });
      return null;
    }
  }

  /**
   * Get the file path for a media record
   */
  static async getMediaFilePath(mediaId: string): Promise<string | null> {
    const record = await this.getMediaById(mediaId);
    return record?.file_path ?? null;
  }

  /**
   * Get the full URL for serving a media file
   */
  static async getMediaURL(mediaId: string): Promise<string | null> {
    const record = await this.getMediaById(mediaId);
    if (!record) return null;

    // Return the storage path - the actual URL construction happens at the route level
    return record.file_path;
  }

  /**
   * Check if data (URL string or Buffer) represents a placeholder image
   */
  static isMediaPlaceholder(data: Buffer | string): boolean {
    if (typeof data === 'string') {
      // Check URL patterns
      const lowerUrl = data.toLowerCase();
      return this.PLACEHOLDER_PATTERNS.some(pattern => lowerUrl.includes(pattern));
    } else {
      // Check buffer size
      const size = data.length;
      return (
        Math.abs(size - this.PLACEHOLDER_SIZE) <= this.PLACEHOLDER_SIZE_TOLERANCE ||
        size === this.PLACEHOLDER_SIZE_564
      );
    }
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Create a new media record in the database
   */
  static async createMediaRecord(data: CreateMediaRecordOptions): Promise<MediaRecord> {
    const sql = `
      INSERT INTO media_locator (
        person_id, file_path, original_filename, source, description,
        captured_at, file_size, mime_type, width, height,
        media_type, duration_seconds, photoset_id, title,
        username, storage_provider, source_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const values = [
      data.personId,
      data.filePath,
      data.originalFilename || null,
      data.source || 'manual_upload',
      data.description || null,
      data.capturedAt || null,
      data.fileSize || null,
      data.mimeType || null,
      data.width || null,
      data.height || null,
      data.mediaType || 'image',
      data.durationSeconds || null,
      data.photosetId || null,
      data.title || null,
      data.username || null,
      data.storageProvider || 's3',
      data.sourceUrl || null,
    ];

    try {
      const result = await query(sql, values);
      logger.info('Media record created', {
        personId: data.personId,
        mediaId: result.rows[0].id,
        source: data.source || 'manual_upload',
        username: data.username,
      });
      return this.mapRowToMediaRecord(result.rows[0]);
    } catch (error) {
      logger.error('Error creating media record', { error, personId: data.personId });
      throw error;
    }
  }

  /**
   * Get a media record by ID
   */
  static async getMediaById(mediaId: string): Promise<MediaRecord | null> {
    const sql = `SELECT * FROM media_locator WHERE id = $1`;

    try {
      const result = await query(sql, [mediaId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToMediaRecord(result.rows[0]);
    } catch (error) {
      logger.error('Error getting media by ID', { error, mediaId });
      throw error;
    }
  }

  /**
   * Get all media for a person
   */
  static async getMediaByPersonId(
    personId: string,
    options?: MediaQueryOptions
  ): Promise<{ records: MediaRecord[]; total: number }> {
    const { source, limit, offset = 0, includeDeleted = false } = options || {};

    let whereClause = 'person_id = $1';
    const params: any[] = [personId];
    let paramIndex = 2;

    if (source) {
      whereClause += ` AND source = $${paramIndex++}`;
      params.push(source);
    }

    if (!includeDeleted) {
      whereClause += ' AND deleted_at IS NULL';
    }

    const countSql = `SELECT COUNT(*) FROM media_locator WHERE ${whereClause}`;
    let recordsSql = `
      SELECT * FROM media_locator
      WHERE ${whereClause}
      ORDER BY uploaded_at DESC
    `;

    if (limit !== undefined) {
      recordsSql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);
    }

    try {
      const countParams = source ? [personId, source] : [personId];
      const [countResult, recordsResult] = await Promise.all([
        query(countSql, countParams),
        query(recordsSql, params),
      ]);

      return {
        records: recordsResult.rows.map(this.mapRowToMediaRecord),
        total: parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      logger.error('Error getting media by person ID', { error, personId });
      throw error;
    }
  }

  /**
   * Get all media for a user by username
   */
  static async getMediaByUsername(
    username: string,
    options?: MediaQueryOptions
  ): Promise<{ records: MediaRecord[]; total: number }> {
    // First get person_id from username
    const personResult = await query(
      'SELECT id FROM persons WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (personResult.rows.length === 0) {
      return { records: [], total: 0 };
    }

    return this.getMediaByPersonId(personResult.rows[0].id, options);
  }

  /**
   * Check if a source URL already exists for a person
   */
  static async hasMediaSourceUrl(personId: string, sourceUrl: string): Promise<boolean> {
    const sql = `SELECT 1 FROM media_locator WHERE person_id = $1 AND source_url = $2 LIMIT 1`;

    try {
      const result = await query(sql, [personId, sourceUrl]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking media source URL', { error, personId });
      return false;
    }
  }

  /**
   * Find a media record by SHA256 hash
   */
  static async findMediaBySha256(sha256: string): Promise<MediaRecord | null> {
    const sql = `SELECT * FROM media_locator WHERE sha256 = $1 AND deleted_at IS NULL LIMIT 1`;

    try {
      const result = await query(sql, [sha256]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToMediaRecord(result.rows[0]);
    } catch (error) {
      logger.error('Error finding media by SHA256', { error, sha256 });
      throw error;
    }
  }

  /**
   * Update a media record
   */
  static async updateMediaRecord(
    mediaId: string,
    data: UpdateMediaRecordOptions
  ): Promise<MediaRecord | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.source !== undefined) {
      updates.push(`source = $${paramIndex++}`);
      values.push(data.source);
    }
    if (data.capturedAt !== undefined) {
      updates.push(`captured_at = $${paramIndex++}`);
      values.push(data.capturedAt);
    }
    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(data.title);
    }

    if (updates.length === 0) {
      return this.getMediaById(mediaId);
    }

    values.push(mediaId);
    const sql = `
      UPDATE media_locator
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await query(sql, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Media record updated', { mediaId });
      return this.mapRowToMediaRecord(result.rows[0]);
    } catch (error) {
      logger.error('Error updating media record', { error, mediaId });
      throw error;
    }
  }

  // ============================================================================
  // Primary/Current Management
  // ============================================================================

  /**
   * Set a media record as the primary for its person
   */
  static async setPrimaryMedia(mediaId: string): Promise<MediaRecord | null> {
    try {
      const media = await this.getMediaById(mediaId);
      if (!media) {
        return null;
      }

      await query('BEGIN');

      try {
        // Unset all primary for this person
        await query(
          `UPDATE media_locator SET is_primary = FALSE WHERE person_id = $1`,
          [media.person_id]
        );

        // Set the specified media as primary
        const result = await query(
          `UPDATE media_locator SET is_primary = TRUE WHERE id = $1 RETURNING *`,
          [mediaId]
        );

        await query('COMMIT');

        if (result.rows.length === 0) {
          return null;
        }

        logger.info('Primary media set', { mediaId, personId: media.person_id });
        return this.mapRowToMediaRecord(result.rows[0]);
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error setting primary media', { error, mediaId });
      throw error;
    }
  }

  /**
   * Get the primary media for a person
   * Falls back to most recent image if no primary is explicitly set
   */
  static async getPrimaryMedia(personId: string): Promise<MediaRecord | null> {
    // First try to get explicit primary
    const primarySql = `SELECT * FROM media_locator WHERE person_id = $1 AND is_primary = TRUE AND deleted_at IS NULL`;

    try {
      const primaryResult = await query(primarySql, [personId]);
      if (primaryResult.rows.length > 0) {
        return this.mapRowToMediaRecord(primaryResult.rows[0]);
      }

      // No explicit primary - fall back to most recent image
      const fallbackSql = `
        SELECT * FROM media_locator
        WHERE person_id = $1 AND deleted_at IS NULL
        ORDER BY COALESCE(captured_at, uploaded_at) DESC
        LIMIT 1
      `;
      const fallbackResult = await query(fallbackSql, [personId]);
      if (fallbackResult.rows.length > 0) {
        return this.mapRowToMediaRecord(fallbackResult.rows[0]);
      }

      return null;
    } catch (error) {
      logger.error('Error getting primary media', { error, personId });
      throw error;
    }
  }

  // ============================================================================
  // Deletion
  // ============================================================================

  /**
   * Soft delete a media record (sets deleted_at timestamp)
   * Does NOT delete the file - use hardDeleteMedia for that
   */
  static async softDeleteMedia(mediaId: string): Promise<boolean> {
    try {
      const media = await this.getMediaById(mediaId);
      if (!media) {
        return false;
      }

      // Record photoset deletion if applicable
      if (media.photoset_id) {
        await this.recordDeletedPhotoset(media.person_id, media.photoset_id);
      }

      const sql = `UPDATE media_locator SET deleted_at = NOW() WHERE id = $1 RETURNING id`;
      const result = await query(sql, [mediaId]);

      const deleted = result.rowCount !== null && result.rowCount > 0;
      if (deleted) {
        logger.info('Media soft deleted', { mediaId, photosetId: media.photoset_id });
      }

      return deleted;
    } catch (error) {
      logger.error('Error soft deleting media', { error, mediaId });
      throw error;
    }
  }

  /**
   * Hard delete a media record (removes DB record and file)
   * WARNING: This is irreversible - use with caution
   */
  static async hardDeleteMedia(mediaId: string): Promise<boolean> {
    try {
      const media = await this.getMediaById(mediaId);
      if (!media) {
        return false;
      }

      // Record photoset deletion if applicable
      if (media.photoset_id) {
        await this.recordDeletedPhotoset(media.person_id, media.photoset_id);
      }

      // Delete from database
      const sql = `DELETE FROM media_locator WHERE id = $1 RETURNING id`;
      const result = await query(sql, [mediaId]);
      const deleted = result.rowCount !== null && result.rowCount > 0;

      if (deleted) {
        // Delete the file
        try {
          const fullPath = path.join(this.LEGACY_STORAGE_DIR, media.file_path);
          await fs.unlink(fullPath);
          logger.info('Media file deleted', { mediaId, filePath: media.file_path });
        } catch (fileError: any) {
          if (fileError.code !== 'ENOENT') {
            logger.warn('Failed to delete media file', {
              mediaId,
              filePath: media.file_path,
              error: fileError,
            });
          }
        }
        logger.info('Media hard deleted', { mediaId, photosetId: media.photoset_id });
      }

      return deleted;
    } catch (error) {
      logger.error('Error hard deleting media', { error, mediaId });
      throw error;
    }
  }

  /**
   * Record a deleted photoset to prevent re-downloading
   */
  private static async recordDeletedPhotoset(personId: string, photosetId: string): Promise<void> {
    const sql = `
      INSERT INTO deleted_photosets (person_id, photoset_id)
      VALUES ($1, $2)
      ON CONFLICT (person_id, photoset_id) DO NOTHING
    `;

    try {
      await query(sql, [personId, photosetId]);
      logger.info('Recorded deleted photoset', { personId, photosetId });
    } catch (error) {
      logger.error('Error recording deleted photoset', { error, personId, photosetId });
    }
  }

  // ============================================================================
  // Deduplication
  // ============================================================================

  /**
   * Find duplicate media records based on SHA256 hash
   */
  static async findDuplicateMediaRecords(): Promise<DuplicateGroup[]> {
    const sql = `
      SELECT sha256, COUNT(*) as count, array_agg(id) as ids
      FROM media_locator
      WHERE sha256 IS NOT NULL AND deleted_at IS NULL
      GROUP BY sha256
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;

    try {
      const result = await query(sql);
      const groups: DuplicateGroup[] = [];

      for (const row of result.rows) {
        // Determine which record to keep (one with most FK references)
        const keepId = await this.findBestRecordToKeep(row.ids);
        const duplicateIds = row.ids.filter((id: string) => id !== keepId);

        groups.push({
          sha256: row.sha256,
          count: parseInt(row.count, 10),
          ids: row.ids,
          keepId,
          duplicateIds,
        });
      }

      return groups;
    } catch (error) {
      logger.error('Error finding duplicate media records', { error });
      throw error;
    }
  }

  /**
   * Find the best record to keep from a list of duplicate IDs
   * Prefers records with the most FK references
   */
  private static async findBestRecordToKeep(ids: string[]): Promise<string> {
    // Count FK references from affiliate_api_polling for each ID
    const sql = `
      SELECT media_locator_id, COUNT(*) as ref_count
      FROM affiliate_api_polling
      WHERE media_locator_id = ANY($1)
      GROUP BY media_locator_id
      ORDER BY ref_count DESC
    `;

    try {
      const result = await query(sql, [ids]);
      if (result.rows.length > 0) {
        return result.rows[0].media_locator_id;
      }
      // If no references, just return the first ID
      return ids[0];
    } catch (error) {
      logger.error('Error finding best record to keep', { error, ids });
      return ids[0];
    }
  }

  /**
   * Remove a duplicate media record, updating any FK references
   */
  static async removeDuplicateMediaRecord(duplicateId: string, keepId: string): Promise<void> {
    try {
      await query('BEGIN');

      // Update any FK references to point to the keeper
      await query(
        `UPDATE affiliate_api_polling SET media_locator_id = $1 WHERE media_locator_id = $2`,
        [keepId, duplicateId]
      );

      // Soft delete the duplicate
      await query(
        `UPDATE media_locator SET deleted_at = NOW() WHERE id = $1`,
        [duplicateId]
      );

      await query('COMMIT');

      logger.info('Duplicate media record removed', { duplicateId, keepId });
    } catch (error) {
      await query('ROLLBACK');
      logger.error('Error removing duplicate media record', { error, duplicateId, keepId });
      throw error;
    }
  }

  // ============================================================================
  // Consistency Checks
  // ============================================================================

  /**
   * Count total media records
   */
  static async countMediaRecords(includeDeleted = false): Promise<number> {
    const sql = includeDeleted
      ? `SELECT COUNT(*) FROM media_locator`
      : `SELECT COUNT(*) FROM media_locator WHERE deleted_at IS NULL`;

    try {
      const result = await query(sql);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Error counting media records', { error });
      throw error;
    }
  }

  /**
   * Find media records where the file doesn't exist in storage
   */
  static async findMissingMediaFiles(): Promise<MediaRecord[]> {
    // This would need to check S3/storage for each file
    // For now, return records and let the caller verify
    const sql = `
      SELECT * FROM media_locator
      WHERE deleted_at IS NULL AND storage_provider = 's3'
      ORDER BY uploaded_at DESC
    `;

    try {
      const result = await query(sql);
      return result.rows.map(this.mapRowToMediaRecord);
    } catch (error) {
      logger.error('Error finding missing media files', { error });
      throw error;
    }
  }

  /**
   * Find S3 files that have no corresponding media_locator record
   * Note: This is a placeholder - actual implementation needs S3 listing
   */
  static async findUnregisteredMediaFiles(): Promise<string[]> {
    // This would need to:
    // 1. List all S3 objects in the media path
    // 2. Compare against media_locator.file_path
    // 3. Return paths that don't have DB records
    logger.warn('findUnregisteredMediaFiles not yet implemented - requires S3 listing');
    return [];
  }

  // ============================================================================
  // Legacy Compatibility Methods
  // ============================================================================

  /**
   * Check if a photoset was deleted by the user
   */
  static async isPhotosetDeleted(personId: string, photosetId: string): Promise<boolean> {
    const sql = `SELECT 1 FROM deleted_photosets WHERE person_id = $1 AND photoset_id = $2 LIMIT 1`;

    try {
      const result = await query(sql, [personId, photosetId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking deleted photoset', { error, personId, photosetId });
      return false;
    }
  }

  /**
   * Check if a photoset has already been downloaded for a person
   */
  static async hasPhotoset(personId: string, photosetId: string): Promise<boolean> {
    const sql = `SELECT 1 FROM media_locator WHERE person_id = $1 AND photoset_id = $2 AND deleted_at IS NULL LIMIT 1`;

    try {
      const result = await query(sql, [personId, photosetId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking photoset', { error, personId, photosetId });
      throw error;
    }
  }

  /**
   * Save an uploaded file (from form upload)
   */
  static async saveUploadedMedia(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    personId: string,
    options?: {
      source?: MediaSource;
      description?: string;
      capturedAt?: Date;
      username?: string;
    }
  ): Promise<MediaRecord> {
    try {
      const ext = path.extname(file.originalname) || this.getExtensionFromMimeType(file.mimetype);
      const hash = crypto.randomUUID();
      const filename = `${hash}${ext}`;

      if (options?.username) {
        const result = await storageService.writeWithUsername(
          options.username,
          options?.source || 'manual_upload',
          filename,
          file.buffer,
          file.mimetype
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to save file to storage');
        }

        return await this.createMediaRecord({
          personId,
          filePath: result.relativePath,
          originalFilename: file.originalname,
          source: options?.source || 'manual_upload',
          description: options?.description,
          capturedAt: options?.capturedAt,
          fileSize: result.size,
          mimeType: file.mimetype,
          username: options.username,
          storageProvider: result.provider || 's3',
        });
      }

      // Legacy fallback path
      const personDir = path.join(this.LEGACY_STORAGE_DIR, personId);
      await fs.mkdir(personDir, { recursive: true });
      const relativePath = path.join(personId, filename);
      const fullPath = path.join(this.LEGACY_STORAGE_DIR, relativePath);
      await fs.writeFile(fullPath, file.buffer);

      return await this.createMediaRecord({
        personId,
        filePath: relativePath,
        originalFilename: file.originalname,
        source: options?.source || 'manual_upload',
        description: options?.description,
        capturedAt: options?.capturedAt,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageProvider: 'docker',
      });
    } catch (error) {
      logger.error('Error saving uploaded media', { error, personId });
      throw error;
    }
  }

  /**
   * Get media count for a person
   */
  static async getMediaCount(personId: string): Promise<number> {
    const sql = `SELECT COUNT(*) FROM media_locator WHERE person_id = $1 AND deleted_at IS NULL`;

    try {
      const result = await query(sql, [personId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Error getting media count', { error, personId });
      throw error;
    }
  }

  /**
   * Get media filtered by type
   */
  static async getMediaByType(
    personId: string,
    mediaType: MediaType,
    options?: MediaQueryOptions
  ): Promise<{ records: MediaRecord[]; total: number }> {
    const { limit, offset = 0 } = options || {};

    const countSql = `SELECT COUNT(*) FROM media_locator WHERE person_id = $1 AND media_type = $2 AND deleted_at IS NULL`;
    let recordsSql = `
      SELECT * FROM media_locator
      WHERE person_id = $1 AND media_type = $2 AND deleted_at IS NULL
      ORDER BY uploaded_at DESC
    `;

    const params: any[] = [personId, mediaType];
    if (limit !== undefined) {
      recordsSql += ` LIMIT $3 OFFSET $4`;
      params.push(limit, offset);
    }

    try {
      const [countResult, recordsResult] = await Promise.all([
        query(countSql, [personId, mediaType]),
        query(recordsSql, params),
      ]);

      return {
        records: recordsResult.rows.map(this.mapRowToMediaRecord),
        total: parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      logger.error('Error getting media by type', { error, personId, mediaType });
      throw error;
    }
  }

  /**
   * Update has_videos flag on profiles table
   */
  static async updateHasVideosFlag(personId: string): Promise<void> {
    const sql = `
      UPDATE profiles
      SET has_videos = EXISTS (
        SELECT 1 FROM media_locator
        WHERE person_id = $1 AND media_type = 'video' AND deleted_at IS NULL
      )
      WHERE person_id = $1
    `;

    try {
      await query(sql, [personId]);
    } catch (error) {
      logger.error('Error updating has_videos flag', { error, personId });
    }
  }

  /**
   * Get video statistics
   */
  static async getVideoStats(): Promise<{
    videoCount: number;
    videoSizeBytes: number;
    usersWithVideos: number;
  }> {
    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE media_type = 'video' AND deleted_at IS NULL) as video_count,
        COALESCE(SUM(file_size) FILTER (WHERE media_type = 'video' AND deleted_at IS NULL), 0) as video_total_size,
        COUNT(DISTINCT person_id) FILTER (WHERE media_type = 'video' AND deleted_at IS NULL) as users_with_videos
      FROM media_locator
    `;

    try {
      const result = await query(sql);
      return {
        videoCount: parseInt(result.rows[0].video_count || '0', 10),
        videoSizeBytes: parseInt(result.rows[0].video_total_size || '0', 10),
        usersWithVideos: parseInt(result.rows[0].users_with_videos || '0', 10),
      };
    } catch (error) {
      logger.error('Error getting video stats', { error });
      return { videoCount: 0, videoSizeBytes: 0, usersWithVideos: 0 };
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get file extension from MIME type
   */
  private static getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
    };
    return mimeToExt[mimeType] || '.jpg';
  }

  /**
   * Map database row to MediaRecord
   */
  private static mapRowToMediaRecord(row: any): MediaRecord {
    return {
      id: row.id,
      person_id: row.person_id,
      file_path: row.file_path,
      original_filename: row.original_filename,
      source: row.source,
      description: row.description,
      captured_at: row.captured_at,
      uploaded_at: row.uploaded_at,
      file_size: row.file_size,
      mime_type: row.mime_type,
      width: row.width,
      height: row.height,
      is_primary: row.is_primary || false,
      is_favorite: row.is_favorite || false,
      created_at: row.created_at,
      media_type: row.media_type || 'image',
      duration_seconds: row.duration_seconds,
      photoset_id: row.photoset_id,
      title: row.title,
      source_url: row.source_url,
      sha256: row.sha256,
      deleted_at: row.deleted_at,
      storage_provider: row.storage_provider || 's3',
      username: row.username,
    };
  }

  // ============================================================================
  // Favorites Operations
  // ============================================================================

  /**
   * Toggle favorite status for a media item
   */
  static async toggleFavorite(mediaId: string): Promise<MediaRecord | null> {
    const sql = `
      UPDATE media_locator
      SET is_favorite = NOT COALESCE(is_favorite, FALSE)
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    try {
      const result = await query(sql, [mediaId]);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Toggled media favorite', { mediaId, is_favorite: result.rows[0].is_favorite });
      return this.mapRowToMediaRecord(result.rows[0]);
    } catch (error) {
      logger.error('Error toggling favorite', { error, mediaId });
      throw error;
    }
  }

  /**
   * Set favorite status explicitly
   */
  static async setFavorite(mediaId: string, isFavorite: boolean): Promise<MediaRecord | null> {
    const sql = `
      UPDATE media_locator
      SET is_favorite = $2
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    try {
      const result = await query(sql, [mediaId, isFavorite]);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Set media favorite', { mediaId, is_favorite: isFavorite });
      return this.mapRowToMediaRecord(result.rows[0]);
    } catch (error) {
      logger.error('Error setting favorite', { error, mediaId });
      throw error;
    }
  }

  /**
   * Get all favorite media with pagination
   */
  static async getFavorites(options?: MediaQueryOptions & { mediaType?: MediaType }): Promise<{ records: MediaRecord[]; total: number }> {
    const { limit = 50, offset = 0, mediaType } = options || {};

    let whereClause = 'is_favorite = TRUE AND deleted_at IS NULL';
    const params: any[] = [];
    let paramIndex = 1;

    if (mediaType) {
      whereClause += ` AND media_type = $${paramIndex++}`;
      params.push(mediaType);
    }

    const countSql = `SELECT COUNT(*) FROM media_locator WHERE ${whereClause}`;
    const recordsSql = `
      SELECT m.*, p.username as person_username
      FROM media_locator m
      LEFT JOIN persons p ON m.person_id = p.id
      WHERE ${whereClause}
      ORDER BY m.uploaded_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    try {
      const countParams = mediaType ? [mediaType] : [];
      const [countResult, recordsResult] = await Promise.all([
        query(countSql, countParams),
        query(recordsSql, params),
      ]);

      // Map results and include person_username
      const records = recordsResult.rows.map((row: any) => ({
        ...this.mapRowToMediaRecord(row),
        person_username: row.person_username,
      }));

      return {
        records,
        total: parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      logger.error('Error getting favorites', { error });
      throw error;
    }
  }

  /**
   * Get favorite media count and stats
   */
  static async getFavoriteStats(): Promise<{ totalFavorites: number; imageCount: number; videoCount: number }> {
    const sql = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE media_type = 'image') as images,
        COUNT(*) FILTER (WHERE media_type = 'video') as videos
      FROM media_locator
      WHERE is_favorite = TRUE AND deleted_at IS NULL
    `;

    try {
      const result = await query(sql, []);
      const row = result.rows[0];
      return {
        totalFavorites: parseInt(row.total, 10),
        imageCount: parseInt(row.images, 10),
        videoCount: parseInt(row.videos, 10),
      };
    } catch (error) {
      logger.error('Error getting favorite stats', { error });
      throw error;
    }
  }
}

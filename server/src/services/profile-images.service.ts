import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import { storageService } from './storage/storage.service.js';

export type MediaType = 'image' | 'video';
export type MediaSource = 'manual_upload' | 'screensnap' | 'following_snap' | 'affiliate_api' | 'external' | 'imported' | 'profile';

export interface ProfileImage {
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
  created_at: Date;
  media_type: MediaType;
  duration_seconds: number | null;
  photoset_id: string | null;
  title: string | null;
  source_url: string | null;
}

export interface CreateProfileImageInput {
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
  username?: string; // For new username-based path structure
  storageProvider?: 'docker' | 'ssd' | 's3';
  sourceUrl?: string; // Original URL from which the image was downloaded
}

export interface UpdateProfileImageInput {
  description?: string;
  source?: MediaSource;
  capturedAt?: Date;
  title?: string;
}

export class ProfileImagesService {
  private static readonly STORAGE_DIR = path.join(process.cwd(), 'data', 'images', 'profiles');

  /**
   * Initialize storage directory
   */
  static async init(): Promise<void> {
    try {
      await fs.mkdir(this.STORAGE_DIR, { recursive: true });
      logger.info('Profile images storage initialized', { path: this.STORAGE_DIR });
    } catch (error) {
      logger.error('Failed to initialize profile images storage', { error });
      throw error;
    }
  }

  /**
   * Get the storage directory for a specific person
   */
  private static getPersonDir(personId: string): string {
    return path.join(this.STORAGE_DIR, personId);
  }

  /**
   * Ensure person's image directory exists
   */
  private static async ensurePersonDir(personId: string): Promise<string> {
    const dir = this.getPersonDir(personId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  /**
   * Get all images for a person (newest first)
   */
  static async getByPersonId(
    personId: string,
    limit?: number,
    offset = 0
  ): Promise<{ images: ProfileImage[]; total: number }> {
    const countSql = `SELECT COUNT(*) FROM profile_images WHERE person_id = $1`;
    let imagesSql = `
      SELECT * FROM profile_images
      WHERE person_id = $1
      ORDER BY uploaded_at DESC
    `;

    const params: any[] = [personId];
    if (limit !== undefined) {
      imagesSql += ` LIMIT $2 OFFSET $3`;
      params.push(limit, offset);
    }

    try {
      const [countResult, imagesResult] = await Promise.all([
        query(countSql, [personId]),
        query(imagesSql, params),
      ]);

      return {
        images: imagesResult.rows.map(this.mapRowToImage),
        total: parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      logger.error('Error getting profile images', { error, personId });
      throw error;
    }
  }

  /**
   * Get a single image by ID
   */
  static async getById(imageId: string): Promise<ProfileImage | null> {
    const sql = `SELECT * FROM profile_images WHERE id = $1`;

    try {
      const result = await query(sql, [imageId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToImage(result.rows[0]);
    } catch (error) {
      logger.error('Error getting image by ID', { error, imageId });
      throw error;
    }
  }

  /**
   * Create a new image record
   */
  static async create(data: CreateProfileImageInput): Promise<ProfileImage> {
    const sql = `
      INSERT INTO profile_images (
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
      data.storageProvider || 's3', // Default to S3 (primary storage)
      data.sourceUrl || null,
    ];

    try {
      const result = await query(sql, values);
      logger.info('Profile media created', {
        personId: data.personId,
        imageId: result.rows[0].id,
        source: data.source || 'manual_upload',
        mediaType: data.mediaType || 'image',
        username: data.username,
        storageProvider: data.storageProvider || 's3',
      });
      return this.mapRowToImage(result.rows[0]);
    } catch (error) {
      logger.error('Error creating profile image', { error, personId: data.personId });
      throw error;
    }
  }

  /**
   * Update image metadata
   */
  static async update(
    imageId: string,
    data: UpdateProfileImageInput
  ): Promise<ProfileImage | null> {
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

    if (updates.length === 0) {
      return this.getById(imageId);
    }

    values.push(imageId);
    const sql = `
      UPDATE profile_images
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await query(sql, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Profile image updated', { imageId });
      return this.mapRowToImage(result.rows[0]);
    } catch (error) {
      logger.error('Error updating profile image', { error, imageId });
      throw error;
    }
  }

  /**
   * Delete an image (both DB record and file)
   * If the image has a photoset_id, record it to prevent re-downloading during rescrape
   */
  static async delete(imageId: string): Promise<boolean> {
    try {
      // First get the image to know the file path and photoset
      const image = await this.getById(imageId);
      if (!image) {
        return false;
      }

      // If this image has a photoset_id, record it as deleted to prevent re-download
      if (image.photoset_id) {
        await this.recordDeletedPhotoset(image.person_id, image.photoset_id);
      }

      // Delete from database
      const sql = `DELETE FROM profile_images WHERE id = $1 RETURNING id`;
      const result = await query(sql, [imageId]);
      const deleted = result.rowCount !== null && result.rowCount > 0;

      if (deleted) {
        // Delete the file
        try {
          const fullPath = path.join(this.STORAGE_DIR, image.file_path);
          await fs.unlink(fullPath);
          logger.info('Profile image file deleted', { imageId, filePath: image.file_path });
        } catch (fileError: any) {
          if (fileError.code !== 'ENOENT') {
            logger.warn('Failed to delete image file', {
              imageId,
              filePath: image.file_path,
              error: fileError,
            });
          }
        }
        logger.info('Profile image deleted', { imageId, photosetId: image.photoset_id });
      }

      return deleted;
    } catch (error) {
      logger.error('Error deleting profile image', { error, imageId });
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
      // Don't throw - this is a non-critical operation
    }
  }

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
      return false; // Default to allowing download on error
    }
  }

  /**
   * Save an uploaded file and create database record
   * Uses new storage service with username-based paths
   */
  static async saveUploadedFile(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    personId: string,
    options?: {
      source?: 'manual_upload' | 'screensnap' | 'external' | 'imported';
      description?: string;
      capturedAt?: Date;
      username?: string; // Required for new storage paths
    }
  ): Promise<ProfileImage> {
    try {
      // Generate unique filename
      const ext = path.extname(file.originalname) || this.getExtensionFromMimeType(file.mimetype);
      const hash = crypto.randomUUID();
      const filename = `${hash}${ext}`;

      // If username provided, use new storage service with username-based paths
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

        // Create database record with username and storage provider from write result
        const image = await this.create({
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

        logger.info('Uploaded file saved (new storage)', {
          personId,
          username: options.username,
          imageId: image.id,
          path: result.relativePath,
          size: result.size,
        });

        return image;
      }

      // Fallback: Legacy path for files without username (existing code path)
      await this.ensurePersonDir(personId);
      const relativePath = path.join(personId, filename);
      const fullPath = path.join(this.STORAGE_DIR, relativePath);

      // Save file
      await fs.writeFile(fullPath, file.buffer);

      // Create database record (legacy path uses docker storage)
      const image = await this.create({
        personId,
        filePath: relativePath,
        originalFilename: file.originalname,
        source: options?.source || 'manual_upload',
        description: options?.description,
        capturedAt: options?.capturedAt,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageProvider: 'docker', // Legacy path saves to Docker volume
      });

      logger.info('Uploaded file saved (legacy path)', {
        personId,
        imageId: image.id,
        filename,
        size: file.size,
      });

      return image;
    } catch (error) {
      logger.error('Error saving uploaded file', { error, personId });
      throw error;
    }
  }

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
    };
    return mimeToExt[mimeType] || '.jpg';
  }

  /**
   * Get total image count for a person
   */
  static async getCount(personId: string): Promise<number> {
    const sql = `SELECT COUNT(*) FROM profile_images WHERE person_id = $1`;

    try {
      const result = await query(sql, [personId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Error getting image count', { error, personId });
      throw error;
    }
  }

  /**
   * Get the full filesystem path for an image
   */
  static getFullPath(relativePath: string): string {
    return path.join(this.STORAGE_DIR, relativePath);
  }

  /**
   * Check if image file exists on disk
   */
  static async fileExists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.getFullPath(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set an image as the primary/featured image for a person
   * This will unset any previous primary image
   */
  static async setAsPrimary(imageId: string): Promise<ProfileImage | null> {
    try {
      // First get the image to know which person it belongs to
      const image = await this.getById(imageId);
      if (!image) {
        return null;
      }

      // Unset any primary image for this person and set the new one
      // Using a transaction to ensure atomicity
      await query('BEGIN');

      try {
        // Unset all primary images for this person
        await query(`UPDATE profile_images SET is_primary = FALSE WHERE person_id = $1`, [
          image.person_id,
        ]);

        // Set the specified image as primary
        const result = await query(
          `UPDATE profile_images SET is_primary = TRUE WHERE id = $1 RETURNING *`,
          [imageId]
        );

        await query('COMMIT');

        if (result.rows.length === 0) {
          return null;
        }

        logger.info('Profile image set as primary', { imageId, personId: image.person_id });
        return this.mapRowToImage(result.rows[0]);
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error setting image as primary', { error, imageId });
      throw error;
    }
  }

  /**
   * Get the primary image for a person
   */
  static async getPrimaryByPersonId(personId: string): Promise<ProfileImage | null> {
    const sql = `SELECT * FROM profile_images WHERE person_id = $1 AND is_primary = TRUE`;

    try {
      const result = await query(sql, [personId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToImage(result.rows[0]);
    } catch (error) {
      logger.error('Error getting primary image', { error, personId });
      throw error;
    }
  }

  /**
   * Map database row to ProfileImage object
   */
  private static mapRowToImage(row: any): ProfileImage {
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
      created_at: row.created_at,
      media_type: row.media_type || 'image',
      duration_seconds: row.duration_seconds,
      photoset_id: row.photoset_id,
      title: row.title,
      source_url: row.source_url,
    };
  }

  /**
   * Get media for a person filtered by media type (newest first)
   */
  static async getByPersonIdByType(
    personId: string,
    mediaType: MediaType,
    limit?: number,
    offset = 0
  ): Promise<{ images: ProfileImage[]; total: number }> {
    const countSql = `SELECT COUNT(*) FROM profile_images WHERE person_id = $1 AND media_type = $2`;
    let imagesSql = `
      SELECT * FROM profile_images
      WHERE person_id = $1 AND media_type = $2
      ORDER BY uploaded_at DESC
    `;

    const params: any[] = [personId, mediaType];
    if (limit !== undefined) {
      imagesSql += ` LIMIT $3 OFFSET $4`;
      params.push(limit, offset);
    }

    try {
      const [countResult, imagesResult] = await Promise.all([
        query(countSql, [personId, mediaType]),
        query(imagesSql, params),
      ]);

      return {
        images: imagesResult.rows.map(this.mapRowToImage),
        total: parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      logger.error('Error getting profile media by type', { error, personId, mediaType });
      throw error;
    }
  }

  /**
   * Check if a photoset has already been downloaded for a person
   */
  static async hasPhotoset(personId: string, photosetId: string): Promise<boolean> {
    const sql = `SELECT 1 FROM profile_images WHERE person_id = $1 AND photoset_id = $2 LIMIT 1`;

    try {
      const result = await query(sql, [personId, photosetId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking photoset', { error, personId, photosetId });
      throw error;
    }
  }

  /**
   * Check if a source URL has already been downloaded for a person
   * Used to prevent duplicate downloads of the same image
   */
  static async hasSourceUrl(personId: string, sourceUrl: string): Promise<boolean> {
    const sql = `SELECT 1 FROM profile_images WHERE person_id = $1 AND source_url = $2 LIMIT 1`;

    try {
      const result = await query(sql, [personId, sourceUrl]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking source URL', { error, personId });
      return false; // On error, allow the download to proceed
    }
  }

  /**
   * Update has_videos flag on profiles table for a person
   */
  static async updateHasVideosFlag(personId: string): Promise<void> {
    const sql = `
      UPDATE profiles
      SET has_videos = EXISTS (
        SELECT 1 FROM profile_images
        WHERE person_id = $1 AND media_type = 'video'
      )
      WHERE person_id = $1
    `;

    try {
      await query(sql, [personId]);
    } catch (error) {
      logger.error('Error updating has_videos flag', { error, personId });
      // Don't throw - this is a non-critical update
    }
  }

  /**
   * Get video statistics for admin dashboard
   */
  static async getVideoStats(): Promise<{
    videoCount: number;
    videoSizeBytes: number;
    usersWithVideos: number;
  }> {
    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE media_type = 'video') as video_count,
        COALESCE(SUM(file_size) FILTER (WHERE media_type = 'video'), 0) as video_total_size,
        COUNT(DISTINCT person_id) FILTER (WHERE media_type = 'video') as users_with_videos
      FROM profile_images
    `;

    try {
      const result = await query(sql, []);
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
}

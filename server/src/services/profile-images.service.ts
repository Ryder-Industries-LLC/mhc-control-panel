import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface ProfileImage {
  id: string;
  person_id: string;
  file_path: string;
  original_filename: string | null;
  source: 'manual_upload' | 'screensnap' | 'external' | 'imported';
  description: string | null;
  captured_at: Date | null;
  uploaded_at: Date;
  file_size: number | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  is_current: boolean;
  created_at: Date;
}

export interface CreateProfileImageInput {
  personId: string;
  filePath: string;
  originalFilename?: string;
  source?: 'manual_upload' | 'screensnap' | 'external' | 'imported';
  description?: string;
  capturedAt?: Date;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface UpdateProfileImageInput {
  description?: string;
  source?: 'manual_upload' | 'screensnap' | 'external' | 'imported';
  capturedAt?: Date;
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
        captured_at, file_size, mime_type, width, height
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
    ];

    try {
      const result = await query(sql, values);
      logger.info('Profile image created', {
        personId: data.personId,
        imageId: result.rows[0].id,
        source: data.source || 'manual_upload',
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
  static async update(imageId: string, data: UpdateProfileImageInput): Promise<ProfileImage | null> {
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
   */
  static async delete(imageId: string): Promise<boolean> {
    try {
      // First get the image to know the file path
      const image = await this.getById(imageId);
      if (!image) {
        return false;
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
            logger.warn('Failed to delete image file', { imageId, filePath: image.file_path, error: fileError });
          }
        }
        logger.info('Profile image deleted', { imageId });
      }

      return deleted;
    } catch (error) {
      logger.error('Error deleting profile image', { error, imageId });
      throw error;
    }
  }

  /**
   * Save an uploaded file and create database record
   */
  static async saveUploadedFile(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    personId: string,
    options?: {
      source?: 'manual_upload' | 'screensnap' | 'external' | 'imported';
      description?: string;
      capturedAt?: Date;
    }
  ): Promise<ProfileImage> {
    try {
      // Ensure directory exists
      await this.ensurePersonDir(personId);

      // Generate unique filename
      const ext = path.extname(file.originalname) || this.getExtensionFromMimeType(file.mimetype);
      const hash = crypto.randomUUID();
      const filename = `${hash}${ext}`;
      const relativePath = path.join(personId, filename);
      const fullPath = path.join(this.STORAGE_DIR, relativePath);

      // Save file
      await fs.writeFile(fullPath, file.buffer);

      // Create database record
      const image = await this.create({
        personId,
        filePath: relativePath,
        originalFilename: file.originalname,
        source: options?.source || 'manual_upload',
        description: options?.description,
        capturedAt: options?.capturedAt,
        fileSize: file.size,
        mimeType: file.mimetype,
      });

      logger.info('Uploaded file saved', {
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
   * Set an image as the current/primary image for a person
   * This will unset any previous current image
   */
  static async setAsCurrent(imageId: string): Promise<ProfileImage | null> {
    try {
      // First get the image to know which person it belongs to
      const image = await this.getById(imageId);
      if (!image) {
        return null;
      }

      // Unset any current image for this person and set the new one
      // Using a transaction to ensure atomicity
      await query('BEGIN');

      try {
        // Unset all current images for this person
        await query(
          `UPDATE profile_images SET is_current = FALSE WHERE person_id = $1`,
          [image.person_id]
        );

        // Set the specified image as current
        const result = await query(
          `UPDATE profile_images SET is_current = TRUE WHERE id = $1 RETURNING *`,
          [imageId]
        );

        await query('COMMIT');

        if (result.rows.length === 0) {
          return null;
        }

        logger.info('Profile image set as current', { imageId, personId: image.person_id });
        return this.mapRowToImage(result.rows[0]);
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error setting image as current', { error, imageId });
      throw error;
    }
  }

  /**
   * Get the current image for a person
   */
  static async getCurrentByPersonId(personId: string): Promise<ProfileImage | null> {
    const sql = `SELECT * FROM profile_images WHERE person_id = $1 AND is_current = TRUE`;

    try {
      const result = await query(sql, [personId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToImage(result.rows[0]);
    } catch (error) {
      logger.error('Error getting current image', { error, personId });
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
      is_current: row.is_current || false,
      created_at: row.created_at,
    };
  }
}

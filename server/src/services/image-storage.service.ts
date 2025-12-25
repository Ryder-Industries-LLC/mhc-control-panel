import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../config/logger.js';

export class ImageStorageService {
  private static readonly STORAGE_DIR = path.join(process.cwd(), 'data', 'images');
  private static readonly THUMBNAIL_DIR = path.join(ImageStorageService.STORAGE_DIR, 'thumbnails');

  /**
   * Initialize storage directories
   */
  static async init(): Promise<void> {
    try {
      await fs.mkdir(this.STORAGE_DIR, { recursive: true });
      await fs.mkdir(this.THUMBNAIL_DIR, { recursive: true });
      logger.info('Image storage directories initialized', {
        storage: this.STORAGE_DIR,
        thumbnails: this.THUMBNAIL_DIR,
      });
    } catch (error) {
      logger.error('Failed to initialize image storage directories', { error });
      throw error;
    }
  }

  /**
   * Download and save an image from a URL
   * Returns the local file path relative to the storage directory
   */
  static async downloadAndSave(
    imageUrl: string,
    username: string,
    type: 'thumbnail' | 'full' = 'full'
  ): Promise<string | null> {
    try {
      // Generate a unique filename based on username and timestamp
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(imageUrl).digest('hex').substring(0, 8);
      const filename = `${username}_${timestamp}_${hash}.jpg`;

      const targetDir = type === 'thumbnail' ? this.THUMBNAIL_DIR : this.STORAGE_DIR;
      const filePath = path.join(targetDir, filename);

      // Download the image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      // Save to disk
      await fs.writeFile(filePath, response.data);

      // Return the relative path from the storage directory
      const relativePath = type === 'thumbnail'
        ? path.join('thumbnails', filename)
        : filename;

      logger.debug('Image saved successfully', {
        username,
        type,
        url: imageUrl,
        path: relativePath,
      });

      return relativePath;
    } catch (error) {
      logger.error('Failed to download and save image', {
        error,
        username,
        imageUrl,
        type,
      });
      return null;
    }
  }

  /**
   * Download and save both thumbnail and full-size image
   */
  static async downloadBoth(
    imageUrl: string,
    imageUrl360x270: string,
    username: string
  ): Promise<{ thumbnail: string | null; full: string | null }> {
    const [thumbnail, full] = await Promise.all([
      this.downloadAndSave(imageUrl, username, 'thumbnail'),
      this.downloadAndSave(imageUrl360x270, username, 'full'),
    ]);

    return { thumbnail, full };
  }

  /**
   * Get the full path to an image file
   */
  static getImagePath(relativePath: string): string {
    return path.join(this.STORAGE_DIR, relativePath);
  }

  /**
   * Check if an image file exists
   */
  static async imageExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.getImagePath(relativePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete old images (cleanup utility)
   * Deletes images older than the specified number of days
   */
  static async cleanupOldImages(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      // Clean thumbnails
      const thumbnailFiles = await fs.readdir(this.THUMBNAIL_DIR);
      for (const file of thumbnailFiles) {
        const filePath = path.join(this.THUMBNAIL_DIR, file);
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      // Clean full images
      const imageFiles = await fs.readdir(this.STORAGE_DIR);
      for (const file of imageFiles) {
        if (file === 'thumbnails') continue; // Skip the thumbnails directory
        const filePath = path.join(this.STORAGE_DIR, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile() && stats.mtimeMs < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      logger.info('Cleaned up old images', { deletedCount, olderThanDays });
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old images', { error });
      return 0;
    }
  }
}

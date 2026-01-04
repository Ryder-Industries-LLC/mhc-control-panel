import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../config/logger.js';

export class ImageStorageService {
  private static readonly STORAGE_DIR = path.join(process.cwd(), 'data', 'images');
  private static readonly THUMBNAIL_DIR = path.join(ImageStorageService.STORAGE_DIR, 'thumbnails');
  private static readonly PROFILES_DIR = path.join(ImageStorageService.STORAGE_DIR, 'profiles');
  private static readonly VIDEOS_DIR = path.join(ImageStorageService.STORAGE_DIR, 'videos');

  // Known placeholder image patterns - these are generic "no image" placeholders
  private static readonly PLACEHOLDER_PATTERNS = [
    'no_image',
    'noimage',
    'placeholder',
    'default_avatar',
  ];

  // Chaturbate placeholder image is exactly 5045 bytes
  // We use 5100 as threshold to catch it while allowing real small thumbnails
  private static readonly PLACEHOLDER_SIZE = 5045;
  private static readonly PLACEHOLDER_SIZE_TOLERANCE = 100;

  /**
   * Initialize storage directories
   */
  static async init(): Promise<void> {
    try {
      await fs.mkdir(this.STORAGE_DIR, { recursive: true });
      await fs.mkdir(this.THUMBNAIL_DIR, { recursive: true });
      await fs.mkdir(this.PROFILES_DIR, { recursive: true });
      await fs.mkdir(this.VIDEOS_DIR, { recursive: true });
      logger.info('Image storage directories initialized', {
        storage: this.STORAGE_DIR,
        thumbnails: this.THUMBNAIL_DIR,
        profiles: this.PROFILES_DIR,
        videos: this.VIDEOS_DIR,
      });
    } catch (error) {
      logger.error('Failed to initialize image storage directories', { error });
      throw error;
    }
  }

  /**
   * Check if a URL points to a known placeholder image
   */
  static isPlaceholderUrl(imageUrl: string): boolean {
    const lowerUrl = imageUrl.toLowerCase();
    return this.PLACEHOLDER_PATTERNS.some(pattern => lowerUrl.includes(pattern));
  }

  /**
   * Check if image data is a placeholder based on file size
   * Chaturbate placeholder image is exactly 5045 bytes
   */
  static isPlaceholderBySize(data: Buffer): boolean {
    const size = data.length;
    return Math.abs(size - this.PLACEHOLDER_SIZE) <= this.PLACEHOLDER_SIZE_TOLERANCE;
  }

  /**
   * Download and save an image from a URL
   * Returns the local file path relative to the storage directory
   * Returns null if the image is detected as a placeholder
   */
  static async downloadAndSave(
    imageUrl: string,
    username: string,
    type: 'thumbnail' | 'full' = 'full'
  ): Promise<string | null> {
    try {
      // Check if URL is a known placeholder pattern
      if (this.isPlaceholderUrl(imageUrl)) {
        logger.debug('Skipping placeholder image URL', { username, imageUrl });
        return null;
      }

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

      // Check if downloaded image is a placeholder by size
      if (this.isPlaceholderBySize(response.data)) {
        logger.debug('Skipping placeholder image (detected by size)', {
          username,
          imageUrl,
          size: response.data.length,
        });
        return null;
      }

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
   * Clean up placeholder images from storage
   * Returns list of deleted filenames for database cleanup
   */
  static async cleanupPlaceholderImages(): Promise<string[]> {
    const deletedFiles: string[] = [];
    try {
      const imageFiles = await fs.readdir(this.STORAGE_DIR);
      for (const file of imageFiles) {
        if (file === 'thumbnails' || !file.endsWith('.jpg')) continue;
        const filePath = path.join(this.STORAGE_DIR, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile() && Math.abs(stats.size - this.PLACEHOLDER_SIZE) <= this.PLACEHOLDER_SIZE_TOLERANCE) {
          await fs.unlink(filePath);
          deletedFiles.push(file);
        }
      }
      logger.info('Cleaned up placeholder images', { count: deletedFiles.length });
    } catch (error) {
      logger.error('Failed to cleanup placeholder images', { error });
    }
    return deletedFiles;
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

  /**
   * Get file extension from URL or MIME type
   */
  private static getExtensionFromUrl(url: string, mimeType?: string): string {
    // Try to extract from URL path (before query params)
    const urlPath = url.split('?')[0];
    const urlExt = path.extname(urlPath).toLowerCase();
    if (urlExt && ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov'].includes(urlExt)) {
      return urlExt;
    }

    // Fall back to MIME type
    if (mimeType) {
      const mimeToExt: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
        'video/quicktime': '.mov',
      };
      return mimeToExt[mimeType] || '.bin';
    }

    return '.bin';
  }

  /**
   * Download and save a video from a URL
   * Returns object with local path and file size
   * Videos use signed URLs that expire, so download immediately
   */
  static async downloadVideo(
    videoUrl: string,
    personId: string,
    options?: {
      maxSizeBytes?: number;
      photosetId?: string;
      title?: string;
    }
  ): Promise<{ relativePath: string; fileSize: number; mimeType: string } | null> {
    try {
      // Create person-specific video directory
      const personVideoDir = path.join(this.PROFILES_DIR, personId);
      await fs.mkdir(personVideoDir, { recursive: true });

      // Generate unique filename
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(videoUrl).digest('hex').substring(0, 8);

      // First, make a HEAD request to check size before downloading
      let fileSize = 0;
      let mimeType = 'video/mp4';
      try {
        const headResponse = await axios.head(videoUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        });
        fileSize = parseInt(headResponse.headers['content-length'] || '0', 10);
        mimeType = headResponse.headers['content-type'] || 'video/mp4';

        // Check max size limit
        if (options?.maxSizeBytes && fileSize > options.maxSizeBytes) {
          logger.info('Skipping video - exceeds max size', {
            personId,
            videoUrl: videoUrl.substring(0, 100),
            fileSize,
            maxSize: options.maxSizeBytes,
          });
          return null;
        }
      } catch (headError) {
        // HEAD request failed, proceed with download anyway
        logger.debug('HEAD request failed, proceeding with download', { personId, error: headError });
      }

      const ext = this.getExtensionFromUrl(videoUrl, mimeType);
      const filename = `${timestamp}_${hash}${ext}`;
      const relativePath = path.join(personId, filename);
      const fullPath = path.join(this.PROFILES_DIR, relativePath);

      // Download the video with streaming for large files
      logger.info('Downloading video', {
        personId,
        url: videoUrl.substring(0, 100),
        estimatedSize: fileSize,
      });

      const response = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 300000, // 5 minute timeout for large videos
        maxContentLength: options?.maxSizeBytes || 1024 * 1024 * 1024, // 1GB default max
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      const actualSize = response.data.length;
      const actualMimeType = response.headers['content-type'] || mimeType;

      // Save to disk
      await fs.writeFile(fullPath, response.data);

      logger.info('Video saved successfully', {
        personId,
        path: relativePath,
        size: actualSize,
        mimeType: actualMimeType,
      });

      return {
        relativePath,
        fileSize: actualSize,
        mimeType: actualMimeType,
      };
    } catch (error) {
      logger.error('Failed to download video', {
        error,
        personId,
        videoUrl: videoUrl.substring(0, 100),
      });
      return null;
    }
  }

  /**
   * Download and save an image from a profile photoset
   * Downloads at full resolution (ignores any size constraints in URL)
   */
  static async downloadProfileImage(
    imageUrl: string,
    personId: string,
    options?: {
      photosetId?: string;
      title?: string;
    }
  ): Promise<{ relativePath: string; fileSize: number; mimeType: string } | null> {
    try {
      // Check if URL is a known placeholder pattern
      if (this.isPlaceholderUrl(imageUrl)) {
        logger.debug('Skipping placeholder image URL', { personId, imageUrl });
        return null;
      }

      // Create person-specific directory
      const personDir = path.join(this.PROFILES_DIR, personId);
      await fs.mkdir(personDir, { recursive: true });

      // Generate unique filename
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(imageUrl).digest('hex').substring(0, 8);

      // Download the image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      // Check if downloaded image is a placeholder by size
      if (this.isPlaceholderBySize(response.data)) {
        logger.debug('Skipping placeholder image (detected by size)', {
          personId,
          imageUrl,
          size: response.data.length,
        });
        return null;
      }

      const mimeType = response.headers['content-type'] || 'image/jpeg';
      const ext = this.getExtensionFromUrl(imageUrl, mimeType);
      const filename = `${timestamp}_${hash}${ext}`;
      const relativePath = path.join(personId, filename);
      const fullPath = path.join(this.PROFILES_DIR, relativePath);

      // Save to disk
      await fs.writeFile(fullPath, response.data);

      const fileSize = response.data.length;

      logger.debug('Profile image saved successfully', {
        personId,
        path: relativePath,
        size: fileSize,
      });

      return {
        relativePath,
        fileSize,
        mimeType,
      };
    } catch (error) {
      logger.error('Failed to download profile image', {
        error,
        personId,
        imageUrl: imageUrl.substring(0, 100),
      });
      return null;
    }
  }

  /**
   * Get the full path to a profile media file
   */
  static getProfileMediaPath(relativePath: string): string {
    return path.join(this.PROFILES_DIR, relativePath);
  }
}

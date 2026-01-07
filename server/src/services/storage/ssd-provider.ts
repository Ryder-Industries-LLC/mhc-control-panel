/**
 * SSD Storage Provider
 *
 * Stores files on a bind-mounted SSD at /mnt/ssd/mhc-images.
 * Supports creating username-based symlinks for human-browsable access.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseStorageProvider } from './base-provider.js';
import { StorageProviderType, StorageWriteResult, StorageReadResult, StorageFileStats, SymlinkCapableProvider } from './types.js';
import { logger } from '../../config/logger.js';

export class SSDProvider extends BaseStorageProvider implements SymlinkCapableProvider {
  readonly type: StorageProviderType = 'ssd';
  private basePath: string;
  private symlinkBasePath: string;
  private lastAvailableCheck: number = 0;
  private lastAvailableResult: boolean = false;
  private static readonly AVAILABILITY_CACHE_MS = 5000; // Cache availability for 5 seconds

  constructor(basePath: string = '/mnt/ssd/mhc-images') {
    super();
    this.basePath = basePath;
    // Symlinks are stored in a parallel 'usernames' directory
    this.symlinkBasePath = path.join(basePath, 'usernames');
  }

  /**
   * Check if SSD mount is available and writable
   * Uses a cached result to avoid filesystem thrashing
   */
  async isAvailable(): Promise<boolean> {
    const now = Date.now();

    // Return cached result if recent enough
    if (now - this.lastAvailableCheck < SSDProvider.AVAILABILITY_CACHE_MS) {
      return this.lastAvailableResult;
    }

    try {
      // Check basic access
      await fs.access(this.basePath, fs.constants.R_OK | fs.constants.W_OK);

      // Verify it's actually a directory (not a stale mount point)
      const stats = await fs.stat(this.basePath);
      if (!stats.isDirectory()) {
        this.lastAvailableResult = false;
        this.lastAvailableCheck = now;
        return false;
      }

      // Try to write a test file to verify mount is truly writable
      const testFile = path.join(this.basePath, '.ssd-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);

      this.lastAvailableResult = true;
      this.lastAvailableCheck = now;

      return true;
    } catch (error) {
      // Log only when availability changes
      if (this.lastAvailableResult === true) {
        logger.warn('[SSDProvider] SSD became unavailable', {
          path: this.basePath,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      this.lastAvailableResult = false;
      this.lastAvailableCheck = now;
      return false;
    }
  }

  /**
   * Force re-check availability (bypass cache)
   */
  async recheckAvailability(): Promise<boolean> {
    this.lastAvailableCheck = 0;
    return this.isAvailable();
  }

  /**
   * Write file to SSD
   */
  async write(relativePath: string, data: Buffer, mimeType?: string): Promise<StorageWriteResult> {
    const absolutePath = path.join(this.basePath, relativePath);
    const dir = path.dirname(absolutePath);

    // Quick availability check before attempting write
    if (!await this.isAvailable()) {
      logger.warn(`[SSDProvider] Write skipped - SSD unavailable: ${relativePath}`);
      return {
        success: false,
        relativePath,
        absolutePath,
        size: 0,
        sha256: '',
        error: 'SSD storage is not available',
      };
    }

    try {
      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(absolutePath, data);

      const sha256 = this.computeSha256(data);

      logger.debug(`[SSDProvider] Wrote file: ${relativePath} (${data.length} bytes)`);

      return {
        success: true,
        relativePath,
        absolutePath,
        size: data.length,
        sha256,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[SSDProvider] Write failed for ${relativePath}: ${message}`);

      // Mark as unavailable on write failure (likely ejected)
      if (message.includes('ENOENT') || message.includes('EROFS') || message.includes('EIO')) {
        this.lastAvailableResult = false;
        this.lastAvailableCheck = Date.now();
        logger.warn('[SSDProvider] SSD appears to have been ejected or become read-only');
      }

      return {
        success: false,
        relativePath,
        absolutePath,
        size: 0,
        sha256: '',
        error: message,
      };
    }
  }

  /**
   * Read file from SSD
   */
  async read(relativePath: string): Promise<StorageReadResult | null> {
    const absolutePath = path.join(this.basePath, relativePath);

    try {
      const data = await fs.readFile(absolutePath);
      return {
        data,
        size: data.length,
        mimeType: this.getMimeType(relativePath),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if file exists on SSD
   */
  async exists(relativePath: string): Promise<boolean> {
    const absolutePath = path.join(this.basePath, relativePath);
    try {
      await fs.access(absolutePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete file from SSD
   */
  async delete(relativePath: string): Promise<boolean> {
    const absolutePath = path.join(this.basePath, relativePath);
    try {
      await fs.unlink(absolutePath);
      logger.debug(`[SSDProvider] Deleted file: ${relativePath}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return true; // Already deleted
      }
      logger.error(`[SSDProvider] Delete failed for ${relativePath}: ${error}`);
      return false;
    }
  }

  /**
   * Get URL for serving file from SSD
   * Returns relative path for Express static serving
   */
  getServeUrl(relativePath: string): string {
    // Express serves from /ssd-images/* mapped to the SSD mount
    return `/ssd-images/${relativePath}`;
  }

  /**
   * Get file stats from SSD
   */
  async getStats(relativePath: string): Promise<StorageFileStats | null> {
    const absolutePath = path.join(this.basePath, relativePath);

    try {
      const stats = await fs.stat(absolutePath);
      const data = await fs.readFile(absolutePath);
      const sha256 = this.computeSha256(data);

      return {
        size: stats.size,
        sha256,
        mimeType: this.getMimeType(relativePath),
        modifiedAt: stats.mtime,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a username-based symlink to a file
   *
   * Creates: usernames/{username}/{filename} -> ../../profiles/{person_id}/YYYY/MM/{filename}
   *
   * @param relativePath The canonical path (profiles/{person_id}/YYYY/MM/{id}.ext)
   * @param username The username for the symlink directory
   */
  async createSymlink(relativePath: string, username: string): Promise<boolean> {
    if (!username) {
      logger.warn('[SSDProvider] Cannot create symlink: username is empty');
      return false;
    }

    const filename = this.getFilename(relativePath);
    const symlinkDir = path.join(this.symlinkBasePath, username.toLowerCase());
    const symlinkPath = path.join(symlinkDir, filename);

    // Calculate relative path from symlink to target
    // From: usernames/{username}/{filename}
    // To:   profiles/{person_id}/YYYY/MM/{filename}
    // Need: ../../profiles/{person_id}/YYYY/MM/{filename}
    const targetPath = path.join('..', '..', relativePath);

    try {
      // Ensure symlink directory exists
      await fs.mkdir(symlinkDir, { recursive: true });

      // Remove existing symlink if present
      try {
        await fs.unlink(symlinkPath);
      } catch (e) {
        // Ignore if doesn't exist
      }

      // Create symlink (relative path)
      await fs.symlink(targetPath, symlinkPath);

      logger.debug(`[SSDProvider] Created symlink: ${symlinkPath} -> ${targetPath}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[SSDProvider] Failed to create symlink for ${username}/${filename}: ${message}`);
      return false;
    }
  }

  /**
   * Remove a username symlink
   */
  async removeSymlink(relativePath: string, username: string): Promise<boolean> {
    if (!username) {
      return false;
    }

    const filename = this.getFilename(relativePath);
    const symlinkPath = path.join(this.symlinkBasePath, username.toLowerCase(), filename);

    try {
      await fs.unlink(symlinkPath);
      logger.debug(`[SSDProvider] Removed symlink: ${symlinkPath}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return true; // Already removed
      }
      logger.error(`[SSDProvider] Failed to remove symlink: ${symlinkPath}`);
      return false;
    }
  }

  /**
   * Get the base path for this provider
   */
  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Get the symlink base path
   */
  getSymlinkBasePath(): string {
    return this.symlinkBasePath;
  }
}

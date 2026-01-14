/**
 * SSD Storage Provider
 *
 * Stores files on a bind-mounted SSD at /mnt/ssd/mhc-images.
 * Supports creating username-based symlinks for human-browsable access.
 *
 * New path structure (v1.29.0):
 * /mnt/ssd/mhc-images/
 *   people/{username}/
 *     auto/       - affiliate_api thumbnails
 *     uploads/    - manual_upload, external, imported
 *     snaps/      - screensnap (live screenshots)
 *     profile/    - profile scrape images
 *     all/        - symlinks to all files in above folders
 *   all/          - global symlinks: {username}_{filename}
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseStorageProvider } from './base-provider.js';
import { StorageProviderType, StorageWriteResult, StorageReadResult, StorageFileStats, SymlinkCapableProvider } from './types.js';
import { logger } from '../../config/logger.js';

export interface DiskSpaceInfo {
  total: number;       // bytes
  used: number;        // bytes
  free: number;        // bytes
  usedPercent: number; // 0-100
}

// Source types mapped to folder names
export type MediaSource = 'affiliate_api' | 'manual_upload' | 'screensnap' | 'following_snap' | 'profile' | 'external' | 'imported';

const SOURCE_TO_FOLDER: Record<string, string> = {
  'affiliate_api': 'auto',
  'manual_upload': 'uploads',
  'screensnap': 'snaps',
  'following_snap': 'following',
  'profile': 'profile',
  'external': 'uploads',
  'imported': 'uploads',
};

export class SSDProvider extends BaseStorageProvider implements SymlinkCapableProvider {
  readonly type: StorageProviderType = 'ssd';
  private basePath: string;
  private symlinkBasePath: string;
  private peopleBasePath: string;
  private globalAllPath: string;
  private lastAvailableCheck: number = 0;
  private lastAvailableResult: boolean = false;
  private static readonly AVAILABILITY_CACHE_MS = 5000; // Cache availability for 5 seconds

  // Health tracking
  private _lastHealthCheckTime: Date | null = null;
  private _lastError: string | null = null;
  private _unavailableSince: Date | null = null;

  constructor(basePath: string = '/mnt/ssd/mhc-images') {
    super();
    this.basePath = basePath;
    // Symlinks are stored in a parallel 'usernames' directory (legacy)
    this.symlinkBasePath = path.join(basePath, 'usernames');
    // New structure paths
    this.peopleBasePath = path.join(basePath, 'people');
    this.globalAllPath = path.join(basePath, 'all');
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

    this._lastHealthCheckTime = new Date();

    try {
      // Check basic access
      await fs.access(this.basePath, fs.constants.R_OK | fs.constants.W_OK);

      // Verify it's actually a directory (not a stale mount point)
      const stats = await fs.stat(this.basePath);
      if (!stats.isDirectory()) {
        this._lastError = 'Mount point is not a directory';
        if (!this._unavailableSince) {
          this._unavailableSince = new Date();
        }
        this.lastAvailableResult = false;
        this.lastAvailableCheck = now;
        return false;
      }

      // Try to write a test file to verify mount is truly writable
      const testFile = path.join(this.basePath, '.ssd-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);

      // Clear error state on success
      this._lastError = null;
      this._unavailableSince = null;
      this.lastAvailableResult = true;
      this.lastAvailableCheck = now;

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this._lastError = errorMessage;

      // Log only when availability changes
      if (this.lastAvailableResult === true) {
        this._unavailableSince = new Date();
        logger.warn('[SSDProvider] SSD became unavailable', {
          path: this.basePath,
          error: errorMessage
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

  // ==========================================
  // New username-based path structure methods
  // ==========================================

  /**
   * Map source type to folder name
   */
  sourceToFolder(source: string): string {
    return SOURCE_TO_FOLDER[source] || 'uploads';
  }

  /**
   * Generate username-based path for new storage structure
   * Returns: people/{username}/{folder}/{filename}
   */
  generateUsernamePath(username: string, source: string, filename: string): string {
    const folder = this.sourceToFolder(source);
    return path.join('people', username.toLowerCase(), folder, filename);
  }

  /**
   * Write file with username-based path and create symlinks
   */
  async writeWithUsername(
    username: string,
    source: string,
    filename: string,
    data: Buffer,
    mimeType?: string
  ): Promise<StorageWriteResult & { symlinkCreated: boolean; globalSymlinkCreated: boolean }> {
    const relativePath = this.generateUsernamePath(username, source, filename);
    const result = await this.write(relativePath, data, mimeType);

    let symlinkCreated = false;
    let globalSymlinkCreated = false;

    if (result.success) {
      // Create per-user /all/ symlink
      symlinkCreated = await this.createUserAllSymlink(username, filename, relativePath);
      // Create global /all/ symlink
      globalSymlinkCreated = await this.createGlobalAllSymlink(username, filename, relativePath);
    }

    return {
      ...result,
      symlinkCreated,
      globalSymlinkCreated,
    };
  }

  /**
   * Create per-user /all/ symlink
   * Creates: people/{username}/all/{filename} -> ../{folder}/{filename}
   */
  async createUserAllSymlink(username: string, filename: string, sourcePath: string): Promise<boolean> {
    if (!username) {
      logger.warn('[SSDProvider] Cannot create user all symlink: username is empty');
      return false;
    }

    const userAllDir = path.join(this.peopleBasePath, username.toLowerCase(), 'all');
    const symlinkPath = path.join(userAllDir, filename);

    // Extract folder from sourcePath (e.g., people/username/snaps/file.jpg -> snaps)
    const parts = sourcePath.split('/');
    const folder = parts[parts.length - 2]; // The folder before the filename

    // Relative path from all/ to source folder: ../{folder}/{filename}
    const targetPath = path.join('..', folder, filename);

    try {
      // Ensure all directory exists
      await fs.mkdir(userAllDir, { recursive: true });

      // Remove existing symlink if present
      try {
        await fs.unlink(symlinkPath);
      } catch {
        // Ignore if doesn't exist
      }

      // Create symlink
      await fs.symlink(targetPath, symlinkPath);

      logger.debug(`[SSDProvider] Created user all symlink: ${symlinkPath} -> ${targetPath}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[SSDProvider] Failed to create user all symlink for ${username}/${filename}: ${message}`);
      return false;
    }
  }

  /**
   * Create global /all/ symlink
   * Creates: all/{username}_{filename} -> ../people/{username}/{folder}/{filename}
   */
  async createGlobalAllSymlink(username: string, filename: string, sourcePath: string): Promise<boolean> {
    if (!username) {
      logger.warn('[SSDProvider] Cannot create global all symlink: username is empty');
      return false;
    }

    // Use username prefix to avoid collisions
    const symlinkName = `${username.toLowerCase()}_${filename}`;
    const symlinkPath = path.join(this.globalAllPath, symlinkName);

    // Relative path from all/ to source: ../people/{username}/{folder}/{filename}
    // sourcePath is already: people/{username}/{folder}/{filename}
    const targetPath = path.join('..', sourcePath);

    try {
      // Ensure global all directory exists
      await fs.mkdir(this.globalAllPath, { recursive: true });

      // Remove existing symlink if present
      try {
        await fs.unlink(symlinkPath);
      } catch {
        // Ignore if doesn't exist
      }

      // Create symlink
      await fs.symlink(targetPath, symlinkPath);

      logger.debug(`[SSDProvider] Created global all symlink: ${symlinkPath} -> ${targetPath}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[SSDProvider] Failed to create global all symlink for ${symlinkName}: ${message}`);
      return false;
    }
  }

  /**
   * Remove both user and global symlinks for a file
   */
  async removeAllSymlinks(username: string, filename: string): Promise<{ userRemoved: boolean; globalRemoved: boolean }> {
    let userRemoved = false;
    let globalRemoved = false;

    if (!username) {
      return { userRemoved, globalRemoved };
    }

    // Remove user all symlink
    const userSymlinkPath = path.join(this.peopleBasePath, username.toLowerCase(), 'all', filename);
    try {
      await fs.unlink(userSymlinkPath);
      userRemoved = true;
    } catch {
      userRemoved = true; // Already removed
    }

    // Remove global all symlink
    const globalSymlinkPath = path.join(this.globalAllPath, `${username.toLowerCase()}_${filename}`);
    try {
      await fs.unlink(globalSymlinkPath);
      globalRemoved = true;
    } catch {
      globalRemoved = true; // Already removed
    }

    return { userRemoved, globalRemoved };
  }

  /**
   * Get the people base path
   */
  getPeopleBasePath(): string {
    return this.peopleBasePath;
  }

  /**
   * Get the global all path
   */
  getGlobalAllPath(): string {
    return this.globalAllPath;
  }

  /**
   * List all files in a user's folder of a specific type
   */
  async listUserFiles(username: string, source?: string): Promise<string[]> {
    const userDir = path.join(this.peopleBasePath, username.toLowerCase());
    const files: string[] = [];

    try {
      if (source) {
        // List files in specific folder
        const folder = this.sourceToFolder(source);
        const folderPath = path.join(userDir, folder);
        try {
          const entries = await fs.readdir(folderPath);
          for (const entry of entries) {
            files.push(path.join('people', username.toLowerCase(), folder, entry));
          }
        } catch {
          // Folder doesn't exist
        }
      } else {
        // List files in all folders
        for (const folder of Object.values(SOURCE_TO_FOLDER)) {
          const folderPath = path.join(userDir, folder);
          try {
            const entries = await fs.readdir(folderPath);
            for (const entry of entries) {
              files.push(path.join('people', username.toLowerCase(), folder, entry));
            }
          } catch {
            // Folder doesn't exist
          }
        }
      }
    } catch {
      // User directory doesn't exist
    }

    return files;
  }

  // ==========================================
  // Health and status tracking methods
  // ==========================================

  /**
   * Get disk space information for the SSD mount
   * Returns null if unable to get disk space (e.g., mount unavailable)
   */
  async getDiskSpace(): Promise<DiskSpaceInfo | null> {
    try {
      const stats = await fs.statfs(this.basePath);
      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      const used = total - free;
      const usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;

      return {
        total,
        used,
        free,
        usedPercent,
      };
    } catch (error) {
      logger.debug('[SSDProvider] Failed to get disk space:', error);
      return null;
    }
  }

  /**
   * Get the last health check timestamp
   */
  get lastHealthCheckTime(): Date | null {
    return this._lastHealthCheckTime;
  }

  /**
   * Get the last error message (null if no error)
   */
  get lastError(): string | null {
    return this._lastError;
  }

  /**
   * Get the timestamp when SSD became unavailable (null if available)
   */
  get unavailableSince(): Date | null {
    return this._unavailableSince;
  }
}

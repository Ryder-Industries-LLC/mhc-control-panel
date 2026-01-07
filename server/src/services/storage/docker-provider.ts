/**
 * Docker Volume Storage Provider
 *
 * Stores files in the Docker named volume at /app/data/images.
 * This is the default provider for backward compatibility.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseStorageProvider } from './base-provider.js';
import { StorageProviderType, StorageWriteResult, StorageReadResult, StorageFileStats } from './types.js';
import { logger } from '../../config/logger.js';

export class DockerProvider extends BaseStorageProvider {
  readonly type: StorageProviderType = 'docker';
  private basePath: string;

  constructor(basePath: string = '/app/data/images') {
    super();
    this.basePath = basePath;
  }

  /**
   * Check if Docker volume is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.basePath, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Write file to Docker volume
   */
  async write(relativePath: string, data: Buffer, mimeType?: string): Promise<StorageWriteResult> {
    const absolutePath = path.join(this.basePath, relativePath);
    const dir = path.dirname(absolutePath);

    try {
      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(absolutePath, data);

      const sha256 = this.computeSha256(data);

      logger.debug(`[DockerProvider] Wrote file: ${relativePath} (${data.length} bytes)`);

      return {
        success: true,
        relativePath,
        absolutePath,
        size: data.length,
        sha256,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[DockerProvider] Write failed for ${relativePath}: ${message}`);
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
   * Read file from Docker volume
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
   * Check if file exists in Docker volume
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
   * Delete file from Docker volume
   */
  async delete(relativePath: string): Promise<boolean> {
    const absolutePath = path.join(this.basePath, relativePath);
    try {
      await fs.unlink(absolutePath);
      logger.debug(`[DockerProvider] Deleted file: ${relativePath}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return true; // Already deleted
      }
      logger.error(`[DockerProvider] Delete failed for ${relativePath}: ${error}`);
      return false;
    }
  }

  /**
   * Get URL for serving file from Docker volume
   * Returns relative path for Express static serving
   */
  getServeUrl(relativePath: string): string {
    // Express serves from /images/* mapped to the Docker volume
    return `/images/${relativePath}`;
  }

  /**
   * Get file stats from Docker volume
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
   * Get the base path for this provider
   */
  getBasePath(): string {
    return this.basePath;
  }
}

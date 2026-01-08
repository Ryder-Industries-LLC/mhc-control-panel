/**
 * Storage Migration Job
 *
 * Migrates images from legacy UUID-based paths to new username-based paths.
 * Creates symlinks in /all/ folders for easy browsing.
 */

import { query, pool } from '../db/client.js';
import { logger } from '../config/logger.js';
import { storageService } from '../services/storage/storage.service.js';
import { JobPersistenceService } from '../services/job-persistence.service.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const JOB_NAME = 'storage-migration';

export interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  currentFile: string | null;
  startedAt: Date | null;
  lastError: string | null;
}

export class StorageMigrationJob {
  private isRunning = false;
  private isPaused = false;
  private stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    currentFile: null,
    startedAt: null,
    lastError: null,
  };

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      stats: this.stats,
    };
  }

  /**
   * Start the migration
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[StorageMigration] Already running');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.stats = {
      total: 0,
      migrated: 0,
      skipped: 0,
      failed: 0,
      currentFile: null,
      startedAt: new Date(),
      lastError: null,
    };

    logger.info('[StorageMigration] Starting migration job');

    try {
      await this.runMigration();
    } catch (error) {
      logger.error('[StorageMigration] Migration failed:', error);
      this.stats.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.isRunning = false;
      this.stats.currentFile = null;
      logger.info('[StorageMigration] Migration complete', this.stats);
    }
  }

  /**
   * Pause the migration
   */
  pause(): void {
    if (this.isRunning && !this.isPaused) {
      this.isPaused = true;
      logger.info('[StorageMigration] Paused');
    }
  }

  /**
   * Resume the migration
   */
  resume(): void {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      logger.info('[StorageMigration] Resumed');
    }
  }

  /**
   * Stop the migration
   */
  stop(): void {
    this.isRunning = false;
    this.isPaused = false;
    logger.info('[StorageMigration] Stopped');
  }

  /**
   * Run the migration process
   */
  private async runMigration(): Promise<void> {
    // Get SSD provider
    const ssdProvider = storageService.getSSDProvider();
    if (!ssdProvider || !await ssdProvider.isAvailable()) {
      throw new Error('SSD provider not available');
    }

    const ssdBasePath = ssdProvider.getBasePath();
    const dockerProvider = storageService.getDockerProvider();
    const dockerBasePath = dockerProvider?.getBasePath() || '/app/data/images';

    // Count total images to migrate (those without new username-based paths)
    const countResult = await query(`
      SELECT COUNT(*) as count
      FROM profile_images pi
      JOIN persons p ON pi.person_id = p.id
      WHERE pi.file_path NOT LIKE 'people/%'
    `);
    this.stats.total = parseInt(countResult.rows[0].count);

    logger.info(`[StorageMigration] Found ${this.stats.total} images to migrate`);

    // Process in batches
    // NOTE: We don't use OFFSET because each migrated record is removed from the result set
    // (its file_path changes from UUID format to people/ format)
    const batchSize = 100;

    while (this.isRunning && !this.isPaused) {
      // Get batch of images to migrate (always from the beginning since we modify them)
      const batchResult = await query(`
        SELECT
          pi.id,
          pi.file_path,
          pi.source,
          pi.storage_provider,
          pi.person_id,
          p.username
        FROM profile_images pi
        JOIN persons p ON pi.person_id = p.id
        WHERE pi.file_path NOT LIKE 'people/%'
        ORDER BY pi.created_at ASC
        LIMIT $1
      `, [batchSize]);

      if (batchResult.rows.length === 0) {
        break; // No more images to migrate
      }

      for (const image of batchResult.rows as Array<{
        id: string;
        file_path: string;
        source: string;
        storage_provider: string | null;
        person_id: string;
        username: string;
      }>) {
        if (!this.isRunning || this.isPaused) break;

        await this.migrateImage(image, ssdBasePath, dockerBasePath);
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Wait for pause to be released
    while (this.isPaused && this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Migrate a single image
   */
  private async migrateImage(
    image: {
      id: string;
      file_path: string;
      source: string;
      storage_provider: string | null;
      person_id: string;
      username: string;
    },
    ssdBasePath: string,
    dockerBasePath: string
  ): Promise<void> {
    this.stats.currentFile = image.file_path;

    try {
      // Determine source location
      let sourceFullPath: string;
      if (image.storage_provider === 'ssd') {
        sourceFullPath = path.join(ssdBasePath, image.file_path);
      } else if (image.storage_provider === 'docker' || !image.storage_provider) {
        // Try SSD first, then Docker
        const ssdPath = path.join(ssdBasePath, image.file_path);
        const dockerPath = path.join(dockerBasePath, image.file_path);

        try {
          await fs.access(ssdPath);
          sourceFullPath = ssdPath;
        } catch {
          try {
            await fs.access(dockerPath);
            sourceFullPath = dockerPath;
          } catch {
            // Try profiles subdirectory
            const profilesSsdPath = path.join(ssdBasePath, 'profiles', image.file_path);
            const profilesDockerPath = path.join(dockerBasePath, 'profiles', image.file_path);

            try {
              await fs.access(profilesSsdPath);
              sourceFullPath = profilesSsdPath;
            } catch {
              try {
                await fs.access(profilesDockerPath);
                sourceFullPath = profilesDockerPath;
              } catch {
                logger.debug(`[StorageMigration] File not found, skipping: ${image.file_path}`);
                this.stats.skipped++;
                return;
              }
            }
          }
        }
      } else {
        logger.debug(`[StorageMigration] Unknown storage provider, skipping: ${image.storage_provider}`);
        this.stats.skipped++;
        return;
      }

      // Read the file
      const data = await fs.readFile(sourceFullPath);

      // Calculate SHA256
      const sha256 = crypto.createHash('sha256').update(data).digest('hex');

      // Determine new path based on source type
      const sourceToFolder: Record<string, string> = {
        'affiliate_api': 'auto',
        'manual_upload': 'uploads',
        'screensnap': 'snaps',
        'profile': 'profile',
        'external': 'uploads',
        'imported': 'uploads',
      };

      const folder = sourceToFolder[image.source] || 'uploads';
      const filename = path.basename(image.file_path);
      const newRelativePath = `people/${image.username}/${folder}/${filename}`;
      const newFullPath = path.join(ssdBasePath, newRelativePath);

      // Create directory if needed
      await fs.mkdir(path.dirname(newFullPath), { recursive: true });

      // Copy file to new location
      await fs.writeFile(newFullPath, data);

      // Verify SHA256
      const newData = await fs.readFile(newFullPath);
      const newSha256 = crypto.createHash('sha256').update(newData).digest('hex');
      if (sha256 !== newSha256) {
        throw new Error('SHA256 mismatch after copy');
      }

      // Create symlinks
      const ssdProvider = storageService.getSSDProvider();
      if (ssdProvider) {
        await ssdProvider.createUserAllSymlink(image.username, filename, newRelativePath);
        await ssdProvider.createGlobalAllSymlink(image.username, filename, newRelativePath);
      }

      // Update database with new path and set legacy_file_path
      await query(`
        UPDATE profile_images
        SET
          file_path = $1,
          legacy_file_path = $2,
          storage_provider = 'ssd',
          username = $3
        WHERE id = $4
      `, [newRelativePath, image.file_path, image.username, image.id]);

      this.stats.migrated++;

      logger.debug(`[StorageMigration] Migrated: ${image.file_path} -> ${newRelativePath}`);

    } catch (error) {
      this.stats.failed++;
      this.stats.lastError = error instanceof Error ? error.message : String(error);
      logger.error(`[StorageMigration] Failed to migrate ${image.file_path}:`, error);
    }
  }

  /**
   * Cleanup: Delete old files after migration is verified
   * Only run this after confirming migration was successful
   */
  async cleanupLegacyFiles(): Promise<{ deleted: number; errors: number }> {
    let deleted = 0;
    let errors = 0;

    const result = await query(`
      SELECT legacy_file_path, storage_provider
      FROM profile_images
      WHERE legacy_file_path IS NOT NULL
    `);

    const dockerProvider = storageService.getDockerProvider();
    const ssdProvider = storageService.getSSDProvider();

    for (const row of result.rows) {
      try {
        const legacyPath = row.legacy_file_path;

        // Try to delete from both locations
        if (dockerProvider) {
          const dockerPath = path.join(dockerProvider.getBasePath(), legacyPath);
          try {
            await fs.unlink(dockerPath);
            deleted++;
          } catch {
            // File might not exist in Docker
          }
        }

        if (ssdProvider) {
          const ssdPath = path.join(ssdProvider.getBasePath(), legacyPath);
          try {
            await fs.unlink(ssdPath);
            deleted++;
          } catch {
            // File might not exist on SSD
          }
        }
      } catch (error) {
        errors++;
        logger.error('[StorageMigration] Error cleaning up legacy file:', error);
      }
    }

    logger.info(`[StorageMigration] Cleanup complete: ${deleted} files deleted, ${errors} errors`);
    return { deleted, errors };
  }
}

export const storageMigrationJob = new StorageMigrationJob();

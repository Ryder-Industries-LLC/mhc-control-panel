/**
 * Transfer Service
 *
 * Handles safe file transfers between storage providers.
 * Implements copy → verify → update → delete pattern to prevent data loss.
 */

import { pool } from '../../db/client.js';
import { StorageProvider, StorageProviderType, TransferResult, TransferStats, isSymlinkCapable } from './types.js';
import { storageService } from './storage.service.js';
import { logger } from '../../config/logger.js';

export interface TransferOptions {
  createSymlinks?: boolean;
  deleteSource?: boolean;
  batchSize?: number;
}

class TransferService {
  private stats: TransferStats = {
    totalTransferred: 0,
    totalFailed: 0,
    totalSkipped: 0,
  };

  /**
   * Get current transfer statistics
   */
  getStats(): TransferStats {
    return { ...this.stats };
  }

  /**
   * Reset transfer statistics
   */
  resetStats(): void {
    this.stats = {
      totalTransferred: 0,
      totalFailed: 0,
      totalSkipped: 0,
    };
  }

  /**
   * Transfer a single file between providers
   *
   * Safe transfer steps:
   * 1. Read file from source
   * 2. Write to destination
   * 3. Verify SHA256 matches
   * 4. Update database record
   * 5. Delete from source (only after verification)
   * 6. Create symlink if destination supports it
   */
  async transferFile(
    imageId: string,
    sourceProvider: StorageProvider,
    destProvider: StorageProvider,
    options: TransferOptions = {}
  ): Promise<TransferResult> {
    const { createSymlinks = true, deleteSource = true } = options;

    // Get image info from database
    const imageResult = await pool.query(
      `SELECT pi.id, pi.person_id, pi.file_path, pi.storage_provider, pi.sha256,
              p.username
       FROM profile_images pi
       JOIN persons p ON p.id = pi.person_id
       WHERE pi.id = $1`,
      [imageId]
    );

    if (imageResult.rows.length === 0) {
      return {
        success: false,
        imageId,
        sourceProvider: sourceProvider.type,
        destProvider: destProvider.type,
        relativePath: '',
        size: 0,
        sha256: '',
        error: 'Image not found in database',
      };
    }

    const image = imageResult.rows[0];
    const relativePath = image.file_path;
    const username = image.username;

    // Skip if already on destination provider
    if (image.storage_provider === destProvider.type) {
      this.stats.totalSkipped++;
      return {
        success: true,
        imageId,
        sourceProvider: sourceProvider.type,
        destProvider: destProvider.type,
        relativePath,
        size: 0,
        sha256: image.sha256 || '',
        error: 'Already on destination provider',
      };
    }

    try {
      // Step 1: Read from source
      const sourceData = await sourceProvider.read(relativePath);
      if (!sourceData) {
        this.stats.totalFailed++;
        return {
          success: false,
          imageId,
          sourceProvider: sourceProvider.type,
          destProvider: destProvider.type,
          relativePath,
          size: 0,
          sha256: '',
          error: 'File not found on source provider',
        };
      }

      // Step 2: Write to destination
      const writeResult = await destProvider.write(relativePath, sourceData.data, sourceData.mimeType);
      if (!writeResult.success) {
        this.stats.totalFailed++;
        return {
          success: false,
          imageId,
          sourceProvider: sourceProvider.type,
          destProvider: destProvider.type,
          relativePath,
          size: 0,
          sha256: '',
          error: `Write failed: ${writeResult.error}`,
        };
      }

      // Step 3: Verify SHA256
      const destStats = await destProvider.getStats(relativePath);
      if (!destStats || destStats.sha256 !== writeResult.sha256) {
        // Verification failed - delete the bad copy
        await destProvider.delete(relativePath);
        this.stats.totalFailed++;
        return {
          success: false,
          imageId,
          sourceProvider: sourceProvider.type,
          destProvider: destProvider.type,
          relativePath,
          size: 0,
          sha256: '',
          error: 'SHA256 verification failed',
        };
      }

      // Step 4: Update database record
      await pool.query(
        `UPDATE profile_images
         SET storage_provider = $1, sha256 = $2
         WHERE id = $3`,
        [destProvider.type, writeResult.sha256, imageId]
      );

      // Step 5: Delete from source (only after DB update)
      if (deleteSource) {
        const deleted = await sourceProvider.delete(relativePath);
        if (!deleted) {
          logger.warn(`[TransferService] Failed to delete source file: ${relativePath}`);
        }
      }

      // Step 6: Create symlink if supported
      let symlinkCreated = false;
      if (createSymlinks && username && isSymlinkCapable(destProvider)) {
        symlinkCreated = await destProvider.createSymlink(relativePath, username);
      }

      this.stats.totalTransferred++;
      this.stats.lastRunAt = new Date();

      logger.info(`[TransferService] Transferred ${relativePath} from ${sourceProvider.type} to ${destProvider.type}`);

      return {
        success: true,
        imageId,
        sourceProvider: sourceProvider.type,
        destProvider: destProvider.type,
        relativePath,
        size: writeResult.size,
        sha256: writeResult.sha256,
        symlinkCreated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.stats.totalFailed++;
      this.stats.lastError = message;

      logger.error(`[TransferService] Transfer failed for ${imageId}: ${message}`);

      return {
        success: false,
        imageId,
        sourceProvider: sourceProvider.type,
        destProvider: destProvider.type,
        relativePath,
        size: 0,
        sha256: '',
        error: message,
      };
    }
  }

  /**
   * Transfer a batch of files from source to destination
   */
  async transferBatch(
    sourceType: StorageProviderType,
    destType: StorageProviderType,
    options: TransferOptions = {}
  ): Promise<{ transferred: number; failed: number; skipped: number }> {
    const { batchSize = 100 } = options;

    const sourceProvider = storageService.getProvider(sourceType);
    const destProvider = storageService.getProvider(destType);

    if (!sourceProvider || !destProvider) {
      logger.error(`[TransferService] Invalid providers: ${sourceType} -> ${destType}`);
      return { transferred: 0, failed: 0, skipped: 0 };
    }

    // Get batch of images from source provider
    const imagesResult = await pool.query(
      `SELECT id FROM profile_images
       WHERE storage_provider = $1
       ORDER BY uploaded_at ASC
       LIMIT $2`,
      [sourceType, batchSize]
    );

    let transferred = 0;
    let failed = 0;
    let skipped = 0;

    this.stats.currentBatchProgress = {
      current: 0,
      total: imagesResult.rows.length,
    };

    for (const row of imagesResult.rows) {
      const result = await this.transferFile(row.id, sourceProvider, destProvider, options);

      if (result.success) {
        if (result.error?.includes('Already on destination')) {
          skipped++;
        } else {
          transferred++;
        }
      } else {
        failed++;
      }

      this.stats.currentBatchProgress.current++;
    }

    this.stats.currentBatchProgress = undefined;

    return { transferred, failed, skipped };
  }

  /**
   * Get count of files pending transfer from source to destination
   */
  async getPendingCount(sourceType: StorageProviderType): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM profile_images WHERE storage_provider = $1`,
      [sourceType]
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Determine the best destination provider based on configuration
   */
  async getAutoDestination(): Promise<StorageProviderType | null> {
    const config = storageService.getConfig();

    // If global mode is remote and S3 is enabled
    if (config.globalMode === 'remote' && config.external.enabled) {
      const s3Provider = storageService.getS3Provider();
      if (s3Provider && await s3Provider.isAvailable()) {
        return 's3';
      }
    }

    // Local mode - prefer SSD
    if (config.local.ssdEnabled) {
      const ssdProvider = storageService.getSSDProvider();
      if (ssdProvider && await ssdProvider.isAvailable()) {
        return 'ssd';
      }
    }

    return null;
  }

  /**
   * Backfill SHA256 hashes for images missing them
   */
  async backfillSha256(batchSize: number = 100): Promise<{ updated: number; failed: number }> {
    const imagesResult = await pool.query(
      `SELECT id, file_path, storage_provider FROM profile_images
       WHERE sha256 IS NULL
       LIMIT $1`,
      [batchSize]
    );

    let updated = 0;
    let failed = 0;

    for (const row of imagesResult.rows) {
      try {
        const provider = storageService.getProvider(row.storage_provider as StorageProviderType);
        if (!provider) {
          failed++;
          continue;
        }

        const stats = await provider.getStats(row.file_path);
        if (!stats) {
          failed++;
          continue;
        }

        await pool.query(
          `UPDATE profile_images SET sha256 = $1 WHERE id = $2`,
          [stats.sha256, row.id]
        );
        updated++;
      } catch (error) {
        failed++;
        logger.error(`[TransferService] Failed to backfill SHA256 for ${row.id}: ${error}`);
      }
    }

    return { updated, failed };
  }
}

// Export singleton instance
export const transferService = new TransferService();

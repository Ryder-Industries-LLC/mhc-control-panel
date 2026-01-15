/**
 * Image Consolidation Service
 *
 * Handles image deduplication, SSD to S3 migration, and orphan cleanup.
 * Part of the v1.35 image storage consolidation project.
 */

import { query, pool } from '../db/client.js';
import { storageService } from './storage/storage.service.js';
import { logger } from '../config/logger.js';
import fs from 'fs/promises';
import path from 'path';

export interface DuplicateImage {
  source_url: string;
  person_id: string;
  ids: string[];
  file_paths: string[];
  created_ats: Date[];
  keep_id: string;
  remove_ids: string[];
}

export interface MigrationResult {
  success: boolean;
  migrated: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export interface DeduplicationResult {
  success: boolean;
  duplicatesFound: number;
  duplicatesRemoved: number;
  errors: string[];
  details: DuplicateImage[];
}

export interface ConsolidationReport {
  timestamp: Date;
  baseline: {
    totalImages: number;
    byStorage: Record<string, number>;
    bySource: Record<string, { count: number; sizeBytes: number }>;
    duplicates: number;
    ssdFiles: number;
    ssdSize: number;
    s3Objects: number;
    s3Size: number;
  };
  after?: {
    totalImages: number;
    byStorage: Record<string, number>;
    bySource: Record<string, { count: number; sizeBytes: number }>;
    duplicates: number;
  };
  operations: {
    duplicatesRemoved: number;
    imagesMigrated: number;
    brokenImagesRemoved: number;
    storageReduced: number;
  };
}

export class ImageConsolidationService {

  /**
   * Find all duplicate images (same source_url + person_id)
   */
  static async findDuplicates(): Promise<DuplicateImage[]> {
    const sql = `
      SELECT
        source_url,
        person_id,
        array_agg(id ORDER BY created_at ASC) as ids,
        array_agg(file_path ORDER BY created_at ASC) as file_paths,
        array_agg(created_at ORDER BY created_at ASC) as created_ats
      FROM profile_images
      WHERE source_url IS NOT NULL
      GROUP BY source_url, person_id
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;

    const result = await query<{
      source_url: string;
      person_id: string;
      ids: string[];
      file_paths: string[];
      created_ats: Date[];
    }>(sql, []);

    return result.rows.map(row => ({
      source_url: row.source_url,
      person_id: row.person_id,
      ids: row.ids,
      file_paths: row.file_paths,
      created_ats: row.created_ats,
      keep_id: row.ids[0], // Keep oldest
      remove_ids: row.ids.slice(1), // Remove newer duplicates
    }));
  }

  /**
   * Remove duplicate images (keep oldest, remove newer)
   */
  static async removeDuplicates(dryRun: boolean = true): Promise<DeduplicationResult> {
    const duplicates = await this.findDuplicates();
    const errors: string[] = [];
    let removed = 0;

    logger.info(`[ImageConsolidation] Found ${duplicates.length} duplicate groups`);

    if (dryRun) {
      logger.info(`[ImageConsolidation] DRY RUN - would remove ${duplicates.reduce((sum, d) => sum + d.remove_ids.length, 0)} images`);
      return {
        success: true,
        duplicatesFound: duplicates.length,
        duplicatesRemoved: 0,
        errors: [],
        details: duplicates,
      };
    }

    for (const dup of duplicates) {
      try {
        // Delete the duplicate records (not the files - they may be shared)
        const deleteSQL = `DELETE FROM profile_images WHERE id = ANY($1)`;
        await query(deleteSQL, [dup.remove_ids]);
        removed += dup.remove_ids.length;
        logger.info(`[ImageConsolidation] Removed ${dup.remove_ids.length} duplicates for source_url ${dup.source_url.substring(0, 50)}...`);
      } catch (error) {
        const msg = `Failed to remove duplicates for ${dup.source_url}: ${error}`;
        errors.push(msg);
        logger.error(`[ImageConsolidation] ${msg}`);
      }
    }

    return {
      success: errors.length === 0,
      duplicatesFound: duplicates.length,
      duplicatesRemoved: removed,
      errors,
      details: duplicates,
    };
  }

  /**
   * Find images that are marked as SSD but need to be migrated to S3
   */
  static async findSSDImages(): Promise<{ id: string; file_path: string; username: string; person_id: string }[]> {
    const sql = `
      SELECT pi.id, pi.file_path, pi.person_id, p.username
      FROM profile_images pi
      JOIN persons p ON pi.person_id = p.id
      WHERE pi.storage_provider IN ('ssd', 'local', 'docker')
      ORDER BY pi.created_at DESC
    `;

    const result = await query<{ id: string; file_path: string; person_id: string; username: string }>(sql, []);
    return result.rows;
  }

  /**
   * Migrate SSD images to S3
   */
  static async migrateToS3(dryRun: boolean = true): Promise<MigrationResult> {
    const ssdImages = await this.findSSDImages();
    const errors: string[] = [];
    let migrated = 0;
    let failed = 0;
    let skipped = 0;

    logger.info(`[ImageConsolidation] Found ${ssdImages.length} SSD images to migrate`);

    if (dryRun) {
      logger.info(`[ImageConsolidation] DRY RUN - would migrate ${ssdImages.length} images`);
      return {
        success: true,
        migrated: 0,
        failed: 0,
        skipped: ssdImages.length,
        errors: [],
      };
    }

    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      return {
        success: false,
        migrated: 0,
        failed: ssdImages.length,
        skipped: 0,
        errors: ['S3 provider not available'],
      };
    }

    // Get SSD base path from config - use container path, not host path
    const status = await storageService.getStatus();
    // In Docker, use the container path (/mnt/ssd/mhc-images), not host path
    const ssdBasePath = status.ssd.path || '/mnt/ssd/mhc-images';

    for (const img of ssdImages) {
      try {
        // Try to find the file on SSD
        const possiblePaths = [
          path.join(ssdBasePath, img.file_path),
          path.join(ssdBasePath, 'profiles', img.file_path),
          path.join(ssdBasePath, 'people', img.username, img.file_path.split('/').pop() || ''),
        ];

        let foundPath: string | null = null;
        let fileData: Buffer | null = null;

        for (const p of possiblePaths) {
          try {
            fileData = await fs.readFile(p);
            foundPath = p;
            break;
          } catch {
            // Try next path
          }
        }

        if (!fileData || !foundPath) {
          // File not found on SSD - mark as broken
          skipped++;
          logger.warn(`[ImageConsolidation] SSD file not found for ${img.id}: ${img.file_path}`);
          continue;
        }

        // Generate S3 path
        const filename = path.basename(foundPath);
        const s3Path = `people/${img.username}/migrated/${filename}`;

        // Upload to S3
        const result = await s3Provider.write(s3Path, fileData);

        if (!result.success) {
          failed++;
          errors.push(`Failed to upload ${img.id}: ${result.error}`);
          continue;
        }

        // Update database record
        await query(
          `UPDATE profile_images SET storage_provider = 's3', file_path = $1 WHERE id = $2`,
          [s3Path, img.id]
        );

        migrated++;
        logger.info(`[ImageConsolidation] Migrated ${img.id} to S3: ${s3Path}`);

      } catch (error) {
        failed++;
        errors.push(`Error migrating ${img.id}: ${error}`);
      }
    }

    return {
      success: failed === 0,
      migrated,
      failed,
      skipped,
      errors,
    };
  }

  /**
   * Find broken images (DB records where file doesn't exist)
   */
  static async findBrokenImages(): Promise<{ id: string; file_path: string; storage_provider: string }[]> {
    await storageService.init();
    const s3Provider = storageService.getS3Provider();
    const status = await storageService.getStatus();
    // In Docker, use the container path (/mnt/ssd/mhc-images), not host path
    const ssdBasePath = status.ssd.path || '/mnt/ssd/mhc-images';

    const broken: { id: string; file_path: string; storage_provider: string }[] = [];

    // Get all images
    const sql = `SELECT id, file_path, storage_provider FROM profile_images ORDER BY storage_provider`;
    const result = await query<{ id: string; file_path: string; storage_provider: string }>(sql, []);

    logger.info(`[ImageConsolidation] Checking ${result.rows.length} images for broken references...`);

    let checked = 0;
    for (const row of result.rows) {
      checked++;
      if (checked % 1000 === 0) {
        logger.info(`[ImageConsolidation] Checked ${checked}/${result.rows.length} images...`);
      }

      const provider = row.storage_provider?.toLowerCase() || '';

      if (provider === 's3') {
        // Check S3
        if (s3Provider) {
          const exists = await s3Provider.exists(row.file_path);
          if (!exists) {
            broken.push(row);
          }
        }
      } else {
        // Check SSD/local
        const fullPath = path.join(ssdBasePath, row.file_path);
        try {
          await fs.access(fullPath);
        } catch {
          broken.push(row);
        }
      }
    }

    logger.info(`[ImageConsolidation] Found ${broken.length} broken image references`);
    return broken;
  }

  /**
   * Remove broken image records
   */
  static async removeBrokenImages(dryRun: boolean = true): Promise<{ removed: number; errors: string[] }> {
    const broken = await this.findBrokenImages();

    if (dryRun) {
      logger.info(`[ImageConsolidation] DRY RUN - would remove ${broken.length} broken records`);
      return { removed: 0, errors: [] };
    }

    const errors: string[] = [];
    let removed = 0;

    for (const img of broken) {
      try {
        await query('DELETE FROM profile_images WHERE id = $1', [img.id]);
        removed++;
      } catch (error) {
        errors.push(`Failed to remove ${img.id}: ${error}`);
      }
    }

    return { removed, errors };
  }

  /**
   * Get current image statistics
   */
  static async getStats(): Promise<{
    total: number;
    byStorage: Record<string, number>;
    bySource: Record<string, { count: number; sizeBytes: number }>;
    duplicates: number;
  }> {
    // Total and by storage
    const storageSql = `
      SELECT storage_provider, COUNT(*) as count, COALESCE(SUM(file_size), 0) as size
      FROM profile_images
      GROUP BY storage_provider
    `;
    const storageResult = await query<{ storage_provider: string; count: string; size: string }>(storageSql, []);

    // By source
    const sourceSql = `
      SELECT source, COUNT(*) as count, COALESCE(SUM(file_size), 0) as size
      FROM profile_images
      GROUP BY source
      ORDER BY SUM(file_size) DESC
    `;
    const sourceResult = await query<{ source: string; count: string; size: string }>(sourceSql, []);

    // Duplicates
    const duplicates = await this.findDuplicates();

    const byStorage: Record<string, number> = {};
    let total = 0;
    for (const row of storageResult.rows) {
      byStorage[row.storage_provider || 'unknown'] = parseInt(row.count);
      total += parseInt(row.count);
    }

    const bySource: Record<string, { count: number; sizeBytes: number }> = {};
    for (const row of sourceResult.rows) {
      bySource[row.source || 'unknown'] = {
        count: parseInt(row.count),
        sizeBytes: parseInt(row.size),
      };
    }

    return {
      total,
      byStorage,
      bySource,
      duplicates: duplicates.length,
    };
  }

  /**
   * Run full consolidation (dedup + migrate + cleanup)
   */
  static async runFullConsolidation(dryRun: boolean = true): Promise<ConsolidationReport> {
    const startTime = new Date();

    logger.info(`[ImageConsolidation] Starting full consolidation (dryRun=${dryRun})`);

    // Get baseline stats
    const baselineStats = await this.getStats();

    // Get storage status
    await storageService.init();
    const status = await storageService.getStatus();

    const baseline = {
      totalImages: baselineStats.total,
      byStorage: baselineStats.byStorage,
      bySource: baselineStats.bySource,
      duplicates: baselineStats.duplicates,
      ssdFiles: status.ssd.fileCount || 0,
      ssdSize: status.ssd.diskSpace?.used || 0,
      s3Objects: status.s3.bucketStats?.objectCount || 0,
      s3Size: status.s3.bucketStats?.totalSizeBytes || 0,
    };

    // 1. Remove duplicates
    const dedupResult = await this.removeDuplicates(dryRun);

    // 2. Migrate SSD to S3
    const migrateResult = await this.migrateToS3(dryRun);

    // 3. Find broken images (report only, don't auto-remove)
    const brokenImages = await this.findBrokenImages();

    // Get after stats
    const afterStats = dryRun ? null : await this.getStats();

    const report: ConsolidationReport = {
      timestamp: startTime,
      baseline,
      after: afterStats ? {
        totalImages: afterStats.total,
        byStorage: afterStats.byStorage,
        bySource: afterStats.bySource,
        duplicates: afterStats.duplicates,
      } : undefined,
      operations: {
        duplicatesRemoved: dedupResult.duplicatesRemoved,
        imagesMigrated: migrateResult.migrated,
        brokenImagesRemoved: 0, // Not auto-removed
        storageReduced: 0, // Calculate from before/after
      },
    };

    logger.info(`[ImageConsolidation] Consolidation complete`, {
      dryRun,
      duplicatesFound: dedupResult.duplicatesFound,
      duplicatesRemoved: dedupResult.duplicatesRemoved,
      imagesMigrated: migrateResult.migrated,
      brokenImagesFound: brokenImages.length,
    });

    return report;
  }
}

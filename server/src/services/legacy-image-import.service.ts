/**
 * Legacy Image Import Service
 *
 * Imports orphaned images from SSD and S3 into the database by parsing filenames.
 * Filename format: username_timestamp_hash.extension
 * Example: nicolaskan_1766925284693_6603c588.jpg
 */

import { query, pool } from '../db/client.js';
import { storageService } from './storage/storage.service.js';
import { logger } from '../config/logger.js';
import fs from 'fs/promises';
import path from 'path';

export interface ParsedFilename {
  username: string;
  timestamp: number;
  hash: string;
  extension: string;
  originalFilename: string;
}

export interface ImportResult {
  success: boolean;
  totalFound: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
  details?: {
    noPersonMatch: number;
    alreadyExists: number;
    invalidFormat: number;
  };
}

export interface AuditResult {
  ssd: {
    totalFiles: number;
    orphanFiles: number;
    trackedFiles: number;
    byExtension: Record<string, number>;
  };
  s3: {
    totalObjects: number;
    orphanObjects: number;
    trackedObjects: number;
    byPrefix: Record<string, number>;
  };
  database: {
    totalRecords: number;
    byStorage: Record<string, number>;
    bySource: Record<string, number>;
  };
}

export class LegacyImageImportService {
  private static SSD_BASE_PATH = '/mnt/ssd/mhc-images';

  /**
   * Parse a legacy filename into components
   * Format: username_timestamp_hash.extension
   */
  static parseFilename(filename: string): ParsedFilename | null {
    // Match: username_timestamp_hash.extension
    // Username can contain underscores, so we match from the end
    const match = filename.match(/^(.+)_(\d{13})_([a-f0-9]{8})\.(\w+)$/i);

    if (!match) {
      return null;
    }

    return {
      username: match[1],
      timestamp: parseInt(match[2]),
      hash: match[3],
      extension: match[4],
      originalFilename: filename,
    };
  }

  /**
   * Get baseline counts before import
   */
  static async getBaselineCounts(): Promise<{
    database: { total: number; bySource: Record<string, number>; byStorage: Record<string, number> };
    ssd: { total: number; sizeBytes: number };
    s3: { total: number; sizeBytes: number };
  }> {
    // Database counts
    const dbTotal = await query<{ count: string }>('SELECT COUNT(*) as count FROM profile_images', []);
    const dbBySource = await query<{ source: string; count: string }>(
      'SELECT COALESCE(source, \'unknown\') as source, COUNT(*) as count FROM profile_images GROUP BY source',
      []
    );
    const dbByStorage = await query<{ storage_provider: string; count: string }>(
      'SELECT COALESCE(storage_provider, \'unknown\') as storage_provider, COUNT(*) as count FROM profile_images GROUP BY storage_provider',
      []
    );

    // Storage status
    await storageService.init();
    const status = await storageService.getStatus();

    return {
      database: {
        total: parseInt(dbTotal.rows[0]?.count || '0'),
        bySource: Object.fromEntries(dbBySource.rows.map(r => [r.source, parseInt(r.count)])),
        byStorage: Object.fromEntries(dbByStorage.rows.map(r => [r.storage_provider, parseInt(r.count)])),
      },
      ssd: {
        total: status.ssd.fileCount || 0,
        sizeBytes: status.ssd.diskSpace?.used || 0,
      },
      s3: {
        total: status.s3.bucketStats?.objectCount || 0,
        sizeBytes: status.s3.bucketStats?.totalSizeBytes || 0,
      },
    };
  }

  /**
   * Find all orphan files on SSD (not in database)
   */
  static async findSSDOrphans(limit: number = 1000): Promise<{
    orphans: string[];
    total: number;
    scanned: number;
  }> {
    const orphans: string[] = [];
    let scanned = 0;

    try {
      // List files in SSD root directory
      const files = await fs.readdir(this.SSD_BASE_PATH);

      for (const file of files) {
        // Only process image/video files in root (not subdirectories)
        if (!file.match(/\.(jpg|jpeg|png|gif|mp4|webm)$/i)) {
          continue;
        }

        scanned++;

        // Check if this file is tracked in the database
        const result = await query<{ count: string }>(
          `SELECT COUNT(*) as count FROM profile_images WHERE file_path LIKE $1`,
          [`%${file}`]
        );

        if (parseInt(result.rows[0]?.count || '0') === 0) {
          orphans.push(file);
          if (orphans.length >= limit) {
            break;
          }
        }

        if (scanned % 1000 === 0) {
          logger.info(`[LegacyImport] Scanned ${scanned} SSD files, found ${orphans.length} orphans...`);
        }
      }
    } catch (error) {
      logger.error('[LegacyImport] Error scanning SSD:', error);
    }

    return {
      orphans,
      total: orphans.length,
      scanned,
    };
  }

  /**
   * Import SSD orphan files into the database
   */
  static async importSSDOrphans(
    dryRun: boolean = true,
    batchSize: number = 1000
  ): Promise<ImportResult> {
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let noPersonMatch = 0;
    let alreadyExists = 0;
    let invalidFormat = 0;

    logger.info(`[LegacyImport] Starting SSD orphan import (dryRun=${dryRun})...`);

    try {
      // Get all files in SSD root
      const files = await fs.readdir(this.SSD_BASE_PATH);
      const imageFiles = files.filter(f => f.match(/\.(jpg|jpeg|png|gif|mp4|webm)$/i));

      logger.info(`[LegacyImport] Found ${imageFiles.length} image/video files on SSD`);

      if (dryRun) {
        // Just count what would be imported
        let wouldImport = 0;
        let sample: ParsedFilename[] = [];

        for (const file of imageFiles.slice(0, 100)) {
          const parsed = this.parseFilename(file);
          if (parsed) {
            wouldImport++;
            if (sample.length < 10) {
              sample.push(parsed);
            }
          }
        }

        logger.info(`[LegacyImport] DRY RUN - Would process ${imageFiles.length} files`);
        logger.info(`[LegacyImport] Sample parsed files:`, sample.slice(0, 5));

        return {
          success: true,
          totalFound: imageFiles.length,
          imported: 0,
          skipped: imageFiles.length,
          failed: 0,
          errors: [],
          details: { noPersonMatch: 0, alreadyExists: 0, invalidFormat: 0 },
        };
      }

      // Process in batches
      for (let i = 0; i < imageFiles.length; i += batchSize) {
        const batch = imageFiles.slice(i, i + batchSize);
        logger.info(`[LegacyImport] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(imageFiles.length / batchSize)}...`);

        for (const file of batch) {
          try {
            const parsed = this.parseFilename(file);
            if (!parsed) {
              invalidFormat++;
              skipped++;
              continue;
            }

            // Find person by username
            const personResult = await query<{ id: string }>(
              'SELECT id FROM persons WHERE username = $1',
              [parsed.username]
            );

            if (personResult.rows.length === 0) {
              noPersonMatch++;
              skipped++;
              continue;
            }

            const personId = personResult.rows[0].id;

            // Check if already imported
            const existsResult = await query<{ count: string }>(
              `SELECT COUNT(*) as count FROM profile_images
               WHERE person_id = $1 AND file_path LIKE $2`,
              [personId, `%${file}`]
            );

            if (parseInt(existsResult.rows[0]?.count || '0') > 0) {
              alreadyExists++;
              skipped++;
              continue;
            }

            // Get file stats
            const filePath = path.join(this.SSD_BASE_PATH, file);
            const stats = await fs.stat(filePath);

            // Determine source type from filename pattern
            const source = 'imported_legacy';
            const createdAt = new Date(parsed.timestamp);

            // Insert into database
            await query(
              `INSERT INTO profile_images
               (person_id, file_path, storage_provider, source, file_size, created_at)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [personId, file, 'ssd', source, stats.size, createdAt]
            );

            imported++;

          } catch (error) {
            failed++;
            const msg = error instanceof Error ? error.message : String(error);
            if (errors.length < 100) {
              errors.push(`${file}: ${msg}`);
            }
          }
        }

        logger.info(`[LegacyImport] Batch complete. Imported: ${imported}, Skipped: ${skipped}, Failed: ${failed}`);
      }

    } catch (error) {
      logger.error('[LegacyImport] Import error:', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: failed === 0,
      totalFound: imported + skipped + failed,
      imported,
      skipped,
      failed,
      errors,
      details: { noPersonMatch, alreadyExists, invalidFormat },
    };
  }

  /**
   * Audit S3 bucket for untracked objects
   */
  static async auditS3Objects(maxObjects: number = 10000): Promise<{
    totalObjects: number;
    trackedObjects: number;
    untrackedObjects: number;
    untrackedSamples: string[];
    byPrefix: Record<string, { total: number; untracked: number }>;
  }> {
    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      throw new Error('S3 provider not available');
    }

    logger.info(`[LegacyImport] Auditing S3 objects (max ${maxObjects})...`);

    // Get list of S3 objects
    const objects = await s3Provider.listObjects('', maxObjects);
    const totalObjects = objects.length;

    logger.info(`[LegacyImport] Found ${totalObjects} S3 objects to audit`);

    // Get all tracked file paths from database
    const dbPaths = await query<{ file_path: string }>(
      'SELECT file_path FROM profile_images WHERE storage_provider = $1',
      ['s3']
    );
    const trackedPaths = new Set(dbPaths.rows.map(r => r.file_path));

    let trackedObjects = 0;
    let untrackedObjects = 0;
    const untrackedSamples: string[] = [];
    const byPrefix: Record<string, { total: number; untracked: number }> = {};

    for (const obj of objects) {
      // Extract prefix (first directory level)
      const prefix = obj.key.split('/')[0] || 'root';

      if (!byPrefix[prefix]) {
        byPrefix[prefix] = { total: 0, untracked: 0 };
      }
      byPrefix[prefix].total++;

      // Check if tracked
      if (trackedPaths.has(obj.key)) {
        trackedObjects++;
      } else {
        untrackedObjects++;
        byPrefix[prefix].untracked++;

        if (untrackedSamples.length < 100) {
          untrackedSamples.push(obj.key);
        }
      }
    }

    logger.info(`[LegacyImport] S3 audit complete: ${trackedObjects} tracked, ${untrackedObjects} untracked`);

    return {
      totalObjects,
      trackedObjects,
      untrackedObjects,
      untrackedSamples,
      byPrefix,
    };
  }

  /**
   * Import S3 untracked objects into database
   */
  static async importS3Untracked(
    dryRun: boolean = true,
    maxObjects: number = 10000
  ): Promise<ImportResult> {
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let noPersonMatch = 0;
    let alreadyExists = 0;
    let invalidFormat = 0;

    logger.info(`[LegacyImport] Starting S3 untracked import (dryRun=${dryRun}, max=${maxObjects})...`);

    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      return {
        success: false,
        totalFound: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
        errors: ['S3 provider not available'],
      };
    }

    try {
      // Get S3 objects
      const objects = await s3Provider.listObjects('', maxObjects);
      logger.info(`[LegacyImport] Processing ${objects.length} S3 objects...`);

      // Get tracked paths
      const dbPaths = await query<{ file_path: string }>(
        'SELECT file_path FROM profile_images WHERE storage_provider = $1',
        ['s3']
      );
      const trackedPaths = new Set(dbPaths.rows.map(r => r.file_path));

      // Filter to untracked objects
      const untrackedObjects = objects.filter(obj => !trackedPaths.has(obj.key));
      logger.info(`[LegacyImport] Found ${untrackedObjects.length} untracked objects`);

      if (dryRun) {
        // Analyze what would be imported
        let wouldImport = 0;
        for (const obj of untrackedObjects.slice(0, 100)) {
          const filename = path.basename(obj.key);
          const parsed = this.parseFilename(filename);
          if (parsed) {
            wouldImport++;
          }
        }

        return {
          success: true,
          totalFound: untrackedObjects.length,
          imported: 0,
          skipped: untrackedObjects.length,
          failed: 0,
          errors: [],
          details: { noPersonMatch: 0, alreadyExists: 0, invalidFormat: 0 },
        };
      }

      // Process untracked objects
      for (const obj of untrackedObjects) {
        try {
          const filename = path.basename(obj.key);
          const parsed = this.parseFilename(filename);

          if (!parsed) {
            // Try to extract username from path (people/username/...)
            const pathMatch = obj.key.match(/^people\/([^\/]+)\//);
            if (!pathMatch) {
              invalidFormat++;
              skipped++;
              continue;
            }

            // Use path-based username
            const username = pathMatch[1];
            const personResult = await query<{ id: string }>(
              'SELECT id FROM persons WHERE username = $1',
              [username]
            );

            if (personResult.rows.length === 0) {
              noPersonMatch++;
              skipped++;
              continue;
            }

            const personId = personResult.rows[0].id;

            // Insert with S3 path
            await query(
              `INSERT INTO profile_images
               (person_id, file_path, storage_provider, source, file_size, created_at)
               VALUES ($1, $2, $3, $4, $5, NOW())`,
              [personId, obj.key, 's3', 'imported_s3_audit', obj.size || 0]
            );

            imported++;
            continue;
          }

          // Parsed filename successfully
          const personResult = await query<{ id: string }>(
            'SELECT id FROM persons WHERE username = $1',
            [parsed.username]
          );

          if (personResult.rows.length === 0) {
            noPersonMatch++;
            skipped++;
            continue;
          }

          const personId = personResult.rows[0].id;
          const createdAt = new Date(parsed.timestamp);

          await query(
            `INSERT INTO profile_images
             (person_id, file_path, storage_provider, source, file_size, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [personId, obj.key, 's3', 'imported_s3_audit', obj.size || 0, createdAt]
          );

          imported++;

        } catch (error) {
          failed++;
          const msg = error instanceof Error ? error.message : String(error);
          if (errors.length < 100) {
            errors.push(`${obj.key}: ${msg}`);
          }
        }
      }

    } catch (error) {
      logger.error('[LegacyImport] S3 import error:', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: failed === 0,
      totalFound: imported + skipped + failed,
      imported,
      skipped,
      failed,
      errors,
      details: { noPersonMatch, alreadyExists, invalidFormat },
    };
  }

  /**
   * Migrate SSD files to S3
   * Reads files from SSD, uploads to S3, and updates DB records
   */
  static async migrateSSDToS3(
    dryRun: boolean = true,
    batchSize: number = 500
  ): Promise<{
    success: boolean;
    total: number;
    migrated: number;
    failed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let migrated = 0;
    let failed = 0;

    logger.info(`[LegacyImport] Starting SSD to S3 migration (dryRun=${dryRun})...`);

    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      return {
        success: false,
        total: 0,
        migrated: 0,
        failed: 0,
        errors: ['S3 provider not available'],
      };
    }

    try {
      // Get all records with storage_provider='ssd'
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM profile_images WHERE storage_provider = 'ssd'`,
        []
      );
      const total = parseInt(countResult.rows[0]?.count || '0');

      logger.info(`[LegacyImport] Found ${total} SSD records to migrate to S3`);

      if (dryRun) {
        return {
          success: true,
          total,
          migrated: 0,
          failed: 0,
          errors: [],
        };
      }

      // Process in batches
      let processed = 0;
      while (processed < total) {
        const batchResult = await query<{
          id: string;
          file_path: string;
          person_id: string;
          username: string;
        }>(
          `SELECT pi.id, pi.file_path, pi.person_id, p.username
           FROM profile_images pi
           JOIN persons p ON pi.person_id = p.id
           WHERE pi.storage_provider = 'ssd'
           ORDER BY pi.created_at ASC
           LIMIT $1`,
          [batchSize]
        );

        if (batchResult.rows.length === 0) break;

        const batchNum = Math.floor(processed / batchSize) + 1;
        const totalBatches = Math.ceil(total / batchSize);
        logger.info(`[LegacyImport] Processing batch ${batchNum}/${totalBatches}...`);

        for (const record of batchResult.rows) {
          try {
            // Read file from SSD
            const ssdPath = path.join(this.SSD_BASE_PATH, record.file_path);
            let data: Buffer;

            try {
              data = await fs.readFile(ssdPath);
            } catch {
              // Try just the filename in the root
              const altPath = path.join(this.SSD_BASE_PATH, path.basename(record.file_path));
              data = await fs.readFile(altPath);
            }

            // Determine S3 path
            const filename = path.basename(record.file_path);
            const folder = record.file_path.includes('/') ?
              record.file_path.split('/').slice(-2, -1)[0] : 'auto';
            const s3Path = `people/${record.username}/${folder}/${filename}`;

            // Upload to S3
            const result = await s3Provider.write(s3Path, data);

            if (!result.success) {
              throw new Error(result.error || 'S3 write failed');
            }

            // Update database
            await query(
              `UPDATE profile_images
               SET storage_provider = 's3', file_path = $1
               WHERE id = $2`,
              [s3Path, record.id]
            );

            migrated++;

          } catch (error) {
            failed++;
            const msg = error instanceof Error ? error.message : String(error);
            if (errors.length < 100) {
              errors.push(`${record.file_path}: ${msg}`);
            }
          }

          processed++;
        }

        logger.info(`[LegacyImport] Batch complete. Migrated: ${migrated}, Failed: ${failed}`);
      }

    } catch (error) {
      logger.error('[LegacyImport] Migration error:', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: failed === 0,
      total: migrated + failed,
      migrated,
      failed,
      errors,
    };
  }

  /**
   * Clean up SSD files that have been migrated to S3
   * Scans SSD files and removes those that are now tracked in S3
   */
  static async cleanupMigratedSSD(dryRun: boolean = true): Promise<{
    success: boolean;
    total: number;
    deleted: number;
    skipped: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let deleted = 0;
    let skipped = 0;

    logger.info(`[LegacyImport] Starting SSD cleanup (dryRun=${dryRun})...`);

    try {
      // Get all files on SSD
      const files = await fs.readdir(this.SSD_BASE_PATH);
      const imageFiles = files.filter(f => f.match(/\.(jpg|jpeg|png|gif|mp4|webm)$/i));

      logger.info(`[LegacyImport] Found ${imageFiles.length} image/video files on SSD to check`);

      // Build a set of all file basenames in S3 for quick lookup
      const s3FilesResult = await query<{ file_path: string }>(
        `SELECT file_path FROM profile_images WHERE storage_provider = 's3'`,
        []
      );

      const s3Basenames = new Set<string>();
      for (const row of s3FilesResult.rows) {
        s3Basenames.add(path.basename(row.file_path));
      }

      logger.info(`[LegacyImport] Found ${s3Basenames.size} files tracked in S3`);

      let processed = 0;
      const batchSize = 5000;

      for (const file of imageFiles) {
        // Check if this file is now in S3 (by basename)
        if (s3Basenames.has(file)) {
          if (dryRun) {
            deleted++; // Count what would be deleted
          } else {
            try {
              const filePath = path.join(this.SSD_BASE_PATH, file);
              await fs.unlink(filePath);
              deleted++;
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              if (errors.length < 100) {
                errors.push(`${file}: ${msg}`);
              }
            }
          }
        } else {
          skipped++;
        }

        processed++;
        if (processed % batchSize === 0) {
          logger.info(`[LegacyImport] Cleanup progress: ${processed}/${imageFiles.length} (deleted: ${deleted}, skipped: ${skipped})`);
        }
      }

      logger.info(`[LegacyImport] Cleanup complete: ${deleted} deleted, ${skipped} skipped`);

    } catch (error) {
      logger.error('[LegacyImport] Cleanup error:', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: errors.length === 0,
      total: deleted + skipped,
      deleted,
      skipped,
      errors,
    };
  }

  /**
   * Clean up duplicate S3 objects (flat files that exist in people/username/... format)
   * These are the original synced files that are now duplicates of the migrated files
   */
  static async cleanupS3Duplicates(
    dryRun: boolean = true,
    maxObjects: number = 100000
  ): Promise<{
    success: boolean;
    total: number;
    deleted: number;
    skipped: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let deleted = 0;
    let skipped = 0;

    logger.info(`[LegacyImport] Starting S3 duplicates cleanup (dryRun=${dryRun})...`);

    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      return {
        success: false,
        total: 0,
        deleted: 0,
        skipped: 0,
        errors: ['S3 provider not available'],
      };
    }

    try {
      // Get S3 objects (flat files only, not in people/ structure)
      const objects = await s3Provider.listObjects('', maxObjects);
      const flatObjects = objects.filter(obj => !obj.key.startsWith('people/'));

      logger.info(`[LegacyImport] Found ${flatObjects.length} flat S3 objects to check`);

      // Build a set of basenames that are tracked in DB (in people/username/... format)
      const dbFilesResult = await query<{ file_path: string }>(
        `SELECT file_path FROM profile_images WHERE storage_provider = 's3' AND file_path LIKE 'people/%'`,
        []
      );

      const trackedBasenames = new Set<string>();
      for (const row of dbFilesResult.rows) {
        trackedBasenames.add(path.basename(row.file_path));
      }

      logger.info(`[LegacyImport] Found ${trackedBasenames.size} basenames tracked in DB`);

      let processed = 0;
      const batchSize = 5000;

      for (const obj of flatObjects) {
        const basename = path.basename(obj.key);

        // If this flat file's basename exists in the tracked set, it's a duplicate
        if (trackedBasenames.has(basename)) {
          if (dryRun) {
            deleted++; // Count what would be deleted
          } else {
            try {
              await s3Provider.delete(obj.key);
              deleted++;
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              if (errors.length < 100) {
                errors.push(`${obj.key}: ${msg}`);
              }
            }
          }
        } else {
          skipped++;
        }

        processed++;
        if (processed % batchSize === 0) {
          logger.info(`[LegacyImport] S3 cleanup progress: ${processed}/${flatObjects.length} (deleted: ${deleted}, skipped: ${skipped})`);
        }
      }

      logger.info(`[LegacyImport] S3 cleanup complete: ${deleted} deleted, ${skipped} skipped`);

    } catch (error) {
      logger.error('[LegacyImport] S3 cleanup error:', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: errors.length === 0,
      total: deleted + skipped,
      deleted,
      skipped,
      errors,
    };
  }
}

export default LegacyImageImportService;

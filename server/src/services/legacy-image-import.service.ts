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
            const source = 'imported';
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

  /**
   * Analyze S3 bucket structure and return directory counts
   */
  static async analyzeS3Structure(maxObjects: number = 2000000): Promise<{
    totalObjects: number;
    totalSizeBytes: number;
    directories: { path: string; count: number; sizeBytes: number }[];
  }> {
    logger.info(`[LegacyImport] Analyzing S3 structure (maxObjects=${maxObjects})...`);

    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      return {
        totalObjects: 0,
        totalSizeBytes: 0,
        directories: [],
      };
    }

    try {
      const objects = await s3Provider.listObjects('', maxObjects);

      const dirCounts: Record<string, number> = {};
      const dirSizes: Record<string, number> = {};
      let totalSize = 0;

      for (const obj of objects) {
        totalSize += obj.size || 0;

        const parts = obj.key.split('/');

        if (parts.length === 1) {
          // Root level flat file
          dirCounts['(root)'] = (dirCounts['(root)'] || 0) + 1;
          dirSizes['(root)'] = (dirSizes['(root)'] || 0) + (obj.size || 0);
        } else if (parts[0] === 'people' && parts.length >= 3) {
          // people/username/folder/file structure
          const folder = parts.length >= 4 ? parts[2] : '(direct)';
          const key = `people/*/${folder}`;
          dirCounts[key] = (dirCounts[key] || 0) + 1;
          dirSizes[key] = (dirSizes[key] || 0) + (obj.size || 0);
        } else {
          // Other top-level directories
          const key = parts[0];
          dirCounts[key] = (dirCounts[key] || 0) + 1;
          dirSizes[key] = (dirSizes[key] || 0) + (obj.size || 0);
        }
      }

      // Sort by count descending
      const directories = Object.entries(dirCounts)
        .map(([path, count]) => ({
          path,
          count,
          sizeBytes: dirSizes[path] || 0,
        }))
        .sort((a, b) => b.count - a.count);

      logger.info(`[LegacyImport] S3 structure analysis complete: ${objects.length} objects in ${directories.length} directories`);

      return {
        totalObjects: objects.length,
        totalSizeBytes: totalSize,
        directories,
      };
    } catch (error) {
      logger.error('[LegacyImport] S3 structure analysis error:', error);
      return {
        totalObjects: 0,
        totalSizeBytes: 0,
        directories: [],
      };
    }
  }

  /**
   * Clean up S3 objects matching a prefix
   * Used to delete entire folders like 'all/', 'thumbnails/', etc.
   */
  static async cleanupS3Prefix(
    prefix: string,
    dryRun: boolean = true,
    maxObjects: number = 500000
  ): Promise<{
    success: boolean;
    prefix: string;
    total: number;
    deleted: number;
    sizeBytes: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let deleted = 0;
    let sizeBytes = 0;

    logger.info(`[LegacyImport] Cleaning up S3 prefix '${prefix}' (dryRun=${dryRun})...`);

    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      return {
        success: false,
        prefix,
        total: 0,
        deleted: 0,
        sizeBytes: 0,
        errors: ['S3 provider not available'],
      };
    }

    try {
      // List all objects and filter by prefix (same approach as listS3Samples)
      // Use 600000 as limit to ensure we get all objects
      const allObjects = await s3Provider.listObjects('', 600000);

      logger.info(`[LegacyImport] Total objects in S3: ${allObjects.length}`);

      const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
      const objects = allObjects.filter(o => o.key.startsWith(normalizedPrefix) || o.key.startsWith(prefix));

      logger.info(`[LegacyImport] Found ${objects.length} objects with prefix '${prefix}' (normalized: '${normalizedPrefix}')`);
      if (objects.length === 0 && allObjects.length > 0) {
        logger.info(`[LegacyImport] Sample keys: ${allObjects.slice(0, 5).map(o => o.key).join(', ')}`);
      }

      if (dryRun) {
        // Just count what would be deleted
        for (const obj of objects) {
          sizeBytes += obj.size || 0;
          deleted++;
        }
        return {
          success: true,
          prefix,
          total: objects.length,
          deleted,
          sizeBytes,
          errors: [],
        };
      }

      // Actually delete the objects
      let processed = 0;
      const batchSize = 1000;

      for (const obj of objects) {
        try {
          await s3Provider.deleteObject(obj.key);
          sizeBytes += obj.size || 0;
          deleted++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (errors.length < 100) {
            errors.push(`${obj.key}: ${msg}`);
          }
        }

        processed++;
        if (processed % batchSize === 0) {
          logger.info(`[LegacyImport] Cleanup progress: ${processed}/${objects.length} (deleted: ${deleted})`);
        }
      }

      logger.info(`[LegacyImport] Cleanup complete: ${deleted} objects deleted, ${(sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB freed`);

    } catch (error) {
      logger.error('[LegacyImport] Cleanup error:', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: errors.length === 0,
      prefix,
      total: deleted + errors.length,
      deleted,
      sizeBytes,
      errors,
    };
  }

  /**
   * List sample files from a specific S3 prefix or root
   * Note: Uses same approach as analyzeS3Structure - fetches all and filters
   */
  static async listS3Samples(
    prefix: string,
    limit: number = 50
  ): Promise<{
    prefix: string;
    total: number;
    samples: { key: string; size: number; lastModified?: Date }[];
  }> {
    logger.info(`[LegacyImport] Listing S3 samples for prefix '${prefix}' (limit=${limit})...`);

    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      return { prefix, total: 0, samples: [] };
    }

    try {
      // Fetch all objects and filter by prefix (same approach as analyzeS3Structure)
      const allObjects = await s3Provider.listObjects('', 600000);

      let filtered: typeof allObjects;

      if (prefix === '(root)' || prefix === '') {
        // Root files = no slash in key
        filtered = allObjects.filter(o => !o.key.includes('/'));
      } else {
        // Filter by prefix
        const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
        filtered = allObjects.filter(o => o.key.startsWith(normalizedPrefix) || o.key.startsWith(prefix));
      }

      return {
        prefix: prefix || '(root)',
        total: filtered.length,
        samples: filtered.slice(0, limit).map(o => ({
          key: o.key,
          size: o.size || 0,
          lastModified: o.lastModified,
        })),
      };
    } catch (error) {
      logger.error('[LegacyImport] Error listing S3 samples:', error);
      return { prefix, total: 0, samples: [] };
    }
  }

  /**
   * Import mhc/ folder files into database
   * Files are at: mhc/mediapeople/{username}/auto/{timestamp}_{hash}.jpg
   * Need to copy them to: people/{username}/auto/{timestamp}_{hash}.jpg
   */
  static async importMhcFolder(
    dryRun: boolean = true,
    source: string = 'affiliate_api'
  ): Promise<{
    success: boolean;
    totalFound: number;
    imported: number;
    skipped: number;
    failed: number;
    errors: string[];
    details: {
      noPersonMatch: number;
      alreadyExists: number;
      invalidFormat: number;
      copied: number;
    };
  }> {
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let noPersonMatch = 0;
    let alreadyExists = 0;
    let invalidFormat = 0;
    let copied = 0;

    logger.info(`[LegacyImport] Importing mhc/ folder (dryRun=${dryRun}, source=${source})...`);

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
        details: { noPersonMatch: 0, alreadyExists: 0, invalidFormat: 0, copied: 0 },
      };
    }

    try {
      // Get all mhc/ files
      const allObjects = await s3Provider.listObjects('', 600000);
      const mhcFiles = allObjects.filter(o => o.key.startsWith('mhc/'));

      logger.info(`[LegacyImport] Found ${mhcFiles.length} files in mhc/ folder`);

      for (const obj of mhcFiles) {
        try {
          // Parse path: mhc/mediapeople/{username}/{folder}/{filename}
          // folder can be 'auto' or 'profile'
          const match = obj.key.match(/^mhc\/mediapeople\/([^\/]+)\/(auto|profile)\/(.+)$/);
          if (!match) {
            invalidFormat++;
            skipped++;
            continue;
          }

          const username = match[1];
          const folder = match[2];
          const filename = match[3];

          // Parse timestamp from filename (format: timestamp_hash.jpg)
          const tsMatch = filename.match(/^(\d{13})_[a-f0-9]{8}\.\w+$/i);
          if (!tsMatch) {
            invalidFormat++;
            skipped++;
            continue;
          }

          const timestamp = parseInt(tsMatch[1]);
          const createdAt = new Date(timestamp);

          // Find person by username
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
          // Use appropriate source based on folder type
          const imageSource = folder === 'profile' ? 'profile' : source;
          const newPath = `people/${username}/${folder}/${filename}`;

          // Check if file already exists at new path in database
          const existsResult = await query<{ count: string }>(
            'SELECT COUNT(*) as count FROM profile_images WHERE file_path = $1',
            [newPath]
          );

          if (parseInt(existsResult.rows[0]?.count || '0') > 0) {
            alreadyExists++;
            skipped++;
            continue;
          }

          if (dryRun) {
            imported++;
            continue;
          }

          // Copy file to new location in S3
          await s3Provider.copyObject(obj.key, newPath);
          copied++;

          // Insert into database
          await query(
            `INSERT INTO profile_images
             (person_id, file_path, storage_provider, source, file_size, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [personId, newPath, 's3', imageSource, obj.size, createdAt]
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

      logger.info(`[LegacyImport] Import complete. Imported: ${imported}, Skipped: ${skipped}, Failed: ${failed}`);

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
      details: { noPersonMatch, alreadyExists, invalidFormat, copied },
    };
  }

  /**
   * Delete all files in people/[username]/all/ folders
   * These are duplicates of auto/ folder files (symlink was uploaded as real files)
   */
  static async cleanupAllFolder(dryRun: boolean = true): Promise<{
    success: boolean;
    deleted: number;
    sizeBytes: number;
    errors: string[];
  }> {
    logger.info(`[LegacyImport] Cleaning up people/*/all/ folders (dryRun=${dryRun})...`);

    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      return {
        success: false,
        deleted: 0,
        sizeBytes: 0,
        errors: ['S3 provider not available'],
      };
    }

    const errors: string[] = [];
    let deleted = 0;
    let sizeBytes = 0;

    try {
      // List all objects and filter for /all/ folders
      const allObjects = await s3Provider.listObjects('', 600000);
      logger.info(`[LegacyImport] Total objects in S3: ${allObjects.length}`);

      // Filter for files that have /all/ in their path
      const allFolderFiles = allObjects.filter(o => o.key.includes('/all/'));
      logger.info(`[LegacyImport] Found ${allFolderFiles.length} files in /all/ folders`);

      if (dryRun) {
        // Just count what would be deleted
        for (const obj of allFolderFiles) {
          sizeBytes += obj.size || 0;
          deleted++;
        }
        logger.info(`[LegacyImport] DRY RUN - would delete ${deleted} files (${(sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB)`);
        return {
          success: true,
          deleted,
          sizeBytes,
          errors: [],
        };
      }

      // Actually delete the objects
      let processed = 0;
      const batchSize = 1000;

      for (const obj of allFolderFiles) {
        try {
          // The deleteObject method expects key WITHOUT prefix
          // S3 keys from listObjects include the prefix (mhc/media/), so strip it
          const keyWithoutPrefix = obj.key.replace(/^mhc\/media\//, '');
          await s3Provider.deleteObject(keyWithoutPrefix);
          sizeBytes += obj.size || 0;
          deleted++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (errors.length < 100) {
            errors.push(`${obj.key}: ${msg}`);
          }
        }

        processed++;
        if (processed % batchSize === 0) {
          logger.info(`[LegacyImport] Cleanup progress: ${processed}/${allFolderFiles.length} (deleted: ${deleted})`);
        }
      }

      logger.info(`[LegacyImport] Cleanup complete: ${deleted} files deleted, ${(sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB freed`);

    } catch (error) {
      logger.error('[LegacyImport] Cleanup error:', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: errors.length === 0,
      deleted,
      sizeBytes,
      errors,
    };
  }

  /**
   * Delete orphaned files in people/[username]/migrated/ folders
   * These are S3 files that have no corresponding database records
   */
  static async cleanupMigratedFolder(dryRun: boolean = true): Promise<{
    success: boolean;
    deleted: number;
    sizeBytes: number;
    errors: string[];
  }> {
    logger.info(`[LegacyImport] Cleaning up people/*/migrated/ folders (dryRun=${dryRun})...`);

    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      return {
        success: false,
        deleted: 0,
        sizeBytes: 0,
        errors: ['S3 provider not available'],
      };
    }

    const errors: string[] = [];
    let deleted = 0;
    let sizeBytes = 0;

    try {
      // List all objects and filter for /migrated/ folders
      const allObjects = await s3Provider.listObjects('', 600000);
      logger.info(`[LegacyImport] Total objects in S3: ${allObjects.length}`);

      // Filter for files that have /migrated/ in their path
      const migratedFiles = allObjects.filter(o => o.key.includes('/migrated/'));
      logger.info(`[LegacyImport] Found ${migratedFiles.length} files in /migrated/ folders`);

      if (dryRun) {
        // Just count what would be deleted
        for (const obj of migratedFiles) {
          sizeBytes += obj.size || 0;
          deleted++;
        }
        logger.info(`[LegacyImport] DRY RUN - would delete ${deleted} files (${(sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB)`);
        return {
          success: true,
          deleted,
          sizeBytes,
          errors: [],
        };
      }

      // Actually delete the objects
      for (const obj of migratedFiles) {
        try {
          // Strip the prefix before passing to deleteObject
          const keyWithoutPrefix = obj.key.replace(/^mhc\/media\//, '');
          await s3Provider.deleteObject(keyWithoutPrefix);
          sizeBytes += obj.size || 0;
          deleted++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (errors.length < 100) {
            errors.push(`${obj.key}: ${msg}`);
          }
        }
      }

      logger.info(`[LegacyImport] Cleanup complete: ${deleted} files deleted, ${(sizeBytes / 1024 / 1024).toFixed(2)} MB freed`);

    } catch (error) {
      logger.error('[LegacyImport] Cleanup error:', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: errors.length === 0,
      deleted,
      sizeBytes,
      errors,
    };
  }

  /**
   * Migrate files from people/[username]/migrated/ to people/[username]/snaps/
   * These are screensnap images that were placed in the wrong folder during migration
   */
  static async migrateFolderToSnaps(dryRun: boolean = true): Promise<{
    success: boolean;
    moved: number;
    failed: number;
    errors: string[];
  }> {
    logger.info(`[LegacyImport] Migrating files from migrated/ to snaps/ (dryRun=${dryRun})...`);

    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      return {
        success: false,
        moved: 0,
        failed: 0,
        errors: ['S3 provider not available'],
      };
    }

    const errors: string[] = [];
    let moved = 0;
    let failed = 0;

    // Get all images in migrated/ folders
    const sql = `
      SELECT id, file_path, source
      FROM profile_images
      WHERE file_path LIKE '%/migrated/%'
      ORDER BY file_path
    `;
    const result = await query<{ id: string; file_path: string; source: string }>(sql, []);

    logger.info(`[LegacyImport] Found ${result.rows.length} images in migrated/ folders`);

    if (dryRun) {
      logger.info(`[LegacyImport] DRY RUN - would move ${result.rows.length} images`);
      return {
        success: true,
        moved: 0,
        failed: 0,
        errors: [],
      };
    }

    for (const img of result.rows) {
      try {
        // Replace /migrated/ with /snaps/ in the path
        const newPath = img.file_path.replace('/migrated/', '/snaps/');

        // Copy the S3 object to new path
        const copySuccess = await s3Provider.copyObject(img.file_path, newPath);

        if (!copySuccess) {
          failed++;
          errors.push(`Failed to copy ${img.file_path} to ${newPath}`);
          continue;
        }

        // Update database record
        await query(
          'UPDATE profile_images SET file_path = $1 WHERE id = $2',
          [newPath, img.id]
        );

        // Delete old S3 object
        await s3Provider.deleteObject(img.file_path);

        moved++;
        logger.info(`[LegacyImport] Moved ${img.file_path} → ${newPath}`);
      } catch (error) {
        failed++;
        errors.push(`Error migrating ${img.file_path}: ${error}`);
        logger.error(`[LegacyImport] Error migrating ${img.file_path}:`, error);
      }
    }

    logger.info(`[LegacyImport] Migration complete: ${moved} moved, ${failed} failed`);

    return {
      success: failed === 0,
      moved,
      failed,
      errors,
    };
  }

  /**
   * Clean up root flat files from S3
   * These are files at the bucket root (no folder) with format: username_timestamp_hash.jpg
   */
  static async cleanupRootFlatFiles(
    dryRun: boolean = true
  ): Promise<{
    success: boolean;
    total: number;
    deleted: number;
    sizeBytes: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let deleted = 0;
    let sizeBytes = 0;

    logger.info(`[LegacyImport] Cleaning up root flat files (dryRun=${dryRun})...`);

    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      return { success: false, total: 0, deleted: 0, sizeBytes: 0, errors: ['S3 provider not available'] };
    }

    try {
      // Get all objects and filter to root-level (no slash in key)
      const allObjects = await s3Provider.listObjects('', 600000);
      const rootFiles = allObjects.filter(o => !o.key.includes('/'));

      logger.info(`[LegacyImport] Found ${rootFiles.length} root flat files`);

      if (dryRun) {
        const totalSize = rootFiles.reduce((sum, o) => sum + (o.size || 0), 0);
        return {
          success: true,
          total: rootFiles.length,
          deleted: 0,
          sizeBytes: totalSize,
          errors: [],
        };
      }

      const batchSize = 100;
      for (let i = 0; i < rootFiles.length; i += batchSize) {
        const batch = rootFiles.slice(i, i + batchSize);

        for (const obj of batch) {
          try {
            await s3Provider.deleteObject(obj.key);
            sizeBytes += obj.size || 0;
            deleted++;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (errors.length < 100) {
              errors.push(`${obj.key}: ${msg}`);
            }
          }
        }

        if ((i + batchSize) % 1000 === 0 || i + batchSize >= rootFiles.length) {
          logger.info(`[LegacyImport] Cleanup progress: ${Math.min(i + batchSize, rootFiles.length)}/${rootFiles.length}`);
        }
      }

      logger.info(`[LegacyImport] Cleanup complete: ${deleted} files deleted, ${(sizeBytes / 1024 / 1024).toFixed(2)} MB freed`);

    } catch (error) {
      logger.error('[LegacyImport] Cleanup error:', error);
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: errors.length === 0,
      total: deleted + errors.length,
      deleted,
      sizeBytes,
      errors,
    };
  }
}

export default LegacyImageImportService;

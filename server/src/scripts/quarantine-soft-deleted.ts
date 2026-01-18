/**
 * Quarantine S3 files for soft-deleted media_locator records
 *
 * After deduplication, we soft-deleted DB records but left S3 files in place.
 * This script moves those orphaned files to the QUARANTINE folder.
 *
 * Usage:
 *   npx tsx server/src/scripts/quarantine-soft-deleted.ts analyze
 *   npx tsx server/src/scripts/quarantine-soft-deleted.ts quarantine --dry-run
 *   npx tsx server/src/scripts/quarantine-soft-deleted.ts quarantine
 */

import { query } from '../db/client.js';
import { storageService } from '../services/storage/index.js';
import { logger } from '../config/logger.js';

async function analyze(): Promise<void> {
  console.log('=== Analyzing Soft-Deleted Records ===\n');

  const result = await query(`
    SELECT
      COUNT(*) as total_soft_deleted,
      COUNT(*) FILTER (WHERE file_path IS NOT NULL) as with_file_path,
      COUNT(*) FILTER (WHERE file_path IS NULL) as without_file_path
    FROM media_locator
    WHERE deleted_at IS NOT NULL
  `);

  const row = result.rows[0];
  console.log(`Total soft-deleted records: ${parseInt(row.total_soft_deleted).toLocaleString()}`);
  console.log(`With file_path: ${parseInt(row.with_file_path).toLocaleString()}`);
  console.log(`Without file_path: ${parseInt(row.without_file_path).toLocaleString()}`);

  // Sample some paths
  const sampleResult = await query(`
    SELECT file_path FROM media_locator
    WHERE deleted_at IS NOT NULL AND file_path IS NOT NULL
    LIMIT 5
  `);

  console.log('\nSample file paths:');
  for (const r of sampleResult.rows) {
    console.log(`  ${r.file_path}`);
  }

  // Check storage status
  await storageService.init();
  const s3Provider = storageService.getS3Provider();
  if (s3Provider) {
    console.log(`\nS3 Bucket: ${s3Provider.getBucket()}`);
    console.log(`S3 Prefix: ${s3Provider.getPrefix()}`);
  } else {
    console.log('\n⚠️  S3 provider not available');
  }
}

async function quarantine(dryRun: boolean, batchSize: number): Promise<void> {
  console.log(`=== Quarantining Soft-Deleted Files ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  await storageService.init();
  const s3Provider = storageService.getS3Provider();

  if (!s3Provider) {
    console.error('S3 provider not available');
    process.exit(1);
  }

  // Get all soft-deleted records with file paths
  const result = await query(`
    SELECT id, file_path
    FROM media_locator
    WHERE deleted_at IS NOT NULL AND file_path IS NOT NULL
    ORDER BY deleted_at ASC
  `);

  console.log(`Found ${result.rows.length.toLocaleString()} soft-deleted records with file paths\n`);

  let processed = 0;
  let moved = 0;
  let notFound = 0;
  let errors = 0;

  for (const row of result.rows) {
    const sourcePath = row.file_path;
    // Create quarantine path: QUARANTINE/duplicates/{original_path}
    const quarantinePath = `QUARANTINE/duplicates/${sourcePath}`;

    try {
      if (!dryRun) {
        // Check if source exists
        const exists = await s3Provider.exists(sourcePath);
        if (!exists) {
          notFound++;
          processed++;
          continue;
        }

        // Copy to quarantine
        const copied = await s3Provider.copyObject(sourcePath, quarantinePath);
        if (!copied) {
          errors++;
          console.error(`  Failed to copy: ${sourcePath}`);
          processed++;
          continue;
        }

        // Delete original
        const deleted = await s3Provider.deleteObject(sourcePath);
        if (!deleted) {
          console.error(`  Failed to delete after copy: ${sourcePath}`);
          errors++;
        } else {
          moved++;
        }
      } else {
        // Dry run - just check if file exists
        const exists = await s3Provider.exists(sourcePath);
        if (exists) {
          moved++;
        } else {
          notFound++;
        }
      }

      processed++;

      // Progress every batch
      if (processed % batchSize === 0) {
        console.log(`  Processed ${processed.toLocaleString()}/${result.rows.length.toLocaleString()} (moved: ${moved.toLocaleString()}, not found: ${notFound.toLocaleString()}, errors: ${errors})`);
      }
    } catch (error: any) {
      errors++;
      console.error(`  Error processing ${sourcePath}: ${error.message}`);
      processed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${processed.toLocaleString()}`);
  console.log(`${dryRun ? 'Would move' : 'Moved'}: ${moved.toLocaleString()} files`);
  console.log(`Not found in S3: ${notFound.toLocaleString()}`);
  console.log(`Errors: ${errors}`);

  if (dryRun) {
    console.log('\n(Dry run - no changes made)');
  }
}

async function main() {
  const command = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  const batchSize = 500;

  switch (command) {
    case 'analyze':
      await analyze();
      break;
    case 'quarantine':
      await quarantine(dryRun, batchSize);
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx server/src/scripts/quarantine-soft-deleted.ts analyze');
      console.log('  npx tsx server/src/scripts/quarantine-soft-deleted.ts quarantine --dry-run');
      console.log('  npx tsx server/src/scripts/quarantine-soft-deleted.ts quarantine');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

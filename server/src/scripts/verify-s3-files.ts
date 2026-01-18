/**
 * Verify S3 Files
 *
 * Checks that each active media_locator record has a corresponding file in S3.
 * Updates the s3_verified and s3_verified_at columns.
 *
 * This is a long-running process for large databases.
 *
 * Usage:
 *   npx tsx server/src/scripts/verify-s3-files.ts analyze
 *   npx tsx server/src/scripts/verify-s3-files.ts verify --dry-run
 *   npx tsx server/src/scripts/verify-s3-files.ts verify --batch-size 1000
 *   npx tsx server/src/scripts/verify-s3-files.ts verify --only-unverified
 *   npx tsx server/src/scripts/verify-s3-files.ts report
 */

import { query } from '../db/client.js';
import { storageService } from '../services/storage/index.js';

interface VerificationResult {
  totalChecked: number;
  verified: number;
  missing: number;
  errors: number;
  duration: number;
}

async function analyze(): Promise<void> {
  console.log('=== S3 Verification Analysis ===\n');

  // Check if columns exist
  const columnCheck = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'media_locator'
    AND column_name IN ('s3_verified', 's3_verified_at')
  `);

  if (columnCheck.rows.length < 2) {
    console.log('⚠️  Migration 087 needs to be run first.');
    console.log('   Run: npm run migrate');
    console.log('');
  }

  const result = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE deleted_at IS NULL) as active,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND s3_verified IS NULL) as unverified,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND s3_verified = true) as verified_true,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND s3_verified = false) as verified_false
    FROM media_locator
  `);

  const row = result.rows[0];
  const total = parseInt(row.total);
  const active = parseInt(row.active);
  const unverified = parseInt(row.unverified || '0');
  const verifiedTrue = parseInt(row.verified_true || '0');
  const verifiedFalse = parseInt(row.verified_false || '0');

  console.log('Database Statistics:');
  console.log(`  Total records: ${total.toLocaleString()}`);
  console.log(`  Active records: ${active.toLocaleString()}`);
  console.log('');
  console.log('Verification Status:');
  console.log(`  Not yet verified: ${unverified.toLocaleString()}`);
  console.log(`  Verified (exists): ${verifiedTrue.toLocaleString()}`);
  console.log(`  Verified (missing): ${verifiedFalse.toLocaleString()}`);
  console.log('');

  // Estimate time
  const estimatedSeconds = (unverified / 100) * 10; // ~100 checks per 10 seconds with S3 API
  const estimatedMinutes = estimatedSeconds / 60;
  console.log(`Estimated time to verify unverified: ~${estimatedMinutes.toFixed(0)} minutes`);
}

async function verify(options: {
  dryRun: boolean;
  batchSize: number;
  onlyUnverified: boolean;
  limit?: number;
}): Promise<VerificationResult> {
  const { dryRun, batchSize, onlyUnverified, limit } = options;

  console.log(`=== Verifying S3 Files ${dryRun ? '(DRY RUN)' : ''} ===\n`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Only unverified: ${onlyUnverified}`);
  if (limit) console.log(`Limit: ${limit}`);
  console.log('');

  await storageService.init();
  const s3Provider = storageService.getS3Provider();

  if (!s3Provider) {
    console.error('S3 provider not available');
    process.exit(1);
  }

  const startTime = Date.now();

  // Build query
  let whereClause = 'WHERE deleted_at IS NULL';
  if (onlyUnverified) {
    whereClause += ' AND (s3_verified IS NULL OR s3_verified = false)';
  }

  const limitClause = limit ? `LIMIT ${limit}` : '';

  // Get records to verify
  const result = await query(`
    SELECT id, file_path
    FROM media_locator
    ${whereClause}
    ORDER BY uploaded_at ASC
    ${limitClause}
  `);

  console.log(`Found ${result.rows.length.toLocaleString()} records to verify\n`);

  let checked = 0;
  let verified = 0;
  let missing = 0;
  let errors = 0;

  const batchUpdates: { id: string; exists: boolean }[] = [];

  for (const row of result.rows) {
    try {
      const exists = await s3Provider.exists(row.file_path);

      if (exists) {
        verified++;
      } else {
        missing++;
      }

      batchUpdates.push({ id: row.id, exists });
      checked++;

      // Batch update
      if (batchUpdates.length >= batchSize) {
        if (!dryRun) {
          await updateVerificationStatus(batchUpdates);
        }
        console.log(`  Checked ${checked.toLocaleString()}/${result.rows.length.toLocaleString()} (verified: ${verified.toLocaleString()}, missing: ${missing.toLocaleString()}, errors: ${errors})`);
        batchUpdates.length = 0;
      }
    } catch (error: any) {
      errors++;
      if (errors <= 10) {
        console.error(`  Error checking ${row.file_path}: ${error.message}`);
      }
      checked++;
    }
  }

  // Final batch
  if (batchUpdates.length > 0 && !dryRun) {
    await updateVerificationStatus(batchUpdates);
  }

  const duration = (Date.now() - startTime) / 1000;

  console.log(`\n=== Verification Complete ===`);
  console.log(`Total checked: ${checked.toLocaleString()}`);
  console.log(`Verified (exists): ${verified.toLocaleString()}`);
  console.log(`Missing: ${missing.toLocaleString()}`);
  console.log(`Errors: ${errors}`);
  console.log(`Duration: ${duration.toFixed(1)} seconds`);

  if (dryRun) {
    console.log('\n(Dry run - no database updates made)');
  }

  return { totalChecked: checked, verified, missing, errors, duration };
}

async function updateVerificationStatus(updates: { id: string; exists: boolean }[]): Promise<void> {
  // Use CASE statement for efficient batch update
  const trueIds = updates.filter(u => u.exists).map(u => u.id);
  const falseIds = updates.filter(u => !u.exists).map(u => u.id);

  if (trueIds.length > 0) {
    await query(`
      UPDATE media_locator
      SET s3_verified = true, s3_verified_at = NOW()
      WHERE id = ANY($1)
    `, [trueIds]);
  }

  if (falseIds.length > 0) {
    await query(`
      UPDATE media_locator
      SET s3_verified = false, s3_verified_at = NOW()
      WHERE id = ANY($1)
    `, [falseIds]);
  }
}

async function report(): Promise<void> {
  console.log('=== S3 Verification Report ===\n');

  // Overall stats
  const overallResult = await query(`
    SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NULL) as active,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND s3_verified = true) as verified,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND s3_verified = false) as missing,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND s3_verified IS NULL) as unchecked
    FROM media_locator
  `);

  const overall = overallResult.rows[0];
  const active = parseInt(overall.active);
  const verifiedCount = parseInt(overall.verified || '0');
  const missingCount = parseInt(overall.missing || '0');
  const unchecked = parseInt(overall.unchecked || '0');

  console.log('Overall Status:');
  console.log(`  Active records: ${active.toLocaleString()}`);
  console.log(`  Verified (exists): ${verifiedCount.toLocaleString()} (${((verifiedCount / active) * 100).toFixed(1)}%)`);
  console.log(`  Missing: ${missingCount.toLocaleString()} (${((missingCount / active) * 100).toFixed(1)}%)`);
  console.log(`  Not yet checked: ${unchecked.toLocaleString()} (${((unchecked / active) * 100).toFixed(1)}%)`);
  console.log('');

  // Missing files by source
  if (missingCount > 0) {
    const missingBySource = await query(`
      SELECT source, COUNT(*) as count
      FROM media_locator
      WHERE deleted_at IS NULL AND s3_verified = false
      GROUP BY source
      ORDER BY count DESC
    `);

    console.log('Missing Files by Source:');
    for (const row of missingBySource.rows) {
      console.log(`  ${row.source || 'unknown'}: ${parseInt(row.count).toLocaleString()}`);
    }
    console.log('');

    // Sample of missing files
    const missingSample = await query(`
      SELECT file_path, source, uploaded_at
      FROM media_locator
      WHERE deleted_at IS NULL AND s3_verified = false
      ORDER BY uploaded_at DESC
      LIMIT 10
    `);

    console.log('Sample Missing Files (most recent):');
    for (const row of missingSample.rows) {
      console.log(`  ${row.file_path}`);
      console.log(`    Source: ${row.source}, Uploaded: ${row.uploaded_at}`);
    }
  }
}

async function main() {
  const command = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  const onlyUnverified = process.argv.includes('--only-unverified');

  // Parse batch size
  let batchSize = 100;
  const batchArg = process.argv.find(a => a.startsWith('--batch-size'));
  if (batchArg) {
    const idx = process.argv.indexOf(batchArg);
    if (idx >= 0 && process.argv[idx + 1]) {
      batchSize = parseInt(process.argv[idx + 1], 10);
    }
  }

  // Parse limit
  let limit: number | undefined;
  const limitArg = process.argv.find(a => a.startsWith('--limit'));
  if (limitArg) {
    const idx = process.argv.indexOf(limitArg);
    if (idx >= 0 && process.argv[idx + 1]) {
      limit = parseInt(process.argv[idx + 1], 10);
    }
  }

  switch (command) {
    case 'analyze':
      await analyze();
      break;
    case 'verify':
      await verify({ dryRun, batchSize, onlyUnverified, limit });
      break;
    case 'report':
      await report();
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx server/src/scripts/verify-s3-files.ts analyze');
      console.log('  npx tsx server/src/scripts/verify-s3-files.ts verify --dry-run');
      console.log('  npx tsx server/src/scripts/verify-s3-files.ts verify --batch-size 100');
      console.log('  npx tsx server/src/scripts/verify-s3-files.ts verify --only-unverified');
      console.log('  npx tsx server/src/scripts/verify-s3-files.ts verify --limit 1000');
      console.log('  npx tsx server/src/scripts/verify-s3-files.ts report');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

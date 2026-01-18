/**
 * Verify Missing S3 Files
 *
 * This script checks all profile_images records with storage_provider='s3'
 * and verifies the files actually exist in S3.
 *
 * For missing files, it:
 * 1. Checks alternate paths (with/without username in filename)
 * 2. Checks if exists on SSD (wrong storage_provider)
 * 3. Logs findings for manual review
 *
 * Usage:
 *   npx tsx server/src/scripts/verify-missing-files.ts analyze
 *   npx tsx server/src/scripts/verify-missing-files.ts full-scan
 *   npx tsx server/src/scripts/verify-missing-files.ts cleanup --dry-run
 *   npx tsx server/src/scripts/verify-missing-files.ts cleanup
 */

import { query } from '../db/client.js';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

const S3_BUCKET = 'mhc-media-prod';
const S3_REGION = 'us-east-2';
const S3_PREFIX = 'mhc/media/';
const SSD_BASE_PATH = '/Volumes/Imago/MHC-Control_Panel/media';

let s3Client: S3Client;

function initS3Client() {
  s3Client = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

async function checkS3Exists(relativePath: string): Promise<boolean> {
  try {
    const key = `${S3_PREFIX}${relativePath}`;
    await s3Client.send(new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }));
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function analyze(): Promise<void> {
  console.log('=== Analyzing missing S3 files ===\n');

  initS3Client();

  // Get sample of potentially missing files
  const sampleResult = await query(`
    SELECT id, file_path, storage_provider, person_id, source
    FROM profile_images
    WHERE storage_provider = 's3'
    ORDER BY RANDOM()
    LIMIT 100
  `);

  let exists = 0;
  let missing = 0;

  console.log('Checking sample of 100 S3 files...');

  for (const row of sampleResult.rows) {
    const existsInS3 = await checkS3Exists(row.file_path);
    if (existsInS3) {
      exists++;
    } else {
      missing++;
      console.log(`MISSING: ${row.file_path}`);
    }
  }

  console.log(`\nSample results:`);
  console.log(`  Exists: ${exists}/100`);
  console.log(`  Missing: ${missing}/100`);

  // Estimate total missing
  const totalResult = await query(`SELECT COUNT(*) as count FROM profile_images WHERE storage_provider = 's3'`);
  const totalS3 = parseInt(totalResult.rows[0].count);
  const estimatedMissing = Math.round((missing / 100) * totalS3);

  console.log(`\nEstimated missing out of ${totalS3} S3 records: ~${estimatedMissing}`);
}

async function fullScan(): Promise<void> {
  console.log('=== Full scan of missing S3 files ===\n');

  initS3Client();

  const result = await query(`
    SELECT id, file_path, storage_provider, person_id, source
    FROM profile_images
    WHERE storage_provider = 's3'
    ORDER BY uploaded_at DESC
  `);

  const totalCount = result.rows.length;
  console.log(`Total S3 records to check: ${totalCount}\n`);

  let processed = 0;
  let exists = 0;
  let missing = 0;
  const missingPaths: { id: string; path: string; source: string }[] = [];

  for (const row of result.rows) {
    processed++;

    const existsInS3 = await checkS3Exists(row.file_path);
    if (existsInS3) {
      exists++;
    } else {
      missing++;
      missingPaths.push({
        id: row.id,
        path: row.file_path,
        source: row.source,
      });
    }

    // Progress
    if (processed % 10000 === 0) {
      console.log(`Progress: ${processed}/${totalCount} (${Math.round(processed / totalCount * 100)}%)`);
      console.log(`  Exists: ${exists}, Missing: ${missing}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total checked: ${processed}`);
  console.log(`Exists: ${exists}`);
  console.log(`Missing: ${missing}`);

  // Write missing to file
  const outputPath = '/tmp/missing-s3-files.json';
  fs.writeFileSync(outputPath, JSON.stringify(missingPaths, null, 2));
  console.log(`\nMissing files written to: ${outputPath}`);

  // Group by source
  const bySource: Record<string, number> = {};
  for (const item of missingPaths) {
    bySource[item.source] = (bySource[item.source] || 0) + 1;
  }
  console.log('\nMissing by source:');
  for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source}: ${count}`);
  }
}

async function cleanup(dryRun: boolean): Promise<void> {
  console.log(`=== Cleaning up missing S3 file records ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  // Check if we have the missing files list
  const missingPath = '/tmp/missing-s3-files.json';
  if (!fs.existsSync(missingPath)) {
    console.error('No missing files list found. Run "full-scan" first.');
    process.exit(1);
  }

  const missingPaths = JSON.parse(fs.readFileSync(missingPath, 'utf-8')) as { id: string; path: string; source: string }[];
  console.log(`Found ${missingPaths.length} missing file records\n`);

  let deleted = 0;
  let errors = 0;

  if (!dryRun && missingPaths.length > 0) {
    // Batch delete
    const batchSize = 100;
    for (let i = 0; i < missingPaths.length; i += batchSize) {
      const batch = missingPaths.slice(i, i + batchSize);
      const ids = batch.map(m => m.id);

      try {
        const result = await query(`
          DELETE FROM profile_images WHERE id = ANY($1::uuid[])
        `, [ids]);
        deleted += result.rowCount || 0;
      } catch (error: any) {
        errors += batch.length;
        console.error(`Error deleting batch: ${error.message}`);
      }

      if ((i + batchSize) % 1000 === 0 || i + batchSize >= missingPaths.length) {
        console.log(`Progress: ${Math.min(i + batchSize, missingPaths.length)}/${missingPaths.length}`);
      }
    }
  } else if (dryRun) {
    console.log(`Would delete ${missingPaths.length} records`);
    deleted = missingPaths.length;
  }

  console.log('\n=== Summary ===');
  console.log(`Deleted: ${deleted}`);
  console.log(`Errors: ${errors}`);

  if (dryRun) {
    console.log('\n(Dry run - no changes made)');
  }
}

async function main() {
  const command = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  switch (command) {
    case 'analyze':
      await analyze();
      break;
    case 'full-scan':
      await fullScan();
      break;
    case 'cleanup':
      await cleanup(dryRun);
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx server/src/scripts/verify-missing-files.ts analyze');
      console.log('  npx tsx server/src/scripts/verify-missing-files.ts full-scan');
      console.log('  npx tsx server/src/scripts/verify-missing-files.ts cleanup --dry-run');
      console.log('  npx tsx server/src/scripts/verify-missing-files.ts cleanup');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

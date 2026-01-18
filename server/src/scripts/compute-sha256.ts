/**
 * Compute SHA256 Hashes for Profile Images
 *
 * This script computes SHA256 hashes for all profile_images that don't have one.
 * It streams files directly from S3 without writing to disk.
 *
 * Usage:
 *   npx tsx server/src/scripts/compute-sha256.ts analyze
 *   npx tsx server/src/scripts/compute-sha256.ts compute --batch-size=100 --dry-run
 *   npx tsx server/src/scripts/compute-sha256.ts compute --batch-size=100
 *   npx tsx server/src/scripts/compute-sha256.ts compute --batch-size=100 --start-offset=10000
 *   npx tsx server/src/scripts/compute-sha256.ts find-placeholders
 */

import { query } from '../db/client.js';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { Readable } from 'stream';

const S3_BUCKET = 'mhc-media-prod';
const S3_REGION = 'us-east-2';
const S3_PREFIX = 'mhc/media/';

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

/**
 * Compute SHA256 by streaming from S3 - no temp files
 */
async function computeSha256FromS3(filePath: string): Promise<{ sha256: string; fileSize: number } | null> {
  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: `${S3_PREFIX}${filePath}`,
    }));

    if (!response.Body) {
      return null;
    }

    const hash = createHash('sha256');
    let fileSize = 0;

    // Stream the body and compute hash without storing entire file in memory
    const stream = response.Body as Readable;

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        fileSize += chunk.length;
      });
      stream.on('end', () => {
        resolve({
          sha256: hash.digest('hex'),
          fileSize,
        });
      });
      stream.on('error', reject);
    });
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function analyze(): Promise<void> {
  console.log('=== Analyzing SHA256 coverage ===\n');

  const result = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE sha256 IS NOT NULL) as with_sha256,
      COUNT(*) FILTER (WHERE sha256 IS NULL) as without_sha256,
      COUNT(*) FILTER (WHERE storage_provider = 's3') as s3_records,
      COUNT(*) FILTER (WHERE storage_provider = 's3' AND sha256 IS NULL) as s3_without_sha256
    FROM profile_images
  `);

  const stats = result.rows[0];
  console.log('Profile Images Statistics:');
  console.log(`  Total records: ${parseInt(stats.total).toLocaleString()}`);
  console.log(`  With SHA256: ${parseInt(stats.with_sha256).toLocaleString()}`);
  console.log(`  Without SHA256: ${parseInt(stats.without_sha256).toLocaleString()}`);
  console.log(`  S3 records: ${parseInt(stats.s3_records).toLocaleString()}`);
  console.log(`  S3 without SHA256: ${parseInt(stats.s3_without_sha256).toLocaleString()}`);

  // Check for duplicates in existing SHA256
  const dupResult = await query(`
    SELECT sha256, COUNT(*) as count
    FROM profile_images
    WHERE sha256 IS NOT NULL
    GROUP BY sha256
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 10
  `);

  console.log('\nDuplicate SHA256 hashes (top 10):');
  if (dupResult.rows.length === 0) {
    console.log('  None found');
  } else {
    for (const row of dupResult.rows) {
      console.log(`  ${row.sha256}: ${row.count} copies`);
    }
  }

  // Check by source
  const bySource = await query(`
    SELECT source,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE sha256 IS NULL) as missing_sha256
    FROM profile_images
    WHERE storage_provider = 's3'
    GROUP BY source
    ORDER BY missing_sha256 DESC
  `);

  console.log('\nMissing SHA256 by source:');
  for (const row of bySource.rows) {
    console.log(`  ${row.source}: ${parseInt(row.missing_sha256).toLocaleString()} of ${parseInt(row.total).toLocaleString()}`);
  }
}

async function compute(batchSize: number, dryRun: boolean, startOffset: number): Promise<void> {
  console.log(`=== Computing SHA256 hashes ${dryRun ? '(DRY RUN)' : ''} ===\n`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Start offset: ${startOffset}`);

  initS3Client();

  // Get total count to process
  const countResult = await query(`
    SELECT COUNT(*) as count
    FROM profile_images
    WHERE sha256 IS NULL AND storage_provider = 's3'
  `);
  const totalToProcess = parseInt(countResult.rows[0].count);
  console.log(`\nTotal records needing SHA256: ${totalToProcess.toLocaleString()}\n`);

  if (totalToProcess === 0) {
    console.log('Nothing to process.');
    return;
  }

  let processed = 0;
  let updated = 0;
  let errors = 0;
  let notFound = 0;
  let offset = startOffset;

  const startTime = Date.now();

  while (true) {
    // Fetch batch of records without SHA256
    const batchResult = await query(`
      SELECT id, file_path
      FROM profile_images
      WHERE sha256 IS NULL AND storage_provider = 's3'
      ORDER BY id
      LIMIT $1 OFFSET $2
    `, [batchSize, offset]);

    if (batchResult.rows.length === 0) {
      break;
    }

    // Process batch in parallel (with concurrency limit)
    const concurrency = 10;
    const batches = [];
    for (let i = 0; i < batchResult.rows.length; i += concurrency) {
      batches.push(batchResult.rows.slice(i, i + concurrency));
    }

    for (const batch of batches) {
      const results = await Promise.all(batch.map(async (row: any) => {
        try {
          const result = await computeSha256FromS3(row.file_path);
          if (result) {
            return { id: row.id, ...result, error: null };
          } else {
            return { id: row.id, sha256: null, fileSize: null, error: 'not_found' };
          }
        } catch (error: any) {
          return { id: row.id, sha256: null, fileSize: null, error: error.message };
        }
      }));

      // Update database
      for (const result of results) {
        processed++;

        if (result.error === 'not_found') {
          notFound++;
          continue;
        }

        if (result.error) {
          errors++;
          if (errors <= 5) {
            console.error(`Error processing ${result.id}: ${result.error}`);
          }
          continue;
        }

        if (!dryRun && result.sha256) {
          await query(`
            UPDATE profile_images
            SET sha256 = $1, file_size = $2
            WHERE id = $3
          `, [result.sha256, result.fileSize, result.id]);
        }
        updated++;
      }
    }

    // Progress update
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const remaining = (totalToProcess - offset - processed) / rate;

    console.log(`Progress: ${(offset + processed).toLocaleString()}/${totalToProcess.toLocaleString()} | ` +
      `Updated: ${updated} | Errors: ${errors} | Not Found: ${notFound} | ` +
      `Rate: ${rate.toFixed(1)}/s | ETA: ${(remaining / 60).toFixed(1)}min`);

    offset += batchResult.rows.length;

    // Safety check - if we've processed the batch, continue
    if (batchResult.rows.length < batchSize) {
      break;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`Not found in S3: ${notFound}`);

  if (dryRun) {
    console.log('\n(Dry run - no changes made)');
  }
}

async function findPlaceholders(): Promise<void> {
  console.log('=== Finding placeholder images ===\n');

  initS3Client();

  // Get small files that might be placeholders
  const result = await query(`
    SELECT file_size, COUNT(*) as count, MIN(file_path) as example_path
    FROM profile_images
    WHERE file_size IS NOT NULL AND file_size < 2000
    GROUP BY file_size
    HAVING COUNT(*) > 5
    ORDER BY count DESC
    LIMIT 20
  `);

  console.log('Small files by size (possible placeholders):');

  const placeholderHashes: Map<string, number> = new Map();

  for (const row of result.rows) {
    // Check SHA256 of example file
    const hashResult = await computeSha256FromS3(row.example_path);
    if (hashResult) {
      console.log(`  ${row.file_size} bytes (${row.count} files): SHA256=${hashResult.sha256.substring(0, 16)}...`);

      // Count how many have this exact hash
      const hashCountResult = await query(`
        SELECT COUNT(*) as count FROM profile_images WHERE sha256 = $1
      `, [hashResult.sha256]);

      if (parseInt(hashCountResult.rows[0].count) > 1) {
        placeholderHashes.set(hashResult.sha256, parseInt(hashCountResult.rows[0].count));
      }
    }
  }

  console.log('\nLikely placeholders (same hash across multiple files):');
  for (const [hash, count] of placeholderHashes.entries()) {
    console.log(`  ${hash}: ${count} files`);
  }
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '100');
  const dryRun = args.includes('--dry-run');
  const startOffset = parseInt(args.find(a => a.startsWith('--start-offset='))?.split('=')[1] || '0');

  switch (command) {
    case 'analyze':
      await analyze();
      break;
    case 'compute':
      await compute(batchSize, dryRun, startOffset);
      break;
    case 'find-placeholders':
      await findPlaceholders();
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx server/src/scripts/compute-sha256.ts analyze');
      console.log('  npx tsx server/src/scripts/compute-sha256.ts compute --batch-size=100 --dry-run');
      console.log('  npx tsx server/src/scripts/compute-sha256.ts compute --batch-size=100');
      console.log('  npx tsx server/src/scripts/compute-sha256.ts compute --batch-size=100 --start-offset=10000');
      console.log('  npx tsx server/src/scripts/compute-sha256.ts find-placeholders');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

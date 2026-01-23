/**
 * Backfill profile_image_id in affiliate_api_polling
 *
 * For each affiliate_api_polling record with image_path but no profile_image_id:
 * 1. Check if profile_images record exists with matching file_path
 * 2. If exists: Set profile_image_id
 * 3. If not: Create profile_images record, then set FK
 *
 * Usage:
 *   npx tsx server/src/scripts/backfill-profile-image-ids.ts analyze
 *   npx tsx server/src/scripts/backfill-profile-image-ids.ts backfill --dry-run
 *   npx tsx server/src/scripts/backfill-profile-image-ids.ts backfill
 */

import { query } from '../db/client.js';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

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
  console.log('=== Analyzing affiliate_api_polling for profile_image_id backfill ===\n');

  // Count records needing backfill
  const needsBackfill = await query(`
    SELECT COUNT(*) as count
    FROM affiliate_api_polling
    WHERE image_path IS NOT NULL
      AND profile_image_id IS NULL
  `);
  console.log(`Records needing backfill: ${needsBackfill.rows[0].count}`);

  // Count records that already have matches in profile_images
  const hasMatch = await query(`
    SELECT COUNT(DISTINCT aas.id) as count
    FROM affiliate_api_polling aas
    JOIN profile_images pi ON pi.file_path = aas.image_path
    WHERE aas.image_path IS NOT NULL
      AND aas.profile_image_id IS NULL
  `);
  console.log(`Records with matching profile_images: ${hasMatch.rows[0].count}`);

  // Count records that will need new profile_images created
  const needsCreate = await query(`
    SELECT COUNT(DISTINCT aas.id) as count
    FROM affiliate_api_polling aas
    WHERE aas.image_path IS NOT NULL
      AND aas.profile_image_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM profile_images pi
        WHERE pi.file_path = aas.image_path
      )
  `);
  console.log(`Records needing new profile_images created: ${needsCreate.rows[0].count}`);

  // Get unique paths that need profile_images created
  const uniquePaths = await query(`
    SELECT COUNT(DISTINCT image_path) as count
    FROM affiliate_api_polling aas
    WHERE image_path IS NOT NULL
      AND profile_image_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM profile_images pi
        WHERE pi.file_path = aas.image_path
      )
  `);
  console.log(`Unique paths needing profile_images: ${uniquePaths.rows[0].count}`);

  // Sample of paths needing creation
  console.log('\nSample paths needing profile_images created:');
  const sampleResult = await query(`
    SELECT DISTINCT aas.image_path, aas.person_id, p.username
    FROM affiliate_api_polling aas
    LEFT JOIN persons p ON p.id = aas.person_id
    WHERE aas.image_path IS NOT NULL
      AND aas.profile_image_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM profile_images pi
        WHERE pi.file_path = aas.image_path
      )
    LIMIT 10
  `);

  initS3Client();

  for (const row of sampleResult.rows) {
    const exists = await checkS3Exists(row.image_path);
    const status = exists ? '✅' : '❌';
    console.log(`  ${status} ${row.image_path} (${row.username || 'no username'})`);
  }
}

async function backfill(dryRun: boolean, fast: boolean): Promise<void> {
  console.log(`=== Backfilling profile_image_id ${dryRun ? '(DRY RUN)' : ''} ${fast ? '(FAST MODE)' : ''} ===\n`);

  if (!fast) {
    initS3Client();
  }

  // Step 1: Link existing profile_images records
  console.log('Step 1: Linking existing profile_images records...');

  if (!dryRun) {
    const linkResult = await query(`
      UPDATE affiliate_api_polling aas
      SET profile_image_id = pi.id
      FROM profile_images pi
      WHERE aas.image_path = pi.file_path
        AND aas.profile_image_id IS NULL
        AND aas.image_path IS NOT NULL
    `);
    console.log(`  Linked ${linkResult.rowCount} records to existing profile_images\n`);
  } else {
    const countResult = await query(`
      SELECT COUNT(DISTINCT aas.id) as count
      FROM affiliate_api_polling aas
      JOIN profile_images pi ON pi.file_path = aas.image_path
      WHERE aas.profile_image_id IS NULL
        AND aas.image_path IS NOT NULL
    `);
    console.log(`  Would link ${countResult.rows[0].count} records to existing profile_images\n`);
  }

  // Step 2: Create new profile_images records for remaining
  console.log('Step 2: Creating profile_images for remaining records...');

  if (fast) {
    // Fast mode: Use bulk SQL operations without S3 verification
    console.log('  Using bulk SQL operations (fast mode - no S3 verification)...\n');

    if (!dryRun) {
      // Insert all missing paths into profile_images in bulk
      const insertResult = await query(`
        INSERT INTO profile_images (id, person_id, file_path, storage_provider, source, uploaded_at)
        SELECT
          gen_random_uuid(),
          aas.person_id,
          aas.image_path,
          's3',
          'affiliate_api',
          NOW()
        FROM (
          SELECT DISTINCT ON (image_path)
            image_path,
            person_id
          FROM affiliate_api_polling
          WHERE image_path IS NOT NULL
            AND profile_image_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM profile_images pi
              WHERE pi.file_path = affiliate_api_polling.image_path
            )
          ORDER BY image_path, observed_at DESC
        ) aas
        ON CONFLICT (file_path) DO NOTHING
      `);
      console.log(`  Created ${insertResult.rowCount} new profile_images records`);

      // Link all affiliate_api_polling to their profile_images
      const linkResult2 = await query(`
        UPDATE affiliate_api_polling aas
        SET profile_image_id = pi.id
        FROM profile_images pi
        WHERE aas.image_path = pi.file_path
          AND aas.profile_image_id IS NULL
          AND aas.image_path IS NOT NULL
      `);
      console.log(`  Linked ${linkResult2.rowCount} affiliate_api_polling records`);
    } else {
      // Dry run - just count
      const countResult = await query(`
        SELECT COUNT(*) as count
        FROM (
          SELECT DISTINCT ON (image_path)
            image_path,
            person_id
          FROM affiliate_api_polling
          WHERE image_path IS NOT NULL
            AND profile_image_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM profile_images pi
              WHERE pi.file_path = affiliate_api_polling.image_path
            )
          ORDER BY image_path, observed_at DESC
        ) aas
      `);
      console.log(`  Would create ${countResult.rows[0].count} new profile_images records`);
      console.log(`  Would then link all affiliate_api_polling to profile_images`);
    }

    console.log('\n=== Summary ===');
    if (dryRun) {
      console.log('(Dry run - no changes made)');
    } else {
      console.log('Bulk operations completed successfully');
    }
  } else {
    // Slow mode: Check S3 for each file
    const remainingResult = await query(`
      SELECT DISTINCT ON (image_path)
        image_path,
        person_id
      FROM affiliate_api_polling
      WHERE image_path IS NOT NULL
        AND profile_image_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM profile_images pi
          WHERE pi.file_path = affiliate_api_polling.image_path
        )
      ORDER BY image_path, observed_at DESC
    `);

    const totalRemaining = remainingResult.rows.length;
    console.log(`  Unique paths to create: ${totalRemaining}\n`);

    let created = 0;
    let skippedNotInS3 = 0;
    let errors = 0;

    for (let i = 0; i < remainingResult.rows.length; i++) {
      const row = remainingResult.rows[i];

      // Verify file exists in S3
      const exists = await checkS3Exists(row.image_path);
      if (!exists) {
        skippedNotInS3++;
        if (skippedNotInS3 <= 5) {
          console.log(`  SKIP (not in S3): ${row.image_path}`);
        }
        continue;
      }

      if (!dryRun) {
        try {
          // Create profile_images record
          const newId = randomUUID();
          await query(`
            INSERT INTO profile_images (id, person_id, file_path, storage_provider, source, uploaded_at)
            VALUES ($1, $2, $3, 's3', 'affiliate_api', NOW())
          `, [newId, row.person_id, row.image_path]);

          // Link all affiliate_api_polling with this path
          await query(`
            UPDATE affiliate_api_polling
            SET profile_image_id = $1
            WHERE image_path = $2
              AND profile_image_id IS NULL
          `, [newId, row.image_path]);

          created++;
        } catch (error: any) {
          // Handle duplicate key (race condition or already exists)
          if (error.code === '23505') {
            // Find existing and link
            const existingResult = await query(
              'SELECT id FROM profile_images WHERE file_path = $1',
              [row.image_path]
            );
            if (existingResult.rows.length > 0) {
              await query(`
                UPDATE affiliate_api_polling
                SET profile_image_id = $1
                WHERE image_path = $2
                  AND profile_image_id IS NULL
              `, [existingResult.rows[0].id, row.image_path]);
              created++;
            }
          } else {
            errors++;
            console.error(`  Error for ${row.image_path}:`, error.message);
          }
        }
      } else {
        created++;
      }

      // Progress
      if ((i + 1) % 1000 === 0) {
        console.log(`  Progress: ${i + 1}/${totalRemaining} (${Math.round((i + 1) / totalRemaining * 100)}%)`);
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Created/linked: ${created}`);
    console.log(`Skipped (not in S3): ${skippedNotInS3}`);
    console.log(`Errors: ${errors}`);

    if (dryRun) {
      console.log('\n(Dry run - no changes made)');
    }
  }

  // Final count
  const finalCount = await query(`
    SELECT COUNT(*) as count
    FROM affiliate_api_polling
    WHERE image_path IS NOT NULL
      AND profile_image_id IS NULL
  `);
  console.log(`\nRecords still needing backfill: ${finalCount.rows[0].count}`);
}

async function main() {
  const command = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  const fast = process.argv.includes('--fast');

  switch (command) {
    case 'analyze':
      await analyze();
      break;
    case 'backfill':
      await backfill(dryRun, fast);
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx server/src/scripts/backfill-profile-image-ids.ts analyze');
      console.log('  npx tsx server/src/scripts/backfill-profile-image-ids.ts backfill --dry-run');
      console.log('  npx tsx server/src/scripts/backfill-profile-image-ids.ts backfill --dry-run --fast');
      console.log('  npx tsx server/src/scripts/backfill-profile-image-ids.ts backfill --fast');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

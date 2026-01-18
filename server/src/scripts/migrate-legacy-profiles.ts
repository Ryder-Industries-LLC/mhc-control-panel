/**
 * Migrate Legacy profiles/* Paths
 *
 * This script migrates 971 records that have paths like:
 *   profiles/{person_id}/{image_id}.jpg
 *
 * These files exist on the local SSD but are marked as storage_provider='s3'.
 * The script:
 * 1. Reads files from SSD: /Volumes/Imago/MHC-Control_Panel/media/profiles/{person_id}/{filename}
 * 2. Gets the username from the persons table
 * 3. Uploads to S3: people/{username}/profile/{filename}
 * 4. Updates the database record with new path and saves legacy_file_path
 * 5. Moves SSD files to QUARANTINE folder
 *
 * Usage:
 *   npx tsx server/src/scripts/migrate-legacy-profiles.ts analyze
 *   npx tsx server/src/scripts/migrate-legacy-profiles.ts migrate --dry-run
 *   npx tsx server/src/scripts/migrate-legacy-profiles.ts migrate
 */

import { query } from '../db/client.js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

const S3_BUCKET = 'mhc-media-prod';
const S3_REGION = 'us-east-2';
const S3_PREFIX = 'mhc/media/';

const SSD_BASE_PATH = '/Volumes/Imago/MHC-Control_Panel/media';
const QUARANTINE_PATH = '/Volumes/Imago/MHC-Control_Panel/media/QUARANTINE/profiles';

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

async function uploadToS3(localPath: string, s3RelativePath: string): Promise<void> {
  const fileContent = fs.readFileSync(localPath);
  const key = `${S3_PREFIX}${s3RelativePath}`;

  // Determine content type from extension
  const ext = path.extname(localPath).toLowerCase();
  const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.png' ? 'image/png'
    : ext === '.gif' ? 'image/gif'
    : ext === '.webp' ? 'image/webp'
    : 'application/octet-stream';

  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: fileContent,
    ContentType: contentType,
  }));
}

async function analyze(): Promise<void> {
  console.log('=== Analyzing legacy profiles/* paths ===\n');

  // Get count
  const countResult = await query(`
    SELECT COUNT(*) as count
    FROM profile_images
    WHERE file_path LIKE 'profiles/%'
  `);
  const totalCount = parseInt(countResult.rows[0].count);
  console.log(`Total legacy profiles/* paths: ${totalCount}\n`);

  // Get sample with person info
  const sampleResult = await query(`
    SELECT
      pi.id,
      pi.file_path,
      pi.storage_provider,
      pi.person_id,
      p.username
    FROM profile_images pi
    LEFT JOIN persons p ON p.id = pi.person_id
    WHERE pi.file_path LIKE 'profiles/%'
    LIMIT 20
  `);

  console.log('Sample records:');
  console.log('-'.repeat(100));

  let existsOnSsd = 0;
  let missingFromSsd = 0;
  let hasUsername = 0;
  let noUsername = 0;

  for (const row of sampleResult.rows) {
    const ssdPath = path.join(SSD_BASE_PATH, row.file_path);
    const fileExists = fs.existsSync(ssdPath);

    if (fileExists) existsOnSsd++;
    else missingFromSsd++;

    if (row.username) hasUsername++;
    else noUsername++;

    const status = fileExists ? '✅' : '❌';
    const usernameStatus = row.username ? row.username : '(no username)';

    console.log(`${status} ${row.file_path}`);
    console.log(`   Person: ${usernameStatus} | Storage: ${row.storage_provider}`);
    console.log(`   SSD: ${ssdPath}`);
    console.log('');
  }

  console.log('Sample statistics:');
  console.log(`  Exists on SSD: ${existsOnSsd}/${sampleResult.rows.length}`);
  console.log(`  Missing from SSD: ${missingFromSsd}/${sampleResult.rows.length}`);
  console.log(`  Has username: ${hasUsername}/${sampleResult.rows.length}`);
  console.log(`  No username: ${noUsername}/${sampleResult.rows.length}`);

  // Check full counts
  console.log('\nChecking all records for SSD file existence...');

  const allResult = await query(`
    SELECT pi.file_path
    FROM profile_images pi
    WHERE pi.file_path LIKE 'profiles/%'
  `);

  let totalExists = 0;
  let totalMissing = 0;

  for (const row of allResult.rows) {
    const ssdPath = path.join(SSD_BASE_PATH, row.file_path);
    if (fs.existsSync(ssdPath)) {
      totalExists++;
    } else {
      totalMissing++;
    }
  }

  console.log(`\nFull scan results:`);
  console.log(`  Files found on SSD: ${totalExists}`);
  console.log(`  Files missing from SSD: ${totalMissing}`);
}

async function migrate(dryRun: boolean): Promise<void> {
  console.log(`=== Migrating legacy profiles/* paths ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  initS3Client();

  // Ensure quarantine directory exists
  if (!dryRun && !fs.existsSync(QUARANTINE_PATH)) {
    fs.mkdirSync(QUARANTINE_PATH, { recursive: true });
  }

  // Get before count
  const beforeCount = await query(`
    SELECT COUNT(*) as count FROM profile_images
    WHERE file_path LIKE 'profiles/%'
  `);
  console.log(`BEFORE: ${beforeCount.rows[0].count} legacy profiles/* paths\n`);

  // Get all legacy records with person info
  const result = await query(`
    SELECT
      pi.id,
      pi.file_path,
      pi.storage_provider,
      pi.person_id,
      p.username
    FROM profile_images pi
    LEFT JOIN persons p ON p.id = pi.person_id
    WHERE pi.file_path LIKE 'profiles/%'
    ORDER BY pi.uploaded_at
  `);

  const totalCount = result.rows.length;
  console.log(`Total records to process: ${totalCount}\n`);

  let processed = 0;
  let migrated = 0;
  let skippedNoFile = 0;
  let skippedNoUsername = 0;
  let skippedAlreadyInS3 = 0;
  let errors = 0;

  for (const row of result.rows) {
    processed++;

    const ssdPath = path.join(SSD_BASE_PATH, row.file_path);
    const filename = path.basename(row.file_path);

    // Check if file exists on SSD
    if (!fs.existsSync(ssdPath)) {
      skippedNoFile++;
      if (skippedNoFile <= 5) {
        console.log(`SKIP (no file): ${row.file_path}`);
      }
      continue;
    }

    // Check if we have a username
    if (!row.username) {
      skippedNoUsername++;
      if (skippedNoUsername <= 5) {
        console.log(`SKIP (no username): ${row.file_path} (person_id: ${row.person_id})`);
      }
      continue;
    }

    // Construct new S3 path
    const newPath = `people/${row.username}/profile/${filename}`;

    // Check if already exists in S3
    const existsInS3 = await checkS3Exists(newPath);
    if (existsInS3) {
      skippedAlreadyInS3++;
      if (skippedAlreadyInS3 <= 5) {
        console.log(`SKIP (already in S3): ${newPath}`);
      }

      // Still update the database record if needed
      if (!dryRun && row.file_path !== newPath) {
        try {
          await query(
            `UPDATE profile_images
             SET file_path = $1, legacy_file_path = $2, storage_provider = 's3'
             WHERE id = $3`,
            [newPath, row.file_path, row.id]
          );
        } catch (error) {
          console.error(`Error updating DB for ${row.id}:`, error);
          errors++;
        }
      }
      continue;
    }

    if (!dryRun) {
      try {
        // Upload to S3
        await uploadToS3(ssdPath, newPath);

        // Verify upload
        const verified = await checkS3Exists(newPath);
        if (!verified) {
          throw new Error('Upload verification failed');
        }

        // Update database
        await query(
          `UPDATE profile_images
           SET file_path = $1, legacy_file_path = $2, storage_provider = 's3'
           WHERE id = $3`,
          [newPath, row.file_path, row.id]
        );

        // Move SSD file to quarantine
        const quarantinePath = path.join(QUARANTINE_PATH, row.person_id, filename);
        const quarantineDir = path.dirname(quarantinePath);
        if (!fs.existsSync(quarantineDir)) {
          fs.mkdirSync(quarantineDir, { recursive: true });
        }
        fs.renameSync(ssdPath, quarantinePath);

        migrated++;
      } catch (error) {
        errors++;
        console.error(`Error migrating ${row.file_path}:`, error);
      }
    } else {
      migrated++;
      if (migrated <= 10) {
        console.log(`Would migrate: ${row.file_path} → ${newPath}`);
      }
    }

    // Progress update
    if (processed % 100 === 0) {
      console.log(`Progress: ${processed}/${totalCount} (${Math.round(processed / totalCount * 100)}%)`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total processed: ${processed}`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped (no file on SSD): ${skippedNoFile}`);
  console.log(`Skipped (no username): ${skippedNoUsername}`);
  console.log(`Skipped (already in S3): ${skippedAlreadyInS3}`);
  console.log(`Errors: ${errors}`);

  if (dryRun) {
    console.log('\n(Dry run - no changes made)');
  } else {
    console.log(`\nQuarantine location: ${QUARANTINE_PATH}`);
  }

  // Verify final count
  const afterCount = await query(`
    SELECT COUNT(*) as count
    FROM profile_images
    WHERE file_path LIKE 'profiles/%'
  `);
  console.log(`\nAFTER: ${afterCount.rows[0].count} legacy profiles/* paths remaining`);
}

async function main() {
  const command = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  switch (command) {
    case 'analyze':
      await analyze();
      break;
    case 'migrate':
      await migrate(dryRun);
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx server/src/scripts/migrate-legacy-profiles.ts analyze');
      console.log('  npx tsx server/src/scripts/migrate-legacy-profiles.ts migrate --dry-run');
      console.log('  npx tsx server/src/scripts/migrate-legacy-profiles.ts migrate');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

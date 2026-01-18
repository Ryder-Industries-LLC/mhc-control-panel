/**
 * Import Orphaned S3 Objects
 *
 * This script imports S3 objects that exist in S3 but aren't tracked in profile_images.
 * It handles the following folders:
 * - people/{username}/auto/{filename} - Source: affiliate_api
 * - people/{username}/profile/{filename} - Source: profile
 * - people/{username}/snaps/{filename} - Source: screensnap
 *
 * Usage:
 *   npx tsx server/src/scripts/import-s3-orphans.ts analyze
 *   npx tsx server/src/scripts/import-s3-orphans.ts import --dry-run
 *   npx tsx server/src/scripts/import-s3-orphans.ts import
 */

import { query } from '../db/client.js';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

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

interface S3Object {
  key: string;
  relativePath: string;
  username: string;
  folder: string;
  filename: string;
}

async function listS3Objects(prefix: string): Promise<S3Object[]> {
  const objects: S3Object[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: `${S3_PREFIX}${prefix}`,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));

    for (const obj of response.Contents || []) {
      if (!obj.Key) continue;

      // Extract relative path (remove S3_PREFIX)
      const relativePath = obj.Key.replace(S3_PREFIX, '');

      // Parse path: people/{username}/{folder}/{filename}
      const parts = relativePath.split('/');
      if (parts.length >= 4 && parts[0] === 'people') {
        const username = parts[1];
        const folder = parts[2];
        const filename = parts.slice(3).join('/');

        // Skip directories, .DS_Store files, etc.
        if (!filename || filename.endsWith('/') || filename === '.DS_Store') continue;

        objects.push({
          key: obj.Key,
          relativePath,
          username,
          folder,
          filename,
        });
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

async function analyze(): Promise<void> {
  console.log('=== Analyzing orphaned S3 objects ===\n');

  initS3Client();

  // Get all paths currently in profile_images
  console.log('Loading existing profile_images paths...');
  const existingResult = await query('SELECT file_path FROM profile_images');
  const existingPaths = new Set(existingResult.rows.map(r => r.file_path));
  console.log(`Existing profile_images: ${existingPaths.size}\n`);

  // Check each folder type
  const folders = ['auto', 'profile', 'snaps', 'all', 'migrated'];
  const stats: Record<string, { total: number; orphaned: number }> = {};

  for (const folder of folders) {
    console.log(`Scanning people/*/${folder}/*...`);
    const objects = await listS3Objects(`people/`);
    const folderObjects = objects.filter(o => o.folder === folder);
    const orphans = folderObjects.filter(o => !existingPaths.has(o.relativePath));

    stats[folder] = {
      total: folderObjects.length,
      orphaned: orphans.length,
    };

    console.log(`  Total: ${folderObjects.length}, Orphaned: ${orphans.length}`);
  }

  console.log('\n=== Summary ===');
  let totalOrphans = 0;
  for (const [folder, stat] of Object.entries(stats)) {
    console.log(`${folder}: ${stat.orphaned} orphaned of ${stat.total} total`);
    totalOrphans += stat.orphaned;
  }
  console.log(`\nTotal orphaned: ${totalOrphans}`);
}

async function importOrphans(dryRun: boolean): Promise<void> {
  console.log(`=== Importing orphaned S3 objects ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  initS3Client();

  // Get all paths currently in profile_images
  console.log('Loading existing profile_images paths...');
  const existingResult = await query('SELECT file_path FROM profile_images');
  const existingPaths = new Set(existingResult.rows.map(r => r.file_path));
  console.log(`Existing profile_images: ${existingPaths.size}\n`);

  // Load all S3 objects from people/ prefix
  console.log('Loading all S3 objects...');
  const allObjects = await listS3Objects('people/');
  console.log(`Total S3 objects: ${allObjects.length}\n`);

  // Filter to importable folders
  const importableFolders = ['auto', 'profile', 'snaps'];
  const sourceMap: Record<string, string> = {
    'auto': 'affiliate_api',
    'profile': 'profile',
    'snaps': 'screensnap',
  };

  // Group by folder
  const byFolder: Record<string, S3Object[]> = {};
  for (const folder of importableFolders) {
    byFolder[folder] = allObjects.filter(o =>
      o.folder === folder && !existingPaths.has(o.relativePath)
    );
  }

  // Load all usernames to person_id mapping
  console.log('Loading username to person_id mapping...');
  const personsResult = await query('SELECT id, username FROM persons WHERE username IS NOT NULL');
  const usernameToPersonId = new Map<string, string>();
  for (const row of personsResult.rows) {
    usernameToPersonId.set(row.username, row.id);
  }
  console.log(`Loaded ${usernameToPersonId.size} person mappings\n`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalNoPersonId = 0;
  let totalErrors = 0;

  for (const folder of importableFolders) {
    const orphans = byFolder[folder];
    console.log(`\nProcessing ${folder}/ orphans: ${orphans.length}`);

    if (orphans.length === 0) continue;

    const source = sourceMap[folder];
    let imported = 0;
    let skipped = 0;
    let noPersonId = 0;
    let errors = 0;

    // Batch insert for efficiency
    const batchSize = 1000;
    const validOrphans: { relativePath: string; personId: string }[] = [];

    for (const orphan of orphans) {
      const personId = usernameToPersonId.get(orphan.username);
      if (!personId) {
        noPersonId++;
        continue;
      }
      validOrphans.push({ relativePath: orphan.relativePath, personId });
    }

    console.log(`  Valid orphans (with person_id): ${validOrphans.length}`);
    console.log(`  No person_id: ${noPersonId}`);

    if (!dryRun && validOrphans.length > 0) {
      // Batch insert
      for (let i = 0; i < validOrphans.length; i += batchSize) {
        const batch = validOrphans.slice(i, i + batchSize);

        // Build VALUES clause
        const values: any[] = [];
        const placeholders: string[] = [];

        for (let j = 0; j < batch.length; j++) {
          const item = batch[j];
          const offset = j * 3;
          placeholders.push(`(gen_random_uuid(), $${offset + 1}, $${offset + 2}, 's3', $${offset + 3}, NOW())`);
          values.push(item.personId, item.relativePath, source);
        }

        try {
          const result = await query(`
            INSERT INTO profile_images (id, person_id, file_path, storage_provider, source, uploaded_at)
            VALUES ${placeholders.join(', ')}
            ON CONFLICT (file_path) DO NOTHING
          `, values);

          imported += result.rowCount || 0;
          skipped += batch.length - (result.rowCount || 0);
        } catch (error: any) {
          errors += batch.length;
          console.error(`  Error inserting batch: ${error.message}`);
        }

        // Progress
        if ((i + batchSize) % 10000 === 0 || i + batchSize >= validOrphans.length) {
          console.log(`  Progress: ${Math.min(i + batchSize, validOrphans.length)}/${validOrphans.length}`);
        }
      }
    } else {
      imported = validOrphans.length;
    }

    console.log(`  Imported: ${imported}, Skipped (duplicate): ${skipped}, Errors: ${errors}`);

    totalImported += imported;
    totalSkipped += skipped;
    totalNoPersonId += noPersonId;
    totalErrors += errors;
  }

  console.log('\n=== Summary ===');
  console.log(`Total imported: ${totalImported}`);
  console.log(`Total skipped (duplicate): ${totalSkipped}`);
  console.log(`Total no person_id: ${totalNoPersonId}`);
  console.log(`Total errors: ${totalErrors}`);

  if (dryRun) {
    console.log('\n(Dry run - no changes made)');
  }

  // Final count
  const finalResult = await query('SELECT COUNT(*) as count FROM profile_images');
  console.log(`\nFinal profile_images count: ${finalResult.rows[0].count}`);
}

async function main() {
  const command = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  switch (command) {
    case 'analyze':
      await analyze();
      break;
    case 'import':
      await importOrphans(dryRun);
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx server/src/scripts/import-s3-orphans.ts analyze');
      console.log('  npx tsx server/src/scripts/import-s3-orphans.ts import --dry-run');
      console.log('  npx tsx server/src/scripts/import-s3-orphans.ts import');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

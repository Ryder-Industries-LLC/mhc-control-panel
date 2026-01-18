/**
 * Quarantine S3 Folders
 *
 * This script moves/copies S3 objects from:
 * - people/{username}/all/{filename} - symlink duplicates
 * - people/{username}/migrated/{filename} - migration artifacts
 *
 * To: QUARANTINE/{folder}/{original_path}
 *
 * Usage:
 *   npx tsx server/src/scripts/quarantine-s3-folders.ts analyze
 *   npx tsx server/src/scripts/quarantine-s3-folders.ts quarantine --dry-run
 *   npx tsx server/src/scripts/quarantine-s3-folders.ts quarantine
 *   npx tsx server/src/scripts/quarantine-s3-folders.ts delete-dsstore
 */

import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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
  folder: string;
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

      const relativePath = obj.Key.replace(S3_PREFIX, '');
      const parts = relativePath.split('/');

      if (parts.length >= 4 && parts[0] === 'people') {
        const folder = parts[2];
        objects.push({
          key: obj.Key,
          relativePath,
          folder,
        });
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

async function analyze(): Promise<void> {
  console.log('=== Analyzing S3 folders for quarantine ===\n');

  initS3Client();

  const allObjects = await listS3Objects('people/');

  const byCFolder: Record<string, number> = {};
  let dsStoreCount = 0;

  for (const obj of allObjects) {
    if (obj.relativePath.endsWith('.DS_Store')) {
      dsStoreCount++;
      continue;
    }

    byCFolder[obj.folder] = (byCFolder[obj.folder] || 0) + 1;
  }

  console.log('Objects by folder:');
  for (const [folder, count] of Object.entries(byCFolder).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${folder}: ${count}`);
  }

  console.log(`\n.DS_Store files: ${dsStoreCount}`);

  console.log('\nFolders to quarantine:');
  console.log(`  all: ${byCFolder['all'] || 0}`);
  console.log(`  migrated: ${byCFolder['migrated'] || 0}`);
}

async function quarantine(dryRun: boolean): Promise<void> {
  console.log(`=== Quarantining S3 folders ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  initS3Client();

  const foldersToQuarantine = ['all', 'migrated'];

  for (const folder of foldersToQuarantine) {
    console.log(`\nProcessing ${folder}/ folder...`);

    const objects = await listS3Objects('people/');
    const folderObjects = objects.filter(o => o.folder === folder);

    console.log(`  Found ${folderObjects.length} objects`);

    if (folderObjects.length === 0) continue;

    let moved = 0;
    let errors = 0;

    for (let i = 0; i < folderObjects.length; i++) {
      const obj = folderObjects[i];
      const newKey = `${S3_PREFIX}QUARANTINE/${folder}/${obj.relativePath}`;

      if (!dryRun) {
        try {
          // Copy to quarantine
          await s3Client.send(new CopyObjectCommand({
            Bucket: S3_BUCKET,
            CopySource: `${S3_BUCKET}/${obj.key}`,
            Key: newKey,
          }));

          // Delete original
          await s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: obj.key,
          }));

          moved++;
        } catch (error: any) {
          errors++;
          if (errors <= 5) {
            console.error(`  Error moving ${obj.relativePath}: ${error.message}`);
          }
        }
      } else {
        moved++;
      }

      // Progress
      if ((i + 1) % 1000 === 0 || i + 1 === folderObjects.length) {
        console.log(`  Progress: ${i + 1}/${folderObjects.length}`);
      }
    }

    console.log(`  Moved: ${moved}, Errors: ${errors}`);
  }

  if (dryRun) {
    console.log('\n(Dry run - no changes made)');
  }
}

async function deleteDsStore(): Promise<void> {
  console.log('=== Deleting .DS_Store files ===\n');

  initS3Client();

  let continuationToken: string | undefined;
  let deleted = 0;
  let errors = 0;

  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: S3_PREFIX,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));

    for (const obj of response.Contents || []) {
      if (!obj.Key || !obj.Key.endsWith('.DS_Store')) continue;

      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: obj.Key,
        }));
        deleted++;
        console.log(`  Deleted: ${obj.Key}`);
      } catch (error: any) {
        errors++;
        console.error(`  Error deleting ${obj.Key}: ${error.message}`);
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`\nDeleted: ${deleted}, Errors: ${errors}`);
}

async function main() {
  const command = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  switch (command) {
    case 'analyze':
      await analyze();
      break;
    case 'quarantine':
      await quarantine(dryRun);
      break;
    case 'delete-dsstore':
      await deleteDsStore();
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx server/src/scripts/quarantine-s3-folders.ts analyze');
      console.log('  npx tsx server/src/scripts/quarantine-s3-folders.ts quarantine --dry-run');
      console.log('  npx tsx server/src/scripts/quarantine-s3-folders.ts quarantine');
      console.log('  npx tsx server/src/scripts/quarantine-s3-folders.ts delete-dsstore');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Script to move files from legacy S3 prefix (mhc-media/) to current prefix (mhc/media/)
 *
 * These 21 files were uploaded to the wrong prefix on Jan 16, 2026 ~7:03-7:04 PM.
 * The database has correct paths (people/username/auto/...) but files are at wrong S3 location.
 *
 * Usage:
 *   node scripts/move-legacy-s3-files.js
 *
 * Requires AWS credentials with both s3:GetObject on mhc-media/* and s3:PutObject on mhc/media/*
 */

import { S3Client, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const BUCKET = 'mhc-media-prod';
const LEGACY_PREFIX = 'mhc-media/';
const CURRENT_PREFIX = 'mhc/media/';
const REGION = 'us-east-2';

// Use default credential provider chain (env vars, shared credentials, IAM role)
const s3 = new S3Client({ region: REGION });

async function listLegacyFiles() {
  const cmd = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: LEGACY_PREFIX
  });
  const result = await s3.send(cmd);
  return result.Contents || [];
}

async function moveFile(sourceKey, destKey) {
  try {
    // Copy to new location
    const copyCmd = new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: encodeURIComponent(`${BUCKET}/${sourceKey}`),
      Key: destKey
    });
    await s3.send(copyCmd);
    console.log(`  Copied: ${sourceKey} -> ${destKey}`);

    // Delete from old location
    const deleteCmd = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: sourceKey
    });
    await s3.send(deleteCmd);
    console.log(`  Deleted: ${sourceKey}`);

    return true;
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('Listing files in legacy prefix:', LEGACY_PREFIX);

  const files = await listLegacyFiles();
  console.log(`Found ${files.length} files to move\n`);

  if (files.length === 0) {
    console.log('No files to move. Exiting.');
    return;
  }

  let success = 0;
  let failed = 0;

  for (const file of files) {
    const sourceKey = file.Key;
    // Convert mhc-media/people/... to mhc/media/people/...
    const relativePath = sourceKey.replace(LEGACY_PREFIX, '');
    const destKey = `${CURRENT_PREFIX}${relativePath}`;

    console.log(`Moving: ${sourceKey}`);
    const ok = await moveFile(sourceKey, destKey);
    if (ok) {
      success++;
    } else {
      failed++;
    }
  }

  console.log(`\nComplete: ${success} moved, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

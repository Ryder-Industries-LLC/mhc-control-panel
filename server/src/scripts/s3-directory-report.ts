/**
 * S3 Directory Report
 *
 * Lists all top-level directories/prefixes in S3, their file counts and sizes,
 * and indicates which are active (used by media_locator) vs deletable (orphaned/legacy).
 *
 * Usage:
 *   npx tsx server/src/scripts/s3-directory-report.ts
 */

import { query } from '../db/client.js';
import { storageService } from '../services/storage/index.js';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

interface DirectoryStats {
  prefix: string;
  fileCount: number;
  totalSizeBytes: number;
  status: 'active' | 'quarantine' | 'deletable' | 'unknown';
  description: string;
}

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

const S3_BUCKET = 'mhc-media-prod';
const S3_REGION = 'us-east-2';

async function main() {
  console.log('=== S3 Directory Report ===\n');

  // Get S3 configuration
  await storageService.init();
  const s3Provider = storageService.getS3Provider();

  if (!s3Provider) {
    console.error('S3 provider not available');
    process.exit(1);
  }

  const bucket = s3Provider.getBucket();
  const basePrefix = s3Provider.getPrefix(); // mhc/media/

  console.log(`Bucket: ${bucket}`);
  console.log(`Base Prefix: ${basePrefix}`);
  console.log('');

  // Create S3 client for direct listing (with credentials)
  const client = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  // First, list all top-level prefixes in the bucket
  console.log('=== Top-Level Bucket Prefixes ===\n');

  const topLevelStats: DirectoryStats[] = [];

  // List objects at root level with delimiter
  let continuationToken: string | undefined;
  const seenPrefixes = new Set<string>();

  // Get all unique top-level prefixes by listing all objects and extracting prefixes
  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: '',
      Delimiter: '/',
      ContinuationToken: continuationToken,
    });

    const response = await client.send(command);

    // Collect common prefixes
    if (response.CommonPrefixes) {
      for (const p of response.CommonPrefixes) {
        if (p.Prefix) {
          seenPrefixes.add(p.Prefix);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`Found ${seenPrefixes.size} top-level prefixes in bucket\n`);

  // For each top-level prefix, count objects and size
  for (const prefix of Array.from(seenPrefixes).sort()) {
    let count = 0;
    let size = 0;
    let token: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      });

      const response = await client.send(command);

      if (response.Contents) {
        count += response.Contents.length;
        for (const obj of response.Contents) {
          size += obj.Size || 0;
        }
      }

      token = response.NextContinuationToken;
    } while (token);

    // Determine status
    let status: DirectoryStats['status'] = 'unknown';
    let description = '';

    const cleanPrefix = prefix.replace(/\/$/, '');

    if (cleanPrefix === 'mhc') {
      // Check if this is the current media path or old backup
      status = 'deletable';
      description = 'Old/backup prefix - can be deleted if verified empty of needed data';
    } else if (cleanPrefix.startsWith('mhc/media/QUARANTINE')) {
      status = 'quarantine';
      description = 'Quarantine folder for deleted/orphaned files';
    } else if (cleanPrefix === 'mhc/media' || cleanPrefix.startsWith('mhc/media/people')) {
      status = 'active';
      description = 'Active media storage - DO NOT DELETE';
    }

    topLevelStats.push({
      prefix,
      fileCount: count,
      totalSizeBytes: size,
      status,
      description,
    });

    console.log(`${prefix}`);
    console.log(`  Files: ${count.toLocaleString()} | Size: ${formatSize(size)}`);
    console.log(`  Status: ${status.toUpperCase()}`);
    if (description) console.log(`  ${description}`);
    console.log('');
  }

  // Now detailed breakdown under mhc/media/
  console.log('=== Detailed Breakdown: mhc/media/ ===\n');

  const mediaSubdirs: DirectoryStats[] = [];
  const mediaPrefix = 'mhc/media/';

  // List subdirectories under mhc/media/
  let mediaToken: string | undefined;
  const mediaSubprefixes = new Set<string>();

  do {
    const listMediaCmd = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: mediaPrefix,
      Delimiter: '/',
      ContinuationToken: mediaToken,
    });

    const mediaResponse = await client.send(listMediaCmd);

    if (mediaResponse.CommonPrefixes) {
      for (const p of mediaResponse.CommonPrefixes) {
        if (p.Prefix) {
          mediaSubprefixes.add(p.Prefix);
        }
      }
    }

    mediaToken = mediaResponse.NextContinuationToken;
  } while (mediaToken);

  console.log(`Found ${mediaSubprefixes.size} subdirectories under mhc/media/\n`);

  for (const prefix of Array.from(mediaSubprefixes).sort()) {
    let count = 0;
    let size = 0;
    let token: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      });

      const response = await client.send(command);

      if (response.Contents) {
        count += response.Contents.length;
        for (const obj of response.Contents) {
          size += obj.Size || 0;
        }
      }

      token = response.NextContinuationToken;
    } while (token);

    const subdir = prefix.replace(mediaPrefix, '').replace(/\/$/, '');
    let status: DirectoryStats['status'] = 'unknown';
    let description = '';

    if (subdir === 'people') {
      status = 'active';
      description = 'Active media storage - contains all user images';
    } else if (subdir === 'QUARANTINE') {
      status = 'quarantine';
      description = 'Quarantine folder - can be deleted after verification period';
    } else {
      status = 'deletable';
      description = 'Unknown/legacy folder - verify before deletion';
    }

    mediaSubdirs.push({
      prefix,
      fileCount: count,
      totalSizeBytes: size,
      status,
      description,
    });

    console.log(`${prefix}`);
    console.log(`  Files: ${count.toLocaleString()} | Size: ${formatSize(size)}`);
    console.log(`  Status: ${status.toUpperCase()}`);
    if (description) console.log(`  ${description}`);
    console.log('');
  }

  // Summary
  console.log('=== Summary ===\n');

  // DB counts
  const dbResult = await query(`
    SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NULL) as active,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as soft_deleted,
      COUNT(*) as total
    FROM media_locator
  `);
  const dbRow = dbResult.rows[0];
  console.log('Database (media_locator):');
  console.log(`  Active records: ${parseInt(dbRow.active).toLocaleString()}`);
  console.log(`  Soft-deleted: ${parseInt(dbRow.soft_deleted).toLocaleString()}`);
  console.log(`  Total: ${parseInt(dbRow.total).toLocaleString()}`);
  console.log('');

  // S3 summary by status
  const byStatus = { active: 0, quarantine: 0, deletable: 0, unknown: 0 };
  const sizeByStatus = { active: 0, quarantine: 0, deletable: 0, unknown: 0 };

  for (const stat of [...topLevelStats, ...mediaSubdirs]) {
    byStatus[stat.status] += stat.fileCount;
    sizeByStatus[stat.status] += stat.totalSizeBytes;
  }

  console.log('S3 Files by Status:');
  console.log(`  Active: ${byStatus.active.toLocaleString()} files (${formatSize(sizeByStatus.active)})`);
  console.log(`  Quarantine: ${byStatus.quarantine.toLocaleString()} files (${formatSize(sizeByStatus.quarantine)})`);
  console.log(`  Deletable: ${byStatus.deletable.toLocaleString()} files (${formatSize(sizeByStatus.deletable)})`);
  console.log(`  Unknown: ${byStatus.unknown.toLocaleString()} files (${formatSize(sizeByStatus.unknown)})`);
  console.log('');

  // Recommendations
  console.log('=== Recommendations ===\n');

  if (byStatus.deletable > 0) {
    console.log('⚠️  DELETABLE PREFIXES (verify contents before deletion):');
    for (const stat of topLevelStats.filter(s => s.status === 'deletable')) {
      console.log(`   - ${stat.prefix} (${stat.fileCount.toLocaleString()} files, ${formatSize(stat.totalSizeBytes)})`);
    }
    console.log('');
  }

  if (byStatus.quarantine > 0) {
    console.log('📦 QUARANTINE (can be deleted after verification period):');
    for (const stat of mediaSubdirs.filter(s => s.status === 'quarantine')) {
      console.log(`   - ${stat.prefix} (${stat.fileCount.toLocaleString()} files, ${formatSize(stat.totalSizeBytes)})`);
    }
    console.log('');
  }

  console.log('✅ ACTIVE (DO NOT DELETE):');
  for (const stat of mediaSubdirs.filter(s => s.status === 'active')) {
    console.log(`   - ${stat.prefix} (${stat.fileCount.toLocaleString()} files, ${formatSize(stat.totalSizeBytes)})`);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

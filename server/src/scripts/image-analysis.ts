/**
 * Comprehensive Image Analysis Script
 *
 * This script analyzes the image storage system to:
 * 1. Verify all DB image paths exist in S3
 * 2. Find missing images and search alternative S3 locations
 * 3. Identify orphaned S3 images that could be imported
 * 4. Generate a detailed report
 */

import { query } from '../db/client.js';
import { S3Client, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

interface ImageAnalysisReport {
  summary: {
    profileImagesTotal: number;
    profileImagesInS3: number;
    profileImagesMissing: number;
    affiliateSnapshotsTotal: number;
    affiliateSnapshotsWithPaths: number;
    s3ObjectsTotal: number;
    s3ObjectsInDB: number;
    s3ObjectsOrphaned: number;
  };
  pathPatterns: {
    pattern: string;
    count: number;
  }[];
  missingImages: {
    tableName: string;
    id: string;
    username: string | null;
    filePath: string;
    foundInAlternatePath?: string;
  }[];
  orphanedS3Objects: {
    key: string;
    username: string | null;
    canImport: boolean;
    reason?: string;
  }[];
  duplicateIssues: {
    type: string;
    details: string;
    count: number;
  }[];
}

const S3_BUCKET = 'mhc-media-prod';
const S3_REGION = 'us-east-2';
const S3_PREFIX = 'mhc/media/';

// Alternative prefixes to check for missing images
const ALTERNATIVE_PREFIXES = [
  'mhc-media/',
  '',  // Root of bucket
];

let s3Client: S3Client;

async function initS3Client() {
  s3Client = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

async function checkS3ObjectExists(key: string): Promise<boolean> {
  try {
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

async function listAllS3Objects(prefix: string): Promise<Set<string>> {
  const objects = new Set<string>();
  let continuationToken: string | undefined;

  console.log(`Listing S3 objects with prefix: ${prefix}...`);
  let batchCount = 0;

  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          // Store relative path (without the prefix)
          const relativePath = obj.Key.startsWith(prefix)
            ? obj.Key.slice(prefix.length)
            : obj.Key;
          objects.add(relativePath);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
    batchCount++;
    if (batchCount % 100 === 0) {
      console.log(`  Listed ${objects.size} objects so far...`);
    }
  } while (continuationToken);

  console.log(`  Total: ${objects.size} objects`);
  return objects;
}

async function getProfileImagesFromDB(): Promise<{ id: string; file_path: string; username: string | null; storage_provider: string }[]> {
  const result = await query(`
    SELECT pi.id, pi.file_path, pi.username, pi.storage_provider, p.username as person_username
    FROM profile_images pi
    LEFT JOIN persons p ON pi.person_id = p.id
    WHERE pi.storage_provider = 's3'
  `);
  return result.rows.map(r => ({
    id: r.id,
    file_path: r.file_path,
    username: r.username || r.person_username,
    storage_provider: r.storage_provider,
  }));
}

async function getAffiliateSnapshotsFromDB(): Promise<{ id: number; image_path_360x270: string | null; username: string }[]> {
  const result = await query(`
    SELECT a.id, a.image_path_360x270, p.username
    FROM affiliate_api_snapshots a
    JOIN persons p ON a.person_id = p.id
    WHERE a.image_path_360x270 IS NOT NULL
  `);
  return result.rows as { id: number; image_path_360x270: string | null; username: string }[];
}

function extractUsernameFromPath(path: string): string | null {
  // Match patterns like: people/{username}/auto/...
  const match = path.match(/^people\/([^\/]+)\//);
  if (match) {
    return match[1];
  }

  // Match patterns like: {username}_{timestamp}_{hash}.jpg
  const filenameMatch = path.match(/^([a-z0-9_]+)_\d+_[a-f0-9]+\.jpg$/i);
  if (filenameMatch) {
    return filenameMatch[1];
  }

  return null;
}

async function runAnalysis(): Promise<ImageAnalysisReport> {
  await initS3Client();

  const report: ImageAnalysisReport = {
    summary: {
      profileImagesTotal: 0,
      profileImagesInS3: 0,
      profileImagesMissing: 0,
      affiliateSnapshotsTotal: 0,
      affiliateSnapshotsWithPaths: 0,
      s3ObjectsTotal: 0,
      s3ObjectsInDB: 0,
      s3ObjectsOrphaned: 0,
    },
    pathPatterns: [],
    missingImages: [],
    orphanedS3Objects: [],
    duplicateIssues: [],
  };

  // Step 1: Get path pattern distribution
  console.log('\n=== Step 1: Analyzing path patterns ===');
  const patternsResult = await query(`
    SELECT
      CASE
        WHEN file_path LIKE 'people/%/auto/%' THEN 'people/*/auto/*'
        WHEN file_path LIKE 'people/%/profile/%' THEN 'people/*/profile/*'
        WHEN file_path LIKE 'people/%/snaps/%' THEN 'people/*/snaps/*'
        WHEN file_path LIKE 'people/%/uploads/%' THEN 'people/*/uploads/*'
        WHEN file_path LIKE 'people/%/following/%' THEN 'people/*/following/*'
        WHEN file_path LIKE 'profiles/%' THEN 'profiles/* (legacy)'
        ELSE 'other'
      END as pattern,
      COUNT(*) as count
    FROM profile_images
    GROUP BY 1
    ORDER BY count DESC
  `);
  report.pathPatterns = patternsResult.rows.map(r => ({
    pattern: r.pattern,
    count: parseInt(r.count),
  }));
  console.log('Path patterns:', report.pathPatterns);

  // Step 2: List all S3 objects
  console.log('\n=== Step 2: Listing all S3 objects ===');
  const s3Objects = await listAllS3Objects(S3_PREFIX);
  report.summary.s3ObjectsTotal = s3Objects.size;

  // Step 3: Get all profile_images paths
  console.log('\n=== Step 3: Checking profile_images against S3 ===');
  const profileImages = await getProfileImagesFromDB();
  report.summary.profileImagesTotal = profileImages.length;

  const dbPaths = new Set<string>();
  let checked = 0;

  for (const img of profileImages) {
    checked++;
    if (checked % 10000 === 0) {
      console.log(`  Checked ${checked}/${profileImages.length} images...`);
    }

    dbPaths.add(img.file_path);

    if (s3Objects.has(img.file_path)) {
      report.summary.profileImagesInS3++;
    } else {
      // Image not found at expected path
      report.summary.profileImagesMissing++;

      // Try alternative paths
      let foundPath: string | undefined;
      for (const altPrefix of ALTERNATIVE_PREFIXES) {
        const altKey = altPrefix + img.file_path;
        const exists = await checkS3ObjectExists(altKey);
        if (exists) {
          foundPath = altKey;
          break;
        }
      }

      if (report.missingImages.length < 1000) { // Limit for report size
        report.missingImages.push({
          tableName: 'profile_images',
          id: img.id,
          username: img.username,
          filePath: img.file_path,
          foundInAlternatePath: foundPath,
        });
      }
    }
  }

  // Step 4: Check affiliate_api_snapshots
  console.log('\n=== Step 4: Checking affiliate_api_snapshots ===');
  const affiliateSnapshots = await getAffiliateSnapshotsFromDB();
  report.summary.affiliateSnapshotsTotal = affiliateSnapshots.length;
  report.summary.affiliateSnapshotsWithPaths = affiliateSnapshots.filter(s => s.image_path_360x270).length;

  for (const snap of affiliateSnapshots) {
    if (snap.image_path_360x270) {
      dbPaths.add(snap.image_path_360x270);

      if (!s3Objects.has(snap.image_path_360x270)) {
        if (report.missingImages.length < 1000) {
          report.missingImages.push({
            tableName: 'affiliate_api_snapshots',
            id: String(snap.id),
            username: snap.username,
            filePath: snap.image_path_360x270,
          });
        }
      }
    }
  }

  // Step 5: Find orphaned S3 objects
  console.log('\n=== Step 5: Finding orphaned S3 objects ===');
  report.summary.s3ObjectsInDB = 0;

  for (const s3Key of s3Objects) {
    if (dbPaths.has(s3Key)) {
      report.summary.s3ObjectsInDB++;
    } else {
      report.summary.s3ObjectsOrphaned++;

      // Check if we can import this
      const username = extractUsernameFromPath(s3Key);
      const canImport = username !== null;

      if (report.orphanedS3Objects.length < 1000) {
        report.orphanedS3Objects.push({
          key: s3Key,
          username,
          canImport,
          reason: canImport ? 'Username extracted from path' : 'Cannot determine username',
        });
      }
    }
  }

  // Step 6: Check for duplicate paths/hashes
  console.log('\n=== Step 6: Checking for duplicates ===');
  const duplicatePathsResult = await query(`
    SELECT file_path, COUNT(*) as count
    FROM profile_images
    GROUP BY file_path
    HAVING COUNT(*) > 1
    LIMIT 100
  `);

  if (duplicatePathsResult.rows.length > 0) {
    report.duplicateIssues.push({
      type: 'duplicate_file_paths',
      details: `${duplicatePathsResult.rows.length} file paths appear multiple times`,
      count: duplicatePathsResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
    });
  }

  const duplicateSha256Result = await query(`
    SELECT sha256, person_id, COUNT(*) as count
    FROM profile_images
    WHERE sha256 IS NOT NULL
    GROUP BY sha256, person_id
    HAVING COUNT(*) > 1
    LIMIT 100
  `);

  if (duplicateSha256Result.rows.length > 0) {
    report.duplicateIssues.push({
      type: 'duplicate_sha256_same_person',
      details: `${duplicateSha256Result.rows.length} SHA256 hashes duplicated for same person`,
      count: duplicateSha256Result.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
    });
  }

  return report;
}

async function main() {
  console.log('========================================');
  console.log('MHC Control Panel - Image Analysis');
  console.log('========================================\n');

  try {
    const report = await runAnalysis();

    console.log('\n========================================');
    console.log('ANALYSIS REPORT');
    console.log('========================================\n');

    console.log('=== SUMMARY ===');
    console.log(`Profile Images Total: ${report.summary.profileImagesTotal.toLocaleString()}`);
    console.log(`Profile Images in S3: ${report.summary.profileImagesInS3.toLocaleString()}`);
    console.log(`Profile Images Missing: ${report.summary.profileImagesMissing.toLocaleString()}`);
    console.log(`Affiliate Snapshots Total: ${report.summary.affiliateSnapshotsTotal.toLocaleString()}`);
    console.log(`Affiliate Snapshots with Paths: ${report.summary.affiliateSnapshotsWithPaths.toLocaleString()}`);
    console.log(`S3 Objects Total: ${report.summary.s3ObjectsTotal.toLocaleString()}`);
    console.log(`S3 Objects Referenced in DB: ${report.summary.s3ObjectsInDB.toLocaleString()}`);
    console.log(`S3 Objects Orphaned: ${report.summary.s3ObjectsOrphaned.toLocaleString()}`);

    console.log('\n=== PATH PATTERNS ===');
    for (const p of report.pathPatterns) {
      console.log(`  ${p.pattern}: ${p.count.toLocaleString()}`);
    }

    console.log('\n=== MISSING IMAGES (first 20) ===');
    for (const m of report.missingImages.slice(0, 20)) {
      console.log(`  [${m.tableName}] ${m.username}: ${m.filePath}`);
      if (m.foundInAlternatePath) {
        console.log(`    -> Found at: ${m.foundInAlternatePath}`);
      }
    }
    if (report.missingImages.length > 20) {
      console.log(`  ... and ${report.missingImages.length - 20} more`);
    }

    console.log('\n=== ORPHANED S3 OBJECTS (first 20) ===');
    for (const o of report.orphanedS3Objects.slice(0, 20)) {
      console.log(`  ${o.key}`);
      console.log(`    Username: ${o.username || 'UNKNOWN'}, Can Import: ${o.canImport}`);
    }
    if (report.orphanedS3Objects.length > 20) {
      console.log(`  ... and ${report.orphanedS3Objects.length - 20} more`);
    }

    console.log('\n=== DUPLICATE ISSUES ===');
    for (const d of report.duplicateIssues) {
      console.log(`  ${d.type}: ${d.details} (${d.count} records)`);
    }

    // Write full report to JSON file
    const fs = await import('fs');
    const reportPath = '/tmp/image-analysis-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nFull report written to: ${reportPath}`);

  } catch (error) {
    console.error('Error running analysis:', error);
    process.exit(1);
  }
}

main();

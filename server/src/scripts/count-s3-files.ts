/**
 * Count S3 files in people/ path and compare to DB count
 */

import { query } from '../db/client.js';
import { storageService } from '../services/storage/index.js';

async function main() {
  console.log('=== S3 vs DB File Count Comparison ===\n');

  // Get DB count
  const dbResult = await query(`
    SELECT COUNT(*) as count
    FROM media_locator
    WHERE deleted_at IS NULL
  `);
  const dbCount = parseInt(dbResult.rows[0].count, 10);
  console.log(`DB (media_locator active records): ${dbCount.toLocaleString()}`);

  // Initialize storage and get S3 provider
  await storageService.init();
  const s3Provider = storageService.getS3Provider();

  if (!s3Provider) {
    console.error('S3 provider not available');
    process.exit(1);
  }

  console.log(`\nS3 Bucket: ${s3Provider.getBucket()}`);
  console.log(`S3 Prefix: ${s3Provider.getPrefix()}`);
  console.log('\nCounting S3 objects (this may take a minute)...\n');

  // Count only files in people/ path (excluding QUARANTINE, etc.)
  const objects = await s3Provider.listObjects('people/', 1000000);
  const s3Count = objects.length;

  console.log(`S3 (files in people/ path): ${s3Count.toLocaleString()}`);

  const diff = s3Count - dbCount;
  const diffPercent = ((diff / dbCount) * 100).toFixed(2);

  console.log(`\n=== Comparison ===`);
  console.log(`Difference: ${diff > 0 ? '+' : ''}${diff.toLocaleString()} (${diffPercent}%)`);

  if (diff > 0) {
    console.log(`\n⚠️  S3 has ${diff.toLocaleString()} more files than DB records.`);
    console.log('   These may be orphaned files (S3 files without DB records).');
  } else if (diff < 0) {
    console.log(`\n⚠️  DB has ${Math.abs(diff).toLocaleString()} more records than S3 files.`);
    console.log('   These may be missing files (DB records pointing to non-existent S3 files).');
  } else {
    console.log('\n✓ Counts match exactly!');
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

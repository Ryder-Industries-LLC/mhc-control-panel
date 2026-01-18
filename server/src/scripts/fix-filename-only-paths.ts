/**
 * Fix Filename-Only Paths in affiliate_api_snapshots
 *
 * This script fixes 54,107 records that have paths like:
 *   oldnewfun_1766905959636_95be6d04.jpg
 *
 * And converts them to proper paths:
 *   people/oldnewfun/auto/oldnewfun_1766905959636_95be6d04.jpg
 *
 * The username is extracted by parsing from the END of the filename since
 * usernames can contain underscores but timestamp (13 digits) and hash (8 hex)
 * are always at the end.
 *
 * Usage:
 *   npx tsx server/src/scripts/fix-filename-only-paths.ts analyze
 *   npx tsx server/src/scripts/fix-filename-only-paths.ts fix --dry-run
 *   npx tsx server/src/scripts/fix-filename-only-paths.ts fix
 *   npx tsx server/src/scripts/fix-filename-only-paths.ts fix --fast (skip S3 verification)
 */

import { query } from '../db/client.js';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

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
 * Parse filename to extract username, timestamp, and hash
 * Format: username_TIMESTAMP_HASH.ext
 * Parse from END because username can contain underscores
 */
function parseFilename(filename: string): {
  username: string;
  timestamp: string;
  hash: string;
  extension: string;
} | null {
  // Match pattern: anything_13digits_8hexchars.extension
  const match = filename.match(/^(.+)_(\d{13})_([a-f0-9]{8})\.(\w+)$/i);
  if (!match) {
    return null;
  }

  return {
    username: match[1],
    timestamp: match[2],
    hash: match[3],
    extension: match[4],
  };
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
  console.log('=== Analyzing filename-only paths ===\n');

  // Get count
  const countResult = await query(`
    SELECT COUNT(*) as count
    FROM affiliate_api_snapshots
    WHERE image_path_360x270 IS NOT NULL
      AND image_path_360x270 NOT LIKE '%/%'
  `);
  const totalCount = parseInt(countResult.rows[0].count);
  console.log(`Total filename-only paths: ${totalCount}\n`);

  // Get sample and analyze
  const sampleResult = await query(`
    SELECT id, image_path_360x270, person_id
    FROM affiliate_api_snapshots
    WHERE image_path_360x270 IS NOT NULL
      AND image_path_360x270 NOT LIKE '%/%'
    LIMIT 20
  `);

  console.log('Sample analysis:');
  console.log('-'.repeat(80));

  initS3Client();

  let parseable = 0;
  let unparseable = 0;
  let existsInS3 = 0;
  let missingInS3 = 0;

  for (const row of sampleResult.rows) {
    const parsed = parseFilename(row.image_path_360x270);

    if (parsed) {
      parseable++;
      const newPath = `people/${parsed.username}/auto/${row.image_path_360x270}`;
      const exists = await checkS3Exists(newPath);

      if (exists) {
        existsInS3++;
        console.log(`✅ ${row.image_path_360x270}`);
        console.log(`   → ${newPath}`);
      } else {
        missingInS3++;
        console.log(`❌ ${row.image_path_360x270}`);
        console.log(`   → ${newPath} (NOT FOUND IN S3)`);
      }
    } else {
      unparseable++;
      console.log(`⚠️  UNPARSEABLE: ${row.image_path_360x270}`);
    }
    console.log('');
  }

  console.log('Sample statistics:');
  console.log(`  Parseable: ${parseable}/${sampleResult.rows.length}`);
  console.log(`  Exists in S3: ${existsInS3}/${parseable}`);
  console.log(`  Missing in S3: ${missingInS3}/${parseable}`);

  // Get unparseable patterns
  const unparseableResult = await query(`
    SELECT image_path_360x270, COUNT(*) as count
    FROM affiliate_api_snapshots
    WHERE image_path_360x270 IS NOT NULL
      AND image_path_360x270 NOT LIKE '%/%'
      AND image_path_360x270 !~ '^.+_\\d{13}_[a-f0-9]{8}\\.[a-z]+$'
    GROUP BY image_path_360x270
    LIMIT 20
  `);

  if (unparseableResult.rows.length > 0) {
    console.log('\nUnparseable patterns found:');
    for (const row of unparseableResult.rows) {
      console.log(`  ${row.image_path_360x270} (${row.count} occurrences)`);
    }
  } else {
    console.log('\nNo unparseable patterns found - all files match expected format.');
  }
}

async function fix(dryRun: boolean, skipS3Check: boolean): Promise<void> {
  console.log(`=== Fixing filename-only paths ${dryRun ? '(DRY RUN)' : ''} ${skipS3Check ? '(FAST MODE - no S3 verification)' : ''} ===\n`);

  if (!skipS3Check) {
    initS3Client();
  }

  // Get before count
  const beforeCount = await query(`
    SELECT COUNT(*) as count FROM affiliate_api_snapshots
    WHERE image_path_360x270 IS NOT NULL AND image_path_360x270 NOT LIKE '%/%'
  `);
  console.log(`BEFORE: ${beforeCount.rows[0].count} filename-only paths\n`);

  if (skipS3Check) {
    // Fast mode: Use SQL UPDATE directly
    console.log('Using direct SQL update (fast mode)...\n');

    // First, let's see how the paths will be transformed
    const previewResult = await query(`
      SELECT
        image_path_360x270 as old_path,
        CONCAT('people/',
          SUBSTRING(image_path_360x270 FROM '^(.+)_\\d{13}_[a-f0-9]{8}\\.\\w+$'),
          '/auto/',
          image_path_360x270
        ) as new_path
      FROM affiliate_api_snapshots
      WHERE image_path_360x270 IS NOT NULL
        AND image_path_360x270 NOT LIKE '%/%'
        AND image_path_360x270 ~ '^.+_\\d{13}_[a-f0-9]{8}\\.\\w+$'
      LIMIT 5
    `);

    console.log('Preview of transformations:');
    for (const row of previewResult.rows) {
      console.log(`  ${row.old_path}`);
      console.log(`  → ${row.new_path}\n`);
    }

    if (!dryRun) {
      // Execute the update
      const updateResult = await query(`
        UPDATE affiliate_api_snapshots
        SET image_path_360x270 = CONCAT(
          'people/',
          SUBSTRING(image_path_360x270 FROM '^(.+)_\\d{13}_[a-f0-9]{8}\\.\\w+$'),
          '/auto/',
          image_path_360x270
        )
        WHERE image_path_360x270 IS NOT NULL
          AND image_path_360x270 NOT LIKE '%/%'
          AND image_path_360x270 ~ '^.+_\\d{13}_[a-f0-9]{8}\\.\\w+$'
      `);

      console.log(`Updated ${updateResult.rowCount} records.`);
    } else {
      // Count how many would be updated
      const countResult = await query(`
        SELECT COUNT(*) as count
        FROM affiliate_api_snapshots
        WHERE image_path_360x270 IS NOT NULL
          AND image_path_360x270 NOT LIKE '%/%'
          AND image_path_360x270 ~ '^.+_\\d{13}_[a-f0-9]{8}\\.\\w+$'
      `);
      console.log(`Would update ${countResult.rows[0].count} records.`);
    }
  } else {
    // Slow mode: Check S3 for each file
    const result = await query(`
      SELECT id, image_path_360x270
      FROM affiliate_api_snapshots
      WHERE image_path_360x270 IS NOT NULL
        AND image_path_360x270 NOT LIKE '%/%'
    `);

    const totalCount = result.rows.length;
    console.log(`Total records to process: ${totalCount}\n`);

    let processed = 0;
    let fixed = 0;
    let skipped = 0;
    let errors = 0;
    let notInS3 = 0;

    for (const row of result.rows) {
      processed++;

      const parsed = parseFilename(row.image_path_360x270);

      if (!parsed) {
        skipped++;
        console.log(`SKIP: Cannot parse ${row.image_path_360x270}`);
        continue;
      }

      const newPath = `people/${parsed.username}/auto/${row.image_path_360x270}`;

      // Verify S3 file exists at new path
      const exists = await checkS3Exists(newPath);

      if (!exists) {
        notInS3++;
        if (notInS3 <= 10) {
          console.log(`NOT IN S3: ${newPath}`);
        }
        continue;
      }

      if (!dryRun) {
        try {
          await query(
            'UPDATE affiliate_api_snapshots SET image_path_360x270 = $1 WHERE id = $2',
            [newPath, row.id]
          );
          fixed++;
        } catch (error) {
          errors++;
          console.error(`Error updating id ${row.id}:`, error);
        }
      } else {
        fixed++;
      }

      // Progress update
      if (processed % 1000 === 0) {
        console.log(`Progress: ${processed}/${totalCount} (${Math.round(processed / totalCount * 100)}%)`);
        console.log(`  Fixed: ${fixed}, Skipped: ${skipped}, Not in S3: ${notInS3}, Errors: ${errors}`);
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total processed: ${processed}`);
    console.log(`Fixed: ${fixed}`);
    console.log(`Skipped (unparseable): ${skipped}`);
    console.log(`Not in S3: ${notInS3}`);
    console.log(`Errors: ${errors}`);
  }

  if (dryRun) {
    console.log('\n(Dry run - no changes made)');
  }

  // Verify final count
  const afterCount = await query(`
    SELECT COUNT(*) as count
    FROM affiliate_api_snapshots
    WHERE image_path_360x270 IS NOT NULL
      AND image_path_360x270 NOT LIKE '%/%'
  `);
  console.log(`\nAFTER: ${afterCount.rows[0].count} filename-only paths remaining`);
}

async function main() {
  const command = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  const fast = process.argv.includes('--fast');

  switch (command) {
    case 'analyze':
      await analyze();
      break;
    case 'fix':
      await fix(dryRun, fast);
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx server/src/scripts/fix-filename-only-paths.ts analyze');
      console.log('  npx tsx server/src/scripts/fix-filename-only-paths.ts fix --dry-run');
      console.log('  npx tsx server/src/scripts/fix-filename-only-paths.ts fix --dry-run --fast');
      console.log('  npx tsx server/src/scripts/fix-filename-only-paths.ts fix --fast');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

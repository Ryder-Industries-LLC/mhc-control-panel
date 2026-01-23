/**
 * Deduplicate media_locator records based on SHA256 hash
 *
 * For each group of duplicates:
 * 1. Find the record with the most FK references (affiliate_api_polling)
 * 2. Update all FKs to point to the keeper
 * 3. Soft-delete the duplicates (set deleted_at)
 *
 * Usage:
 *   npx tsx server/src/scripts/deduplicate-by-sha256.ts analyze
 *   npx tsx server/src/scripts/deduplicate-by-sha256.ts dedupe --dry-run
 *   npx tsx server/src/scripts/deduplicate-by-sha256.ts dedupe
 */

import { query } from '../db/client.js';

interface DuplicateGroup {
  sha256: string;
  count: number;
  ids: string[];
}

async function analyze(): Promise<void> {
  console.log('=== Analyzing Duplicate SHA256 Hashes ===\n');

  // Count duplicate groups
  const summaryResult = await query(`
    WITH duplicates AS (
      SELECT sha256, COUNT(*) as count
      FROM media_locator
      WHERE sha256 IS NOT NULL AND deleted_at IS NULL
      GROUP BY sha256
      HAVING COUNT(*) > 1
    )
    SELECT
      COUNT(*) as duplicate_groups,
      SUM(count) as total_records_in_groups,
      SUM(count) - COUNT(*) as records_to_remove
    FROM duplicates
  `);

  const summary = summaryResult.rows[0];
  console.log(`Duplicate groups: ${summary.duplicate_groups}`);
  console.log(`Total records in groups: ${summary.total_records_in_groups}`);
  console.log(`Records to remove: ${summary.records_to_remove}`);

  // Show top 20 duplicate groups
  console.log('\nTop 20 duplicate groups:');
  const topResult = await query(`
    SELECT sha256, COUNT(*) as count, array_agg(id) as ids
    FROM media_locator
    WHERE sha256 IS NOT NULL AND deleted_at IS NULL
    GROUP BY sha256
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `);

  for (const row of topResult.rows) {
    console.log(`  ${row.sha256.substring(0, 16)}... : ${row.count} duplicates`);
  }

  // Show distribution by count
  console.log('\nDistribution by duplicate count:');
  const distResult = await query(`
    WITH duplicates AS (
      SELECT sha256, COUNT(*) as count
      FROM media_locator
      WHERE sha256 IS NOT NULL AND deleted_at IS NULL
      GROUP BY sha256
      HAVING COUNT(*) > 1
    )
    SELECT
      CASE
        WHEN count = 2 THEN '2 copies'
        WHEN count BETWEEN 3 AND 5 THEN '3-5 copies'
        WHEN count BETWEEN 6 AND 10 THEN '6-10 copies'
        WHEN count BETWEEN 11 AND 20 THEN '11-20 copies'
        ELSE '20+ copies'
      END as range,
      COUNT(*) as groups,
      SUM(count - 1) as records_to_remove
    FROM duplicates
    GROUP BY 1
    ORDER BY MIN(count)
  `);

  for (const row of distResult.rows) {
    console.log(`  ${row.range}: ${row.groups} groups, ${row.records_to_remove} to remove`);
  }
}

async function findBestRecordToKeep(ids: string[]): Promise<string> {
  // Count FK references from affiliate_api_polling for each ID
  const sql = `
    SELECT media_locator_id, COUNT(*) as ref_count
    FROM affiliate_api_polling
    WHERE media_locator_id = ANY($1)
    GROUP BY media_locator_id
    ORDER BY ref_count DESC
  `;

  const result = await query(sql, [ids]);
  if (result.rows.length > 0) {
    return result.rows[0].media_locator_id;
  }
  // If no references, return the first ID (oldest by array order)
  return ids[0];
}

async function dedupe(dryRun: boolean, batchSize: number): Promise<void> {
  console.log(`=== Deduplicating by SHA256 ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  // Get all duplicate groups
  const duplicatesResult = await query(`
    SELECT sha256, COUNT(*) as count, array_agg(id ORDER BY uploaded_at ASC) as ids
    FROM media_locator
    WHERE sha256 IS NOT NULL AND deleted_at IS NULL
    GROUP BY sha256
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `);

  const duplicateGroups: DuplicateGroup[] = duplicatesResult.rows.map(row => ({
    sha256: row.sha256,
    count: parseInt(row.count, 10),
    ids: row.ids,
  }));

  console.log(`Found ${duplicateGroups.length} duplicate groups`);

  let processed = 0;
  let fkUpdates = 0;
  let softDeleted = 0;
  let errors = 0;

  for (let i = 0; i < duplicateGroups.length; i++) {
    const group = duplicateGroups[i];

    try {
      // Find the best record to keep (most FK references)
      const keepId = await findBestRecordToKeep(group.ids);
      const duplicateIds = group.ids.filter(id => id !== keepId);

      if (!dryRun) {
        await query('BEGIN');

        try {
          // Update all FK references to point to the keeper
          const updateResult = await query(
            `UPDATE affiliate_api_polling SET media_locator_id = $1 WHERE media_locator_id = ANY($2)`,
            [keepId, duplicateIds]
          );
          fkUpdates += updateResult.rowCount || 0;

          // Soft delete the duplicates
          const deleteResult = await query(
            `UPDATE media_locator SET deleted_at = NOW() WHERE id = ANY($1)`,
            [duplicateIds]
          );
          softDeleted += deleteResult.rowCount || 0;

          await query('COMMIT');
        } catch (error) {
          await query('ROLLBACK');
          throw error;
        }
      } else {
        // Dry run - just count
        const countResult = await query(
          `SELECT COUNT(*) FROM affiliate_api_polling WHERE media_locator_id = ANY($1)`,
          [duplicateIds]
        );
        fkUpdates += parseInt(countResult.rows[0].count, 10);
        softDeleted += duplicateIds.length;
      }

      processed++;

      // Progress every batch
      if (processed % batchSize === 0) {
        console.log(`  Processed ${processed}/${duplicateGroups.length} groups (${softDeleted} soft-deleted, ${fkUpdates} FK updates)`);
      }
    } catch (error: any) {
      errors++;
      console.error(`  Error processing group ${group.sha256.substring(0, 16)}...: ${error.message}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${processed} groups`);
  console.log(`Soft-deleted: ${softDeleted} records`);
  console.log(`FK updates: ${fkUpdates} affiliate_api_polling records`);
  console.log(`Errors: ${errors}`);

  if (dryRun) {
    console.log('\n(Dry run - no changes made)');
  }

  // Verify no duplicates remain
  if (!dryRun) {
    const verifyResult = await query(`
      SELECT COUNT(*) as remaining
      FROM (
        SELECT sha256
        FROM media_locator
        WHERE sha256 IS NOT NULL AND deleted_at IS NULL
        GROUP BY sha256
        HAVING COUNT(*) > 1
      ) sub
    `);
    console.log(`\nRemaining duplicate groups: ${verifyResult.rows[0].remaining}`);
  }
}

async function main() {
  const command = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  const batchSize = 1000;

  switch (command) {
    case 'analyze':
      await analyze();
      break;
    case 'dedupe':
      await dedupe(dryRun, batchSize);
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx server/src/scripts/deduplicate-by-sha256.ts analyze');
      console.log('  npx tsx server/src/scripts/deduplicate-by-sha256.ts dedupe --dry-run');
      console.log('  npx tsx server/src/scripts/deduplicate-by-sha256.ts dedupe');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

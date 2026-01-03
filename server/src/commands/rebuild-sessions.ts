/**
 * Rebuild Sessions Command
 *
 * Rebuilds broadcast sessions from events using the segment stitch rule.
 *
 * Usage:
 *   npm run rebuild:sessions
 *   npm run rebuild:sessions -- --from 2025-12-25
 *   npm run rebuild:sessions -- --dry-run
 */

import { SegmentBuilderService } from '../services/segment-builder.service.js';
import { SessionStitcherService } from '../services/session-stitcher.service.js';
import { RollupsService } from '../services/rollups.service.js';
import { SettingsService } from '../services/settings.service.js';
import { logger } from '../config/logger.js';
import { pool } from '../db/client.js';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fromIndex = args.indexOf('--from');
  const fromDate = fromIndex >= 0 && args[fromIndex + 1]
    ? new Date(args[fromIndex + 1])
    : undefined;

  console.log('='.repeat(60));
  console.log('REBUILD SESSIONS');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made');
  }

  if (fromDate) {
    console.log(`Starting from: ${fromDate.toISOString()}`);
  } else {
    console.log('Processing all events');
  }

  try {
    // Show current settings
    const mergeGap = await SettingsService.getBroadcastMergeGapMinutes();
    const summaryDelay = await SettingsService.getEffectiveSummaryDelayMinutes();
    console.log(`\nSettings:`);
    console.log(`  Merge gap: ${mergeGap} minutes`);
    console.log(`  Summary delay: ${summaryDelay} minutes`);

    if (dryRun) {
      // In dry run, just analyze what would happen
      console.log('\n[DRY RUN] Would clear existing segments and sessions');
      console.log('[DRY RUN] Would build segments from events');
      console.log('[DRY RUN] Would stitch segments into sessions');
      console.log('[DRY RUN] Would compute rollups');
      return;
    }

    // Step 1: Clear existing data
    console.log('\n1. Clearing existing segments and sessions...');
    const clearedSegments = await SegmentBuilderService.clearAll();
    const clearedSessions = await SessionStitcherService.clearAll();
    console.log(`   Cleared ${clearedSegments} segments and ${clearedSessions} sessions`);

    // Step 2: Build segments from events
    console.log('\n2. Building segments from broadcastStart/broadcastStop events...');
    const segments = await SegmentBuilderService.buildSegments(fromDate);
    console.log(`   Created ${segments.length} explicit segments`);

    // Show segment summary
    console.log('\n   Segments:');
    for (const seg of segments) {
      const duration = seg.ended_at
        ? ((seg.ended_at.getTime() - seg.started_at.getTime()) / (1000 * 60)).toFixed(1)
        : 'active';
      console.log(`   - ${seg.started_at.toISOString()} → ${seg.ended_at?.toISOString() || 'active'} (${duration} min)`);
    }

    // Step 3: Assign events to segments
    console.log('\n3. Assigning events to segments...');
    let assignedEvents = await SegmentBuilderService.assignAllEventsToSegments();
    console.log(`   Assigned ${assignedEvents} events to segments`);

    // Step 3b: Build implicit segments for orphaned events (events without matching start/stop)
    console.log('\n3b. Building implicit segments for orphaned events...');
    const implicitSegments = await SegmentBuilderService.buildImplicitSegments();
    if (implicitSegments.length > 0) {
      console.log(`   Created ${implicitSegments.length} implicit segments`);
      for (const seg of implicitSegments) {
        const duration = seg.ended_at
          ? ((seg.ended_at.getTime() - seg.started_at.getTime()) / (1000 * 60)).toFixed(1)
          : 'active';
        console.log(`   - ${seg.started_at.toISOString()} → ${seg.ended_at?.toISOString() || 'active'} (${duration} min)`);
      }

      // Re-assign events to include the new implicit segments
      const newlyAssigned = await SegmentBuilderService.assignAllEventsToSegments();
      assignedEvents += newlyAssigned;
      console.log(`   Assigned ${newlyAssigned} additional events to implicit segments`);

      // Add implicit segments to the main list for stitching
      segments.push(...implicitSegments);
    } else {
      console.log('   No orphaned events found');
    }

    // Step 4: Stitch segments into sessions
    console.log('\n4. Stitching segments into sessions...');
    const { sessions, assignments } = await SessionStitcherService.stitchSegments(segments);
    console.log(`   Created ${sessions.length} sessions from ${segments.length} segments`);

    // Apply segment-session assignments
    await SessionStitcherService.applyAssignments(assignments);

    // Show session summary
    console.log('\n   Sessions:');
    for (const session of sessions) {
      const duration = session.ended_at
        ? ((session.ended_at.getTime() - session.started_at.getTime()) / (1000 * 60)).toFixed(1)
        : 'active';
      const segmentCount = assignments.filter(a => a.sessionId === session.id).length;
      console.log(`   - ${session.started_at.toISOString()} (${duration} min, ${segmentCount} segment${segmentCount > 1 ? 's' : ''}, ${session.status})`);
    }

    // Step 5: Propagate session IDs to events
    console.log('\n5. Propagating session IDs to events...');
    const propagated = await SessionStitcherService.propagateSessionIdsToEvents();
    console.log(`   Propagated session_id to ${propagated} events`);

    // Step 6: Compute rollups
    console.log('\n6. Computing rollups for each session...');
    for (const session of sessions) {
      const rollups = await RollupsService.computeAndUpdateSession(session.id);
      console.log(`   Session ${session.started_at.toISOString().split('T')[0]}:`);
      console.log(`     - Tokens: ${rollups.total_tokens}`);
      console.log(`     - Followers: ${rollups.followers_gained >= 0 ? '+' : ''}${rollups.followers_gained}`);
      console.log(`     - Peak viewers: ${rollups.peak_viewers}`);
      console.log(`     - Avg viewers: ${rollups.avg_viewers.toFixed(1)}`);
      console.log(`     - Unique visitors: ${rollups.unique_visitors}`);
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('REBUILD COMPLETE');
    console.log('='.repeat(60));
    console.log(`Segments: ${segments.length}`);
    console.log(`Sessions: ${sessions.length}`);
    console.log(`Events linked: ${propagated}`);

    // Show aggregate stats
    const stats = await RollupsService.getAggregateStats();
    console.log('\nAggregate Stats:');
    console.log(`  Total tokens: ${stats.totalTokens}`);
    console.log(`  Total followers: ${stats.totalFollowers >= 0 ? '+' : ''}${stats.totalFollowers}`);
    console.log(`  Peak viewers: ${stats.peakViewers}`);
    console.log(`  Avg viewers: ${stats.avgViewers.toFixed(1)}`);
    console.log(`  Total time: ${stats.totalMinutes.toFixed(0)} minutes`);

  } catch (error) {
    logger.error('Rebuild failed:', error);
    console.error('\nREBUILD FAILED:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface BroadcastSegment {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  session_id: string | null;
  source: 'events_api' | 'manual' | 'migration';
  start_event_id: string | null;
  end_event_id: string | null;
  created_at: Date;
}

interface EventRecord {
  id: string;
  timestamp: Date;
  method: string;
}

export class SegmentBuilderService {
  /**
   * Build segments from broadcastStart/broadcastStop events
   * @param fromDate Optional start date to filter events
   * @returns Array of created segments
   */
  static async buildSegments(fromDate?: Date): Promise<BroadcastSegment[]> {
    logger.info(`Building segments from events${fromDate ? ` since ${fromDate.toISOString()}` : ''}`);

    // Get all broadcastStart and broadcastStop events ordered by timestamp
    const dateFilter = fromDate ? 'AND timestamp >= $1' : '';
    const params = fromDate ? [fromDate] : [];

    const eventsResult = await query<EventRecord>(
      `SELECT id, timestamp, method
       FROM event_logs
       WHERE method IN ('broadcastStart', 'broadcastStop')
       ${dateFilter}
       ORDER BY timestamp ASC`,
      params
    );

    const events = eventsResult.rows;
    logger.info(`Found ${events.length} broadcast start/stop events`);

    if (events.length === 0) {
      return [];
    }

    // Parse events into segments
    const segments: Omit<BroadcastSegment, 'id' | 'created_at'>[] = [];
    let currentStart: EventRecord | null = null;

    for (const event of events) {
      if (event.method === 'broadcastStart') {
        // If we have an unclosed segment, close it at this point (edge case: missing stop)
        if (currentStart) {
          logger.warn(`Found broadcastStart without matching stop at ${currentStart.timestamp.toISOString()}`);
          segments.push({
            started_at: currentStart.timestamp,
            ended_at: event.timestamp, // Close at next start
            session_id: null,
            source: 'events_api',
            start_event_id: currentStart.id,
            end_event_id: null,
          });
        }
        currentStart = event;
      } else if (event.method === 'broadcastStop') {
        if (currentStart) {
          // Normal case: close the segment
          segments.push({
            started_at: currentStart.timestamp,
            ended_at: event.timestamp,
            session_id: null,
            source: 'events_api',
            start_event_id: currentStart.id,
            end_event_id: event.id,
          });
          currentStart = null;
        } else {
          // Edge case: stop without start (might be from before our date range)
          logger.warn(`Found broadcastStop without matching start at ${event.timestamp.toISOString()}`);
        }
      }
    }

    // Handle unclosed segment (still broadcasting)
    if (currentStart) {
      logger.info(`Active segment detected, started at ${currentStart.timestamp.toISOString()}`);
      segments.push({
        started_at: currentStart.timestamp,
        ended_at: null, // Active
        session_id: null,
        source: 'events_api',
        start_event_id: currentStart.id,
        end_event_id: null,
      });
    }

    logger.info(`Built ${segments.length} segments from events`);

    // Insert segments into database
    const createdSegments: BroadcastSegment[] = [];

    for (const segment of segments) {
      const result = await query<BroadcastSegment>(
        `INSERT INTO broadcast_segments (started_at, ended_at, session_id, source, start_event_id, end_event_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          segment.started_at,
          segment.ended_at,
          segment.session_id,
          segment.source,
          segment.start_event_id,
          segment.end_event_id,
        ]
      );
      createdSegments.push(result.rows[0]);
    }

    logger.info(`Saved ${createdSegments.length} segments to database`);
    return createdSegments;
  }

  /**
   * Assign events to their containing segment
   */
  static async assignEventsToSegment(
    segmentId: string,
    startAt: Date,
    endAt: Date | null
  ): Promise<number> {
    const result = await query(
      `UPDATE event_logs
       SET segment_id = $1
       WHERE timestamp >= $2
         AND ($3::timestamptz IS NULL OR timestamp <= $3)
         AND segment_id IS NULL`,
      [segmentId, startAt, endAt]
    );

    const count = result.rowCount ?? 0;
    logger.debug(`Assigned ${count} events to segment ${segmentId}`);
    return count;
  }

  /**
   * Assign all events to their segments
   */
  static async assignAllEventsToSegments(): Promise<number> {
    const segments = await query<BroadcastSegment>(
      'SELECT * FROM broadcast_segments ORDER BY started_at'
    );

    let totalAssigned = 0;
    for (const segment of segments.rows) {
      const assigned = await this.assignEventsToSegment(
        segment.id,
        segment.started_at,
        segment.ended_at
      );
      totalAssigned += assigned;
    }

    logger.info(`Assigned ${totalAssigned} events to ${segments.rows.length} segments`);
    return totalAssigned;
  }

  /**
   * Get all segments
   */
  static async getAll(): Promise<BroadcastSegment[]> {
    const result = await query<BroadcastSegment>(
      'SELECT * FROM broadcast_segments ORDER BY started_at'
    );
    return result.rows;
  }

  /**
   * Get segment by ID
   */
  static async getById(id: string): Promise<BroadcastSegment | null> {
    const result = await query<BroadcastSegment>(
      'SELECT * FROM broadcast_segments WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Clear all segments (for rebuild)
   */
  static async clearAll(): Promise<number> {
    // First clear event linkages
    await query('UPDATE event_logs SET segment_id = NULL, session_id = NULL');

    // Then delete segments
    const result = await query('DELETE FROM broadcast_segments');
    const count = result.rowCount ?? 0;
    logger.info(`Cleared ${count} segments`);
    return count;
  }

  /**
   * Build implicit segments for orphaned events.
   * These are events that exist without explicit broadcastStart/broadcastStop pairs.
   *
   * Strategy:
   * 1. Find contiguous blocks of unassigned events (separated by 30+ min gaps)
   * 2. Look for broadcastStop events within those blocks to mark end times
   * 3. Create segments for those blocks
   */
  static async buildImplicitSegments(): Promise<BroadcastSegment[]> {
    logger.info('Looking for orphaned events to build implicit segments...');

    // Find contiguous blocks of unassigned broadcast activity
    // We look for gaps > 30 minutes to identify separate blocks
    const blocksResult = await query<{
      block_start: Date;
      block_end: Date;
      event_count: string;
    }>(
      `WITH ordered_events AS (
         SELECT
           id,
           timestamp,
           method,
           LAG(timestamp) OVER (ORDER BY timestamp) as prev_timestamp
         FROM event_logs
         WHERE segment_id IS NULL
           AND method IN ('chatMessage', 'tip', 'userEnter', 'userLeave', 'follow', 'unfollow', 'privateMessage', 'roomSubjectChange', 'broadcastStop')
       ),
       block_markers AS (
         SELECT
           id,
           timestamp,
           method,
           CASE
             WHEN prev_timestamp IS NULL THEN 1
             WHEN EXTRACT(EPOCH FROM (timestamp - prev_timestamp)) / 60 > 30 THEN 1
             ELSE 0
           END as is_new_block
         FROM ordered_events
       ),
       block_ids AS (
         SELECT
           id,
           timestamp,
           method,
           SUM(is_new_block) OVER (ORDER BY timestamp) as block_id
         FROM block_markers
       )
       SELECT
         MIN(timestamp) as block_start,
         MAX(timestamp) as block_end,
         COUNT(*) as event_count
       FROM block_ids
       GROUP BY block_id
       HAVING COUNT(*) >= 5  -- Only consider blocks with at least 5 events
       ORDER BY MIN(timestamp)`
    );

    if (blocksResult.rows.length === 0) {
      logger.info('No orphaned event blocks found');
      return [];
    }

    logger.info(`Found ${blocksResult.rows.length} orphaned event blocks`);

    const createdSegments: BroadcastSegment[] = [];

    for (const block of blocksResult.rows) {
      const startTime = block.block_start;
      let endTime = block.block_end;

      // Check for a broadcastStop event near the end of this block
      const stopResult = await query<{ id: string; timestamp: Date }>(
        `SELECT id, timestamp
         FROM event_logs
         WHERE method = 'broadcastStop'
           AND segment_id IS NULL
           AND timestamp >= $1
           AND timestamp <= $2
         ORDER BY timestamp DESC
         LIMIT 1`,
        [startTime, new Date(endTime.getTime() + 5 * 60 * 1000)] // Look up to 5 min after last event
      );

      const endEventId = stopResult.rows[0]?.id || null;
      if (stopResult.rows[0]) {
        endTime = stopResult.rows[0].timestamp;
      }

      // Check if there's already a segment that covers this period
      const existingResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM broadcast_segments
         WHERE started_at < $2 AND (ended_at IS NULL OR ended_at > $1)`,
        [startTime, endTime]
      );

      if (parseInt(existingResult.rows[0].count, 10) > 0) {
        logger.debug(`Skipping implicit segment - overlaps with existing segment`);
        continue;
      }

      // Get the first event ID for this block
      const firstEventResult = await query<{ id: string }>(
        `SELECT id FROM event_logs
         WHERE timestamp >= $1 AND timestamp <= $2 AND segment_id IS NULL
         ORDER BY timestamp LIMIT 1`,
        [startTime, endTime]
      );

      // Create the implicit segment
      const result = await query<BroadcastSegment>(
        `INSERT INTO broadcast_segments (started_at, ended_at, session_id, source, start_event_id, end_event_id)
         VALUES ($1, $2, NULL, 'events_api', $3, $4)
         RETURNING *`,
        [startTime, endTime, firstEventResult.rows[0]?.id || null, endEventId]
      );

      createdSegments.push(result.rows[0]);
      logger.info(`Created implicit segment: ${startTime.toISOString()} → ${endTime.toISOString()} (${parseInt(block.event_count, 10)} events)`);
    }

    logger.info(`Created ${createdSegments.length} implicit segments from orphaned events`);
    return createdSegments;
  }
}

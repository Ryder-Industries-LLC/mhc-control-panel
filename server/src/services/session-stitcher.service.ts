import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import { SettingsService } from './settings.service.js';
import type { BroadcastSegment } from './segment-builder.service.js';

export interface BroadcastSessionV2 {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  last_event_at: Date;
  finalize_at: Date | null;
  status: 'active' | 'ended' | 'pending_finalize' | 'finalized';
  total_tokens: number;
  followers_gained: number;
  peak_viewers: number;
  avg_viewers: number;
  unique_visitors: number;
  ai_summary: string | null;
  ai_summary_status: 'pending' | 'generating' | 'generated' | 'failed';
  ai_summary_generated_at: Date | null;
  notes: string | null;
  tags: string[];
  room_subject: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface StitchResult {
  sessions: BroadcastSessionV2[];
  assignments: { segmentId: string; sessionId: string }[];
}

interface SessionBuilder {
  started_at: Date;
  ended_at: Date | null;
  last_event_at: Date;
  segmentIds: string[];
}

export class SessionStitcherService {
  /**
   * THE DEFINITIVE MERGE RULE:
   * Two adjacent segments A and B MUST be merged into one session IFF:
   *   B.started_at - A.ended_at <= merge_gap_minutes (default 30)
   * Otherwise: they are separate sessions.
   *
   * Repeated stitching: If segment C starts within merge gap of
   * the merged session's latest end time, keep stitching.
   */
  static async stitchSegments(segments: BroadcastSegment[]): Promise<StitchResult> {
    const mergeGapMinutes = await SettingsService.getBroadcastMergeGapMinutes();
    const summaryDelayMinutes = await SettingsService.getEffectiveSummaryDelayMinutes();

    logger.info(`Stitching ${segments.length} segments with ${mergeGapMinutes} minute merge gap`);

    // Sort segments by start time
    const sortedSegments = [...segments].sort(
      (a, b) => a.started_at.getTime() - b.started_at.getTime()
    );

    const sessionBuilders: SessionBuilder[] = [];
    let currentBuilder: SessionBuilder | null = null;

    for (const segment of sortedSegments) {
      if (!currentBuilder) {
        // Start new session with first segment
        currentBuilder = {
          started_at: segment.started_at,
          ended_at: segment.ended_at,
          last_event_at: segment.ended_at || segment.started_at,
          segmentIds: [segment.id],
        };
      } else {
        // Check if we should stitch or separate
        const gapMinutes = this.getGapMinutes(currentBuilder.ended_at, segment.started_at);

        if (currentBuilder.ended_at === null) {
          // Previous segment was active, can't merge
          // Finalize current and start new
          sessionBuilders.push(currentBuilder);
          currentBuilder = {
            started_at: segment.started_at,
            ended_at: segment.ended_at,
            last_event_at: segment.ended_at || segment.started_at,
            segmentIds: [segment.id],
          };
        } else if (gapMinutes !== null && gapMinutes <= mergeGapMinutes) {
          // STITCH: Extend current session
          logger.debug(`Stitching segment ${segment.id} (gap: ${gapMinutes.toFixed(1)} min)`);
          currentBuilder.ended_at = segment.ended_at;
          currentBuilder.last_event_at = segment.ended_at || segment.started_at;
          currentBuilder.segmentIds.push(segment.id);
        } else {
          // SEPARATE: Finalize current, start new
          logger.debug(`Separating segment ${segment.id} (gap: ${gapMinutes?.toFixed(1) ?? 'null'} min)`);
          sessionBuilders.push(currentBuilder);
          currentBuilder = {
            started_at: segment.started_at,
            ended_at: segment.ended_at,
            last_event_at: segment.ended_at || segment.started_at,
            segmentIds: [segment.id],
          };
        }
      }
    }

    // Handle last session
    if (currentBuilder) {
      sessionBuilders.push(currentBuilder);
    }

    logger.info(`Stitched ${segments.length} segments into ${sessionBuilders.length} sessions`);

    // Create sessions in database
    const sessions: BroadcastSessionV2[] = [];
    const assignments: { segmentId: string; sessionId: string }[] = [];

    for (const builder of sessionBuilders) {
      // Determine status and finalize_at
      // Sessions start as 'active' when broadcasting, then move to 'ended' when broadcast stops
      // They stay in 'ended' until finalize_at passes, then become 'pending_finalize', then 'finalized'
      const isActive = builder.ended_at === null;
      const finalize_at = isActive
        ? null
        : new Date(builder.last_event_at.getTime() + summaryDelayMinutes * 60 * 1000);

      // For sessions that have ended, check if we're past the finalize time
      let status: 'active' | 'ended' | 'pending_finalize' | 'finalized';
      if (isActive) {
        status = 'active';
      } else if (finalize_at && finalize_at <= new Date()) {
        // Finalize time has passed, ready for finalization
        status = 'pending_finalize';
      } else {
        // Ended but still within merge window
        status = 'ended';
      }

      const result = await query<BroadcastSessionV2>(
        `INSERT INTO broadcast_sessions_v2
         (started_at, ended_at, last_event_at, finalize_at, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [builder.started_at, builder.ended_at, builder.last_event_at, finalize_at, status]
      );

      const session = result.rows[0];
      sessions.push(session);

      // Record assignments
      for (const segmentId of builder.segmentIds) {
        assignments.push({ segmentId, sessionId: session.id });
      }
    }

    return { sessions, assignments };
  }

  /**
   * Calculate gap in minutes between two timestamps
   * Returns null if either timestamp is null
   */
  static getGapMinutes(endTime: Date | null, startTime: Date): number | null {
    if (endTime === null) {
      return null;
    }
    return (startTime.getTime() - endTime.getTime()) / (1000 * 60);
  }

  /**
   * Apply segment-session assignments to the database
   */
  static async applyAssignments(
    assignments: { segmentId: string; sessionId: string }[]
  ): Promise<void> {
    for (const { segmentId, sessionId } of assignments) {
      // Update segment with session_id
      await query(
        'UPDATE broadcast_segments SET session_id = $1 WHERE id = $2',
        [sessionId, segmentId]
      );
    }
    logger.info(`Applied ${assignments.length} segment-session assignments`);
  }

  /**
   * Update session_id on all events based on their segment's session
   */
  static async propagateSessionIdsToEvents(): Promise<number> {
    const result = await query(
      `UPDATE event_logs el
       SET session_id = bs.session_id
       FROM broadcast_segments bs
       WHERE el.segment_id = bs.id
         AND bs.session_id IS NOT NULL
         AND el.session_id IS NULL`
    );

    const count = result.rowCount ?? 0;
    logger.info(`Propagated session_id to ${count} events`);
    return count;
  }

  /**
   * Get all sessions
   */
  static async getAll(options?: {
    limit?: number;
    offset?: number;
    status?: 'active' | 'ended' | 'pending_finalize' | 'finalized';
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ sessions: BroadcastSessionV2[]; total: number }> {
    const { limit = 50, offset = 0, status, startDate, endDate } = options || {};

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (startDate) {
      conditions.push(`started_at >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`started_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM broadcast_sessions_v2 ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get sessions
    params.push(limit, offset);
    const result = await query<BroadcastSessionV2>(
      `SELECT * FROM broadcast_sessions_v2
       ${whereClause}
       ORDER BY started_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return { sessions: result.rows, total };
  }

  /**
   * Get session by ID with its segments
   */
  static async getById(id: string): Promise<{
    session: BroadcastSessionV2 | null;
    segments: BroadcastSegment[];
  }> {
    const sessionResult = await query<BroadcastSessionV2>(
      'SELECT * FROM broadcast_sessions_v2 WHERE id = $1',
      [id]
    );

    if (!sessionResult.rows[0]) {
      return { session: null, segments: [] };
    }

    const segmentsResult = await query<BroadcastSegment>(
      'SELECT * FROM broadcast_segments WHERE session_id = $1 ORDER BY started_at',
      [id]
    );

    return {
      session: sessionResult.rows[0],
      segments: segmentsResult.rows,
    };
  }

  /**
   * Clear all sessions (for rebuild)
   */
  static async clearAll(): Promise<number> {
    // Clear session_id from segments first
    await query('UPDATE broadcast_segments SET session_id = NULL');

    // Then delete sessions
    const result = await query('DELETE FROM broadcast_sessions_v2');
    const count = result.rowCount ?? 0;
    logger.info(`Cleared ${count} sessions`);
    return count;
  }

  /**
   * Get sessions ready for finalization
   */
  static async getReadyToFinalize(): Promise<BroadcastSessionV2[]> {
    const result = await query<BroadcastSessionV2>(
      `SELECT * FROM broadcast_sessions_v2
       WHERE status = 'pending_finalize'
         AND finalize_at <= NOW()
       ORDER BY finalize_at`
    );
    return result.rows;
  }

  /**
   * Mark a session as finalized
   */
  static async markFinalized(sessionId: string): Promise<BroadcastSessionV2 | null> {
    const result = await query<BroadcastSessionV2>(
      `UPDATE broadcast_sessions_v2
       SET status = 'finalized'
       WHERE id = $1
       RETURNING *`,
      [sessionId]
    );
    return result.rows[0] || null;
  }

  /**
   * End a currently active session
   * Sets ended_at, calculates finalize_at, and changes status to 'ended'
   */
  static async endSession(sessionId: string): Promise<BroadcastSessionV2 | null> {
    const summaryDelayMinutes = await SettingsService.getEffectiveSummaryDelayMinutes();
    const now = new Date();
    const finalizeAt = new Date(now.getTime() + summaryDelayMinutes * 60 * 1000);

    const result = await query<BroadcastSessionV2>(
      `UPDATE broadcast_sessions_v2
       SET ended_at = $2,
           last_event_at = $2,
           finalize_at = $3,
           status = 'ended',
           updated_at = NOW()
       WHERE id = $1 AND status = 'active'
       RETURNING *`,
      [sessionId, now, finalizeAt]
    );

    if (result.rows[0]) {
      logger.info(`Session ended: ${sessionId}, will finalize at ${finalizeAt.toISOString()}`);
    }

    return result.rows[0] || null;
  }

  /**
   * Create or find the current active v2 session
   */
  static async getOrCreateActiveSession(): Promise<BroadcastSessionV2> {
    // Check for existing active session
    const existingResult = await query<BroadcastSessionV2>(
      `SELECT * FROM broadcast_sessions_v2
       WHERE status = 'active'
       ORDER BY started_at DESC
       LIMIT 1`
    );

    if (existingResult.rows[0]) {
      return existingResult.rows[0];
    }

    // Create new session
    const result = await query<BroadcastSessionV2>(
      `INSERT INTO broadcast_sessions_v2
       (started_at, last_event_at, status)
       VALUES (NOW(), NOW(), 'active')
       RETURNING *`
    );

    logger.info(`Created new active session: ${result.rows[0].id}`);
    return result.rows[0];
  }

  /**
   * Get the current active session (if any)
   */
  static async getActiveSession(): Promise<BroadcastSessionV2 | null> {
    const result = await query<BroadcastSessionV2>(
      `SELECT * FROM broadcast_sessions_v2
       WHERE status = 'active'
       ORDER BY started_at DESC
       LIMIT 1`
    );
    return result.rows[0] || null;
  }
}

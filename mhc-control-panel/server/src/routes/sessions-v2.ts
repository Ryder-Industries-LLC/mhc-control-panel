import { Router, Request, Response } from 'express';
import { query } from '../db/client.js';
import { RollupsService } from '../services/rollups.service.js';
import { SegmentBuilderService } from '../services/segment-builder.service.js';
import { SessionStitcherService } from '../services/session-stitcher.service.js';
import { aiSummaryService } from '../services/ai-summary.service.js';
import { logger } from '../config/logger.js';

const router = Router();

interface SessionRow {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  last_event_at: Date;
  finalize_at: Date | null;
  status: string;
  total_tokens: number;
  followers_gained: number;
  peak_viewers: number;
  avg_viewers: number;
  unique_visitors: number;
  ai_summary: string | null;
  ai_summary_status: string;
  ai_summary_generated_at: Date | null;
  notes: string | null;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

interface SegmentRow {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  session_id: string | null;
  source: string;
  start_event_id: string | null;
  end_event_id: string | null;
  created_at: Date;
}

/**
 * GET /api/sessions-v2
 * Get all sessions with pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = '20', offset = '0', startDate, endDate, status } = req.query;
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    let whereClause = 'WHERE 1=1';
    const params: (string | Date | number)[] = [];
    let paramIndex = 1;

    if (startDate) {
      whereClause += ` AND started_at >= $${paramIndex}`;
      params.push(new Date(startDate as string));
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND started_at <= $${paramIndex}`;
      params.push(new Date(endDate as string));
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status as string);
      paramIndex++;
    }

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM broadcast_sessions_v2 ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get sessions
    const result = await query<SessionRow>(
      `SELECT * FROM broadcast_sessions_v2
       ${whereClause}
       ORDER BY started_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    res.json({
      sessions: result.rows.map(formatSession),
      total,
      hasMore: offsetNum + result.rows.length < total,
    });
  } catch (error) {
    logger.error('Error fetching sessions', { error });
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * GET /api/sessions-v2/stats
 * Get aggregate statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { days = '30', startDate, endDate } = req.query;

    // Calculate date range from days parameter or use explicit dates
    const dateOptions: { startDate?: Date; endDate?: Date } = {};

    if (startDate) {
      dateOptions.startDate = new Date(startDate as string);
    } else if (days) {
      const daysNum = parseInt(days as string, 10);
      dateOptions.startDate = new Date();
      dateOptions.startDate.setDate(dateOptions.startDate.getDate() - daysNum);
    }

    if (endDate) {
      dateOptions.endDate = new Date(endDate as string);
    }

    const stats = await RollupsService.getAggregateStats(dateOptions);
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching session stats', { error });
    res.status(500).json({ error: 'Failed to fetch session stats' });
  }
});

/**
 * GET /api/sessions-v2/current
 * Get currently active session
 */
router.get('/current', async (_req: Request, res: Response) => {
  try {
    const result = await query<SessionRow>(
      `SELECT * FROM broadcast_sessions_v2
       WHERE status = 'active'
       ORDER BY started_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.json({ session: null });
    }

    res.json({ session: formatSession(result.rows[0]) });
  } catch (error) {
    logger.error('Error fetching current session', { error });
    res.status(500).json({ error: 'Failed to fetch current session' });
  }
});

/**
 * GET /api/sessions-v2/:id
 * Get a specific session with its segments
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get session
    const sessionResult = await query<SessionRow>(
      'SELECT * FROM broadcast_sessions_v2 WHERE id = $1',
      [id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get segments for this session
    const segmentsResult = await query<SegmentRow>(
      'SELECT * FROM broadcast_segments WHERE session_id = $1 ORDER BY started_at',
      [id]
    );

    res.json({
      ...formatSession(sessionResult.rows[0]),
      segments: segmentsResult.rows.map(formatSegment),
    });
  } catch (error) {
    logger.error('Error fetching session', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

/**
 * GET /api/sessions-v2/:id/events
 * Get events for a session with pagination
 */
router.get('/:id/events', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = '100', offset = '0', method } = req.query;
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    let whereClause = 'WHERE session_id = $1';
    const params: (string | number)[] = [id];
    let paramIndex = 2;

    if (method) {
      whereClause += ` AND method = $${paramIndex}`;
      params.push(method as string);
      paramIndex++;
    }

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM event_logs ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get events
    const result = await query(
      `SELECT id, timestamp, method, raw_event
       FROM event_logs
       ${whereClause}
       ORDER BY timestamp ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    res.json({
      events: result.rows,
      total,
      hasMore: offsetNum + result.rows.length < total,
    });
  } catch (error) {
    logger.error('Error fetching session events', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch session events' });
  }
});

/**
 * GET /api/sessions-v2/:id/audience
 * Get audience breakdown for a session
 */
router.get('/:id/audience', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get unique visitors who entered
    const visitorsResult = await query<{ username: string; entered_at: Date }>(
      `SELECT DISTINCT ON (raw_event->'user'->>'username')
         raw_event->'user'->>'username' as username,
         timestamp as entered_at
       FROM event_logs
       WHERE session_id = $1 AND method = 'userEnter'
       ORDER BY raw_event->'user'->>'username', timestamp`,
      [id]
    );

    // Get tippers
    const tippersResult = await query<{ username: string; total_tokens: string; tip_count: string }>(
      `SELECT
         raw_event->'user'->>'username' as username,
         SUM((raw_event->'tip'->>'tokens')::int) as total_tokens,
         COUNT(*) as tip_count
       FROM event_logs
       WHERE session_id = $1 AND method = 'tip'
       GROUP BY raw_event->'user'->>'username'
       ORDER BY total_tokens DESC`,
      [id]
    );

    // Get new followers
    const followersResult = await query<{ username: string; followed_at: Date }>(
      `SELECT
         raw_event->'user'->>'username' as username,
         timestamp as followed_at
       FROM event_logs
       WHERE session_id = $1 AND method = 'follow'
       ORDER BY timestamp`,
      [id]
    );

    res.json({
      visitors: visitorsResult.rows,
      tippers: tippersResult.rows.map(t => ({
        username: t.username,
        totalTokens: parseInt(t.total_tokens, 10),
        tipCount: parseInt(t.tip_count, 10),
      })),
      followers: followersResult.rows,
    });
  } catch (error) {
    logger.error('Error fetching session audience', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch session audience' });
  }
});

/**
 * PUT /api/sessions-v2/:id
 * Update session notes and tags
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes, tags } = req.body;

    const result = await query<SessionRow>(
      `UPDATE broadcast_sessions_v2
       SET notes = COALESCE($2, notes),
           tags = COALESCE($3, tags),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, notes, tags]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(formatSession(result.rows[0]));
  } catch (error) {
    logger.error('Error updating session', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to update session' });
  }
});

/**
 * POST /api/sessions-v2/:id/summary
 * Generate or regenerate AI summary for a session
 */
router.post('/:id/summary', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!aiSummaryService.isAvailable()) {
      return res.status(503).json({ error: 'AI summary service is not configured' });
    }

    // Check session exists and is finalized
    const sessionResult = await query<SessionRow>(
      'SELECT * FROM broadcast_sessions_v2 WHERE id = $1',
      [id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    if (session.status === 'active') {
      return res.status(400).json({ error: 'Cannot generate summary for active session' });
    }

    // Mark as generating
    await query(
      `UPDATE broadcast_sessions_v2 SET ai_summary_status = 'generating' WHERE id = $1`,
      [id]
    );

    // Get chat messages for this session
    const chatResult = await query<{ content: string; username: string; timestamp: Date }>(
      `SELECT
         raw_event->'message'->>'message' as content,
         raw_event->'user'->>'username' as username,
         timestamp
       FROM event_logs
       WHERE session_id = $1 AND method = 'chatMessage'
       ORDER BY timestamp`,
      [id]
    );

    // Build transcript
    const transcript = chatResult.rows
      .map(m => `[${m.username}] ${m.content}`)
      .join('\n');

    if (!transcript) {
      await query(
        `UPDATE broadcast_sessions_v2
         SET ai_summary_status = 'failed', ai_summary = 'No chat messages found'
         WHERE id = $1`,
        [id]
      );
      return res.status(400).json({ error: 'No chat messages found for this session' });
    }

    // Generate summary
    const result = await aiSummaryService.generatePreview(transcript);

    // Save summary
    await query(
      `UPDATE broadcast_sessions_v2
       SET ai_summary = $2,
           ai_summary_status = 'generated',
           ai_summary_generated_at = NOW()
       WHERE id = $1`,
      [id, result.summary]
    );

    res.json({ summary: result.summary });
  } catch (error) {
    logger.error('Error generating session summary', { error, id: req.params.id });

    // Mark as failed
    await query(
      `UPDATE broadcast_sessions_v2 SET ai_summary_status = 'failed' WHERE id = $1`,
      [req.params.id]
    ).catch(() => {});

    res.status(500).json({ error: 'Failed to generate session summary' });
  }
});

/**
 * POST /api/sessions-v2/:id/recompute
 * Recompute rollups for a session
 */
router.post('/:id/recompute', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const rollups = await RollupsService.computeAndUpdateSession(id);
    res.json(rollups);
  } catch (error) {
    logger.error('Error recomputing session rollups', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to recompute session rollups' });
  }
});

/**
 * DELETE /api/sessions-v2/:id
 * Delete a session and unlink its segments
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Unlink segments
    await query('UPDATE broadcast_segments SET session_id = NULL WHERE session_id = $1', [id]);

    // Unlink events
    await query('UPDATE event_logs SET session_id = NULL WHERE session_id = $1', [id]);

    // Delete session
    const result = await query('DELETE FROM broadcast_sessions_v2 WHERE id = $1', [id]);

    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting session', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

/**
 * POST /api/sessions-v2/rebuild
 * Rebuild all sessions from events
 */
router.post('/rebuild', async (req: Request, res: Response) => {
  try {
    const { fromDate } = req.body;
    const from = fromDate ? new Date(fromDate) : undefined;

    logger.info('Starting session rebuild', { fromDate: from?.toISOString() });

    // Clear existing data
    const clearedSegments = await SegmentBuilderService.clearAll();
    const clearedSessions = await SessionStitcherService.clearAll();
    logger.info(`Cleared ${clearedSegments} segments and ${clearedSessions} sessions`);

    // Build segments from events
    const segments = await SegmentBuilderService.buildSegments(from);
    logger.info(`Created ${segments.length} explicit segments`);

    // Assign events to segments
    let assignedEvents = await SegmentBuilderService.assignAllEventsToSegments();

    // Build implicit segments for orphaned events
    const implicitSegments = await SegmentBuilderService.buildImplicitSegments();
    if (implicitSegments.length > 0) {
      const newlyAssigned = await SegmentBuilderService.assignAllEventsToSegments();
      assignedEvents += newlyAssigned;
      segments.push(...implicitSegments);
    }

    // Stitch segments into sessions
    const { sessions, assignments } = await SessionStitcherService.stitchSegments(segments);
    await SessionStitcherService.applyAssignments(assignments);

    // Propagate session IDs to events
    const propagated = await SessionStitcherService.propagateSessionIdsToEvents();

    // Compute rollups for each session
    for (const session of sessions) {
      await RollupsService.computeAndUpdateSession(session.id);
    }

    logger.info('Session rebuild complete', {
      segments: segments.length,
      sessions: sessions.length,
      eventsLinked: propagated,
    });

    res.json({
      segments: segments.length,
      sessions: sessions.length,
      eventsLinked: propagated,
    });
  } catch (error) {
    logger.error('Error rebuilding sessions', { error });
    res.status(500).json({ error: 'Failed to rebuild sessions' });
  }
});

// Helper functions

function formatSession(row: SessionRow) {
  const durationMinutes = row.ended_at
    ? (row.ended_at.getTime() - row.started_at.getTime()) / (1000 * 60)
    : null;

  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    lastEventAt: row.last_event_at,
    finalizeAt: row.finalize_at,
    status: row.status,
    durationMinutes,
    totalTokens: row.total_tokens,
    followersGained: row.followers_gained,
    peakViewers: row.peak_viewers,
    avgViewers: parseFloat(row.avg_viewers.toString()),
    uniqueVisitors: row.unique_visitors,
    aiSummary: row.ai_summary,
    aiSummaryStatus: row.ai_summary_status,
    aiSummaryGeneratedAt: row.ai_summary_generated_at,
    notes: row.notes,
    tags: row.tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatSegment(row: SegmentRow) {
  const durationMinutes = row.ended_at
    ? (row.ended_at.getTime() - row.started_at.getTime()) / (1000 * 60)
    : null;

  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    sessionId: row.session_id,
    source: row.source,
    startEventId: row.start_event_id,
    endEventId: row.end_event_id,
    durationMinutes,
    createdAt: row.created_at,
  };
}

export default router;

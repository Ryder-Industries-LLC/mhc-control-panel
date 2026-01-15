import { Router, Request, Response } from 'express';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

const router = Router();

interface EventLog {
  id: string;
  timestamp: string;
  method: string;
  broadcaster: string;
  username: string;
  raw_event: Record<string, unknown>;
  created_at: string;
}

/**
 * GET /api/events/recent
 * Get recent events from the Events API
 * Supports multiple method values: ?method=broadcastStart&method=broadcastStop
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    // Support both single method and array of methods
    const methodParam = req.query.method;
    const methods: string[] = Array.isArray(methodParam)
      ? methodParam as string[]
      : methodParam
        ? [methodParam as string]
        : [];

    let sql = 'SELECT * FROM event_logs';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (methods.length === 1) {
      sql += ` WHERE method = $${paramIndex++}`;
      params.push(methods[0]);
    } else if (methods.length > 1) {
      const placeholders = methods.map(() => `$${paramIndex++}`).join(', ');
      sql += ` WHERE method IN (${placeholders})`;
      params.push(...methods);
    }

    sql += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query<EventLog>(sql, params);

    const events = result.rows.map(row => {
      // Parse raw_event if it's a string
      const rawEvent = typeof row.raw_event === 'string'
        ? JSON.parse(row.raw_event)
        : row.raw_event;

      return {
        id: row.id,
        timestamp: row.timestamp,
        method: row.method,
        broadcaster: row.broadcaster,
        username: row.username,
        rawEvent: rawEvent,
      };
    });

    res.json({ events });
  } catch (error) {
    logger.error('Get events error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

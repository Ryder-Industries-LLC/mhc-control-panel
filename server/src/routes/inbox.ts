import { Router, Request, Response } from 'express';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

const router = Router();

interface PMThread {
  username: string;
  message_count: number;
  last_message_at: Date;
  last_message: string;
  is_from_user: boolean;
}

interface PMMessage {
  id: string;
  timestamp: Date;
  from_user: string;
  to_user: string;
  message: string;
  is_from_broadcaster: boolean;
}

/**
 * GET /api/inbox/threads
 * Get all PM threads grouped by user
 */
router.get('/threads', async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0' } = req.query;
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    // Get threads with latest message per user
    const result = await query<{
      username: string;
      message_count: string;
      last_message_at: Date;
      last_message: string;
      is_from_user: boolean;
    }>(
      `WITH pm_messages AS (
         SELECT
           id,
           timestamp,
           raw_event->'user'->>'username' as from_user,
           raw_event->'message'->>'toUser' as to_user,
           raw_event->'message'->>'message' as message,
           CASE
             WHEN raw_event->'message'->>'fromUser' = raw_event->'user'->>'username' THEN true
             ELSE false
           END as is_from_user
         FROM event_logs
         WHERE method = 'privateMessage'
       ),
       user_threads AS (
         SELECT
           CASE
             WHEN is_from_user THEN to_user
             ELSE from_user
           END as other_user,
           id,
           timestamp,
           message,
           is_from_user
         FROM pm_messages
       ),
       latest_per_user AS (
         SELECT DISTINCT ON (other_user)
           other_user as username,
           timestamp as last_message_at,
           message as last_message,
           is_from_user
         FROM user_threads
         ORDER BY other_user, timestamp DESC
       ),
       counts AS (
         SELECT
           other_user as username,
           COUNT(*) as message_count
         FROM user_threads
         GROUP BY other_user
       )
       SELECT
         l.username,
         c.message_count,
         l.last_message_at,
         l.last_message,
         l.is_from_user
       FROM latest_per_user l
       JOIN counts c ON l.username = c.username
       WHERE l.username IS NOT NULL AND l.username != ''
       ORDER BY l.last_message_at DESC
       LIMIT $1 OFFSET $2`,
      [limitNum, offsetNum]
    );

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT
         CASE
           WHEN raw_event->'message'->>'fromUser' = raw_event->'user'->>'username'
             THEN raw_event->'message'->>'toUser'
           ELSE raw_event->'user'->>'username'
         END
       ) as count
       FROM event_logs
       WHERE method = 'privateMessage'`
    );

    const threads: PMThread[] = result.rows.map(row => ({
      username: row.username,
      message_count: parseInt(row.message_count, 10),
      last_message_at: row.last_message_at,
      last_message: row.last_message,
      is_from_user: row.is_from_user,
    }));

    res.json({
      threads,
      total: parseInt(countResult.rows[0]?.count || '0', 10),
      hasMore: offsetNum + threads.length < parseInt(countResult.rows[0]?.count || '0', 10),
    });
  } catch (error) {
    logger.error('Error fetching PM threads', { error });
    res.status(500).json({ error: 'Failed to fetch PM threads' });
  }
});

/**
 * GET /api/inbox/thread/:username
 * Get all messages with a specific user
 */
router.get('/thread/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { limit = '100', offset = '0' } = req.query;
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    const result = await query<{
      id: string;
      timestamp: Date;
      from_user: string;
      to_user: string;
      message: string;
    }>(
      `SELECT
         id,
         timestamp,
         raw_event->'user'->>'username' as from_user,
         raw_event->'message'->>'toUser' as to_user,
         raw_event->'message'->>'message' as message
       FROM event_logs
       WHERE method = 'privateMessage'
         AND (
           raw_event->'user'->>'username' = $1
           OR raw_event->'message'->>'toUser' = $1
         )
       ORDER BY timestamp ASC
       LIMIT $2 OFFSET $3`,
      [username, limitNum, offsetNum]
    );

    // Get total count for this thread
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM event_logs
       WHERE method = 'privateMessage'
         AND (
           raw_event->'user'->>'username' = $1
           OR raw_event->'message'->>'toUser' = $1
         )`,
      [username]
    );

    const messages: PMMessage[] = result.rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      from_user: row.from_user,
      to_user: row.to_user,
      message: row.message,
      is_from_broadcaster: row.from_user !== username,
    }));

    res.json({
      username,
      messages,
      total: parseInt(countResult.rows[0]?.count || '0', 10),
      hasMore: offsetNum + messages.length < parseInt(countResult.rows[0]?.count || '0', 10),
    });
  } catch (error) {
    logger.error('Error fetching PM thread', { error, username: req.params.username });
    res.status(500).json({ error: 'Failed to fetch PM thread' });
  }
});

/**
 * GET /api/inbox/stats
 * Get PM statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = parseInt(days as string, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const result = await query<{
      total_messages: string;
      unique_users: string;
      messages_received: string;
      messages_sent: string;
    }>(
      `SELECT
         COUNT(*) as total_messages,
         COUNT(DISTINCT
           CASE
             WHEN raw_event->'message'->>'fromUser' = raw_event->'user'->>'username'
               THEN raw_event->'message'->>'toUser'
             ELSE raw_event->'user'->>'username'
           END
         ) as unique_users,
         COUNT(*) FILTER (
           WHERE raw_event->'message'->>'fromUser' != raw_event->'user'->>'username'
         ) as messages_received,
         COUNT(*) FILTER (
           WHERE raw_event->'message'->>'fromUser' = raw_event->'user'->>'username'
         ) as messages_sent
       FROM event_logs
       WHERE method = 'privateMessage'
         AND timestamp >= $1`,
      [startDate]
    );

    const row = result.rows[0];
    res.json({
      totalMessages: parseInt(row?.total_messages || '0', 10),
      uniqueUsers: parseInt(row?.unique_users || '0', 10),
      messagesReceived: parseInt(row?.messages_received || '0', 10),
      messagesSent: parseInt(row?.messages_sent || '0', 10),
    });
  } catch (error) {
    logger.error('Error fetching PM stats', { error });
    res.status(500).json({ error: 'Failed to fetch PM stats' });
  }
});

/**
 * GET /api/inbox/search
 * Search messages
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, limit = '50' } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const limitNum = parseInt(limit as string, 10);
    const searchTerm = `%${q}%`;

    const result = await query<{
      id: string;
      timestamp: Date;
      from_user: string;
      to_user: string;
      message: string;
    }>(
      `SELECT
         id,
         timestamp,
         raw_event->'user'->>'username' as from_user,
         raw_event->'message'->>'toUser' as to_user,
         raw_event->'message'->>'message' as message
       FROM event_logs
       WHERE method = 'privateMessage'
         AND (
           raw_event->'message'->>'message' ILIKE $1
           OR raw_event->'user'->>'username' ILIKE $1
           OR raw_event->'message'->>'toUser' ILIKE $1
         )
       ORDER BY timestamp DESC
       LIMIT $2`,
      [searchTerm, limitNum]
    );

    res.json({
      query: q,
      results: result.rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        from_user: row.from_user,
        to_user: row.to_user,
        message: row.message,
      })),
    });
  } catch (error) {
    logger.error('Error searching PMs', { error });
    res.status(500).json({ error: 'Failed to search PMs' });
  }
});

export default router;

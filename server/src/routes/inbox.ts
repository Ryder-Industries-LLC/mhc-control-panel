import { Router, Request, Response } from 'express';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

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
 * Uses interactions table which has PMs from all sources (including when not broadcasting)
 */
router.get('/threads', async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0' } = req.query;
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    // Get threads with latest message per user from interactions table
    const result = await query<{
      username: string;
      message_count: string;
      last_message_at: Date;
      last_message: string;
      is_from_user: boolean;
    }>(
      `WITH pm_messages AS (
         SELECT
           i.id,
           i.timestamp,
           p.username,
           i.metadata->>'fromUser' as from_user,
           i.metadata->>'toUser' as to_user,
           i.content as message,
           CASE
             WHEN LOWER(i.metadata->>'fromUser') = LOWER(p.username) THEN true
             ELSE false
           END as is_from_user
         FROM interactions i
         JOIN persons p ON i.person_id = p.id
         WHERE i.type = 'PRIVATE_MESSAGE'
       ),
       latest_per_user AS (
         SELECT DISTINCT ON (username)
           username,
           timestamp as last_message_at,
           message as last_message,
           is_from_user
         FROM pm_messages
         ORDER BY username, timestamp DESC
       ),
       counts AS (
         SELECT
           username,
           COUNT(*) as message_count
         FROM pm_messages
         GROUP BY username
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
      `SELECT COUNT(DISTINCT p.username) as count
       FROM interactions i
       JOIN persons p ON i.person_id = p.id
       WHERE i.type = 'PRIVATE_MESSAGE'`
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
 * Uses interactions table which has PMs from all sources
 */
router.get('/thread/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { limit = '100', offset = '0' } = req.query;
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    // Get messages from interactions table, deduplicated
    const result = await query<{
      id: string;
      timestamp: Date;
      from_user: string;
      to_user: string;
      message: string;
    }>(
      `SELECT * FROM (
         SELECT DISTINCT ON (i.content, DATE_TRUNC('second', i.timestamp))
           i.id,
           i.timestamp,
           i.metadata->>'fromUser' as from_user,
           i.metadata->>'toUser' as to_user,
           i.content as message
         FROM interactions i
         JOIN persons p ON i.person_id = p.id
         WHERE i.type = 'PRIVATE_MESSAGE'
           AND LOWER(p.username) = LOWER($1)
         ORDER BY i.content, DATE_TRUNC('second', i.timestamp), i.id
       ) deduped
       ORDER BY timestamp ASC
       LIMIT $2 OFFSET $3`,
      [username, limitNum, offsetNum]
    );

    // Get total count for this thread (deduplicated)
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM (
         SELECT DISTINCT ON (i.content, DATE_TRUNC('second', i.timestamp))
           i.id
         FROM interactions i
         JOIN persons p ON i.person_id = p.id
         WHERE i.type = 'PRIVATE_MESSAGE'
           AND LOWER(p.username) = LOWER($1)
         ORDER BY i.content, DATE_TRUNC('second', i.timestamp), i.id
       ) deduped`,
      [username]
    );

    // Get broadcaster username from env - this is who "you" are in the chat
    const broadcasterUsername = env.CHATURBATE_USERNAME.toLowerCase();

    const messages: PMMessage[] = result.rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      from_user: row.from_user,
      to_user: row.to_user,
      message: row.message,
      // Message is from broadcaster if from_user matches the broadcaster's username
      is_from_broadcaster: row.from_user?.toLowerCase() === broadcasterUsername,
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
 * Uses interactions table which has PMs from all sources
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
         COUNT(DISTINCT p.username) as unique_users,
         COUNT(*) FILTER (
           WHERE LOWER(i.metadata->>'fromUser') = LOWER(p.username)
         ) as messages_received,
         COUNT(*) FILTER (
           WHERE LOWER(i.metadata->>'fromUser') != LOWER(p.username)
         ) as messages_sent
       FROM interactions i
       JOIN persons p ON i.person_id = p.id
       WHERE i.type = 'PRIVATE_MESSAGE'
         AND i.timestamp >= $1`,
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
 * Uses interactions table which has PMs from all sources
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
      username: string;
      from_user: string;
      to_user: string;
      message: string;
    }>(
      `SELECT
         i.id,
         i.timestamp,
         p.username,
         i.metadata->>'fromUser' as from_user,
         i.metadata->>'toUser' as to_user,
         i.content as message
       FROM interactions i
       JOIN persons p ON i.person_id = p.id
       WHERE i.type = 'PRIVATE_MESSAGE'
         AND (
           i.content ILIKE $1
           OR p.username ILIKE $1
           OR i.metadata->>'fromUser' ILIKE $1
           OR i.metadata->>'toUser' ILIKE $1
         )
       ORDER BY i.timestamp DESC
       LIMIT $2`,
      [searchTerm, limitNum]
    );

    // Get broadcaster username from env
    const broadcasterUsername = env.CHATURBATE_USERNAME.toLowerCase();

    res.json({
      query: q,
      results: result.rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        from_user: row.from_user,
        to_user: row.to_user,
        message: row.message,
        // Message is from broadcaster if from_user matches the broadcaster's username
        is_from_broadcaster: row.from_user?.toLowerCase() === broadcasterUsername,
      })),
    });
  } catch (error) {
    logger.error('Error searching PMs', { error });
    res.status(500).json({ error: 'Failed to search PMs' });
  }
});

export default router;

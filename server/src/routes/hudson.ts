import { Router, Request, Response } from 'express';
import { PersonService } from '../services/person.service.js';
import { SnapshotService } from '../services/snapshot.service.js';
import { InteractionService } from '../services/interaction.service.js';
import { SessionService } from '../services/session.service.js';
import { chaturbateStatsClient, normalizeChaturbateStats } from '../api/chaturbate/stats-client.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { query } from '../db/client.js';
import type { Interaction } from '../types/models.js';

const router = Router();

/**
 * GET /api/hudson
 * Get Hudson Cage's stats and details
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const username = env.CHATURBATE_USERNAME;

    // Get or create person record
    const person = await PersonService.findOrCreate({
      username,
      role: 'MODEL',
    });

    // Fetch Chaturbate Stats API data
    let cbStats = null;
    let cbSnapshot = null;
    try {
      const stats = await chaturbateStatsClient.getHudsonStats();
      if (stats) {
        const normalized = normalizeChaturbateStats(stats);
        cbSnapshot = await SnapshotService.create({
          personId: person.id,
          source: 'cb_stats',
          rawPayload: stats as unknown as Record<string, unknown>,
          normalizedMetrics: normalized,
        });
        cbStats = stats;
      }
    } catch (error) {
      logger.error('Error fetching Chaturbate stats', { error });
    }

    // Get delta for CB stats
    const cbDelta = await SnapshotService.getDelta(person.id, 'cb_stats');

    // Get current session
    const currentSession = await SessionService.getCurrentSession(username);
    let currentSessionStats = null;
    if (currentSession) {
      currentSessionStats = await SessionService.getSessionStats(currentSession.id);
    }

    // Get recent sessions
    const recentSessions = await SessionService.getByBroadcaster(username, { limit: 10 });

    // Get ALL recent interactions from all persons (we'll filter them below)
    // This includes interactions from viewers in Hudson's room
    const result = await query<Interaction>(
      `SELECT * FROM interactions
       WHERE source = 'cb_events'
       ORDER BY timestamp DESC
       LIMIT 100`
    );
    const allInteractions = result.rows;

    // Filter out Hudson's own USER_ENTER/USER_LEAVE/etc. interactions
    // (These are from when he's visiting other rooms, not his own broadcasting activity)
    const recentInteractions = allInteractions.filter((interaction) => {
      // Parse metadata if it's a string (shouldn't be, but just in case)
      const metadata = typeof interaction.metadata === 'string'
        ? JSON.parse(interaction.metadata)
        : interaction.metadata;

      const metaUsername = metadata?.username;

      // Keep all interactions where metadata.username is NOT hudson_cage
      // (i.e., interactions from viewers in his room)
      if (metaUsername && metaUsername !== username) {
        return true;
      }
      // Keep PRIVATE_MESSAGE and CHAT_MESSAGE interactions even if metadata.username is hudson_cage
      // (These are his outgoing PMs and chat messages which we want to see)
      if (interaction.type === 'PRIVATE_MESSAGE' || interaction.type === 'CHAT_MESSAGE') {
        return true;
      }
      // Filter out everything else where metadata.username === hudson_cage
      // (USER_ENTER/LEAVE when visiting other rooms, etc.)
      return false;
    });

    res.json({
      person,
      cbStats,
      cbSnapshot,
      cbDelta: cbDelta.delta,
      currentSession,
      currentSessionStats,
      recentSessions,
      recentInteractions,
    });
  } catch (error) {
    logger.error('Get Hudson details error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

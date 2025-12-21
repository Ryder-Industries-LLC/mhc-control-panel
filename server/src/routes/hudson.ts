import { Router, Request, Response } from 'express';
import { PersonService } from '../services/person.service.js';
import { SnapshotService } from '../services/snapshot.service.js';
import { InteractionService } from '../services/interaction.service.js';
import { SessionService } from '../services/session.service.js';
import { chaturbateStatsClient, normalizeChaturbateStats } from '../api/chaturbate/stats-client.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

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

    // Get recent interactions
    const recentInteractions = await InteractionService.getByPerson(person.id, { limit: 50 });

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

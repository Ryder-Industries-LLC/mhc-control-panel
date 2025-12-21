import { Router, Request, Response } from 'express';
import { SessionService } from '../services/session.service.js';
import { InteractionService } from '../services/interaction.service.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

const router = Router();

/**
 * POST /api/session/start
 * Manually start a stream session
 */
router.post('/start', async (_req: Request, res: Response) => {
  try {
    const session = await SessionService.start(env.CHATURBATE_USERNAME);
    res.json({ session });
  } catch (error) {
    logger.error('Start session error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/session/end
 * Manually end a stream session
 */
router.post('/end', async (_req: Request, res: Response) => {
  try {
    const currentSession = await SessionService.getCurrentSession(env.CHATURBATE_USERNAME);

    if (!currentSession) {
      return res.status(404).json({ error: 'No active session found' });
    }

    const session = await SessionService.end(currentSession.id);
    res.json({ session });
  } catch (error) {
    logger.error('End session error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/session/current
 * Get current active session
 */
router.get('/current', async (_req: Request, res: Response) => {
  try {
    const session = await SessionService.getCurrentSession(env.CHATURBATE_USERNAME);

    if (!session) {
      return res.status(404).json({ error: 'No active session' });
    }

    const stats = await SessionService.getSessionStats(session.id);

    res.json({ session, stats });
  } catch (error) {
    logger.error('Get current session error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/sessions
 * Get all sessions
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0' } = req.query;

    const sessions = await SessionService.getByBroadcaster(env.CHATURBATE_USERNAME, {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    // Get stats for each session
    const sessionsWithStats = await Promise.all(
      sessions.map(async (session) => {
        const stats = await SessionService.getSessionStats(session.id);
        return { ...session, stats };
      })
    );

    res.json({ sessions: sessionsWithStats });
  } catch (error) {
    logger.error('Get sessions error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/session/:id
 * Get session by ID with interactions
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await SessionService.getById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const stats = await SessionService.getSessionStats(id);
    const interactions = await InteractionService.getBySession(id);

    res.json({ session, stats, interactions });
  } catch (error) {
    logger.error('Get session error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { ProfileEnrichmentService } from '../services/profile-enrichment.service.js';
import { chaturbateAffiliateClient } from '../api/chaturbate/affiliate-client.js';
import { BroadcastSessionService } from '../services/broadcast-session.service.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/affiliate/enrich/:username
 * Fetch and enrich profile from Chaturbate Affiliate API
 */
router.get('/enrich/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const result = await ProfileEnrichmentService.enrichFromAffiliateAPI(username);

    if (!result) {
      return res.status(404).json({
        error: 'User not currently online or not found in Affiliate API',
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Error enriching profile', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/affiliate/profile/:username
 * Get comprehensive enriched profile (all data sources combined)
 */
router.get('/profile/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const profile = await ProfileEnrichmentService.getEnrichedProfile(username);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(profile);
  } catch (error) {
    logger.error('Error getting enriched profile', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/affiliate/sessions/:username
 * Get broadcast sessions for a user
 */
router.get('/sessions/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { limit = 100 } = req.query;

    // Get person first
    const { PersonService } = await import('../services/person.service.js');
    const person = await PersonService.findByUsername(username);

    if (!person) {
      return res.status(404).json({ error: 'User not found' });
    }

    const sessions = await BroadcastSessionService.getSessionsByPerson(
      person.id,
      parseInt(limit as string, 10)
    );

    res.json({ sessions, count: sessions.length });
  } catch (error) {
    logger.error('Error getting sessions', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/affiliate/online
 * Get currently online rooms from Affiliate API
 */
router.get('/online', async (req: Request, res: Response) => {
  try {
    const {
      gender,
      limit = 100,
      offset = 0,
      hd,
      tag,
    } = req.query;

    const genders = gender ? (Array.isArray(gender) ? gender : [gender]) as any[] : undefined;
    const tags = tag ? (Array.isArray(tag) ? tag : [tag]) as string[] : undefined;

    const response = await chaturbateAffiliateClient.getOnlineRooms({
      gender: genders as any,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      hd: hd === 'true' ? true : undefined,
      tag: tags,
    });

    res.json(response);
  } catch (error) {
    logger.error('Error getting online rooms', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/affiliate/batch-enrich
 * Batch import currently online broadcasters
 */
router.post('/batch-enrich', async (req: Request, res: Response) => {
  try {
    const { gender, limit = 100 } = req.body;

    const result = await ProfileEnrichmentService.batchEnrichFromAffiliateAPI({
      gender,
      limit,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error in batch enrichment', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

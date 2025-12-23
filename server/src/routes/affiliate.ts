import { Router, Request, Response } from 'express';
import { ProfileEnrichmentService } from '../services/profile-enrichment.service.js';
import { chaturbateAffiliateClient } from '../api/chaturbate/affiliate-client.js';
import { BroadcastSessionService } from '../services/broadcast-session.service.js';
import { feedCacheService } from '../services/feed-cache.service.js';
import { PriorityLookupService } from '../services/priority-lookup.service.js';
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

// ===== On-Demand Lookup & Feed Cache Endpoints =====

/**
 * POST /api/affiliate/lookup/:username
 * On-demand lookup for a specific user
 * Checks cached feed first, then falls back to API if not found or cache is stale
 */
router.post('/lookup/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    logger.info('On-demand lookup requested', { username });

    // Check cached feed first
    const cachedRoom = feedCacheService.findRoom(username);

    if (cachedRoom) {
      logger.info('User found in cached feed', { username });

      // Enrich from cached data
      const result = await ProfileEnrichmentService.enrichFromAffiliateAPI(username);

      return res.json({
        source: 'cache',
        cacheAge: feedCacheService.getCacheAge(),
        result,
      });
    }

    // Not in cache or cache is stale - fetch from API
    logger.info('User not in cache, fetching from API', { username });

    const result = await ProfileEnrichmentService.enrichFromAffiliateAPI(username);

    if (!result) {
      return res.status(404).json({
        error: 'User not currently online or not found',
      });
    }

    res.json({
      source: 'api',
      result,
    });
  } catch (error) {
    logger.error('Error in on-demand lookup', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/affiliate/cache/status
 * Get feed cache status and metadata
 */
router.get('/cache/status', (_req: Request, res: Response) => {
  try {
    const metadata = feedCacheService.getCacheMetadata();
    res.json(metadata);
  } catch (error) {
    logger.error('Error getting cache status', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/affiliate/cache/clear
 * Clear the feed cache
 */
router.post('/cache/clear', (_req: Request, res: Response) => {
  try {
    feedCacheService.clear();
    res.json({ success: true, message: 'Cache cleared' });
  } catch (error) {
    logger.error('Error clearing cache', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== Priority Lookup Endpoints =====

/**
 * GET /api/affiliate/priority
 * List all priority lookups
 */
router.get('/priority', async (_req: Request, res: Response) => {
  try {
    const lookups = await PriorityLookupService.getAll();
    res.json({ lookups, count: lookups.length });
  } catch (error) {
    logger.error('Error listing priority lookups', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/affiliate/priority/stats
 * Get priority lookup statistics
 */
router.get('/priority/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await PriorityLookupService.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error getting priority stats', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/affiliate/priority/:username
 * Get a specific priority lookup
 */
router.get('/priority/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const lookup = await PriorityLookupService.get(username);

    if (!lookup) {
      return res.status(404).json({ error: 'Priority lookup not found' });
    }

    res.json(lookup);
  } catch (error) {
    logger.error('Error getting priority lookup', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/affiliate/priority/add
 * Add a user to the priority lookup queue
 * Body: { username: string, priorityLevel: 1 | 2, notes?: string }
 */
router.post('/priority/add', async (req: Request, res: Response) => {
  try {
    const { username, priorityLevel, notes } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (![1, 2].includes(priorityLevel)) {
      return res.status(400).json({ error: 'Priority level must be 1 or 2' });
    }

    const lookup = await PriorityLookupService.add(username, priorityLevel, notes);

    res.json({
      success: true,
      lookup,
      message: `User added to priority ${priorityLevel} queue`,
    });
  } catch (error) {
    logger.error('Error adding priority lookup', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/affiliate/priority/:username
 * Remove a user from the priority lookup queue
 */
router.delete('/priority/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const deleted = await PriorityLookupService.remove(username);

    if (!deleted) {
      return res.status(404).json({ error: 'Priority lookup not found' });
    }

    res.json({
      success: true,
      message: 'User removed from priority queue',
    });
  } catch (error) {
    logger.error('Error removing priority lookup', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/affiliate/priority/level/:level
 * Get priority lookups by level (1 or 2)
 */
router.get('/priority/level/:level', async (req: Request, res: Response) => {
  try {
    const level = parseInt(req.params.level, 10) as 1 | 2;

    if (![1, 2].includes(level)) {
      return res.status(400).json({ error: 'Priority level must be 1 or 2' });
    }

    const lookups = await PriorityLookupService.getByLevel(level);
    res.json({ lookups, count: lookups.length });
  } catch (error) {
    logger.error('Error getting priority lookups by level', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/affiliate/priority/status/:status
 * Get priority lookups by status (pending, completed, active)
 */
router.get('/priority/status/:status', async (req: Request, res: Response) => {
  try {
    const { status } = req.params;

    if (!['pending', 'completed', 'active'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const lookups = await PriorityLookupService.getByStatus(status as any);
    res.json({ lookups, count: lookups.length });
  } catch (error) {
    logger.error('Error getting priority lookups by status', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

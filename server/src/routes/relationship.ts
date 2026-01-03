import { Router, Request, Response } from 'express';
import { RelationshipService } from '../services/relationship.service.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/relationship/seeds
 * Get seed lists for traits and address terms
 */
router.get('/seeds', async (_req: Request, res: Response) => {
  try {
    const [traits, addressTerms] = await Promise.all([
      RelationshipService.getTraitsSeed(),
      RelationshipService.getAddressTermsSeed(),
    ]);

    res.json({
      traits,
      addressTerms,
    });
  } catch (error) {
    logger.error('Error getting relationship seeds', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/relationship/counts
 * Get counts by role and status
 */
router.get('/counts', async (_req: Request, res: Response) => {
  try {
    const counts = await RelationshipService.getCounts();
    res.json(counts);
  } catch (error) {
    logger.error('Error getting relationship counts', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { PersonService } from '../services/person.service.js';
import { StatbatePollingService } from '../services/statbate-polling.service.js';
import { InteractionService } from '../services/interaction.service.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

const router = Router();

/**
 * GET /api/person/search
 * Search usernames for autocomplete
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }

    if (q.length < 1) {
      return res.json({ usernames: [] });
    }

    const usernames = await PersonService.searchUsernames(q);
    res.json({ usernames });
  } catch (error) {
    logger.error('Username search error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/person/all
 * Get all non-excluded persons with basic stats and source information
 * Own profile is deprioritized (pushed to bottom) unless explicitly searched
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const { limit = '500', offset = '0' } = req.query;

    // Get owner username from environment to deprioritize own profile
    const ownerUsername = env.CHATURBATE_USERNAME;

    const persons = await PersonService.findAllWithSource(
      parseInt(limit as string, 10),
      parseInt(offset as string, 10),
      ownerUsername
    );

    res.json({ persons, total: persons.length });
  } catch (error) {
    logger.error('Get all persons error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/person/:id
 * Get person details by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const person = await PersonService.findById(id);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    res.json({ person });
  } catch (error) {
    logger.error('Get person error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/person/:id/images
 * Get image history for a person (most recent first)
 */
router.get('/:id/images', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = '10' } = req.query;

    const images = await PersonService.getImageHistory(id, parseInt(limit as string, 10));
    res.json({ images });
  } catch (error) {
    logger.error('Get image history error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/person/:id/snapshots
 * Get snapshot timeline for a person
 */
router.get('/:id/snapshots', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { source, limit = '50', offset = '0' } = req.query;

    const snapshots = await StatbatePollingService.getByPerson(id, {
      source: source as any,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({ snapshots });
  } catch (error) {
    logger.error('Get snapshots error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/person/:id/interactions
 * Get interactions for a person
 */
router.get('/:id/interactions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type, source, limit = '50', offset = '0' } = req.query;

    const interactions = await InteractionService.getByPerson(id, {
      type: type as any,
      source: source as any,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({ interactions });
  } catch (error) {
    logger.error('Get interactions error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/person/:id/note
 * Add a manual note for a person
 */
router.post('/:id/note', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content required' });
    }

    const interaction = await InteractionService.create({
      personId: id,
      type: 'MANUAL_NOTE',
      content,
      source: 'manual',
    });

    res.json({ interaction });
  } catch (error) {
    logger.error('Add note error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/person/:id
 * Delete a person and all related data
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await PersonService.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Person not found' });
    }

    logger.info(`Deleted person: ${id}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete person error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

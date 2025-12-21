import { Router, Request, Response } from 'express';
import { PersonService } from '../services/person.service.js';
import { SnapshotService } from '../services/snapshot.service.js';
import { InteractionService } from '../services/interaction.service.js';
import { logger } from '../config/logger.js';

const router = Router();

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

    const aliases = await PersonService.getAliases(id);

    res.json({ person, aliases });
  } catch (error) {
    logger.error('Get person error', { error });
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

    const snapshots = await SnapshotService.getByPerson(id, {
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

export default router;

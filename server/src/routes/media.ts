import { Router, Request, Response } from 'express';
import { MediaService, MediaType } from '../services/media.service.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/media/favorites
 * Get all favorite media with pagination
 */
router.get('/favorites', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const mediaType = req.query.mediaType as MediaType | undefined;

    const offset = (page - 1) * pageSize;

    const result = await MediaService.getFavorites({
      limit: pageSize,
      offset,
      mediaType,
    });

    res.json({
      records: result.records,
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
    });
  } catch (error) {
    logger.error('Error getting favorites', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/media/favorites/stats
 * Get favorite media statistics
 */
router.get('/favorites/stats', async (req: Request, res: Response) => {
  try {
    const stats = await MediaService.getFavoriteStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error getting favorite stats', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/media/:mediaId/favorite
 * Toggle favorite status for a media item
 */
router.post('/:mediaId/favorite', async (req: Request, res: Response) => {
  try {
    const { mediaId } = req.params;

    if (!mediaId) {
      return res.status(400).json({ error: 'Media ID is required' });
    }

    const result = await MediaService.toggleFavorite(mediaId);

    if (!result) {
      return res.status(404).json({ error: 'Media not found' });
    }

    logger.info('Media favorite toggled', { mediaId, is_favorite: result.is_favorite });
    res.json(result);
  } catch (error) {
    logger.error('Error toggling favorite', { error, mediaId: req.params.mediaId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/media/:mediaId/favorite
 * Set favorite status explicitly (true/false in body)
 */
router.put('/:mediaId/favorite', async (req: Request, res: Response) => {
  try {
    const { mediaId } = req.params;
    const { is_favorite } = req.body;

    if (!mediaId) {
      return res.status(400).json({ error: 'Media ID is required' });
    }

    if (typeof is_favorite !== 'boolean') {
      return res.status(400).json({ error: 'is_favorite must be a boolean' });
    }

    const result = await MediaService.setFavorite(mediaId, is_favorite);

    if (!result) {
      return res.status(404).json({ error: 'Media not found' });
    }

    logger.info('Media favorite set', { mediaId, is_favorite });
    res.json(result);
  } catch (error) {
    logger.error('Error setting favorite', { error, mediaId: req.params.mediaId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

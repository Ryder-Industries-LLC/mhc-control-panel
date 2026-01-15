/**
 * Image Consolidation API Routes
 *
 * Endpoints for image deduplication, migration, and cleanup operations.
 */

import { Router, Request, Response } from 'express';
import { ImageConsolidationService } from '../services/image-consolidation.service.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/image-consolidation/stats
 * Get current image statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await ImageConsolidationService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('[ImageConsolidation] Error getting stats:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

/**
 * GET /api/image-consolidation/duplicates
 * Find duplicate images
 */
router.get('/duplicates', async (_req: Request, res: Response) => {
  try {
    const duplicates = await ImageConsolidationService.findDuplicates();
    res.json({
      success: true,
      data: {
        count: duplicates.length,
        totalToRemove: duplicates.reduce((sum, d) => sum + d.remove_ids.length, 0),
        duplicates: duplicates.slice(0, 50), // Return first 50
      },
    });
  } catch (error) {
    logger.error('[ImageConsolidation] Error finding duplicates:', error);
    res.status(500).json({ success: false, error: 'Failed to find duplicates' });
  }
});

/**
 * POST /api/image-consolidation/dedup
 * Remove duplicate images
 */
router.post('/dedup', async (req: Request, res: Response) => {
  try {
    const dryRun = req.body.dryRun !== false; // Default to dry run
    const result = await ImageConsolidationService.removeDuplicates(dryRun);
    res.json({ success: true, dryRun, data: result });
  } catch (error) {
    logger.error('[ImageConsolidation] Error removing duplicates:', error);
    res.status(500).json({ success: false, error: 'Failed to remove duplicates' });
  }
});

/**
 * GET /api/image-consolidation/ssd-images
 * Find images that need migration from SSD to S3
 */
router.get('/ssd-images', async (_req: Request, res: Response) => {
  try {
    const images = await ImageConsolidationService.findSSDImages();
    res.json({
      success: true,
      data: {
        count: images.length,
        images: images.slice(0, 50), // Return first 50
      },
    });
  } catch (error) {
    logger.error('[ImageConsolidation] Error finding SSD images:', error);
    res.status(500).json({ success: false, error: 'Failed to find SSD images' });
  }
});

/**
 * POST /api/image-consolidation/migrate
 * Migrate SSD images to S3
 */
router.post('/migrate', async (req: Request, res: Response) => {
  try {
    const dryRun = req.body.dryRun !== false; // Default to dry run
    const result = await ImageConsolidationService.migrateToS3(dryRun);
    res.json({ success: true, dryRun, data: result });
  } catch (error) {
    logger.error('[ImageConsolidation] Error migrating to S3:', error);
    res.status(500).json({ success: false, error: 'Failed to migrate to S3' });
  }
});

/**
 * GET /api/image-consolidation/broken
 * Find broken image records (file doesn't exist)
 */
router.get('/broken', async (_req: Request, res: Response) => {
  try {
    const broken = await ImageConsolidationService.findBrokenImages();
    res.json({
      success: true,
      data: {
        count: broken.length,
        images: broken.slice(0, 100), // Return first 100
      },
    });
  } catch (error) {
    logger.error('[ImageConsolidation] Error finding broken images:', error);
    res.status(500).json({ success: false, error: 'Failed to find broken images' });
  }
});

/**
 * POST /api/image-consolidation/cleanup-broken
 * Remove broken image records
 */
router.post('/cleanup-broken', async (req: Request, res: Response) => {
  try {
    const dryRun = req.body.dryRun !== false; // Default to dry run
    const result = await ImageConsolidationService.removeBrokenImages(dryRun);
    res.json({ success: true, dryRun, data: result });
  } catch (error) {
    logger.error('[ImageConsolidation] Error cleaning up broken images:', error);
    res.status(500).json({ success: false, error: 'Failed to cleanup broken images' });
  }
});

/**
 * POST /api/image-consolidation/run
 * Run full consolidation (dedup + migrate)
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const dryRun = req.body.dryRun !== false; // Default to dry run
    const report = await ImageConsolidationService.runFullConsolidation(dryRun);
    res.json({ success: true, dryRun, data: report });
  } catch (error) {
    logger.error('[ImageConsolidation] Error running consolidation:', error);
    res.status(500).json({ success: false, error: 'Failed to run consolidation' });
  }
});

export default router;

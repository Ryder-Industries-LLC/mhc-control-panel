/**
 * Storage API Routes
 *
 * Endpoints for storage management, configuration, and S3 redirects.
 */

import { Router, Request, Response } from 'express';
import { storageService, transferService, StorageConfig } from '../services/storage/index.js';
import { S3Provider } from '../services/storage/s3-provider.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/storage/status
 * Get storage system status and statistics
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    await storageService.init();
    const status = await storageService.getStatus();
    const config = storageService.getConfig();

    res.json({
      success: true,
      data: {
        config,
        status,
      },
    });
  } catch (error) {
    logger.error('Error getting storage status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get storage status',
    });
  }
});

/**
 * PUT /api/storage/config
 * Update storage configuration
 */
router.put('/config', async (req: Request, res: Response) => {
  try {
    const updates: Partial<StorageConfig> = req.body;

    await storageService.init();
    await storageService.updateConfig(updates);

    const config = storageService.getConfig();
    const status = await storageService.getStatus();

    res.json({
      success: true,
      data: {
        config,
        status,
      },
    });
  } catch (error) {
    logger.error('Error updating storage config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update storage configuration',
    });
  }
});

/**
 * GET /api/storage/s3/*
 * Redirect to S3 pre-signed URL for file access
 */
router.get('/s3/*', async (req: Request, res: Response) => {
  try {
    await storageService.init();
    const s3Provider = storageService.getS3Provider();

    if (!s3Provider) {
      res.status(503).json({
        success: false,
        error: 'S3 storage is not configured',
      });
      return;
    }

    // Get the relative path from the URL
    const relativePath = req.params[0];

    if (!relativePath) {
      res.status(400).json({
        success: false,
        error: 'File path is required',
      });
      return;
    }

    // Generate pre-signed URL
    const presignedUrl = await s3Provider.getPresignedUrl(relativePath);

    if (!presignedUrl) {
      res.status(404).json({
        success: false,
        error: 'File not found or S3 error',
      });
      return;
    }

    // Redirect to the pre-signed URL
    res.redirect(302, presignedUrl);
  } catch (error) {
    logger.error('Error generating S3 redirect:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate S3 URL',
    });
  }
});

/**
 * POST /api/storage/backfill-sha256
 * Backfill SHA256 hashes for existing images
 */
router.post('/backfill-sha256', async (req: Request, res: Response) => {
  try {
    const batchSize = parseInt(req.body.batchSize) || 100;

    await storageService.init();
    const result = await transferService.backfillSha256(batchSize);

    res.json({
      success: true,
      data: {
        updated: result.updated,
        failed: result.failed,
      },
    });
  } catch (error) {
    logger.error('Error backfilling SHA256:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to backfill SHA256 hashes',
    });
  }
});

/**
 * GET /api/storage/transfer-stats
 * Get transfer service statistics
 */
router.get('/transfer-stats', async (req: Request, res: Response) => {
  try {
    const stats = transferService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting transfer stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transfer statistics',
    });
  }
});

/**
 * POST /api/storage/transfer-stats/reset
 * Reset transfer statistics
 */
router.post('/transfer-stats/reset', async (req: Request, res: Response) => {
  try {
    transferService.resetStats();

    res.json({
      success: true,
      message: 'Transfer statistics reset',
    });
  } catch (error) {
    logger.error('Error resetting transfer stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset transfer statistics',
    });
  }
});

export default router;

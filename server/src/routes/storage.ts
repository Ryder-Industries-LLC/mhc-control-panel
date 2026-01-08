/**
 * Storage API Routes
 *
 * Endpoints for storage management, configuration, migration, and S3 redirects.
 */

import { Router, Request, Response } from 'express';
import { storageService, transferService, StorageConfig } from '../services/storage/index.js';
import { S3Provider } from '../services/storage/s3-provider.js';
import { storageMigrationJob } from '../jobs/storage-migration.job.js';
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

// ============================================================================
// Storage Migration Endpoints
// ============================================================================

/**
 * GET /api/storage/queue
 * Get operation queue status (for when SSD is unavailable)
 */
router.get('/queue', async (_req: Request, res: Response) => {
  try {
    await storageService.init();
    const queueStatus = storageService.getQueueStatus();
    res.json({ success: true, data: queueStatus });
  } catch (error) {
    logger.error('Error fetching queue status', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch queue status' });
  }
});

/**
 * POST /api/storage/queue/process
 * Manually trigger queue processing
 */
router.post('/queue/process', async (_req: Request, res: Response) => {
  try {
    await storageService.init();
    const result = await storageService.processQueue();
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error processing queue', { error });
    res.status(500).json({ success: false, error: 'Failed to process queue' });
  }
});

/**
 * GET /api/storage/migrate/status
 * Get migration job status
 */
router.get('/migrate/status', async (_req: Request, res: Response) => {
  try {
    const status = storageMigrationJob.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Error fetching migration status', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch migration status' });
  }
});

/**
 * POST /api/storage/migrate/start
 * Start the migration job (migrates existing files to username-based paths)
 */
router.post('/migrate/start', async (_req: Request, res: Response) => {
  try {
    // Start migration in background (don't await)
    storageMigrationJob.start().catch(error => {
      logger.error('Migration job error:', error);
    });

    res.json({
      success: true,
      message: 'Migration started',
      data: storageMigrationJob.getStatus(),
    });
  } catch (error) {
    logger.error('Error starting migration', { error });
    res.status(500).json({ success: false, error: 'Failed to start migration' });
  }
});

/**
 * POST /api/storage/migrate/pause
 * Pause the migration job
 */
router.post('/migrate/pause', async (_req: Request, res: Response) => {
  try {
    storageMigrationJob.pause();
    res.json({
      success: true,
      message: 'Migration paused',
      data: storageMigrationJob.getStatus(),
    });
  } catch (error) {
    logger.error('Error pausing migration', { error });
    res.status(500).json({ success: false, error: 'Failed to pause migration' });
  }
});

/**
 * POST /api/storage/migrate/resume
 * Resume the migration job
 */
router.post('/migrate/resume', async (_req: Request, res: Response) => {
  try {
    storageMigrationJob.resume();
    res.json({
      success: true,
      message: 'Migration resumed',
      data: storageMigrationJob.getStatus(),
    });
  } catch (error) {
    logger.error('Error resuming migration', { error });
    res.status(500).json({ success: false, error: 'Failed to resume migration' });
  }
});

/**
 * POST /api/storage/migrate/stop
 * Stop the migration job
 */
router.post('/migrate/stop', async (_req: Request, res: Response) => {
  try {
    storageMigrationJob.stop();
    res.json({
      success: true,
      message: 'Migration stopped',
      data: storageMigrationJob.getStatus(),
    });
  } catch (error) {
    logger.error('Error stopping migration', { error });
    res.status(500).json({ success: false, error: 'Failed to stop migration' });
  }
});

/**
 * POST /api/storage/migrate/cleanup
 * Cleanup legacy files after migration
 * WARNING: This deletes files! Only run after confirming migration success.
 */
router.post('/migrate/cleanup', async (_req: Request, res: Response) => {
  try {
    // Check if migration is complete
    const status = storageMigrationJob.getStatus();
    if (status.isRunning) {
      return res.status(400).json({
        success: false,
        error: 'Cannot cleanup while migration is running',
      });
    }

    const result = await storageMigrationJob.cleanupLegacyFiles();
    res.json({
      success: true,
      message: 'Cleanup complete',
      data: result,
    });
  } catch (error) {
    logger.error('Error during cleanup', { error });
    res.status(500).json({ success: false, error: 'Failed to cleanup legacy files' });
  }
});

export default router;

/**
 * Database Export API Routes
 *
 * Endpoints for managing database backup/export operations.
 */

import { Router, Request, Response } from 'express';
import { databaseBackupJob } from '../jobs/database-backup.job.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/db-export/status
 * Get backup job status
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = databaseBackupJob.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('[DbExport] Error getting status:', error);
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

/**
 * POST /api/db-export/start
 * Start the backup job
 */
router.post('/start', async (_req: Request, res: Response) => {
  try {
    await databaseBackupJob.start();
    res.json({ success: true, message: 'Backup job started' });
  } catch (error) {
    logger.error('[DbExport] Error starting job:', error);
    res.status(500).json({ success: false, error: 'Failed to start backup job' });
  }
});

/**
 * POST /api/db-export/stop
 * Stop the backup job
 */
router.post('/stop', (_req: Request, res: Response) => {
  try {
    databaseBackupJob.stop();
    res.json({ success: true, message: 'Backup job stopped' });
  } catch (error) {
    logger.error('[DbExport] Error stopping job:', error);
    res.status(500).json({ success: false, error: 'Failed to stop backup job' });
  }
});

/**
 * POST /api/db-export/run
 * Run a backup now
 */
router.post('/run', async (_req: Request, res: Response) => {
  try {
    const result = await databaseBackupJob.runBackup();
    res.json({ success: result.success, data: result });
  } catch (error) {
    logger.error('[DbExport] Error running backup:', error);
    res.status(500).json({ success: false, error: 'Failed to run backup' });
  }
});

export default router;

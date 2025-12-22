import { Router, Request, Response } from 'express';
import { statbateRefreshJob } from '../jobs/statbate-refresh.job.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/job/status
 * Get background job status
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = statbateRefreshJob.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Get job status error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/pause
 * Pause the background refresh job
 */
router.post('/pause', (_req: Request, res: Response) => {
  try {
    statbateRefreshJob.pause();
    res.json({ success: true, status: statbateRefreshJob.getStatus() });
  } catch (error) {
    logger.error('Pause job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/resume
 * Resume the background refresh job
 */
router.post('/resume', (_req: Request, res: Response) => {
  try {
    statbateRefreshJob.resume();
    res.json({ success: true, status: statbateRefreshJob.getStatus() });
  } catch (error) {
    logger.error('Resume job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/start
 * Start the background refresh job
 */
router.post('/start', (req: Request, res: Response) => {
  try {
    const { intervalMinutes = 360 } = req.body;
    statbateRefreshJob.start(intervalMinutes);
    res.json({ success: true, status: statbateRefreshJob.getStatus() });
  } catch (error) {
    logger.error('Start job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/stop
 * Stop the background refresh job
 */
router.post('/stop', (_req: Request, res: Response) => {
  try {
    statbateRefreshJob.stop();
    res.json({ success: true, status: statbateRefreshJob.getStatus() });
  } catch (error) {
    logger.error('Stop job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

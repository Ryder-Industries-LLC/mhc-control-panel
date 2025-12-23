import { Router, Request, Response } from 'express';
import { statbateRefreshJob } from '../jobs/statbate-refresh.job.js';
import { affiliatePollingJob } from '../jobs/affiliate-polling.job.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/job/status
 * Get all background job statuses
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = {
      statbateRefresh: statbateRefreshJob.getStatus(),
      affiliatePolling: affiliatePollingJob.getStatus(),
    };
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

// ===== Affiliate Polling Job Endpoints =====

/**
 * GET /api/job/affiliate/status
 * Get affiliate polling job status
 */
router.get('/affiliate/status', (_req: Request, res: Response) => {
  try {
    const status = affiliatePollingJob.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Get affiliate job status error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/affiliate/config
 * Update affiliate polling job configuration
 */
router.post('/affiliate/config', (req: Request, res: Response) => {
  try {
    const { intervalMinutes, gender, limit, enabled } = req.body;

    affiliatePollingJob.updateConfig({
      ...(intervalMinutes !== undefined && { intervalMinutes }),
      ...(gender !== undefined && { gender }),
      ...(limit !== undefined && { limit }),
      ...(enabled !== undefined && { enabled }),
    });

    res.json({ success: true, status: affiliatePollingJob.getStatus() });
  } catch (error) {
    logger.error('Update affiliate job config error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/affiliate/start
 * Start the affiliate polling job
 */
router.post('/affiliate/start', (_req: Request, res: Response) => {
  try {
    affiliatePollingJob.start();
    res.json({ success: true, status: affiliatePollingJob.getStatus() });
  } catch (error) {
    logger.error('Start affiliate job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/affiliate/pause
 * Pause the affiliate polling job
 */
router.post('/affiliate/pause', (_req: Request, res: Response) => {
  try {
    affiliatePollingJob.pause();
    res.json({ success: true, status: affiliatePollingJob.getStatus() });
  } catch (error) {
    logger.error('Pause affiliate job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/affiliate/resume
 * Resume the affiliate polling job
 */
router.post('/affiliate/resume', (_req: Request, res: Response) => {
  try {
    affiliatePollingJob.resume();
    res.json({ success: true, status: affiliatePollingJob.getStatus() });
  } catch (error) {
    logger.error('Resume affiliate job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/affiliate/stop
 * Stop the affiliate polling job
 */
router.post('/affiliate/stop', (_req: Request, res: Response) => {
  try {
    affiliatePollingJob.stop();
    res.json({ success: true, status: affiliatePollingJob.getStatus() });
  } catch (error) {
    logger.error('Stop affiliate job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/affiliate/reset-stats
 * Reset affiliate polling job statistics
 */
router.post('/affiliate/reset-stats', (_req: Request, res: Response) => {
  try {
    affiliatePollingJob.resetStats();
    res.json({ success: true, status: affiliatePollingJob.getStatus() });
  } catch (error) {
    logger.error('Reset affiliate job stats error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

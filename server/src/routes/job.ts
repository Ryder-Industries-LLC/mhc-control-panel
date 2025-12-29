import { Router, Request, Response } from 'express';
import { statbateRefreshJob } from '../jobs/statbate-refresh.job.js';
import { affiliatePollingJob } from '../jobs/affiliate-polling.job.js';
import { profileScrapeJob } from '../jobs/profile-scrape.job.js';
import { cbhoursPollingJob } from '../jobs/cbhours-polling.job.js';
import { ImageStorageService } from '../services/image-storage.service.js';
import { pool } from '../db/client.js';
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
      profileScrape: profileScrapeJob.getStatus(),
      cbhoursPolling: cbhoursPollingJob.getStatus(),
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
router.post('/pause', async (_req: Request, res: Response) => {
  try {
    await statbateRefreshJob.pause();
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
router.post('/resume', async (_req: Request, res: Response) => {
  try {
    await statbateRefreshJob.resume();
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
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { intervalMinutes = 360 } = req.body;
    await statbateRefreshJob.start(intervalMinutes);
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
router.post('/stop', async (_req: Request, res: Response) => {
  try {
    await statbateRefreshJob.stop();
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
router.post('/affiliate/start', async (_req: Request, res: Response) => {
  try {
    await affiliatePollingJob.start();
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
router.post('/affiliate/pause', async (_req: Request, res: Response) => {
  try {
    await affiliatePollingJob.pause();
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
router.post('/affiliate/resume', async (_req: Request, res: Response) => {
  try {
    await affiliatePollingJob.resume();
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
router.post('/affiliate/stop', async (_req: Request, res: Response) => {
  try {
    await affiliatePollingJob.stop();
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

// ===== Profile Scrape Job Endpoints =====

/**
 * GET /api/job/profile-scrape/status
 * Get profile scrape job status
 */
router.get('/profile-scrape/status', (_req: Request, res: Response) => {
  try {
    const status = profileScrapeJob.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Get profile scrape job status error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/profile-scrape/config
 * Update profile scrape job configuration
 */
router.post('/profile-scrape/config', (req: Request, res: Response) => {
  try {
    const { intervalMinutes, maxProfilesPerRun, delayBetweenProfiles, refreshDays, enabled, prioritizeFollowing } = req.body;

    profileScrapeJob.updateConfig({
      ...(intervalMinutes !== undefined && { intervalMinutes }),
      ...(maxProfilesPerRun !== undefined && { maxProfilesPerRun }),
      ...(delayBetweenProfiles !== undefined && { delayBetweenProfiles }),
      ...(refreshDays !== undefined && { refreshDays }),
      ...(enabled !== undefined && { enabled }),
      ...(prioritizeFollowing !== undefined && { prioritizeFollowing }),
    });

    res.json({ success: true, status: profileScrapeJob.getStatus() });
  } catch (error) {
    logger.error('Update profile scrape job config error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/profile-scrape/start
 * Start the profile scrape job
 */
router.post('/profile-scrape/start', async (_req: Request, res: Response) => {
  try {
    await profileScrapeJob.start();
    res.json({ success: true, status: profileScrapeJob.getStatus() });
  } catch (error) {
    logger.error('Start profile scrape job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/profile-scrape/pause
 * Pause the profile scrape job
 */
router.post('/profile-scrape/pause', async (_req: Request, res: Response) => {
  try {
    await profileScrapeJob.pause();
    res.json({ success: true, status: profileScrapeJob.getStatus() });
  } catch (error) {
    logger.error('Pause profile scrape job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/profile-scrape/resume
 * Resume the profile scrape job
 */
router.post('/profile-scrape/resume', async (_req: Request, res: Response) => {
  try {
    await profileScrapeJob.resume();
    res.json({ success: true, status: profileScrapeJob.getStatus() });
  } catch (error) {
    logger.error('Resume profile scrape job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/profile-scrape/stop
 * Stop the profile scrape job
 */
router.post('/profile-scrape/stop', async (_req: Request, res: Response) => {
  try {
    await profileScrapeJob.stop();
    res.json({ success: true, status: profileScrapeJob.getStatus() });
  } catch (error) {
    logger.error('Stop profile scrape job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/profile-scrape/reset-stats
 * Reset profile scrape job statistics
 */
router.post('/profile-scrape/reset-stats', (_req: Request, res: Response) => {
  try {
    profileScrapeJob.resetStats();
    res.json({ success: true, status: profileScrapeJob.getStatus() });
  } catch (error) {
    logger.error('Reset profile scrape job stats error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/profile-scrape/one/:username
 * Manually trigger a scrape for a single username
 */
router.post('/profile-scrape/one/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    logger.info(`Manual profile scrape triggered for ${username}`);
    const success = await profileScrapeJob.scrapeOne(username);

    res.json({
      success,
      username,
      message: success ? 'Profile scraped successfully' : 'Failed to scrape profile',
    });
  } catch (error) {
    logger.error('Manual profile scrape error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== CBHours Polling Job Endpoints =====

/**
 * GET /api/job/cbhours/status
 * Get CBHours polling job status
 */
router.get('/cbhours/status', (_req: Request, res: Response) => {
  try {
    const status = cbhoursPollingJob.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Get CBHours job status error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/cbhours/config
 * Update CBHours polling job configuration
 */
router.post('/cbhours/config', (req: Request, res: Response) => {
  try {
    const { intervalMinutes, batchSize, enabled, targetFollowing } = req.body;

    cbhoursPollingJob.updateConfig({
      ...(intervalMinutes !== undefined && { intervalMinutes }),
      ...(batchSize !== undefined && { batchSize }),
      ...(enabled !== undefined && { enabled }),
      ...(targetFollowing !== undefined && { targetFollowing }),
    });

    res.json({ success: true, status: cbhoursPollingJob.getStatus() });
  } catch (error) {
    logger.error('Update CBHours job config error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/cbhours/start
 * Start the CBHours polling job
 */
router.post('/cbhours/start', async (_req: Request, res: Response) => {
  try {
    await cbhoursPollingJob.start();
    res.json({ success: true, status: cbhoursPollingJob.getStatus() });
  } catch (error) {
    logger.error('Start CBHours job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/cbhours/pause
 * Pause the CBHours polling job
 */
router.post('/cbhours/pause', async (_req: Request, res: Response) => {
  try {
    await cbhoursPollingJob.pause();
    res.json({ success: true, status: cbhoursPollingJob.getStatus() });
  } catch (error) {
    logger.error('Pause CBHours job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/cbhours/resume
 * Resume the CBHours polling job
 */
router.post('/cbhours/resume', async (_req: Request, res: Response) => {
  try {
    await cbhoursPollingJob.resume();
    res.json({ success: true, status: cbhoursPollingJob.getStatus() });
  } catch (error) {
    logger.error('Resume CBHours job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/cbhours/stop
 * Stop the CBHours polling job
 */
router.post('/cbhours/stop', async (_req: Request, res: Response) => {
  try {
    await cbhoursPollingJob.stop();
    res.json({ success: true, status: cbhoursPollingJob.getStatus() });
  } catch (error) {
    logger.error('Stop CBHours job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/cbhours/reset-stats
 * Reset CBHours polling job statistics
 */
router.post('/cbhours/reset-stats', (_req: Request, res: Response) => {
  try {
    cbhoursPollingJob.resetStats();
    res.json({ success: true, status: cbhoursPollingJob.getStatus() });
  } catch (error) {
    logger.error('Reset CBHours job stats error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/cbhours/poll
 * Manually trigger a poll for specific usernames
 */
router.post('/cbhours/poll', async (req: Request, res: Response) => {
  try {
    const { usernames } = req.body;
    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'Usernames array required' });
    }

    logger.info(`Manual CBHours poll triggered for ${usernames.length} usernames`);
    const result = await cbhoursPollingJob.pollUsernames(usernames);

    res.json({
      requestSuccess: true,
      recorded: result.success,
      failed: result.failed,
      online: result.online,
    });
  } catch (error) {
    logger.error('Manual CBHours poll error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== Image Cleanup Endpoints =====

/**
 * POST /api/job/cleanup-placeholder-images
 * Remove placeholder images from storage and clear DB references
 */
router.post('/cleanup-placeholder-images', async (_req: Request, res: Response) => {
  try {
    // Delete placeholder image files
    const deletedFiles = await ImageStorageService.cleanupPlaceholderImages();

    // Clear database references to deleted files
    if (deletedFiles.length > 0) {
      const placeholders = deletedFiles.map((_, i) => `$${i + 1}`).join(', ');
      await pool.query(
        `UPDATE affiliate_api_snapshots SET image_path_360x270 = NULL WHERE image_path_360x270 IN (${placeholders})`,
        deletedFiles
      );
    }

    res.json({
      success: true,
      deletedCount: deletedFiles.length,
      deletedFiles
    });
  } catch (error) {
    logger.error('Cleanup placeholder images error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

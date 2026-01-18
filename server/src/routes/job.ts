import { Router, Request, Response } from 'express';
import { statbateRefreshJob } from '../jobs/statbate-refresh.job.js';
import { affiliatePollingJob } from '../jobs/affiliate-polling.job.js';
import { profileScrapeJob } from '../jobs/profile-scrape.job.js';
import { cbhoursPollingJob } from '../jobs/cbhours-polling.job.js';
import { liveScreenshotJob } from '../jobs/live-screenshot.job.js';
import { mediaTransferJob } from '../jobs/media-transfer.job.js';
import { statsCollectionJob } from '../jobs/stats-collection.job.js';
import { dmImportJob } from '../jobs/dm-import.job.js';
import { DMScraperService } from '../services/dm-scraper.service.js';
import { ImageStorageService } from '../services/image-storage.service.js';
import { pool } from '../db/client.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/job/status
 * Get all background job statuses
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    // Sync all job states from database
    await Promise.all([
      statbateRefreshJob.syncStateFromDB(),
      affiliatePollingJob.syncStateFromDB(),
      profileScrapeJob.syncStateFromDB(),
      liveScreenshotJob.syncStateFromDB(),
      mediaTransferJob.syncStateFromDB(),
      dmImportJob.syncStateFromDB(),
    ]);

    const status = {
      statbateRefresh: statbateRefreshJob.getStatus(),
      affiliatePolling: affiliatePollingJob.getStatus(),
      profileScrape: profileScrapeJob.getStatus(),
      cbhoursPolling: cbhoursPollingJob.getStatus(),
      liveScreenshot: liveScreenshotJob.getStatus(),
      mediaTransfer: mediaTransferJob.getStatus(),
      dmImport: dmImportJob.getStatus(),
    };
    res.json(status);
  } catch (error) {
    logger.error('Get job status error', { error });
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

/**
 * GET /api/job/statbate/status
 * Get Statbate refresh job status
 */
router.get('/statbate/status', async (_req: Request, res: Response) => {
  try {
    // Sync state from database to get accurate status from worker
    await statbateRefreshJob.syncStateFromDB();
    const status = statbateRefreshJob.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Get statbate job status error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/statbate/config
 * Update Statbate refresh job configuration
 */
router.post('/statbate/config', async (req: Request, res: Response) => {
  try {
    const {
      intervalMinutes,
      batchSize,
      delayBetweenBatches,
      delayBetweenRequests,
      maxPersonsPerRun,
      enabled,
      prioritizeFollowing,
      prioritizeFollowers,
      prioritizeBanned,
      prioritizeWatchlist,
      prioritizeLive,
      prioritizeDoms,
      prioritizeFriends,
      prioritizeSubs,
      prioritizeTippedMe,
      prioritizeTippedByMe,
    } = req.body;

    await statbateRefreshJob.updateConfig({
      ...(intervalMinutes !== undefined && { intervalMinutes }),
      ...(batchSize !== undefined && { batchSize }),
      ...(delayBetweenBatches !== undefined && { delayBetweenBatches }),
      ...(delayBetweenRequests !== undefined && { delayBetweenRequests }),
      ...(maxPersonsPerRun !== undefined && { maxPersonsPerRun }),
      ...(enabled !== undefined && { enabled }),
      ...(prioritizeFollowing !== undefined && { prioritizeFollowing }),
      ...(prioritizeFollowers !== undefined && { prioritizeFollowers }),
      ...(prioritizeBanned !== undefined && { prioritizeBanned }),
      ...(prioritizeWatchlist !== undefined && { prioritizeWatchlist }),
      ...(prioritizeLive !== undefined && { prioritizeLive }),
      ...(prioritizeDoms !== undefined && { prioritizeDoms }),
      ...(prioritizeFriends !== undefined && { prioritizeFriends }),
      ...(prioritizeSubs !== undefined && { prioritizeSubs }),
      ...(prioritizeTippedMe !== undefined && { prioritizeTippedMe }),
      ...(prioritizeTippedByMe !== undefined && { prioritizeTippedByMe }),
    });

    res.json({ success: true, status: statbateRefreshJob.getStatus() });
  } catch (error) {
    logger.error('Update statbate job config error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/statbate/start
 * Start the Statbate refresh job
 */
router.post('/statbate/start', async (_req: Request, res: Response) => {
  try {
    await statbateRefreshJob.start();
    res.json({ success: true, status: statbateRefreshJob.getStatus() });
  } catch (error) {
    logger.error('Start statbate job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/statbate/stop
 * Stop the Statbate refresh job
 */
router.post('/statbate/stop', async (_req: Request, res: Response) => {
  try {
    await statbateRefreshJob.stop();
    res.json({ success: true, status: statbateRefreshJob.getStatus() });
  } catch (error) {
    logger.error('Stop statbate job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/statbate/reset-stats
 * Reset Statbate refresh job statistics
 */
router.post('/statbate/reset-stats', (_req: Request, res: Response) => {
  try {
    statbateRefreshJob.resetStats();
    res.json({ success: true, status: statbateRefreshJob.getStatus() });
  } catch (error) {
    logger.error('Reset statbate job stats error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== Affiliate Polling Job Endpoints =====

/**
 * GET /api/job/affiliate/status
 * Get affiliate polling job status
 */
router.get('/affiliate/status', async (_req: Request, res: Response) => {
  try {
    // Sync state from database to get accurate status from worker
    await affiliatePollingJob.syncStateFromDB();
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
router.get('/profile-scrape/status', async (_req: Request, res: Response) => {
  try {
    // Sync state from database to get accurate status from worker
    await profileScrapeJob.syncStateFromDB();
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
      // Delete from media_locator (the single source of truth)
      // This will set media_locator_id to NULL in affiliate_api_snapshots via ON DELETE SET NULL
      await pool.query(
        `DELETE FROM media_locator WHERE file_path IN (${placeholders})`,
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

// ===== Live Screenshot Job Endpoints =====

/**
 * GET /api/job/live-screenshot/status
 * Get live screenshot job status
 */
router.get('/live-screenshot/status', async (_req: Request, res: Response) => {
  try {
    await liveScreenshotJob.syncStateFromDB();
    const status = liveScreenshotJob.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Get live-screenshot job status error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/live-screenshot/config
 * Update live screenshot job configuration
 */
router.post('/live-screenshot/config', async (req: Request, res: Response) => {
  try {
    const { intervalMinutes, enabled } = req.body;

    await liveScreenshotJob.updateConfig({
      ...(intervalMinutes !== undefined && { intervalMinutes }),
      ...(enabled !== undefined && { enabled }),
    });

    res.json({ success: true, status: liveScreenshotJob.getStatus() });
  } catch (error) {
    logger.error('Update live-screenshot job config error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/live-screenshot/start
 * Start the live screenshot job
 */
router.post('/live-screenshot/start', async (_req: Request, res: Response) => {
  try {
    await liveScreenshotJob.start();
    res.json({ success: true, status: liveScreenshotJob.getStatus() });
  } catch (error) {
    logger.error('Start live-screenshot job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/live-screenshot/stop
 * Stop the live screenshot job
 */
router.post('/live-screenshot/stop', async (_req: Request, res: Response) => {
  try {
    await liveScreenshotJob.stop();
    res.json({ success: true, status: liveScreenshotJob.getStatus() });
  } catch (error) {
    logger.error('Stop live-screenshot job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/live-screenshot/reset-stats
 * Reset live screenshot job statistics
 */
router.post('/live-screenshot/reset-stats', (_req: Request, res: Response) => {
  try {
    liveScreenshotJob.resetStats();
    res.json({ success: true, status: liveScreenshotJob.getStatus() });
  } catch (error) {
    logger.error('Reset live-screenshot job stats error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/live-screenshot/run-now
 * Manually trigger a live screenshot capture cycle
 */
router.post('/live-screenshot/run-now', async (_req: Request, res: Response) => {
  try {
    await liveScreenshotJob.runOnce();
    res.json({ success: true, status: liveScreenshotJob.getStatus() });
  } catch (error) {
    logger.error('Run live-screenshot job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== Media Transfer Job Endpoints =====

/**
 * GET /api/job/media-transfer/status
 * Get media transfer job status
 */
router.get('/media-transfer/status', async (_req: Request, res: Response) => {
  try {
    await mediaTransferJob.syncStateFromDB();
    const status = mediaTransferJob.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Get media-transfer job status error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/media-transfer/config
 * Update media transfer job configuration
 */
router.post('/media-transfer/config', async (req: Request, res: Response) => {
  try {
    const { intervalMinutes, destination, batchSize, enabled } = req.body;

    await mediaTransferJob.updateConfig({
      ...(intervalMinutes !== undefined && { intervalMinutes }),
      ...(destination !== undefined && { destination }),
      ...(batchSize !== undefined && { batchSize }),
      ...(enabled !== undefined && { enabled }),
    });

    res.json({ success: true, status: mediaTransferJob.getStatus() });
  } catch (error) {
    logger.error('Update media-transfer job config error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/media-transfer/start
 * Start the media transfer job
 */
router.post('/media-transfer/start', async (_req: Request, res: Response) => {
  try {
    await mediaTransferJob.start();
    res.json({ success: true, status: mediaTransferJob.getStatus() });
  } catch (error) {
    logger.error('Start media-transfer job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/media-transfer/stop
 * Stop the media transfer job
 */
router.post('/media-transfer/stop', async (_req: Request, res: Response) => {
  try {
    await mediaTransferJob.stop();
    res.json({ success: true, status: mediaTransferJob.getStatus() });
  } catch (error) {
    logger.error('Stop media-transfer job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/media-transfer/reset-stats
 * Reset media transfer job statistics
 */
router.post('/media-transfer/reset-stats', (_req: Request, res: Response) => {
  try {
    mediaTransferJob.resetStats();
    res.json({ success: true, status: mediaTransferJob.getStatus() });
  } catch (error) {
    logger.error('Reset media-transfer job stats error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/media-transfer/run-now
 * Manually trigger a media transfer cycle
 */
router.post('/media-transfer/run-now', async (_req: Request, res: Response) => {
  try {
    const result = await mediaTransferJob.runNow();
    res.json({
      success: result.success,
      message: result.message,
      status: mediaTransferJob.getStatus(),
    });
  } catch (error) {
    logger.error('Run media-transfer job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Stats Collection Job Routes
// ============================================================================

/**
 * GET /api/job/stats-collection/status
 * Get stats collection job status
 */
router.get('/stats-collection/status', async (_req: Request, res: Response) => {
  try {
    await statsCollectionJob.syncStateFromDB();
    const status = statsCollectionJob.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Get stats-collection job status error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/stats-collection/config
 * Update stats collection job configuration
 */
router.post('/stats-collection/config', async (req: Request, res: Response) => {
  try {
    const { intervalMinutes, enabled } = req.body;
    await statsCollectionJob.updateConfig({
      ...(intervalMinutes !== undefined && { intervalMinutes }),
      ...(enabled !== undefined && { enabled }),
    });
    res.json({ success: true, status: statsCollectionJob.getStatus() });
  } catch (error) {
    logger.error('Update stats-collection job config error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/stats-collection/start
 * Start the stats collection job
 */
router.post('/stats-collection/start', async (_req: Request, res: Response) => {
  try {
    await statsCollectionJob.start();
    res.json({ success: true, status: statsCollectionJob.getStatus() });
  } catch (error) {
    logger.error('Start stats-collection job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/stats-collection/stop
 * Stop the stats collection job
 */
router.post('/stats-collection/stop', async (_req: Request, res: Response) => {
  try {
    await statsCollectionJob.stop();
    res.json({ success: true, status: statsCollectionJob.getStatus() });
  } catch (error) {
    logger.error('Stop stats-collection job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/stats-collection/run-now
 * Manually trigger a stats collection
 */
router.post('/stats-collection/run-now', async (_req: Request, res: Response) => {
  try {
    const result = await statsCollectionJob.runNow();
    res.json({
      success: result.success,
      message: result.message,
      durationMs: result.durationMs,
      status: statsCollectionJob.getStatus(),
    });
  } catch (error) {
    logger.error('Run stats-collection job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/stats-collection/reset-stats
 * Reset stats collection job statistics
 */
router.post('/stats-collection/reset-stats', async (_req: Request, res: Response) => {
  try {
    await statsCollectionJob.resetStats();
    res.json({ success: true, status: statsCollectionJob.getStatus() });
  } catch (error) {
    logger.error('Reset stats-collection job stats error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// DM Import Job Routes
// ============================================================================

/**
 * GET /api/job/dm-import/status
 * Get DM import job status
 */
router.get('/dm-import/status', async (_req: Request, res: Response) => {
  try {
    await dmImportJob.syncStateFromDB();
    const status = dmImportJob.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Get dm-import job status error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/dm-import/config
 * Update DM import job configuration
 */
router.post('/dm-import/config', async (req: Request, res: Response) => {
  try {
    const { maxThreadsPerRun, delayBetweenThreads, autoImport, enabled } = req.body;
    await dmImportJob.updateConfig({
      ...(maxThreadsPerRun !== undefined && { maxThreadsPerRun }),
      ...(delayBetweenThreads !== undefined && { delayBetweenThreads }),
      ...(autoImport !== undefined && { autoImport }),
      ...(enabled !== undefined && { enabled }),
    });
    res.json({ success: true, status: dmImportJob.getStatus() });
  } catch (error) {
    logger.error('Update dm-import job config error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/dm-import/start
 * Start the DM import job (full run)
 */
router.post('/dm-import/start', async (_req: Request, res: Response) => {
  try {
    const result = await dmImportJob.start();
    res.json({ ...result, status: dmImportJob.getStatus() });
  } catch (error) {
    logger.error('Start dm-import job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/dm-import/stop
 * Stop the DM import job
 */
router.post('/dm-import/stop', async (_req: Request, res: Response) => {
  try {
    await dmImportJob.stop();
    res.json({ success: true, status: dmImportJob.getStatus() });
  } catch (error) {
    logger.error('Stop dm-import job error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/dm-import/reset-stats
 * Reset DM import job statistics
 */
router.post('/dm-import/reset-stats', async (_req: Request, res: Response) => {
  try {
    dmImportJob.resetStats();
    res.json({ success: true, status: dmImportJob.getStatus() });
  } catch (error) {
    logger.error('Reset dm-import job stats error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/dm-import/scrape-one/:username
 * Scrape a single DM thread (for testing)
 */
router.post('/dm-import/scrape-one/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    logger.info(`Manual DM scrape triggered for ${username}`);
    const result = await dmImportJob.scrapeOneThread(username);

    res.json({
      ...result,
      username,
    });
  } catch (error) {
    logger.error('Manual DM scrape error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/dm-import/scrape-n
 * Scrape up to N DM threads (for testing)
 */
router.post('/dm-import/scrape-n', async (req: Request, res: Response) => {
  try {
    const { count = 10 } = req.body;

    logger.info(`Manual DM scrape triggered for ${count} threads`);
    const result = await dmImportJob.scrapeNThreads(count);

    res.json(result);
  } catch (error) {
    logger.error('Manual DM batch scrape error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/job/dm-import/raw-data
 * Get raw DM data for viewing
 */
router.get('/dm-import/raw-data', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const threadUsername = req.query.threadUsername as string | undefined;
    const onlyTips = req.query.onlyTips === 'true';
    const onlyUnimported = req.query.onlyUnimported === 'true';

    const result = await DMScraperService.getRawDMData({
      limit,
      offset,
      threadUsername,
      onlyTips,
      onlyUnimported,
    });

    res.json(result);
  } catch (error) {
    logger.error('Get raw DM data error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/dm-import/import-one/:id
 * Import a single raw DM to interactions
 */
router.post('/dm-import/import-one/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = await DMScraperService.importToInteraction(id);
    res.json({ success, id });
  } catch (error) {
    logger.error('Import DM to interaction error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/dm-import/import-all
 * Import all unimported DMs to interactions
 */
router.post('/dm-import/import-all', async (_req: Request, res: Response) => {
  try {
    const result = await DMScraperService.importAllUnimported();
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Import all DMs error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/job/dm-import/queue
 * Get the DM scrape queue (threads to be scraped)
 */
router.get('/dm-import/queue', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const showScraped = req.query.showScraped !== 'false';

    const result = await DMScraperService.getScrapeQueue({
      limit,
      offset,
      showScraped,
    });

    res.json(result);
  } catch (error) {
    logger.error('Get DM scrape queue error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/job/dm-import/discover-threads
 * Discover DM threads from Chaturbate messages page and add to queue
 */
router.post('/dm-import/discover-threads', async (_req: Request, res: Response) => {
  try {
    const result = await dmImportJob.discoverThreads();
    res.json(result);
  } catch (error) {
    logger.error('Discover DM threads error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

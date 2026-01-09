import { Router, Request, Response } from 'express';
import { query } from '../db/client.js';
import { feedCacheService } from '../services/feed-cache.service.js';
import { affiliatePollingJob } from '../jobs/affiliate-polling.job.js';
import { profileScrapeJob } from '../jobs/profile-scrape.job.js';
import { cbhoursPollingJob } from '../jobs/cbhours-polling.job.js';
import { statbateRefreshJob } from '../jobs/statbate-refresh.job.js';
import { FollowerHistoryService } from '../services/follower-history.service.js';
import { StatsCollectionService } from '../services/stats-collection.service.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/system/stats
 * Get comprehensive system statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    // Run all queries in parallel for performance
    const [
      databaseStats,
      personCounts,
      roleCounts,
      sourceCounts,
      followingStats,
      recentActivity,
    ] = await Promise.all([
      // Database size stats
      query(`
        SELECT
          pg_database_size(current_database()) as db_size
      `),

      // Total persons count
      query(`SELECT COUNT(*) as total FROM persons`),

      // Persons by role
      query(`
        SELECT role, COUNT(*) as count
        FROM persons
        GROUP BY role
      `),

      // Snapshots by source
      query(`
        SELECT source, COUNT(*) as count
        FROM snapshots
        GROUP BY source
      `),

      // Following/Followers counts
      query(`
        SELECT
          COUNT(*) FILTER (WHERE following = true) as following_count,
          COUNT(*) FILTER (WHERE follower = true) as follower_count,
          COUNT(*) FILTER (WHERE active_sub = true) as subs_count,
          COUNT(*) FILTER (WHERE banned_me = true) as banned_count,
          COUNT(*) FILTER (WHERE friend_tier IS NOT NULL) as friends_count,
          COUNT(*) FILTER (WHERE watch_list = true) as watchlist_count,
          (SELECT COUNT(DISTINCT profile_id) FROM service_relationships WHERE service_role = 'dom' AND service_level = 'Actively Serving') as active_doms_count
        FROM profiles
      `),

      // Recent activity stats (last 24h)
      query(`
        SELECT
          COUNT(*) FILTER (WHERE captured_at > NOW() - INTERVAL '24 hours') as snapshots_24h,
          COUNT(*) FILTER (WHERE captured_at > NOW() - INTERVAL '1 hour') as snapshots_1h
        FROM snapshots
      `),
    ]);

    // Calculate image and video storage stats from profile_images table
    let imageCount = 0;
    let imageTotalSizeBytes = 0;
    let videoCount = 0;
    let videoTotalSizeBytes = 0;
    let usersWithVideos = 0;
    try {
      // Get count and total size from profile_images (images with known file sizes)
      const profileImagesResult = await query(`
        SELECT
          COUNT(*) FILTER (WHERE media_type = 'image' OR media_type IS NULL) as image_count,
          COALESCE(SUM(file_size) FILTER (WHERE media_type = 'image' OR media_type IS NULL), 0) as image_total_size,
          COUNT(*) FILTER (WHERE media_type = 'video') as video_count,
          COALESCE(SUM(file_size) FILTER (WHERE media_type = 'video'), 0) as video_total_size,
          COUNT(DISTINCT person_id) FILTER (WHERE media_type = 'video') as users_with_videos
        FROM profile_images
        WHERE file_size IS NOT NULL
      `);
      const uploadedImageCount = parseInt(profileImagesResult.rows[0]?.image_count || '0');
      imageTotalSizeBytes = parseInt(profileImagesResult.rows[0]?.image_total_size || '0');
      videoCount = parseInt(profileImagesResult.rows[0]?.video_count || '0');
      videoTotalSizeBytes = parseInt(profileImagesResult.rows[0]?.video_total_size || '0');
      usersWithVideos = parseInt(profileImagesResult.rows[0]?.users_with_videos || '0');

      // Also count affiliate API snapshots (these don't have file_size stored)
      const affiliateImagesResult = await query(`
        SELECT COUNT(*) as count
        FROM affiliate_api_snapshots
        WHERE image_path_360x270 IS NOT NULL
      `);
      const affiliateCount = parseInt(affiliateImagesResult.rows[0]?.count || '0');

      imageCount = uploadedImageCount + affiliateCount;
    } catch (e) {
      // Tables might not exist
    }

    // Get CBHours live stats count
    let cbhoursOnline = 0;
    let cbhoursTotal = 0;
    try {
      const cbhoursResult = await query(`
        SELECT
          COUNT(DISTINCT person_id) as total,
          COUNT(DISTINCT person_id) FILTER (WHERE is_online = true) as online
        FROM cbhours_live_stats
        WHERE recorded_at > NOW() - INTERVAL '1 hour'
      `);
      cbhoursOnline = parseInt(cbhoursResult.rows[0]?.online || '0');
      cbhoursTotal = parseInt(cbhoursResult.rows[0]?.total || '0');
    } catch (e) {
      // Table might not exist
    }

    // Get priority lookup queue stats (table might not exist)
    let queuePriority1Pending = 0;
    let queuePriority2Active = 0;
    let queueFailedLast24h = 0;
    try {
      const queueResult = await query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending' AND priority = 1) as priority1_pending,
          COUNT(*) FILTER (WHERE status = 'active' AND priority = 2) as priority2_active,
          COUNT(*) FILTER (WHERE status = 'failed' AND failed_at > NOW() - INTERVAL '24 hours') as failed_24h
        FROM priority_lookup_queue
      `);
      queuePriority1Pending = parseInt(queueResult.rows[0]?.priority1_pending || '0');
      queuePriority2Active = parseInt(queueResult.rows[0]?.priority2_active || '0');
      queueFailedLast24h = parseInt(queueResult.rows[0]?.failed_24h || '0');
    } catch (e) {
      // Table might not exist
    }

    // Get feed cache stats
    const feedCache = feedCacheService.getCacheMetadata();

    // Build role counts object
    const byRole: Record<string, number> = {};
    for (const row of roleCounts.rows) {
      byRole[row.role] = parseInt(row.count);
    }

    // Build source counts object
    const bySource: Record<string, number> = {};
    for (const row of sourceCounts.rows) {
      bySource[row.source] = parseInt(row.count);
    }

    // Get job statuses
    const affiliateStatus = affiliatePollingJob.getStatus();
    const profileScrapeStatus = profileScrapeJob.getStatus();
    const cbhoursStatus = cbhoursPollingJob.getStatus();
    const statbateStatus = statbateRefreshJob.getStatus();

    const response = {
      database: {
        sizeBytes: parseInt(databaseStats.rows[0]?.db_size || '0'),
        totalPersons: parseInt(personCounts.rows[0]?.total || '0'),
        byRole,
        bySource,
        imagesStored: imageCount,
        imageSizeBytes: imageTotalSizeBytes,
        videosStored: videoCount,
        videoSizeBytes: videoTotalSizeBytes,
        usersWithVideos: usersWithVideos,
      },
      queue: {
        priority1Pending: queuePriority1Pending,
        priority2Active: queuePriority2Active,
        failedLast24h: queueFailedLast24h,
      },
      following: {
        followingCount: parseInt(followingStats.rows[0]?.following_count || '0'),
        followerCount: parseInt(followingStats.rows[0]?.follower_count || '0'),
        subsCount: parseInt(followingStats.rows[0]?.subs_count || '0'),
        bannedCount: parseInt(followingStats.rows[0]?.banned_count || '0'),
        friendsCount: parseInt(followingStats.rows[0]?.friends_count || '0'),
        watchlistCount: parseInt(followingStats.rows[0]?.watchlist_count || '0'),
        activeDomsCount: parseInt(followingStats.rows[0]?.active_doms_count || '0'),
      },
      activity: {
        snapshotsLast24h: parseInt(recentActivity.rows[0]?.snapshots_24h || '0'),
        snapshotsLastHour: parseInt(recentActivity.rows[0]?.snapshots_1h || '0'),
      },
      realtime: {
        feedCacheSize: feedCache.roomCount,
        feedCacheUpdatedAt: feedCache.timestamp,
        cbhoursOnline: cbhoursOnline,
        cbhoursTracked: cbhoursTotal,
      },
      jobs: {
        affiliate: {
          isRunning: affiliateStatus.isRunning,
          lastRun: affiliateStatus.stats.lastRun,
          totalRuns: affiliateStatus.stats.totalRuns,
          totalEnriched: affiliateStatus.stats.totalEnriched,
        },
        profileScrape: {
          isRunning: profileScrapeStatus.isRunning,
          lastRun: profileScrapeStatus.stats.lastRun,
          totalRuns: profileScrapeStatus.stats.totalRuns,
          totalScraped: profileScrapeStatus.stats.totalScraped,
        },
        cbhours: {
          isRunning: cbhoursStatus.isRunning,
          lastRun: cbhoursStatus.stats.lastRun,
          totalRuns: cbhoursStatus.stats.totalRuns,
          totalRecorded: cbhoursStatus.stats.totalRecorded,
        },
        statbate: {
          isRunning: statbateStatus.isRunning,
        },
      },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching system stats', { error });
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
});

/**
 * GET /api/system/health
 * Simple health check endpoint
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    // Check database connectivity
    await query('SELECT 1');

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});

/**
 * GET /api/system/follower-trends/top-movers
 * Get top gainers and losers in follower counts
 */
router.get('/follower-trends/top-movers', async (req: Request, res: Response) => {
  try {
    const { days = '7', limit = '10' } = req.query;
    const movers = await FollowerHistoryService.getTopMovers(
      parseInt(days as string, 10),
      parseInt(limit as string, 10)
    );
    res.json(movers);
  } catch (error) {
    logger.error('Error fetching top movers', { error });
    res.status(500).json({ error: 'Failed to fetch top movers' });
  }
});

/**
 * GET /api/system/follower-trends/dashboard
 * Get follower trends dashboard summary
 * Query params:
 *   - days: Number of days to look back (7, 14, 30, 60, 180, 365)
 *   - limit: Number of top movers to return (default 10)
 */
router.get('/follower-trends/dashboard', async (req: Request, res: Response) => {
  try {
    const { days = '7', limit = '10' } = req.query;
    const summary = await FollowerHistoryService.getDashboardSummary(
      parseInt(days as string, 10),
      parseInt(limit as string, 10)
    );
    res.json(summary);
  } catch (error) {
    logger.error('Error fetching follower trends dashboard', { error });
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

/**
 * GET /api/system/follower-trends/person/:personId
 * Get follower history for a specific person
 */
router.get('/follower-trends/person/:personId', async (req: Request, res: Response) => {
  try {
    const { personId } = req.params;
    const { days = '30' } = req.query;

    const history = await FollowerHistoryService.getHistory(
      personId,
      parseInt(days as string, 10)
    );

    res.json({
      personId,
      history,
      count: history.length,
    });
  } catch (error) {
    logger.error('Error fetching follower history', { error });
    res.status(500).json({ error: 'Failed to fetch follower history' });
  }
});

/**
 * GET /api/system/follower-trends/person/:personId/growth
 * Get growth stats for a specific person
 */
router.get('/follower-trends/person/:personId/growth', async (req: Request, res: Response) => {
  try {
    const { personId } = req.params;
    const { days = '30' } = req.query;

    const stats = await FollowerHistoryService.getGrowthStats(
      personId,
      parseInt(days as string, 10)
    );

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching growth stats', { error });
    res.status(500).json({ error: 'Failed to fetch growth stats' });
  }
});

/**
 * GET /api/system/follower-trends/recent-changes
 * Get recent follower changes across all tracked models (paginated)
 * Query params:
 *   - minDelta: Minimum absolute delta to include (default 100)
 *   - limit: Number of results per page (default 20)
 *   - offset: Pagination offset (default 0)
 *   - sortBy: Sort column - 'date' or 'change' (default 'date')
 *   - sortOrder: Sort direction - 'asc' or 'desc' (default 'desc')
 */
router.get('/follower-trends/recent-changes', async (req: Request, res: Response) => {
  try {
    const {
      minDelta = '100',
      limit = '20',
      offset = '0',
      sortBy = 'date',
      sortOrder = 'desc',
    } = req.query;

    const result = await FollowerHistoryService.getRecentChangesPaginated(
      parseInt(minDelta as string, 10),
      parseInt(limit as string, 10),
      parseInt(offset as string, 10),
      sortBy as 'date' | 'change',
      sortOrder as 'asc' | 'desc'
    );

    res.json(result);
  } catch (error) {
    logger.error('Error fetching recent changes', { error });
    res.status(500).json({ error: 'Failed to fetch recent changes' });
  }
});

// ============================================================================
// Stats History Endpoints
// ============================================================================

/**
 * GET /api/system/stats-history
 * Get paginated stats history with optional date filtering
 * Query params:
 *   - start: ISO date string (optional)
 *   - end: ISO date string (optional)
 *   - limit: number (default 100)
 *   - offset: number (default 0)
 */
router.get('/stats-history', async (req: Request, res: Response) => {
  try {
    const { start, end, limit = '100', offset = '0' } = req.query;

    const result = await StatsCollectionService.getHistory({
      start: start ? new Date(start as string) : undefined,
      end: end ? new Date(end as string) : undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error fetching stats history', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch stats history' });
  }
});

/**
 * GET /api/system/stats-history/latest
 * Get the most recent stats snapshot
 */
router.get('/stats-history/latest', async (_req: Request, res: Response) => {
  try {
    const latest = await StatsCollectionService.getLatest();
    res.json({ success: true, data: latest });
  } catch (error) {
    logger.error('Error fetching latest stats', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch latest stats' });
  }
});

/**
 * GET /api/system/stats-history/growth-projection
 * Calculate growth projection for a specific stat
 * Query params:
 *   - statPath: string (e.g., 'media.total_image_size_bytes')
 *   - periodDays: number (days of history to use, default 30)
 *   - projectToDays: number (days into future to project, default 30)
 */
router.get('/stats-history/growth-projection', async (req: Request, res: Response) => {
  try {
    const { statPath, periodDays = '30', projectToDays = '30' } = req.query;

    if (!statPath) {
      res.status(400).json({ error: 'statPath query parameter is required' });
      return;
    }

    const projection = await StatsCollectionService.calculateGrowthProjection({
      statPath: statPath as string,
      periodDays: parseInt(periodDays as string, 10),
      projectToDays: parseInt(projectToDays as string, 10),
    });

    res.json({ success: true, data: projection });
  } catch (error) {
    logger.error('Error calculating growth projection', { error });
    res.status(500).json({ success: false, error: 'Failed to calculate growth projection' });
  }
});

/**
 * GET /api/system/stats-history/time-series
 * Get time-series data for a specific stat (for charting)
 * Query params:
 *   - statPath: string (e.g., 'media.total_image_size_bytes')
 *   - start: ISO date string (optional)
 *   - end: ISO date string (optional)
 *   - aggregation: 'hourly' | 'daily' (default 'hourly')
 */
router.get('/stats-history/time-series', async (req: Request, res: Response) => {
  try {
    const { statPath, start, end, aggregation = 'hourly' } = req.query;

    if (!statPath) {
      res.status(400).json({ error: 'statPath query parameter is required' });
      return;
    }

    const data = await StatsCollectionService.getTimeSeries({
      statPath: statPath as string,
      start: start ? new Date(start as string) : undefined,
      end: end ? new Date(end as string) : undefined,
      aggregation: aggregation as 'hourly' | 'daily',
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching time series', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch time series data' });
  }
});

export default router;

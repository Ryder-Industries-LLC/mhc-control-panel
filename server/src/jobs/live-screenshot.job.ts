import { feedCacheService } from '../services/feed-cache.service.js';
import { ProfileImagesService } from '../services/profile-images.service.js';
import { storageService } from '../services/storage/storage.service.js';
import { JobPersistenceService } from '../services/job-persistence.service.js';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import axios from 'axios';
import crypto from 'crypto';

/**
 * Background job to capture screenshots from live Following users
 * Uses the affiliate API feed cache to find online broadcasters
 * and downloads their current stream image at configurable intervals
 */

const JOB_NAME = 'live-screenshot';

export interface LiveScreenshotConfig {
  intervalMinutes: number;
  enabled: boolean;
}

export interface LiveScreenshotStats {
  lastRun: Date | null;
  totalRuns: number;
  totalCaptures: number;
  lastCycleCaptures: number;
  lastCycleFollowingOnline: number;
  errors: number;
  currentUsername: string | null;
  progress: number;
  total: number;
}

export class LiveScreenshotJob {
  private isRunning = false;
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: LiveScreenshotConfig = {
    intervalMinutes: 30,
    enabled: true,
  };

  private stats: LiveScreenshotStats = {
    lastRun: null,
    totalRuns: 0,
    totalCaptures: 0,
    lastCycleCaptures: 0,
    lastCycleFollowingOnline: 0,
    errors: 0,
    currentUsername: null,
    progress: 0,
    total: 0,
  };

  /**
   * Initialize job state in database (on first run)
   */
  async init() {
    await JobPersistenceService.ensureJobState(JOB_NAME, this.config);
  }

  /**
   * Sync state from database without starting the job
   * Used by web server to show accurate status from worker
   */
  async syncStateFromDB(): Promise<void> {
    const state = await JobPersistenceService.loadState(JOB_NAME);
    if (state) {
      this.isRunning = state.is_running;
      if (state.config) {
        this.config = { ...this.config, ...state.config };
      }
      if (state.stats) {
        this.stats = { ...this.stats, ...state.stats };
      }
    }
  }

  /**
   * Restore job state from database (on container restart)
   */
  async restore(): Promise<boolean> {
    const state = await JobPersistenceService.loadState(JOB_NAME);
    if (!state) {
      logger.info('No persisted state found for live-screenshot job');
      return false;
    }

    // Restore config
    if (state.config) {
      this.config = {
        ...this.config,
        ...state.config,
      };
    }

    // Restore stats if available
    if (state.stats) {
      this.stats = {
        ...this.stats,
        ...state.stats,
      };
    }

    // If job was running, restart it
    if (state.is_running) {
      logger.info('Restoring live-screenshot job to running state');
      await this.start();
      return true;
    }

    return false;
  }

  /**
   * Get job status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      config: this.config,
      stats: this.stats,
    };
  }

  /**
   * Update job configuration
   */
  async updateConfig(config: Partial<LiveScreenshotConfig>) {
    const wasRunning = this.isRunning;

    // Stop if running
    if (wasRunning) {
      await this.stop();
    }

    // Update config
    this.config = {
      ...this.config,
      ...config,
    };

    // Persist config to database
    await JobPersistenceService.saveConfig(JOB_NAME, this.config);

    logger.info('Live screenshot job config updated', { config: this.config });

    // Restart if it was running
    if (wasRunning && this.config.enabled) {
      await this.start();
    }
  }

  /**
   * Start the background job
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Live screenshot job is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.warn('Live screenshot job is disabled');
      return;
    }

    logger.info('Starting live screenshot job', {
      intervalMinutes: this.config.intervalMinutes,
    });

    this.isRunning = true;

    // Persist running state to database
    await JobPersistenceService.saveRunningState(JOB_NAME, true);

    // Run immediately on start
    this.runCycle();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      if (!this.isProcessing) {
        this.runCycle();
      }
    }, this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the job (updates database)
   */
  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.isProcessing = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, false);
    logger.info('Live screenshot job stopped');
  }

  /**
   * Halt the job without updating database
   * Used during graceful shutdown to preserve state for restart
   */
  async halt() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('Live screenshot job halted (state preserved)');
  }

  /**
   * Run a single capture cycle (for manual triggering)
   */
  async runOnce() {
    if (this.isProcessing) {
      logger.warn('Live screenshot job is already processing');
      return;
    }
    await this.runCycle();
  }

  /**
   * Run a single capture cycle
   */
  private async runCycle() {
    if (this.isProcessing) {
      logger.warn('Live screenshot job is already processing');
      return;
    }

    try {
      this.isProcessing = true;
      this.stats.progress = 0;
      this.stats.total = 0;
      this.stats.currentUsername = null;

      logger.info('Starting live screenshot capture cycle');

      // 1. Get Following users from profiles table
      const followingResult = await query(`
        SELECT DISTINCT p.username, p.id as person_id
        FROM persons p
        JOIN profiles pr ON pr.person_id = p.id
        WHERE pr.following = true
      `);

      if (followingResult.rows.length === 0) {
        logger.info('No Following users found, skipping cycle');
        this.stats.lastRun = new Date();
        this.stats.totalRuns++;
        this.stats.lastCycleCaptures = 0;
        this.stats.lastCycleFollowingOnline = 0;
        return;
      }

      const followingUsernames = followingResult.rows.map(r => r.username.toLowerCase());
      logger.info(`Found ${followingUsernames.length} Following users`);

      // 2. Get currently live users from affiliate cache
      const feedCache = feedCacheService.getFeed();
      if (!feedCache) {
        logger.warn('Affiliate feed cache is empty or stale, skipping cycle');
        this.stats.lastRun = new Date();
        this.stats.totalRuns++;
        return;
      }

      // 3. Find Following users who are currently live
      const liveFollowing = feedCacheService.findRooms(followingUsernames);
      this.stats.lastCycleFollowingOnline = liveFollowing.size;
      this.stats.total = liveFollowing.size;

      if (liveFollowing.size === 0) {
        logger.info('No Following users are currently live');
        this.stats.lastRun = new Date();
        this.stats.totalRuns++;
        this.stats.lastCycleCaptures = 0;
        return;
      }

      logger.info(`Found ${liveFollowing.size} Following users online, capturing screenshots`);

      // 4. Capture screenshots for each live Following user
      let captures = 0;
      let processed = 0;

      for (const [username, roomData] of liveFollowing.entries()) {
        processed++;
        this.stats.progress = processed;
        this.stats.currentUsername = username;

        // Find person_id for this username
        const person = followingResult.rows.find(
          r => r.username.toLowerCase() === username.toLowerCase()
        );
        if (!person) {
          logger.warn(`Could not find person_id for username: ${username}`);
          continue;
        }

        try {
          // Download the image using new storage service
          const response = await axios.get(roomData.image_url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
          });

          // Skip placeholder images (Chaturbate placeholder is ~5045 bytes)
          if (Math.abs(response.data.length - 5045) <= 100) {
            logger.debug(`Skipping placeholder image for ${username}`);
            continue;
          }

          // Generate unique filename
          const timestamp = Date.now();
          const hash = crypto.createHash('md5').update(roomData.image_url).digest('hex').substring(0, 8);
          const filename = `${timestamp}_${hash}.jpg`;
          const mimeType = response.headers['content-type'] || 'image/jpeg';

          // Save using new storage service with username-based path
          const result = await storageService.writeWithUsername(
            username,
            'following_snap',
            filename,
            Buffer.from(response.data),
            mimeType
          );

          if (result.success) {
            // Create profile_images record with source='following_snap'
            await ProfileImagesService.create({
              personId: person.person_id,
              filePath: result.relativePath,
              source: 'following_snap',
              capturedAt: new Date(),
              fileSize: result.size,
              mimeType,
              username, // Include username for new schema
              storageProvider: result.provider || 's3',
            });
            captures++;
            logger.debug(`Screenshot captured for ${username}`, { path: result.relativePath });
          } else {
            logger.warn(`Failed to save screenshot for ${username}`, { error: result.error });
          }
        } catch (err) {
          logger.error('Failed to capture screenshot', { username, error: err });
          this.stats.errors++;
        }

        // Small delay between captures to be nice to the API
        await this.sleep(500);
      }

      this.stats.lastRun = new Date();
      this.stats.totalRuns++;
      this.stats.totalCaptures += captures;
      this.stats.lastCycleCaptures = captures;
      this.stats.currentUsername = null;

      logger.info('Live screenshot cycle complete', {
        followingOnline: liveFollowing.size,
        captures,
      });
    } catch (error) {
      logger.error('Error in live screenshot cycle', { error });
      this.stats.errors++;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      lastRun: null,
      totalRuns: 0,
      totalCaptures: 0,
      lastCycleCaptures: 0,
      lastCycleFollowingOnline: 0,
      errors: 0,
      currentUsername: null,
      progress: 0,
      total: 0,
    };
    logger.info('Live screenshot job stats reset');
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const liveScreenshotJob = new LiveScreenshotJob();

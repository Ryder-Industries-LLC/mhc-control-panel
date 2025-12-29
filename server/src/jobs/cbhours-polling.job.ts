import { CBHoursStatsService } from '../services/cbhours-stats.service.js';
import { FollowerScraperService } from '../services/follower-scraper.service.js';
import { JobPersistenceService } from '../services/job-persistence.service.js';
import { logger } from '../config/logger.js';
import { query } from '../db/client.js';

/**
 * Background job to poll CBHours API for live stats
 * Collects rank, viewers, followers data for tracked models
 */

const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches (respect rate limits)
const JOB_NAME = 'cbhours-polling';

export interface CBHoursPollingConfig {
  intervalMinutes: number;
  batchSize: number;
  enabled: boolean;
  targetFollowing: boolean; // Only poll users I'm following
}

export class CBHoursPollingJob {
  private isRunning = false;
  private isPaused = false;
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: CBHoursPollingConfig = {
    intervalMinutes: 30,
    batchSize: 50,
    enabled: true,
    targetFollowing: true,
  };

  // Statistics
  private stats = {
    lastRun: null as Date | null,
    totalRuns: 0,
    totalRecorded: 0,
    totalFailed: 0,
    totalOnline: 0,
    lastRunRecorded: 0,
    lastRunFailed: 0,
    lastRunOnline: 0,
    currentBatch: 0,
    totalBatches: 0,
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
   * Restore job state from database (on container restart)
   */
  async restore(): Promise<boolean> {
    const state = await JobPersistenceService.loadState(JOB_NAME);
    if (!state) {
      logger.info('No persisted state found for cbhours-polling job');
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
    if (state.is_running && !state.is_paused) {
      logger.info('Restoring cbhours-polling job to running state');
      await this.start();
      return true;
    } else if (state.is_running && state.is_paused) {
      logger.info('Restoring cbhours-polling job to paused state');
      this.isRunning = true;
      this.isPaused = true;
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
      isPaused: this.isPaused,
      isProcessing: this.isProcessing,
      config: this.config,
      stats: this.stats,
    };
  }

  /**
   * Update job configuration
   */
  async updateConfig(config: Partial<CBHoursPollingConfig>) {
    const wasRunning = this.isRunning && !this.isPaused;

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

    logger.info('CBHours polling job config updated', { config: this.config });

    // Restart if it was running
    if (wasRunning && this.config.enabled) {
      await this.start();
    }
  }

  /**
   * Start the background polling job
   */
  async start() {
    if (this.isRunning && !this.isPaused) {
      logger.warn('CBHours polling job is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.warn('CBHours polling job is disabled');
      return;
    }

    logger.info('Starting CBHours polling job', {
      intervalMinutes: this.config.intervalMinutes,
      batchSize: this.config.batchSize,
      targetFollowing: this.config.targetFollowing,
    });

    this.isRunning = true;
    this.isPaused = false;

    // Persist running state to database
    await JobPersistenceService.saveRunningState(JOB_NAME, true, false);

    // Run immediately on start
    this.runPoll();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      if (!this.isPaused) {
        this.runPoll();
      }
    }, this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Pause the polling job
   */
  async pause() {
    if (!this.isRunning) {
      logger.warn('CBHours polling job is not running');
      return;
    }
    this.isPaused = true;
    await JobPersistenceService.saveRunningState(JOB_NAME, true, true);
    logger.info('CBHours polling job paused');
  }

  /**
   * Resume the polling job
   */
  async resume() {
    if (!this.isRunning) {
      logger.warn('CBHours polling job is not running');
      return;
    }
    this.isPaused = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, true, false);
    logger.info('CBHours polling job resumed');
  }

  /**
   * Stop the polling job (updates database)
   */
  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, false, false);
    logger.info('CBHours polling job stopped');
  }

  /**
   * Halt the polling job without updating database
   * Used during graceful shutdown to preserve state for restart
   */
  async halt() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Don't update isRunning/isPaused or database - preserve state for restart
    logger.info('CBHours polling job halted (state preserved)');
  }

  /**
   * Run a single polling cycle
   */
  private async runPoll() {
    if (this.isProcessing) {
      logger.warn('CBHours polling job is already processing');
      return;
    }

    try {
      this.isProcessing = true;
      this.stats.progress = 0;
      this.stats.total = 0;
      this.stats.currentBatch = 0;
      this.stats.totalBatches = 0;
      this.stats.lastRunRecorded = 0;
      this.stats.lastRunFailed = 0;
      this.stats.lastRunOnline = 0;

      logger.info('Starting CBHours polling cycle', {
        targetFollowing: this.config.targetFollowing,
        batchSize: this.config.batchSize,
      });

      // Get list of usernames to poll
      const usernames = await this.getUsernamesToPoll();

      if (usernames.length === 0) {
        logger.info('No usernames to poll for CBHours');
        this.stats.lastRun = new Date();
        this.stats.totalRuns++;
        return;
      }

      this.stats.total = usernames.length;

      // Split into batches
      const batches: string[][] = [];
      for (let i = 0; i < usernames.length; i += this.config.batchSize) {
        batches.push(usernames.slice(i, i + this.config.batchSize));
      }
      this.stats.totalBatches = batches.length;

      logger.info(`Polling CBHours for ${usernames.length} users in ${batches.length} batches`);

      // Process each batch
      for (let i = 0; i < batches.length && !this.isPaused; i++) {
        const batch = batches[i];
        this.stats.currentBatch = i + 1;
        this.stats.progress = Math.min(i * this.config.batchSize, usernames.length);

        try {
          const result = await CBHoursStatsService.fetchAndStoreLiveStats(batch);
          this.stats.lastRunRecorded += result.success;
          this.stats.lastRunFailed += result.failed;
          this.stats.lastRunOnline += result.online;
          this.stats.totalRecorded += result.success;
          this.stats.totalFailed += result.failed;
          this.stats.totalOnline += result.online;

          logger.debug(`CBHours batch ${i + 1}/${batches.length} complete`, {
            success: result.success,
            failed: result.failed,
            online: result.online,
          });

          // Delay between batches to respect rate limits
          if (i < batches.length - 1) {
            await this.sleep(DELAY_BETWEEN_BATCHES);
          }
        } catch (error) {
          logger.error(`Error in CBHours batch ${i + 1}`, { error });
          this.stats.lastRunFailed += batch.length;
          this.stats.totalFailed += batch.length;
        }
      }

      this.stats.progress = usernames.length;
      this.stats.lastRun = new Date();
      this.stats.totalRuns++;

      logger.info('CBHours polling cycle completed', {
        recorded: this.stats.lastRunRecorded,
        failed: this.stats.lastRunFailed,
        online: this.stats.lastRunOnline,
        total: usernames.length,
      });
    } catch (error) {
      logger.error('Error in CBHours polling cycle', { error });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get list of usernames to poll
   */
  private async getUsernamesToPoll(): Promise<string[]> {
    if (this.config.targetFollowing) {
      // Get usernames from following list (models only)
      const following = await FollowerScraperService.getFollowing();
      return following.map(f => f.username);
    } else {
      // Get all tracked models
      const result = await query(
        `SELECT DISTINCT p.username
         FROM persons p
         WHERE p.role = 'MODEL'
         ORDER BY p.last_seen_at DESC NULLS LAST
         LIMIT 500`
      );
      return result.rows.map(r => r.username);
    }
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      lastRun: null,
      totalRuns: 0,
      totalRecorded: 0,
      totalFailed: 0,
      totalOnline: 0,
      lastRunRecorded: 0,
      lastRunFailed: 0,
      lastRunOnline: 0,
      currentBatch: 0,
      totalBatches: 0,
      progress: 0,
      total: 0,
    };
    logger.info('CBHours polling job stats reset');
  }

  /**
   * Manually poll a specific list of usernames
   */
  async pollUsernames(usernames: string[]): Promise<{
    success: number;
    failed: number;
    online: number;
  }> {
    return CBHoursStatsService.fetchAndStoreLiveStats(usernames);
  }
}

export const cbhoursPollingJob = new CBHoursPollingJob();

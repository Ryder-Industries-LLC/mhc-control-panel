/**
 * Stats Collection Background Job
 *
 * Periodically collects system statistics and stores them in system_stats_history table.
 * Used for historical trend analysis and growth projections.
 */

import { StatsCollectionService } from '../services/stats-collection.service.js';
import { JobPersistenceService } from '../services/job-persistence.service.js';
import { logger } from '../config/logger.js';

const JOB_NAME = 'stats-collection';

export interface StatsCollectionConfig {
  intervalMinutes: number;
  enabled: boolean;
}

export class StatsCollectionJob {
  private isRunning = false;
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: StatsCollectionConfig = {
    intervalMinutes: 60, // Default: collect stats every hour
    enabled: true,
  };

  // Statistics
  private stats = {
    lastRun: null as Date | null,
    totalRuns: 0,
    totalSnapshots: 0,
    lastCollectionDurationMs: 0,
    lastError: null as string | null,
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
      logger.info('No persisted state found for stats-collection job');
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
      logger.info('Restoring stats-collection job to running state');
      await this.start();
      return true;
    }

    return false;
  }

  /**
   * Sync state from database without starting the job
   * Used by web server to get accurate status
   */
  async syncStateFromDB(): Promise<void> {
    const state = await JobPersistenceService.loadState(JOB_NAME);
    if (state) {
      if (state.config) {
        this.config = { ...this.config, ...state.config };
      }
      if (state.stats) {
        this.stats = { ...this.stats, ...state.stats };
      }
      this.isRunning = state.is_running;
    }
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
  async updateConfig(config: Partial<StatsCollectionConfig>) {
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

    logger.info('Stats collection job config updated', { config: this.config });

    // Restart if it was running and is enabled
    if (wasRunning && this.config.enabled) {
      await this.start();
    }
  }

  /**
   * Start the background job
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Stats collection job is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.warn('Stats collection job is disabled');
      return;
    }

    logger.info('Starting stats collection job', {
      intervalMinutes: this.config.intervalMinutes,
    });

    this.isRunning = true;

    // Persist running state to database
    await JobPersistenceService.saveRunningState(JOB_NAME, true);

    // Run immediately on start
    this.runCollection();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      if (!this.isProcessing) {
        this.runCollection();
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
    logger.info('Stats collection job stopped');
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
    logger.info('Stats collection job halted (state preserved)');
  }

  /**
   * Run a single collection cycle
   */
  private async runCollection() {
    if (this.isProcessing) {
      logger.warn('Stats collection job is already processing');
      return;
    }

    const startTime = Date.now();

    try {
      this.isProcessing = true;
      this.stats.lastError = null;

      logger.debug('Starting stats collection cycle');

      // Collect all stats
      const stats = await StatsCollectionService.collectStats();

      const durationMs = Date.now() - startTime;

      // Save to database
      const snapshotId = await StatsCollectionService.saveSnapshot(stats, durationMs);

      // Update stats
      this.stats.lastRun = new Date();
      this.stats.totalRuns++;
      this.stats.totalSnapshots++;
      this.stats.lastCollectionDurationMs = durationMs;

      // Persist stats to database
      await JobPersistenceService.saveStats(JOB_NAME, this.stats);

      logger.info('Stats collection cycle completed', {
        snapshotId,
        durationMs,
        totalSnapshots: this.stats.totalSnapshots,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.stats.lastError = errorMessage;
      this.stats.lastCollectionDurationMs = Date.now() - startTime;

      logger.error('Stats collection cycle failed', { error: errorMessage });

      // Persist error state
      await JobPersistenceService.saveStats(JOB_NAME, this.stats);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Manually trigger a collection (for testing or on-demand)
   */
  async runNow(): Promise<{ success: boolean; message: string; durationMs?: number }> {
    if (this.isProcessing) {
      return { success: false, message: 'Collection is already in progress' };
    }

    const startTime = Date.now();

    try {
      this.isProcessing = true;
      this.stats.lastError = null;

      // Collect all stats
      const stats = await StatsCollectionService.collectStats();

      const durationMs = Date.now() - startTime;

      // Save to database
      const snapshotId = await StatsCollectionService.saveSnapshot(stats, durationMs);

      // Update stats
      this.stats.lastRun = new Date();
      this.stats.totalRuns++;
      this.stats.totalSnapshots++;
      this.stats.lastCollectionDurationMs = durationMs;

      // Persist stats to database
      await JobPersistenceService.saveStats(JOB_NAME, this.stats);

      return {
        success: true,
        message: `Stats snapshot #${snapshotId} collected successfully`,
        durationMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.stats.lastError = errorMessage;

      return {
        success: false,
        message: `Collection failed: ${errorMessage}`,
        durationMs: Date.now() - startTime,
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Reset statistics
   */
  async resetStats() {
    this.stats = {
      lastRun: null,
      totalRuns: 0,
      totalSnapshots: 0,
      lastCollectionDurationMs: 0,
      lastError: null,
    };
    await JobPersistenceService.saveStats(JOB_NAME, this.stats);
    logger.info('Stats collection job statistics reset');
  }
}

// Export singleton instance
export const statsCollectionJob = new StatsCollectionJob();

/**
 * Media Transfer Job
 *
 * Background job to transfer media files between storage providers.
 * Implements safe transfer with copy → verify → update → delete pattern.
 */

import { JobPersistenceService } from '../services/job-persistence.service.js';
import { storageService, transferService, StorageProviderType, MediaTransferJobConfig } from '../services/storage/index.js';
import { logger } from '../config/logger.js';

const JOB_NAME = 'media-transfer';

export class MediaTransferJob {
  private isRunning = false;
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: MediaTransferJobConfig = {
    enabled: false,
    intervalMinutes: 60,
    destination: 'auto',
    batchSize: 100,
  };

  // Statistics
  private stats = {
    lastRun: null as Date | null,
    totalRuns: 0,
    totalTransferred: 0,
    totalFailed: 0,
    totalSkipped: 0,
    lastRunTransferred: 0,
    lastRunFailed: 0,
    lastRunSkipped: 0,
    progress: 0,
    total: 0,
    lastError: null as string | null,
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
      logger.info('No persisted state found for media-transfer job');
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
      logger.info('Restoring media-transfer job to running state');
      await this.start();
      return true;
    }

    return false;
  }

  /**
   * Get job status
   * Status states:
   * - Stopped: isRunning=false
   * - Starting: isRunning=true, isProcessing=false (just started, waiting for first cycle)
   * - Processing: isRunning=true, isProcessing=true (actively working)
   * - Waiting: isRunning=true, isProcessing=false (between cycles)
   */
  getStatus() {
    const transferStats = transferService.getStats();
    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      config: this.config,
      stats: {
        ...this.stats,
        // Include real-time stats from transfer service
        transferServiceStats: transferStats,
      },
    };
  }

  /**
   * Update job configuration
   */
  async updateConfig(config: Partial<MediaTransferJobConfig>) {
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

    logger.info('Media transfer job config updated', { config: this.config });

    // Restart if it was running
    if (wasRunning && this.config.enabled) {
      await this.start();
    }
  }

  /**
   * Start the background transfer job
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Media transfer job is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.warn('Media transfer job is disabled');
      return;
    }

    // Initialize storage service
    await storageService.init();

    // Determine destination
    const destination = await this.resolveDestination();
    if (!destination) {
      logger.warn('Media transfer job cannot start: no valid destination provider');
      return;
    }

    logger.info('Starting media transfer job', {
      intervalMinutes: this.config.intervalMinutes,
      destination: this.config.destination,
      resolvedDestination: destination,
      batchSize: this.config.batchSize,
    });

    this.isRunning = true;

    // Persist running state to database
    await JobPersistenceService.saveRunningState(JOB_NAME, true);

    // Run immediately on start
    this.runTransfer();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      if (!this.isProcessing) {
        this.runTransfer();
      }
    }, this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the transfer job (updates database)
   */
  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.isProcessing = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, false);
    logger.info('Media transfer job stopped');
  }

  /**
   * Halt the transfer job without updating database
   * Used during graceful shutdown to preserve state for restart
   */
  async halt() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('Media transfer job halted (state preserved)');
  }

  /**
   * Run a single transfer cycle
   */
  private async runTransfer() {
    if (this.isProcessing) {
      logger.warn('Media transfer job is already processing');
      return;
    }

    try {
      this.isProcessing = true;
      this.stats.lastRunTransferred = 0;
      this.stats.lastRunFailed = 0;
      this.stats.lastRunSkipped = 0;
      this.stats.progress = 0;
      this.stats.lastError = null;

      logger.info('Starting media transfer cycle');

      // Resolve destination provider
      const destType = await this.resolveDestination();
      if (!destType) {
        logger.warn('No valid destination provider available');
        this.stats.lastError = 'No valid destination provider';
        return;
      }

      // Determine source (always Docker for now, as that's where images are uploaded)
      const sourceType: StorageProviderType = 'docker';

      // Skip if source and destination are the same
      if (sourceType === destType) {
        logger.info('Source and destination are the same, nothing to transfer');
        this.stats.lastRun = new Date();
        this.stats.totalRuns++;
        return;
      }

      // Get count of pending transfers
      const pendingCount = await transferService.getPendingCount(sourceType);
      if (pendingCount === 0) {
        logger.info('No files pending transfer');
        this.stats.lastRun = new Date();
        this.stats.totalRuns++;
        return;
      }

      this.stats.total = Math.min(pendingCount, this.config.batchSize);
      logger.info(`Found ${pendingCount} files pending transfer, processing batch of ${this.stats.total}`);

      // Run batch transfer
      const result = await transferService.transferBatch(sourceType, destType, {
        createSymlinks: true,
        deleteSource: true,
        batchSize: this.config.batchSize,
      });

      // Update stats
      this.stats.lastRunTransferred = result.transferred;
      this.stats.lastRunFailed = result.failed;
      this.stats.lastRunSkipped = result.skipped;
      this.stats.totalTransferred += result.transferred;
      this.stats.totalFailed += result.failed;
      this.stats.totalSkipped += result.skipped;
      this.stats.lastRun = new Date();
      this.stats.totalRuns++;

      // Persist stats
      await this.saveStats();

      logger.info('Media transfer cycle completed', {
        transferred: result.transferred,
        failed: result.failed,
        skipped: result.skipped,
        remainingPending: pendingCount - result.transferred - result.skipped,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.stats.lastError = message;
      logger.error('Error in media transfer cycle', { error });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Resolve the destination provider based on configuration
   */
  private async resolveDestination(): Promise<StorageProviderType | null> {
    if (this.config.destination === 'auto') {
      return transferService.getAutoDestination();
    }

    // Verify the specified destination is available
    const provider = storageService.getProvider(this.config.destination as StorageProviderType);
    if (provider && await provider.isAvailable()) {
      return this.config.destination as StorageProviderType;
    }

    logger.warn(`Configured destination ${this.config.destination} is not available`);
    return null;
  }

  /**
   * Save stats to database
   */
  private async saveStats() {
    try {
      await JobPersistenceService.saveStats(JOB_NAME, this.stats);
    } catch (error) {
      logger.error('Failed to save media transfer stats', { error });
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      lastRun: null,
      totalRuns: 0,
      totalTransferred: 0,
      totalFailed: 0,
      totalSkipped: 0,
      lastRunTransferred: 0,
      lastRunFailed: 0,
      lastRunSkipped: 0,
      progress: 0,
      total: 0,
      lastError: null,
    };
    transferService.resetStats();
    logger.info('Media transfer job stats reset');
  }

  /**
   * Manually trigger a transfer run
   */
  async runNow(): Promise<{ success: boolean; message: string }> {
    if (this.isProcessing) {
      return { success: false, message: 'Transfer is already in progress' };
    }

    // Temporarily enable if disabled
    const wasDisabled = !this.config.enabled;

    try {
      // Initialize storage service
      await storageService.init();

      // Run transfer
      await this.runTransfer();

      return {
        success: true,
        message: `Transfer completed: ${this.stats.lastRunTransferred} transferred, ${this.stats.lastRunFailed} failed, ${this.stats.lastRunSkipped} skipped`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message };
    }
  }
}

export const mediaTransferJob = new MediaTransferJob();

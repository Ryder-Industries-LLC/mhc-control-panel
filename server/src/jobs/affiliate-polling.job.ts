import { ProfileEnrichmentService } from '../services/profile-enrichment.service.js';
import { chaturbateAffiliateClient } from '../api/chaturbate/affiliate-client.js';
import { logger } from '../config/logger.js';

/**
 * Background job to poll Chaturbate Affiliate API for online broadcasters
 * Collects session data and profile information at regular intervals
 */

const DELAY_BETWEEN_REQUESTS = 1000; // 1 second between API calls (respect rate limits)

export interface AffiliatePollingConfig {
  intervalMinutes: number;
  gender: 'm' | 'f' | 't' | 'c' | 'm,f' | 'm,f,t' | 'm,f,t,c';
  limit: number;
  enabled: boolean;
}

export class AffiliatePollingJob {
  private isRunning = false;
  private isPaused = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: AffiliatePollingConfig = {
    intervalMinutes: 30,
    gender: 'm',
    limit: 0,
    enabled: false,
  };

  // Statistics
  private stats = {
    lastRun: null as Date | null,
    totalRuns: 0,
    totalEnriched: 0,
    totalFailed: 0,
    lastRunEnriched: 0,
    lastRunFailed: 0,
  };

  /**
   * Get job status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      config: this.config,
      stats: this.stats,
    };
  }

  /**
   * Update job configuration
   */
  updateConfig(config: Partial<AffiliatePollingConfig>) {
    const wasRunning = this.isRunning && !this.isPaused;

    // Stop if running
    if (wasRunning) {
      this.stop();
    }

    // Update config
    this.config = {
      ...this.config,
      ...config,
    };

    logger.info('Affiliate polling job config updated', { config: this.config });

    // Restart if it was running
    if (wasRunning && this.config.enabled) {
      this.start();
    }
  }

  /**
   * Start the background polling job
   */
  start() {
    if (this.isRunning && !this.isPaused) {
      logger.warn('Affiliate polling job is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.warn('Affiliate polling job is disabled');
      return;
    }

    logger.info('Starting Affiliate polling job', {
      intervalMinutes: this.config.intervalMinutes,
      gender: this.config.gender,
      limit: this.config.limit,
    });

    this.isRunning = true;
    this.isPaused = false;

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
  pause() {
    if (!this.isRunning) {
      logger.warn('Affiliate polling job is not running');
      return;
    }
    this.isPaused = true;
    logger.info('Affiliate polling job paused');
  }

  /**
   * Resume the polling job
   */
  resume() {
    if (!this.isRunning) {
      logger.warn('Affiliate polling job is not running');
      return;
    }
    this.isPaused = false;
    logger.info('Affiliate polling job resumed');
  }

  /**
   * Stop the polling job
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    logger.info('Affiliate polling job stopped');
  }

  /**
   * Run a single polling cycle
   */
  private async runPoll() {
    try {
      const fetchAll = this.config.limit === 0;
      logger.info('Starting Affiliate API polling cycle', {
        gender: this.config.gender,
        limit: fetchAll ? 'ALL' : this.config.limit,
      });

      this.stats.lastRunEnriched = 0;
      this.stats.lastRunFailed = 0;

      // Parse gender filter (can be comma-separated)
      const genders = this.config.gender.split(',').map(g => g.trim()) as Array<'m' | 'f' | 't' | 'c'>;

      // Fetch online rooms with pagination
      let offset = 0;
      let totalProcessed = 0;
      const batchSize = 500; // Affiliate API max per request

      // Continue until we've processed the limit OR fetched all (if limit = 0)
      while (fetchAll || totalProcessed < this.config.limit) {
        const batchLimit = fetchAll ? batchSize : Math.min(batchSize, this.config.limit - totalProcessed);

        logger.info(`Fetching online rooms (offset: ${offset}, limit: ${batchLimit})`);

        // Fetch batch
        const response = await chaturbateAffiliateClient.getOnlineRooms({
          gender: genders,
          limit: batchLimit,
          offset,
        });

        if (response.results.length === 0) {
          logger.info('No more online rooms found');
          break;
        }

        logger.info(`Processing batch of ${response.results.length} rooms`);

        // Process each room
        for (const room of response.results) {
          try {
            await ProfileEnrichmentService.enrichFromAffiliateAPI(room.username);
            this.stats.lastRunEnriched++;
            this.stats.totalEnriched++;

            // Rate limiting
            await this.sleep(DELAY_BETWEEN_REQUESTS);
          } catch (error) {
            logger.error('Error enriching from Affiliate API', {
              username: room.username,
              error,
            });
            this.stats.lastRunFailed++;
            this.stats.totalFailed++;
          }
        }

        totalProcessed += response.results.length;
        offset += batchLimit;

        // If we got fewer results than requested, we've reached the end
        if (response.results.length < batchLimit) {
          logger.info('Reached end of available rooms');
          break;
        }
      }

      this.stats.lastRun = new Date();
      this.stats.totalRuns++;

      logger.info('Affiliate API polling cycle completed', {
        enriched: this.stats.lastRunEnriched,
        failed: this.stats.lastRunFailed,
        totalProcessed,
      });
    } catch (error) {
      logger.error('Error in Affiliate API polling cycle', { error });
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
      totalEnriched: 0,
      totalFailed: 0,
      lastRunEnriched: 0,
      lastRunFailed: 0,
    };
    logger.info('Affiliate polling job stats reset');
  }
}

export const affiliatePollingJob = new AffiliatePollingJob();

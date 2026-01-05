import { ProfileEnrichmentService } from '../services/profile-enrichment.service.js';
import { chaturbateAffiliateClient } from '../api/chaturbate/affiliate-client.js';
import { feedCacheService } from '../services/feed-cache.service.js';
import { PriorityLookupService } from '../services/priority-lookup.service.js';
import { JobPersistenceService } from '../services/job-persistence.service.js';
import { logger } from '../config/logger.js';

/**
 * Background job to poll Chaturbate Affiliate API for online broadcasters
 * Collects session data and profile information at regular intervals
 */

const DELAY_BETWEEN_REQUESTS = 1000; // 1 second between API calls (respect rate limits)
const JOB_NAME = 'affiliate-polling';

export interface AffiliatePollingConfig {
  intervalMinutes: number;
  gender: 'm' | 'f' | 't' | 'c' | 'm,f' | 'm,f,t' | 'm,f,t,c';
  limit: number;
  enabled: boolean;
}

export class AffiliatePollingJob {
  private isRunning = false;
  private isPaused = false;
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: AffiliatePollingConfig = {
    intervalMinutes: 5,
    gender: 'm',
    limit: 0, // 0 = fetch all broadcasters
    enabled: true,
  };

  // Statistics
  private stats = {
    lastRun: null as Date | null,
    totalRuns: 0,
    totalEnriched: 0,
    totalFailed: 0,
    lastRunEnriched: 0,
    lastRunFailed: 0,
    currentUsername: null as string | null,
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
      this.isPaused = state.is_paused;
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
      logger.info('No persisted state found for affiliate-polling job');
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
      logger.info('Restoring affiliate-polling job to running state');
      await this.start();
      return true;
    } else if (state.is_running && state.is_paused) {
      logger.info('Restoring affiliate-polling job to paused state');
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
  async updateConfig(config: Partial<AffiliatePollingConfig>) {
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

    logger.info('Affiliate polling job config updated', { config: this.config });

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
      logger.warn('Affiliate polling job is not running');
      return;
    }
    this.isPaused = true;
    await JobPersistenceService.saveRunningState(JOB_NAME, true, true);
    logger.info('Affiliate polling job paused');
  }

  /**
   * Resume the polling job
   */
  async resume() {
    if (!this.isRunning) {
      logger.warn('Affiliate polling job is not running');
      return;
    }
    this.isPaused = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, true, false);
    logger.info('Affiliate polling job resumed');
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
    logger.info('Affiliate polling job stopped');
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
    logger.info('Affiliate polling job halted (state preserved)');
  }

  /**
   * Run a single polling cycle
   */
  private async runPoll() {
    if (this.isProcessing) {
      logger.warn('Affiliate polling job is already processing');
      return;
    }

    try {
      this.isProcessing = true;
      this.stats.progress = 0;
      this.stats.total = 0;
      this.stats.currentUsername = null;

      const fetchAll = this.config.limit === 0;
      logger.info('Starting Affiliate API polling cycle', {
        gender: this.config.gender,
        limit: fetchAll ? 'ALL' : this.config.limit,
      });

      this.stats.lastRunEnriched = 0;
      this.stats.lastRunFailed = 0;

      // Parse gender filter (can be comma-separated)
      const genders = this.config.gender.split(',').map(g => g.trim()) as Array<'m' | 'f' | 't' | 'c'>;

      // STEP 1: Fetch ENTIRE feed and cache it
      logger.info('Fetching entire feed for caching...');
      const allRooms = await this.fetchEntireFeed(genders, fetchAll ? 0 : this.config.limit);

      if (allRooms.length === 0) {
        logger.warn('No online rooms found in feed');
        return;
      }

      // Cache the complete feed
      feedCacheService.setFeed(allRooms, allRooms.length);
      this.stats.total = allRooms.length;
      logger.info(`Feed cached with ${allRooms.length} rooms`);

      // STEP 2: Process Priority 2 users FIRST (active tracking)
      const priorityTwoUsers = await PriorityLookupService.getActiveTracking();
      if (priorityTwoUsers.length > 0) {
        logger.info(`Processing ${priorityTwoUsers.length} Priority 2 users (active tracking)`);
        await this.processPriorityUsers(priorityTwoUsers, 2);
      }

      // STEP 3: Process Priority 1 users (initial population)
      const priorityOneUsers = await PriorityLookupService.getPendingInitial();
      if (priorityOneUsers.length > 0) {
        logger.info(`Processing ${priorityOneUsers.length} Priority 1 users (initial population)`);
        await this.processPriorityUsers(priorityOneUsers, 1);
      }

      // STEP 4: Process remaining users from cache
      logger.info('Processing remaining users from cache');
      await this.processRemainingUsers(allRooms);

      this.stats.lastRun = new Date();
      this.stats.totalRuns++;
      this.stats.currentUsername = null;

      logger.info('Affiliate API polling cycle completed', {
        enriched: this.stats.lastRunEnriched,
        failed: this.stats.lastRunFailed,
        totalRooms: allRooms.length,
      });
    } catch (error) {
      logger.error('Error in Affiliate API polling cycle', { error });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Fetch entire feed from Affiliate API
   */
  private async fetchEntireFeed(
    genders: Array<'m' | 'f' | 't' | 'c'>,
    limit: number
  ): Promise<any[]> {
    const allRooms: any[] = [];
    let offset = 0;
    const batchSize = 500; // Affiliate API max per request
    const fetchAll = limit === 0;

    // Continue until we've fetched the limit OR fetched all (if limit = 0)
    while (fetchAll || allRooms.length < limit) {
      const batchLimit = fetchAll ? batchSize : Math.min(batchSize, limit - allRooms.length);

      logger.debug(`Fetching feed batch (offset: ${offset}, limit: ${batchLimit})`);

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

      allRooms.push(...response.results);
      offset += batchLimit;

      logger.debug(`Fetched ${response.results.length} rooms (total: ${allRooms.length})`);

      // If we got fewer results than requested, we've reached the end
      if (response.results.length < batchLimit) {
        logger.info('Reached end of available rooms');
        break;
      }

      // Small delay to avoid overwhelming the API
      await this.sleep(500);
    }

    return allRooms;
  }

  /**
   * Process priority users from cached feed
   */
  private async processPriorityUsers(
    priorityUsers: any[],
    priorityLevel: number
  ): Promise<void> {
    const processedUsernames = new Set<string>();

    for (const priorityUser of priorityUsers) {
      try {
        // Find user in cached feed
        const room = feedCacheService.findRoom(priorityUser.username);

        if (room) {
          // Enrich from cached data
          await ProfileEnrichmentService.enrichFromAffiliateAPI(room.username);
          this.stats.lastRunEnriched++;
          this.stats.totalEnriched++;

          processedUsernames.add(priorityUser.username);

          // Mark Priority 1 users as completed after first successful lookup
          if (priorityLevel === 1) {
            await PriorityLookupService.markCompleted(priorityUser.username);
            logger.info(`Priority 1 user completed: ${priorityUser.username}`);
          } else {
            // Update last_checked_at for Priority 2
            await PriorityLookupService.updateLastChecked(priorityUser.username);
          }

          // Rate limiting
          await this.sleep(DELAY_BETWEEN_REQUESTS);
        } else {
          logger.debug(`Priority ${priorityLevel} user not found in feed: ${priorityUser.username}`);
          // Still update last_checked_at to track when we looked
          await PriorityLookupService.updateLastChecked(priorityUser.username);
        }
      } catch (error) {
        logger.error(`Error processing priority ${priorityLevel} user`, {
          username: priorityUser.username,
          error,
        });
        this.stats.lastRunFailed++;
        this.stats.totalFailed++;
      }
    }

    logger.info(`Processed ${processedUsernames.size} Priority ${priorityLevel} users`);
  }

  /**
   * Process remaining users from cached feed (excluding already processed)
   */
  private async processRemainingUsers(allRooms: any[]): Promise<void> {
    // Get all priority usernames to skip them
    const allPriorityUsers = await PriorityLookupService.getAll();
    const priorityUsernames = new Set(
      allPriorityUsers.map(p => p.username.toLowerCase())
    );

    let processed = 0;

    for (let i = 0; i < allRooms.length && !this.isPaused; i++) {
      const room = allRooms[i];
      this.stats.progress = i + 1;
      this.stats.currentUsername = room.username;

      // Skip if this user was already processed as a priority user
      if (priorityUsernames.has(room.username.toLowerCase())) {
        continue;
      }

      try {
        await ProfileEnrichmentService.enrichFromAffiliateAPI(room.username);
        this.stats.lastRunEnriched++;
        this.stats.totalEnriched++;
        processed++;

        // Rate limiting
        await this.sleep(DELAY_BETWEEN_REQUESTS);
      } catch (error) {
        logger.error('Error enriching from cached feed', {
          username: room.username,
          error,
        });
        this.stats.lastRunFailed++;
        this.stats.totalFailed++;
      }
    }

    logger.info(`Processed ${processed} remaining users from cache`);
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
      currentUsername: null,
      progress: 0,
      total: 0,
    };
    logger.info('Affiliate polling job stats reset');
  }
}

export const affiliatePollingJob = new AffiliatePollingJob();

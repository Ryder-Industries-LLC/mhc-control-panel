import { PersonService } from '../services/person.service.js';
import { SnapshotService } from '../services/snapshot.service.js';
import { statbateClient } from '../api/statbate/client.js';
import { normalizeModelInfo, normalizeMemberInfo } from '../api/statbate/normalizer.js';
import { JobPersistenceService } from '../services/job-persistence.service.js';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

/**
 * Background job to refresh Statbate data for all persons
 * Runs periodically with rate limiting to avoid overwhelming the API
 */

const BATCH_SIZE = 5; // Process 5 persons at a time
const DELAY_BETWEEN_BATCHES = 30000; // 30 seconds between batches
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds between individual requests
const JOB_NAME = 'statbate-refresh';

export interface StatbateRefreshConfig {
  intervalMinutes: number;
  batchSize: number;
  delayBetweenBatches: number;
  delayBetweenRequests: number;
  maxPersonsPerRun: number;
  enabled: boolean;
  // Prioritization options (processed in order)
  prioritizeFollowing: boolean;
  prioritizeFollowers: boolean;
  prioritizeBanned: boolean;
  prioritizeWatchlist: boolean;
  prioritizeLive: boolean;
  prioritizeDoms: boolean;
  prioritizeFriends: boolean;
  prioritizeSubs: boolean;
  prioritizeTippedMe: boolean;
  prioritizeTippedByMe: boolean;
}

export class StatbateRefreshJob {
  private isRunning = false;
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: StatbateRefreshConfig = {
    intervalMinutes: 360,
    batchSize: BATCH_SIZE,
    delayBetweenBatches: DELAY_BETWEEN_BATCHES,
    delayBetweenRequests: DELAY_BETWEEN_REQUESTS,
    maxPersonsPerRun: 1000,
    enabled: true,
    prioritizeFollowing: true,
    prioritizeFollowers: false,
    prioritizeBanned: false,
    prioritizeWatchlist: true,
    prioritizeLive: false,
    prioritizeDoms: true,
    prioritizeFriends: true,
    prioritizeSubs: true,
    prioritizeTippedMe: true,
    prioritizeTippedByMe: false,
  };

  // Statistics
  private stats = {
    lastRun: null as Date | null,
    totalRuns: 0,
    currentRunRefreshed: 0,
    currentRunFailed: 0,
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
      logger.info('No persisted state found for statbate-refresh job');
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
      logger.info('Restoring statbate-refresh job to running state');
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
    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      intervalMinutes: this.config.intervalMinutes,
      config: this.config,
      stats: this.stats,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      lastRun: null,
      totalRuns: 0,
      currentRunRefreshed: 0,
      currentRunFailed: 0,
      currentUsername: null,
      progress: 0,
      total: 0,
    };
    logger.info('Statbate refresh job stats reset');
  }

  /**
   * Update job configuration
   */
  async updateConfig(config: Partial<StatbateRefreshConfig>) {
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

    logger.info('Statbate refresh job config updated', { config: this.config });

    // Restart if it was running
    if (wasRunning && this.config.enabled) {
      await this.start();
    }
  }

  /**
   * Start the background refresh job
   * @param intervalMinutes How often to run the full refresh (default: 6 hours)
   */
  async start(intervalMinutes?: number) {
    if (this.isRunning) {
      logger.warn('Statbate refresh job is already running');
      return;
    }

    if (intervalMinutes !== undefined) {
      this.config.intervalMinutes = intervalMinutes;
    }

    if (!this.config.enabled) {
      logger.warn('Statbate refresh job is disabled');
      return;
    }

    logger.info(`Starting Statbate refresh job (interval: ${this.config.intervalMinutes} minutes)`);
    this.isRunning = true;

    // Persist running state to database
    await JobPersistenceService.saveRunningState(JOB_NAME, true);

    // Run immediately on start
    this.runRefresh();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      if (!this.isProcessing) {
        this.runRefresh();
      }
    }, this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the background refresh job (updates database)
   */
  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.isProcessing = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, false);
    logger.info('Statbate refresh job stopped');
  }

  /**
   * Halt the refresh job without updating database
   * Used during graceful shutdown to preserve state for restart
   */
  async halt() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Don't update isRunning/isPaused or database - preserve state for restart
    logger.info('Statbate refresh job halted (state preserved)');
  }

  /**
   * Get prioritized list of persons to refresh based on config
   */
  private async getPrioritizedPersons(): Promise<any[]> {
    const seenIds = new Set<string>();
    const prioritized: any[] = [];
    const maxPersons = this.config.maxPersonsPerRun;

    // Helper to add persons without duplicates
    const addPersons = (persons: any[]) => {
      for (const person of persons) {
        if (!seenIds.has(person.id) && prioritized.length < maxPersons) {
          seenIds.add(person.id);
          prioritized.push(person);
        }
      }
    };

    // Process each priority segment in order
    if (this.config.prioritizeWatchlist) {
      const watchlist = await this.getWatchlistPersons();
      addPersons(watchlist);
      logger.debug(`Added ${watchlist.length} watchlist persons (total: ${prioritized.length})`);
    }

    if (this.config.prioritizeFollowing) {
      const following = await this.getFollowingPersons();
      addPersons(following);
      logger.debug(`Added following persons (total: ${prioritized.length})`);
    }

    if (this.config.prioritizeFollowers) {
      const followers = await this.getFollowerPersons();
      addPersons(followers);
      logger.debug(`Added follower persons (total: ${prioritized.length})`);
    }

    if (this.config.prioritizeBanned) {
      const banned = await this.getBannedPersons();
      addPersons(banned);
      logger.debug(`Added banned persons (total: ${prioritized.length})`);
    }

    if (this.config.prioritizeLive) {
      const live = await this.getLivePersons();
      addPersons(live);
      logger.debug(`Added live persons (total: ${prioritized.length})`);
    }

    if (this.config.prioritizeDoms) {
      const doms = await this.getDomPersons();
      addPersons(doms);
      logger.debug(`Added dom persons (total: ${prioritized.length})`);
    }

    if (this.config.prioritizeFriends) {
      const friends = await this.getFriendPersons();
      addPersons(friends);
      logger.debug(`Added friend persons (total: ${prioritized.length})`);
    }

    if (this.config.prioritizeSubs) {
      const subs = await this.getSubPersons();
      addPersons(subs);
      logger.debug(`Added sub persons (total: ${prioritized.length})`);
    }

    if (this.config.prioritizeTippedMe) {
      const tippedMe = await this.getTippedMePersons();
      addPersons(tippedMe);
      logger.debug(`Added tipped-me persons (total: ${prioritized.length})`);
    }

    if (this.config.prioritizeTippedByMe) {
      const tippedByMe = await this.getTippedByMePersons();
      addPersons(tippedByMe);
      logger.debug(`Added tipped-by-me persons (total: ${prioritized.length})`);
    }

    // Fill remaining slots with non-excluded persons
    if (prioritized.length < maxPersons) {
      const remaining = await PersonService.findAllNonExcluded(maxPersons - prioritized.length, 0);
      addPersons(remaining);
    }

    return prioritized;
  }

  /**
   * Get persons on watchlist
   */
  private async getWatchlistPersons(): Promise<any[]> {
    const result = await query(
      `SELECT p.* FROM persons p
       JOIN attribute_lookup al ON al.person_id = p.id AND al.attribute_key = 'watch_list' AND al.value = true
       WHERE p.is_excluded = false
       ORDER BY p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get persons I'm following
   */
  private async getFollowingPersons(): Promise<any[]> {
    const result = await query(
      `SELECT p.* FROM persons p
       JOIN profiles pr ON pr.person_id = p.id
       WHERE p.is_excluded = false AND pr.following = true
       ORDER BY p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get persons who are following me
   */
  private async getFollowerPersons(): Promise<any[]> {
    const result = await query(
      `SELECT p.* FROM persons p
       JOIN profiles pr ON pr.person_id = p.id
       WHERE p.is_excluded = false AND pr.follower = true
       ORDER BY p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get persons who banned me
   */
  private async getBannedPersons(): Promise<any[]> {
    const result = await query(
      `SELECT p.* FROM persons p
       JOIN attribute_lookup al ON al.person_id = p.id AND al.attribute_key = 'banned_me' AND al.value = true
       WHERE p.is_excluded = false
       ORDER BY p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get persons who are currently live
   */
  private async getLivePersons(): Promise<any[]> {
    const result = await query(
      `SELECT DISTINCT p.* FROM persons p
       JOIN affiliate_api_snapshots aas ON aas.person_id = p.id
       WHERE p.is_excluded = false
         AND aas.observed_at > NOW() - INTERVAL '10 minutes'
         AND aas.current_show IS NOT NULL
       ORDER BY p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get persons who are my doms (actively serving)
   */
  private async getDomPersons(): Promise<any[]> {
    const result = await query(
      `SELECT p.* FROM persons p
       JOIN profiles pr ON pr.person_id = p.id
       JOIN service_relationships sr ON sr.profile_id = pr.id
       WHERE p.is_excluded = false
         AND sr.service_role = 'dom'
         AND sr.service_level = 'Actively Serving'
       ORDER BY p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get persons who are friends (any tier)
   */
  private async getFriendPersons(): Promise<any[]> {
    const result = await query(
      `SELECT p.* FROM persons p
       JOIN profiles pr ON pr.person_id = p.id
       WHERE p.is_excluded = false AND pr.friend_tier IS NOT NULL
       ORDER BY pr.friend_tier ASC, p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get persons who are my subs (active)
   */
  private async getSubPersons(): Promise<any[]> {
    const result = await query(
      `SELECT p.* FROM persons p
       JOIN profiles pr ON pr.person_id = p.id
       WHERE p.is_excluded = false AND pr.active_sub = true
       ORDER BY p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get persons who have tipped me
   */
  private async getTippedMePersons(): Promise<any[]> {
    const result = await query(
      `SELECT DISTINCT p.* FROM persons p
       JOIN interactions i ON i.person_id = p.id
       WHERE p.is_excluded = false AND i.type = 'TIP_EVENT'
       ORDER BY p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get persons I have tipped (via recorded interactions where I'm the tipper)
   */
  private async getTippedByMePersons(): Promise<any[]> {
    // This would require tracking outbound tips - for now return empty
    // Most users won't have this data anyway
    return [];
  }

  /**
   * Run a full refresh cycle
   */
  private async runRefresh() {
    if (this.isProcessing) {
      logger.warn('Statbate refresh cycle already in progress, skipping');
      return;
    }

    try {
      this.isProcessing = true;
      logger.info('Starting Statbate refresh cycle');

      // Reset run stats
      this.stats.currentRunRefreshed = 0;
      this.stats.currentRunFailed = 0;
      this.stats.currentUsername = null;

      // Get prioritized persons
      const persons = await this.getPrioritizedPersons();
      this.stats.total = persons.length;
      this.stats.progress = 0;
      logger.info(`Found ${persons.length} persons to refresh (max: ${this.config.maxPersonsPerRun})`);

      // Process in batches
      const batchSize = this.config.batchSize;
      for (let i = 0; i < persons.length && this.isRunning; i += batchSize) {
        const batch = persons.slice(i, i + batchSize);
        await this.processBatch(batch);
        this.stats.progress = Math.min(i + batchSize, persons.length);

        // Wait between batches (except for the last one)
        if (i + batchSize < persons.length && this.isRunning) {
          logger.debug(`Waiting ${this.config.delayBetweenBatches / 1000}s before next batch...`);
          await this.sleep(this.config.delayBetweenBatches);
        }
      }

      // Update completion stats
      this.stats.totalRuns++;
      this.stats.lastRun = new Date();
      this.stats.currentUsername = null;

      logger.info('Statbate refresh cycle completed', {
        refreshed: this.stats.currentRunRefreshed,
        failed: this.stats.currentRunFailed,
      });
    } catch (error) {
      logger.error('Error in Statbate refresh cycle', { error });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a batch of persons
   */
  private async processBatch(batch: any[]) {
    for (const person of batch) {
      try {
        this.stats.currentUsername = person.username;
        const success = await this.refreshPerson(person);
        if (success) {
          this.stats.currentRunRefreshed++;
        } else {
          this.stats.currentRunFailed++;
        }
        await this.sleep(this.config.delayBetweenRequests);
      } catch (error) {
        this.stats.currentRunFailed++;
        logger.error('Error refreshing person', {
          personId: person.id,
          username: person.username,
          error
        });
      }
    }
  }

  /**
   * Refresh data for a single person
   * Now tries to fetch by username regardless of whether rid/did exists
   * @returns true if data was successfully fetched from either API
   */
  private async refreshPerson(person: any): Promise<boolean> {
    const role = person.role;

    // Try to fetch data based on role
    // For VIEWERS: try member API first, then model API
    // For MODEL or UNKNOWN: try model first, then member API
    if (role === 'VIEWER') {
      const memberSuccess = await this.fetchMemberData(person);
      if (memberSuccess) return true;
      return await this.fetchModelData(person);
    } else {
      // MODEL or UNKNOWN: try model first
      const modelSuccess = await this.fetchModelData(person);
      if (modelSuccess) return true;
      return await this.fetchMemberData(person);
    }
  }

  /**
   * Fetch model data from Statbate
   */
  private async fetchModelData(person: any): Promise<boolean> {
    try {
      const modelData = await statbateClient.getModelInfo('chaturbate', person.username);
      if (modelData) {
        const normalized = normalizeModelInfo(modelData.data);
        await SnapshotService.create({
          personId: person.id,
          source: 'statbate_model',
          rawPayload: modelData.data as unknown as Record<string, unknown>,
          normalizedMetrics: normalized,
        });

        // Update RID if available
        if (modelData.data.rid && !person.rid) {
          await PersonService.update(person.id, {
            rid: modelData.data.rid,
            role: 'MODEL'
          });
        }

        logger.debug(`Refreshed model data for ${person.username}`);
        return true;
      }
      return false;
    } catch (error) {
      // Don't log errors for 404s (person not found as model)
      if ((error as any)?.response?.status !== 404) {
        logger.debug(`Could not fetch model data for ${person.username}`);
      }
      return false;
    }
  }

  /**
   * Fetch member data from Statbate
   */
  private async fetchMemberData(person: any): Promise<boolean> {
    try {
      const memberData = await statbateClient.getMemberInfo('chaturbate', person.username);
      if (memberData) {
        const normalized = normalizeMemberInfo(memberData.data);
        await SnapshotService.create({
          personId: person.id,
          source: 'statbate_member',
          rawPayload: memberData.data as unknown as Record<string, unknown>,
          normalizedMetrics: normalized,
        });

        // Update DID if available
        if (memberData.data.did && !person.did) {
          await PersonService.update(person.id, {
            did: memberData.data.did,
            role: 'VIEWER'
          });
        }

        logger.debug(`Refreshed member data for ${person.username}`);
        return true;
      }
      return false;
    } catch (error) {
      // Don't log errors for 404s (person not found as member)
      if ((error as any)?.response?.status !== 404) {
        logger.debug(`Could not fetch member data for ${person.username}`);
      }
      return false;
    }
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const statbateRefreshJob = new StatbateRefreshJob();

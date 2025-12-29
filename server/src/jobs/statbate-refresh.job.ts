import { PersonService } from '../services/person.service.js';
import { SnapshotService } from '../services/snapshot.service.js';
import { statbateClient } from '../api/statbate/client.js';
import { normalizeModelInfo, normalizeMemberInfo } from '../api/statbate/normalizer.js';
import { JobPersistenceService } from '../services/job-persistence.service.js';
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
  enabled: boolean;
}

export class StatbateRefreshJob {
  private isRunning = false;
  private isPaused = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: StatbateRefreshConfig = {
    intervalMinutes: 360,
    batchSize: BATCH_SIZE,
    delayBetweenBatches: DELAY_BETWEEN_BATCHES,
    delayBetweenRequests: DELAY_BETWEEN_REQUESTS,
    enabled: true,
  };

  // Statistics
  private stats = {
    lastRun: null as Date | null,
    totalRuns: 0,
    totalRefreshed: 0,
    totalFailed: 0,
    lastRunRefreshed: 0,
    lastRunFailed: 0,
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
    if (state.is_running && !state.is_paused) {
      logger.info('Restoring statbate-refresh job to running state');
      await this.start();
      return true;
    } else if (state.is_running && state.is_paused) {
      logger.info('Restoring statbate-refresh job to paused state');
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
      intervalMinutes: this.config.intervalMinutes,
      config: this.config,
      stats: this.stats,
    };
  }

  /**
   * Update job configuration
   */
  async updateConfig(config: Partial<StatbateRefreshConfig>) {
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
    if (this.isRunning && !this.isPaused) {
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
    this.isPaused = false;

    // Persist running state to database
    await JobPersistenceService.saveRunningState(JOB_NAME, true, false);

    // Run immediately on start
    this.runRefresh();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      if (!this.isPaused) {
        this.runRefresh();
      }
    }, this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Pause the background refresh job
   */
  async pause() {
    if (!this.isRunning) {
      logger.warn('Statbate refresh job is not running');
      return;
    }
    this.isPaused = true;
    await JobPersistenceService.saveRunningState(JOB_NAME, true, true);
    logger.info('Statbate refresh job paused');
  }

  /**
   * Resume the background refresh job
   */
  async resume() {
    if (!this.isRunning) {
      logger.warn('Statbate refresh job is not running');
      return;
    }
    this.isPaused = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, true, false);
    logger.info('Statbate refresh job resumed');
  }

  /**
   * Stop the background refresh job
   */
  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, false, false);
    logger.info('Statbate refresh job stopped');
  }

  /**
   * Run a full refresh cycle
   */
  private async runRefresh() {
    try {
      logger.info('Starting Statbate refresh cycle');

      // Get all persons
      const persons = await PersonService.findAllNonExcluded(1000, 0);
      logger.info(`Found ${persons.length} persons to refresh`);

      // Process in batches
      for (let i = 0; i < persons.length; i += BATCH_SIZE) {
        const batch = persons.slice(i, i + BATCH_SIZE);
        await this.processBatch(batch);

        // Wait between batches (except for the last one)
        if (i + BATCH_SIZE < persons.length) {
          logger.info(`Waiting ${DELAY_BETWEEN_BATCHES / 1000}s before next batch...`);
          await this.sleep(DELAY_BETWEEN_BATCHES);
        }
      }

      logger.info('Statbate refresh cycle completed');
    } catch (error) {
      logger.error('Error in Statbate refresh cycle', { error });
    }
  }

  /**
   * Process a batch of persons
   */
  private async processBatch(batch: any[]) {
    for (const person of batch) {
      try {
        await this.refreshPerson(person);
        await this.sleep(DELAY_BETWEEN_REQUESTS);
      } catch (error) {
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
   */
  private async refreshPerson(person: any) {
    const username = person.username;
    const role = person.role;

    // Try to fetch data based on role
    if (role === 'MODEL' && person.rid) {
      await this.fetchModelData(person);
    } else if (role === 'VIEWER' && person.did) {
      await this.fetchMemberData(person);
    } else if (role === 'UNKNOWN') {
      // Try both
      const modelSuccess = await this.fetchModelData(person);
      if (!modelSuccess) {
        await this.fetchMemberData(person);
      }
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

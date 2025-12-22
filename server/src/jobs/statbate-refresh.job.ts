import { PersonService } from '../services/person.service.js';
import { SnapshotService } from '../services/snapshot.service.js';
import { statbateClient } from '../api/statbate/client.js';
import { normalizeModelInfo, normalizeMemberInfo } from '../api/statbate/normalizer.js';
import { logger } from '../config/logger.js';

/**
 * Background job to refresh Statbate data for all persons
 * Runs periodically with rate limiting to avoid overwhelming the API
 */

const BATCH_SIZE = 5; // Process 5 persons at a time
const DELAY_BETWEEN_BATCHES = 30000; // 30 seconds between batches
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds between individual requests

export class StatbateRefreshJob {
  private isRunning = false;
  private isPaused = false;
  private intervalId: NodeJS.Timeout | null = null;
  private intervalMinutes = 360;

  /**
   * Get job status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      intervalMinutes: this.intervalMinutes,
    };
  }

  /**
   * Start the background refresh job
   * @param intervalMinutes How often to run the full refresh (default: 6 hours)
   */
  start(intervalMinutes: number = 360) {
    if (this.isRunning && !this.isPaused) {
      logger.warn('Statbate refresh job is already running');
      return;
    }

    logger.info(`Starting Statbate refresh job (interval: ${intervalMinutes} minutes)`);
    this.isRunning = true;
    this.isPaused = false;
    this.intervalMinutes = intervalMinutes;

    // Run immediately on start
    this.runRefresh();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      if (!this.isPaused) {
        this.runRefresh();
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Pause the background refresh job
   */
  pause() {
    if (!this.isRunning) {
      logger.warn('Statbate refresh job is not running');
      return;
    }
    this.isPaused = true;
    logger.info('Statbate refresh job paused');
  }

  /**
   * Resume the background refresh job
   */
  resume() {
    if (!this.isRunning) {
      logger.warn('Statbate refresh job is not running');
      return;
    }
    this.isPaused = false;
    logger.info('Statbate refresh job resumed');
  }

  /**
   * Stop the background refresh job
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.isPaused = false;
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

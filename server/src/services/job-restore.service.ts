/**
 * Job Restore Service
 *
 * Initializes job state records and restores running jobs on server/worker startup.
 * Called during application bootstrap to ensure jobs that were running before
 * a container restart are automatically resumed.
 */

import { affiliatePollingJob } from '../jobs/affiliate-polling.job.js';
import { profileScrapeJob } from '../jobs/profile-scrape.job.js';
import { cbhoursPollingJob } from '../jobs/cbhours-polling.job.js';
import { statbateRefreshJob } from '../jobs/statbate-refresh.job.js';
import { logger } from '../config/logger.js';

export class JobRestoreService {
  /**
   * Initialize all job state records in the database
   * Should be called once on first run to create initial records
   */
  static async initializeAllJobs(): Promise<void> {
    logger.info('Initializing job state records in database');

    try {
      await Promise.all([
        affiliatePollingJob.init(),
        profileScrapeJob.init(),
        cbhoursPollingJob.init(),
        statbateRefreshJob.init(),
      ]);
      logger.info('All job state records initialized');
    } catch (error) {
      logger.error('Error initializing job state records', { error });
    }
  }

  /**
   * Restore all jobs to their previous running state
   * Should be called on server/worker startup after DB connection is established
   */
  static async restoreAllJobs(): Promise<{
    restored: string[];
    skipped: string[];
    failed: string[];
  }> {
    logger.info('Restoring job states from database');

    const restored: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];

    // Initialize job records first (ensures they exist)
    await this.initializeAllJobs();

    // Restore each job
    const jobs = [
      { name: 'affiliate-polling', job: affiliatePollingJob },
      { name: 'profile-scrape', job: profileScrapeJob },
      { name: 'cbhours-polling', job: cbhoursPollingJob },
      { name: 'statbate-refresh', job: statbateRefreshJob },
    ];

    for (const { name, job } of jobs) {
      try {
        const wasRestored = await job.restore();
        if (wasRestored) {
          restored.push(name);
          logger.info(`Job restored: ${name}`);
        } else {
          skipped.push(name);
          logger.debug(`Job not restored (was not running): ${name}`);
        }
      } catch (error) {
        failed.push(name);
        logger.error(`Failed to restore job: ${name}`, { error });
      }
    }

    logger.info('Job restoration complete', {
      restored: restored.length,
      skipped: skipped.length,
      failed: failed.length,
    });

    return { restored, skipped, failed };
  }

  /**
   * Stop all running jobs (for graceful shutdown)
   */
  static async stopAllJobs(): Promise<void> {
    logger.info('Stopping all jobs');

    await Promise.all([
      affiliatePollingJob.stop(),
      profileScrapeJob.stop(),
      cbhoursPollingJob.stop(),
      statbateRefreshJob.stop(),
    ]);

    logger.info('All jobs stopped');
  }
}

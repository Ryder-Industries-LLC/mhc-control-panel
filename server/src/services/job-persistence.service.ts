/**
 * Job Persistence Service
 *
 * Handles saving and loading job state from the database.
 * Enables jobs to persist their configuration and running state across container restarts.
 */

import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface JobState {
  job_name: string;
  is_running: boolean;
  is_paused: boolean;
  config: Record<string, any>;
  stats: Record<string, any>;
  last_started_at: Date | null;
  last_stopped_at: Date | null;
  last_run_at: Date | null;
}

export class JobPersistenceService {
  /**
   * Load job state from database
   */
  static async loadState(jobName: string): Promise<JobState | null> {
    try {
      const result = await query(
        `SELECT * FROM job_state WHERE job_name = $1`,
        [jobName]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as JobState;
    } catch (error) {
      logger.error('Failed to load job state', { jobName, error });
      return null;
    }
  }

  /**
   * Load all job states
   */
  static async loadAllStates(): Promise<JobState[]> {
    try {
      const result = await query(`SELECT * FROM job_state ORDER BY job_name`);
      return result.rows as JobState[];
    } catch (error) {
      logger.error('Failed to load all job states', { error });
      return [];
    }
  }

  /**
   * Save job running state
   */
  static async saveRunningState(
    jobName: string,
    isRunning: boolean,
    isPaused: boolean = false
  ): Promise<void> {
    try {
      const timestamp = isRunning ? 'last_started_at = NOW()' : 'last_stopped_at = NOW()';

      await query(
        `UPDATE job_state SET
          is_running = $2,
          is_paused = $3,
          ${timestamp}
         WHERE job_name = $1`,
        [jobName, isRunning, isPaused]
      );

      logger.info('Job running state saved', { jobName, isRunning, isPaused });
    } catch (error) {
      logger.error('Failed to save job running state', { jobName, error });
    }
  }

  /**
   * Save job configuration
   */
  static async saveConfig(
    jobName: string,
    config: Record<string, any>
  ): Promise<void> {
    try {
      await query(
        `UPDATE job_state SET config = $2 WHERE job_name = $1`,
        [jobName, JSON.stringify(config)]
      );

      logger.info('Job config saved', { jobName, config });
    } catch (error) {
      logger.error('Failed to save job config', { jobName, error });
    }
  }

  /**
   * Save job statistics
   */
  static async saveStats(
    jobName: string,
    stats: Record<string, any>
  ): Promise<void> {
    try {
      await query(
        `UPDATE job_state SET stats = $2, last_run_at = NOW() WHERE job_name = $1`,
        [jobName, JSON.stringify(stats)]
      );
    } catch (error) {
      logger.error('Failed to save job stats', { jobName, error });
    }
  }

  /**
   * Update last run timestamp
   */
  static async updateLastRun(jobName: string): Promise<void> {
    try {
      await query(
        `UPDATE job_state SET last_run_at = NOW() WHERE job_name = $1`,
        [jobName]
      );
    } catch (error) {
      logger.error('Failed to update last run', { jobName, error });
    }
  }

  /**
   * Get jobs that should be running (for startup restoration)
   */
  static async getJobsToRestore(): Promise<JobState[]> {
    try {
      const result = await query(
        `SELECT * FROM job_state WHERE is_running = true`
      );
      return result.rows as JobState[];
    } catch (error) {
      logger.error('Failed to get jobs to restore', { error });
      return [];
    }
  }

  /**
   * Ensure job state record exists (upsert)
   */
  static async ensureJobState(
    jobName: string,
    defaultConfig: Record<string, any>
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO job_state (job_name, config)
         VALUES ($1, $2)
         ON CONFLICT (job_name) DO NOTHING`,
        [jobName, JSON.stringify(defaultConfig)]
      );
    } catch (error) {
      logger.error('Failed to ensure job state', { jobName, error });
    }
  }
}

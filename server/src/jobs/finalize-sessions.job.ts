import { query } from '../db/client.js';
import { RollupsService } from '../services/rollups.service.js';
import { aiSummaryService } from '../services/ai-summary.service.js';
import { JobPersistenceService } from '../services/job-persistence.service.js';
import { logger } from '../config/logger.js';

/**
 * Background job to finalize broadcast sessions
 *
 * Runs every minute to:
 * 1. Find sessions that are past their finalize_at time
 * 2. Mark them as finalized
 * 3. Compute final rollups
 * 4. Generate AI summaries (if enabled)
 */

const JOB_NAME = 'finalize-sessions';

interface SessionToFinalize {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  last_event_at: Date;
  finalize_at: Date;
  ai_summary_status: string;
}

export interface FinalizeSessionsConfig {
  intervalMinutes: number;
  enabled: boolean;
  generateAiSummary: boolean;
}

export class FinalizeSessionsJob {
  private isRunning = false;
  private isPaused = false;
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: FinalizeSessionsConfig = {
    intervalMinutes: 1, // Check every minute
    enabled: true,
    generateAiSummary: true,
  };

  // Statistics
  private stats = {
    lastRun: null as Date | null,
    totalRuns: 0,
    totalFinalized: 0,
    totalSummariesGenerated: 0,
    lastRunFinalized: 0,
    lastRunSummaries: 0,
  };

  /**
   * Initialize job state in database
   */
  async init() {
    await JobPersistenceService.ensureJobState(JOB_NAME, this.config);
  }

  /**
   * Restore job state from database
   */
  async restore(): Promise<boolean> {
    const state = await JobPersistenceService.loadState(JOB_NAME);
    if (!state) {
      logger.info('No persisted state found for finalize-sessions job');
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
      logger.info('Restoring finalize-sessions job to running state');
      await this.start();
      return true;
    } else if (state.is_running && state.is_paused) {
      logger.info('Restoring finalize-sessions job to paused state');
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
  async updateConfig(config: Partial<FinalizeSessionsConfig>) {
    const wasRunning = this.isRunning && !this.isPaused;

    if (wasRunning) {
      await this.stop();
    }

    this.config = {
      ...this.config,
      ...config,
    };

    await JobPersistenceService.saveConfig(JOB_NAME, this.config);
    logger.info('Finalize sessions job config updated', { config: this.config });

    if (wasRunning && this.config.enabled) {
      await this.start();
    }
  }

  /**
   * Start the job
   */
  async start() {
    if (this.isRunning && !this.isPaused) {
      logger.warn('Finalize sessions job is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.warn('Finalize sessions job is disabled');
      return;
    }

    logger.info('Starting finalize sessions job', {
      intervalMinutes: this.config.intervalMinutes,
      generateAiSummary: this.config.generateAiSummary,
    });

    this.isRunning = true;
    this.isPaused = false;

    await JobPersistenceService.saveRunningState(JOB_NAME, true, false);

    // Run immediately on start
    this.runFinalize();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      if (!this.isPaused) {
        this.runFinalize();
      }
    }, this.config.intervalMinutes * 60 * 1000);
  }

  /**
   * Pause the job
   */
  async pause() {
    if (!this.isRunning) {
      logger.warn('Finalize sessions job is not running');
      return;
    }
    this.isPaused = true;
    await JobPersistenceService.saveRunningState(JOB_NAME, true, true);
    logger.info('Finalize sessions job paused');
  }

  /**
   * Resume the job
   */
  async resume() {
    if (!this.isRunning) {
      logger.warn('Finalize sessions job is not running');
      return;
    }
    this.isPaused = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, true, false);
    logger.info('Finalize sessions job resumed');
  }

  /**
   * Stop the job
   */
  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    await JobPersistenceService.saveRunningState(JOB_NAME, false, false);
    logger.info('Finalize sessions job stopped');
  }

  /**
   * Halt without updating database state
   */
  async halt() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('Finalize sessions job halted (state preserved)');
  }

  /**
   * Run a single finalization cycle
   */
  private async runFinalize() {
    if (this.isProcessing) {
      logger.debug('Finalize sessions job is already processing');
      return;
    }

    try {
      this.isProcessing = true;
      this.stats.lastRunFinalized = 0;
      this.stats.lastRunSummaries = 0;

      // Find sessions ready to finalize
      const sessionsResult = await query<SessionToFinalize>(
        `SELECT id, started_at, ended_at, last_event_at, finalize_at, ai_summary_status
         FROM broadcast_sessions_v2
         WHERE status = 'pending_finalize'
           AND finalize_at <= NOW()
         ORDER BY finalize_at ASC
         LIMIT 10`
      );

      if (sessionsResult.rows.length === 0) {
        logger.debug('No sessions to finalize');
        return;
      }

      logger.info(`Found ${sessionsResult.rows.length} sessions to finalize`);

      for (const session of sessionsResult.rows) {
        await this.finalizeSession(session);
      }

      this.stats.lastRun = new Date();
      this.stats.totalRuns++;

      logger.info('Finalize sessions cycle completed', {
        finalized: this.stats.lastRunFinalized,
        summaries: this.stats.lastRunSummaries,
      });
    } catch (error) {
      logger.error('Error in finalize sessions cycle', { error });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Finalize a single session
   */
  private async finalizeSession(session: SessionToFinalize) {
    logger.info(`Finalizing session ${session.id}`, {
      startedAt: session.started_at.toISOString(),
    });

    try {
      // 1. Mark as finalized
      await query(
        `UPDATE broadcast_sessions_v2
         SET status = 'finalized', updated_at = NOW()
         WHERE id = $1`,
        [session.id]
      );

      // 2. Compute final rollups
      const rollups = await RollupsService.computeAndUpdateSession(session.id);
      logger.info(`Session ${session.id} rollups computed`, {
        tokens: rollups.total_tokens,
        followers: rollups.followers_gained,
        peakViewers: rollups.peak_viewers,
      });

      this.stats.lastRunFinalized++;
      this.stats.totalFinalized++;

      // 3. Generate AI summary if enabled and not already generated
      if (this.config.generateAiSummary && aiSummaryService.isAvailable()) {
        if (session.ai_summary_status === 'pending') {
          await this.generateSummary(session.id);
        }
      }
    } catch (error) {
      logger.error(`Error finalizing session ${session.id}`, { error });
    }
  }

  /**
   * Generate AI summary for a session
   */
  private async generateSummary(sessionId: string) {
    try {
      // Mark as generating
      await query(
        `UPDATE broadcast_sessions_v2 SET ai_summary_status = 'generating' WHERE id = $1`,
        [sessionId]
      );

      // Get chat messages for this session
      const chatResult = await query<{ content: string; username: string }>(
        `SELECT
           raw_event->'message'->>'message' as content,
           raw_event->'user'->>'username' as username
         FROM event_logs
         WHERE session_id = $1 AND method = 'chatMessage'
         ORDER BY timestamp
         LIMIT 1000`,
        [sessionId]
      );

      if (chatResult.rows.length === 0) {
        await query(
          `UPDATE broadcast_sessions_v2
           SET ai_summary_status = 'failed', ai_summary = 'No chat messages found'
           WHERE id = $1`,
          [sessionId]
        );
        return;
      }

      // Build transcript
      const transcript = chatResult.rows
        .map(m => `[${m.username}] ${m.content}`)
        .join('\n');

      // Generate summary
      const result = await aiSummaryService.generatePreview(transcript);

      // Save summary
      await query(
        `UPDATE broadcast_sessions_v2
         SET ai_summary = $2,
             ai_summary_status = 'generated',
             ai_summary_generated_at = NOW()
         WHERE id = $1`,
        [sessionId, result.summary]
      );

      this.stats.lastRunSummaries++;
      this.stats.totalSummariesGenerated++;
      logger.info(`AI summary generated for session ${sessionId}`);
    } catch (error) {
      logger.error(`Error generating AI summary for session ${sessionId}`, { error });
      await query(
        `UPDATE broadcast_sessions_v2 SET ai_summary_status = 'failed' WHERE id = $1`,
        [sessionId]
      ).catch(() => {});
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      lastRun: null,
      totalRuns: 0,
      totalFinalized: 0,
      totalSummariesGenerated: 0,
      lastRunFinalized: 0,
      lastRunSummaries: 0,
    };
    logger.info('Finalize sessions job stats reset');
  }
}

export const finalizeSessionsJob = new FinalizeSessionsJob();

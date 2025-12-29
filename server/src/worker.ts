import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { chaturbateEventsClient } from './api/chaturbate/events-client.js';
import { JobRestoreService } from './services/job-restore.service.js';

/**
 * Worker process for Chaturbate Events API listener and background jobs
 * Run with RUN_MODE=worker
 */

async function startWorker() {
  logger.info('Starting MHC Control Panel Worker');
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Broadcaster: ${env.CHATURBATE_USERNAME}`);

  // Handle graceful shutdown
  // IMPORTANT: Don't call stopAllJobs() here - we want jobs to remain marked as "running"
  // in the database so they auto-restore on the next startup. Only stop the internal timers.
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    chaturbateEventsClient.stop();
    await JobRestoreService.haltAllJobs(); // Halt timers but preserve running state in DB
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    chaturbateEventsClient.stop();
    await JobRestoreService.haltAllJobs(); // Halt timers but preserve running state in DB
    process.exit(0);
  });

  // Restore background jobs from persisted state BEFORE starting events listener
  // This ensures jobs that were running before container restart are automatically resumed
  try {
    const { restored, skipped, failed } = await JobRestoreService.restoreAllJobs();
    logger.info('Background jobs restoration summary', { restored, skipped, failed });
  } catch (error) {
    logger.error('Failed to restore background jobs', { error });
  }

  // Start listening to events (this is a long-running blocking call)
  try {
    await chaturbateEventsClient.start();
  } catch (error) {
    logger.error('Worker failed to start', { error });
    process.exit(1);
  }
}

startWorker();

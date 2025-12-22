import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { chaturbateEventsClient } from './api/chaturbate/events-client.js';
import { statbateRefreshJob } from './jobs/statbate-refresh.job.js';

/**
 * Worker process for Chaturbate Events API listener and background jobs
 * Run with RUN_MODE=worker
 */

async function startWorker() {
  logger.info('Starting MHC Control Panel Worker');
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Broadcaster: ${env.CHATURBATE_USERNAME}`);

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    chaturbateEventsClient.stop();
    statbateRefreshJob.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    chaturbateEventsClient.stop();
    statbateRefreshJob.stop();
    process.exit(0);
  });

  // Start listening to events
  try {
    await chaturbateEventsClient.start();
  } catch (error) {
    logger.error('Worker failed to start', { error });
    process.exit(1);
  }

  // Start background jobs
  // Refresh Statbate data every 6 hours with rate limiting (5 persons per batch, 30s between batches)
  statbateRefreshJob.start(360);
}

startWorker();

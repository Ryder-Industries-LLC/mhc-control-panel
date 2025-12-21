import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { chaturbateEventsClient } from './api/chaturbate/events-client.js';

/**
 * Worker process for Chaturbate Events API listener
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
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    chaturbateEventsClient.stop();
    process.exit(0);
  });

  // Start listening to events
  try {
    await chaturbateEventsClient.start();
  } catch (error) {
    logger.error('Worker failed to start', { error });
    process.exit(1);
  }
}

startWorker();

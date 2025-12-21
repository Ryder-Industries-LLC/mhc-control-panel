import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createApp } from './app.js';
import { disconnect } from './db/client.js';

/**
 * Main web server entry point
 * Run with RUN_MODE=web
 */

async function startServer() {
  logger.info('Starting MHC Control Panel Server');
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Run Mode: ${env.RUN_MODE}`);

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`);
    logger.info(`Health check: http://localhost:${env.PORT}/health`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');

    server.close(async () => {
      logger.info('HTTP server closed');
      await disconnect();
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (env.RUN_MODE === 'web') {
  startServer().catch((error) => {
    logger.error('Failed to start server', { error });
    process.exit(1);
  });
} else {
  logger.warn(`RUN_MODE is ${env.RUN_MODE}, not starting web server`);
}

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { logger } from './config/logger.js';
import { ImageStorageService } from './services/image-storage.service.js';

// Import routes
import lookupRoutes from './routes/lookup.js';
import personRoutes from './routes/person.js';
import sessionRoutes from './routes/session.js';
import hudsonRoutes from './routes/hudson.js';
import jobRoutes from './routes/job.js';
import eventsRoutes from './routes/events.js';
import insightsRoutes from './routes/insights.js';
import profileRoutes from './routes/profile.js';
import affiliateRoutes from './routes/affiliate.js';
import followersRoutes from './routes/followers.js';
import systemRoutes from './routes/system.js';
import broadcastsRoutes from './routes/broadcasts.js';

export function createApp() {
  const app = express();

  // Initialize image storage
  ImageStorageService.init().catch((error) => {
    logger.error('Failed to initialize image storage', { error });
  });

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve static images
  const imagesPath = path.join(process.cwd(), 'data', 'images');
  app.use('/images', express.static(imagesPath));
  logger.info('Serving static images from', { path: imagesPath });

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`, {
      query: req.query,
      body: Object.keys(req.body).length > 0 ? '(has body)' : undefined,
    });
    next();
  });

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/lookup', lookupRoutes);
  app.use('/api/person', personRoutes);
  app.use('/api/session', sessionRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/hudson', hudsonRoutes);
  app.use('/api/job', jobRoutes);
  app.use('/api/events', eventsRoutes);
  app.use('/api/insights', insightsRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/affiliate', affiliateRoutes);
  app.use('/api/followers', followersRoutes);
  app.use('/api/system', systemRoutes);
  app.use('/api/broadcasts', broadcastsRoutes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: _req.path,
    });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

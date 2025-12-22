import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { logger } from './config/logger.js';

// Import routes
import lookupRoutes from './routes/lookup.js';
import personRoutes from './routes/person.js';
import sessionRoutes from './routes/session.js';
import hudsonRoutes from './routes/hudson.js';
import jobRoutes from './routes/job.js';
import eventsRoutes from './routes/events.js';
import insightsRoutes from './routes/insights.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

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

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { logger } from './config/logger.js';
import { storageService } from './services/storage/storage.service.js';

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
import roomPresenceRoutes from './routes/room-presence.js';
import visitorsRoutes from './routes/visitors.js';
import relationshipRoutes from './routes/relationship.js';
import sessionsV2Routes from './routes/sessions-v2.js';
import settingsRoutes from './routes/settings.js';
import inboxRoutes from './routes/inbox.js';
import storageRoutes from './routes/storage.js';

export function createApp() {
  const app = express();

  // Initialize storage service
  storageService.init().catch((error) => {
    logger.error('Failed to initialize storage service', { error });
  });

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Storage paths
  const ssdImagesPath = '/mnt/ssd/mhc-images';
  const dockerImagesPath = path.join(process.cwd(), 'data', 'images');

  // Primary image route - tries SSD first, then Docker for legacy files
  // This allows migration to happen transparently
  app.use('/images', (req, res, next) => {
    const relativePath = req.path;
    const ssdFullPath = path.join(ssdImagesPath, relativePath);
    const dockerFullPath = path.join(dockerImagesPath, relativePath);
    const profilesDockerPath = path.join(dockerImagesPath, 'profiles', relativePath);

    // Try SSD first (new primary storage)
    if (fs.existsSync(ssdFullPath)) {
      return express.static(ssdImagesPath)(req, res, next);
    }

    // Try Docker volume (legacy storage during migration)
    if (fs.existsSync(dockerFullPath)) {
      return express.static(dockerImagesPath)(req, res, next);
    }

    // Try profiles subdirectory in Docker
    if (fs.existsSync(profilesDockerPath)) {
      req.url = '/profiles' + req.url;
      return express.static(dockerImagesPath)(req, res, next);
    }

    // File not found in any location
    res.status(404).json({ error: 'Image not found' });
  });

  logger.info('Serving images with SSD-first fallback', {
    ssd: ssdImagesPath,
    docker: dockerImagesPath,
  });

  // Legacy /ssd-images route - redirect to /images for backward compatibility
  app.use('/ssd-images', (req, res) => {
    res.redirect(301, `/images${req.path}`);
  });
  logger.info('Legacy /ssd-images redirects to /images');

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
  app.use('/api/room/presence', roomPresenceRoutes);
  app.use('/api/visitors', visitorsRoutes);
  app.use('/api/relationship', relationshipRoutes);
  app.use('/api/sessions-v2', sessionsV2Routes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/inbox', inboxRoutes);
  app.use('/api/storage', storageRoutes);

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

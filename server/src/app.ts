import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { logger } from './config/logger.js';
import { storageService } from './services/storage/storage.service.js';

// Import auth middleware
import { loadSession, checkTrustedDevice } from './middleware/auth.middleware.js';
import { provideCsrfToken } from './middleware/csrf.middleware.js';

// Import routes
import authRoutes from './routes/auth.js';
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
  app.use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? process.env.FRONTEND_URL || true
      : true,
    credentials: true // Allow cookies to be sent
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Auth middleware - load session for all requests
  app.use(loadSession);
  app.use(checkTrustedDevice);
  app.use(provideCsrfToken);

  // Primary image route - S3 primary, Docker fallback for legacy paths
  app.use('/images', async (req, res, _next) => {
    const relativePath = req.path.startsWith('/') ? req.path.slice(1) : req.path;

    // Ensure storage service is initialized
    await storageService.init();

    // Check if this looks like a legacy UUID path (UUID/filename format)
    const isLegacyUuidPath = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(relativePath);

    // S3 is the primary storage location
    try {
      const s3Provider = storageService.getS3Provider();
      if (s3Provider && !isLegacyUuidPath) {
        // For non-legacy paths, try S3 first
        const presignedUrl = await s3Provider.getPresignedUrl(relativePath);
        if (presignedUrl) {
          return res.redirect(302, presignedUrl);
        }
      }
    } catch (error) {
      logger.debug('S3 lookup failed for image', { path: relativePath, error });
    }

    // Fallback to Docker volume for legacy UUID paths or if S3 fails
    if (isLegacyUuidPath) {
      const dockerProvider = storageService.getDockerProvider();
      if (dockerProvider) {
        const result = await dockerProvider.read(relativePath);
        if (result) {
          res.set('Content-Type', result.mimeType);
          res.set('Content-Length', result.size.toString());
          res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
          return res.send(result.data);
        }
      }
    }

    // Not found
    res.status(404).json({ error: 'Image not found' });
  });

  logger.info('Serving images from S3 (primary) with Docker fallback for legacy paths');

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
  // Auth routes (public - no auth required for login/signup)
  app.use('/api/auth', authRoutes);

  // Protected routes (auth will be enforced as we migrate)
  // TODO: Add requireAuth middleware to these routes once frontend auth is complete
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

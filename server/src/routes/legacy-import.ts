/**
 * Legacy Image Import API Routes
 *
 * Endpoints for importing orphaned images from SSD and S3 into the database.
 */

import { Router, Request, Response } from 'express';
import { LegacyImageImportService } from '../services/legacy-image-import.service.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/legacy-import/baseline
 * Get baseline counts before import
 */
router.get('/baseline', async (_req: Request, res: Response) => {
  try {
    const baseline = await LegacyImageImportService.getBaselineCounts();
    res.json({ success: true, data: baseline });
  } catch (error) {
    logger.error('[LegacyImport] Error getting baseline:', error);
    res.status(500).json({ success: false, error: 'Failed to get baseline counts' });
  }
});

/**
 * GET /api/legacy-import/ssd-orphans
 * Find orphan files on SSD
 */
router.get('/ssd-orphans', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const result = await LegacyImageImportService.findSSDOrphans(limit);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[LegacyImport] Error finding SSD orphans:', error);
    res.status(500).json({ success: false, error: 'Failed to find SSD orphans' });
  }
});

/**
 * POST /api/legacy-import/ssd
 * Import SSD orphan files into database
 */
router.post('/ssd', async (req: Request, res: Response) => {
  try {
    const dryRun = req.body.dryRun !== false;
    const batchSize = parseInt(req.body.batchSize) || 1000;
    const result = await LegacyImageImportService.importSSDOrphans(dryRun, batchSize);
    res.json({ success: result.success, dryRun, data: result });
  } catch (error) {
    logger.error('[LegacyImport] Error importing SSD:', error);
    res.status(500).json({ success: false, error: 'Failed to import SSD files' });
  }
});

/**
 * GET /api/legacy-import/s3-audit
 * Audit S3 for untracked objects
 */
router.get('/s3-audit', async (req: Request, res: Response) => {
  try {
    const maxObjects = parseInt(req.query.maxObjects as string) || 10000;
    const result = await LegacyImageImportService.auditS3Objects(maxObjects);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[LegacyImport] Error auditing S3:', error);
    res.status(500).json({ success: false, error: 'Failed to audit S3' });
  }
});

/**
 * POST /api/legacy-import/s3
 * Import S3 untracked objects into database
 */
router.post('/s3', async (req: Request, res: Response) => {
  try {
    const dryRun = req.body.dryRun !== false;
    const maxObjects = parseInt(req.body.maxObjects) || 10000;
    const result = await LegacyImageImportService.importS3Untracked(dryRun, maxObjects);
    res.json({ success: result.success, dryRun, data: result });
  } catch (error) {
    logger.error('[LegacyImport] Error importing S3:', error);
    res.status(500).json({ success: false, error: 'Failed to import S3 objects' });
  }
});

/**
 * POST /api/legacy-import/migrate-ssd-to-s3
 * Migrate SSD files to S3
 */
router.post('/migrate-ssd-to-s3', async (req: Request, res: Response) => {
  try {
    const dryRun = req.body.dryRun !== false;
    const batchSize = parseInt(req.body.batchSize) || 500;
    const result = await LegacyImageImportService.migrateSSDToS3(dryRun, batchSize);
    res.json({ success: result.success, dryRun, data: result });
  } catch (error) {
    logger.error('[LegacyImport] Error migrating SSD to S3:', error);
    res.status(500).json({ success: false, error: 'Failed to migrate SSD to S3' });
  }
});

/**
 * POST /api/legacy-import/cleanup-ssd
 * Clean up SSD files that have been migrated
 */
router.post('/cleanup-ssd', async (req: Request, res: Response) => {
  try {
    const dryRun = req.body.dryRun !== false;
    const result = await LegacyImageImportService.cleanupMigratedSSD(dryRun);
    res.json({ success: result.success, dryRun, data: result });
  } catch (error) {
    logger.error('[LegacyImport] Error cleaning up SSD:', error);
    res.status(500).json({ success: false, error: 'Failed to cleanup SSD' });
  }
});

/**
 * POST /api/legacy-import/cleanup-s3-duplicates
 * Clean up duplicate S3 objects (flat files that are duplicates of people/... paths)
 */
router.post('/cleanup-s3-duplicates', async (req: Request, res: Response) => {
  try {
    const dryRun = req.body.dryRun !== false;
    const maxObjects = parseInt(req.body.maxObjects) || 100000;
    const result = await LegacyImageImportService.cleanupS3Duplicates(dryRun, maxObjects);
    res.json({ success: result.success, dryRun, data: result });
  } catch (error) {
    logger.error('[LegacyImport] Error cleaning up S3 duplicates:', error);
    res.status(500).json({ success: false, error: 'Failed to cleanup S3 duplicates' });
  }
});

export default router;

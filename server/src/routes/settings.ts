import { Router, Request, Response } from 'express';
import { SettingsService } from '../services/settings.service.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/settings
 * Get all application settings
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await SettingsService.getAll();

    // Format settings as key-value object
    const formatted: Record<string, any> = {};
    for (const setting of settings) {
      formatted[setting.key] = {
        value: setting.value,
        description: setting.description,
        updatedAt: setting.updated_at,
      };
    }

    res.json(formatted);
  } catch (error) {
    logger.error('Error fetching settings', { error });
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * GET /api/settings/:key
 * Get a specific setting
 */
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const value = await SettingsService.get(key);

    if (value === null) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ key, value });
  } catch (error) {
    logger.error('Error fetching setting', { error, key: req.params.key });
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

/**
 * PUT /api/settings/:key
 * Update a setting
 */
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const setting = await SettingsService.set(key, value, description);
    res.json({
      key: setting.key,
      value: setting.value,
      description: setting.description,
      updatedAt: setting.updated_at,
    });
  } catch (error) {
    logger.error('Error updating setting', { error, key: req.params.key });
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

/**
 * DELETE /api/settings/:key
 * Delete a setting
 */
router.delete('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const deleted = await SettingsService.delete(key);

    if (!deleted) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting setting', { error, key: req.params.key });
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

/**
 * GET /api/settings/broadcast/config
 * Get broadcast-specific configuration
 */
router.get('/broadcast/config', async (_req: Request, res: Response) => {
  try {
    const mergeGap = await SettingsService.getBroadcastMergeGapMinutes();
    const summaryDelay = await SettingsService.getEffectiveSummaryDelayMinutes();
    const aiDelay = await SettingsService.getAISummaryDelayMinutes();

    res.json({
      mergeGapMinutes: mergeGap,
      summaryDelayMinutes: summaryDelay,
      aiSummaryDelayMinutes: aiDelay,
      aiSummaryDelayIsCustom: aiDelay !== null,
    });
  } catch (error) {
    logger.error('Error fetching broadcast config', { error });
    res.status(500).json({ error: 'Failed to fetch broadcast config' });
  }
});

export default router;

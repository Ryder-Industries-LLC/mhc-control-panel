import { Router, Request, Response } from 'express';
import { InsightsService } from '../services/insights.service.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/insights/:username
 * Get aggregated insights data for a broadcaster
 */
router.get('/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const {
      analysisWindowDays = 90,
      includeDetailedViewerAnalysis = true,
    } = req.query;

    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    logger.info(`Fetching insights for ${username}`);

    const insightsData = await InsightsService.aggregateBroadcasterData(username, {
      analysisWindowDays: parseInt(analysisWindowDays as string, 10),
      includeDetailedViewerAnalysis: includeDetailedViewerAnalysis === 'true',
    });

    if (!insightsData) {
      return res.status(404).json({ error: 'No data found for broadcaster' });
    }

    res.json(insightsData);
  } catch (error) {
    logger.error('Error fetching insights', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/insights/:username/generate-report
 * Generate AI-powered insights report (placeholder for now)
 */
router.post('/:username/generate-report', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    logger.info(`Generating insights report for ${username}`);

    // TODO: Implement OpenAI integration
    res.status(501).json({
      message: 'Report generation coming soon',
      placeholder: 'This will generate a PDF report with AI-powered recommendations',
    });
  } catch (error) {
    logger.error('Error generating report', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

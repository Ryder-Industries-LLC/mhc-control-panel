import { Router, Request, Response } from 'express';
import { MyBroadcastService } from '../services/my-broadcast.service.js';
import { aiSummaryService } from '../services/ai-summary.service.js';
import { summaryDataCollectorService } from '../services/summary-data-collector.service.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/broadcasts
 * Get all broadcasts with pagination
 * Returns: { broadcasts: [], total: number, hasMore: boolean }
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = '20', offset = '0' } = req.query;
    const result = await MyBroadcastService.getAllWithCount({
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
    res.json(result);
  } catch (error) {
    logger.error('Error fetching broadcasts', { error });
    res.status(500).json({ error: 'Failed to fetch broadcasts' });
  }
});

/**
 * GET /api/broadcasts/stats
 * Get broadcast statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const stats = await MyBroadcastService.getStats(parseInt(days as string, 10));
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching broadcast stats', { error });
    res.status(500).json({ error: 'Failed to fetch broadcast stats' });
  }
});

/**
 * GET /api/broadcasts/current
 * Get current active broadcast
 */
router.get('/current', async (_req: Request, res: Response) => {
  try {
    const broadcast = await MyBroadcastService.getCurrentBroadcast();
    res.json(broadcast);
  } catch (error) {
    logger.error('Error fetching current broadcast', { error });
    res.status(500).json({ error: 'Failed to fetch current broadcast' });
  }
});

/**
 * GET /api/broadcasts/:id
 * Get a specific broadcast
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const broadcast = await MyBroadcastService.getById(req.params.id);
    if (!broadcast) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }
    res.json(broadcast);
  } catch (error) {
    logger.error('Error fetching broadcast', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch broadcast' });
  }
});

/**
 * POST /api/broadcasts
 * Create a new broadcast (manual start)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      started_at,
      ended_at,
      duration_minutes,
      peak_viewers,
      total_tokens,
      followers_gained,
      summary,
      notes,
      tags,
      room_subject,
      auto_detected = false,
      source = 'manual',
    } = req.body;

    const broadcast = await MyBroadcastService.create({
      started_at: started_at ? new Date(started_at) : new Date(),
      ended_at: ended_at ? new Date(ended_at) : undefined,
      duration_minutes,
      peak_viewers,
      total_tokens,
      followers_gained,
      summary,
      notes,
      tags,
      room_subject,
      auto_detected,
      source,
    });

    res.status(201).json(broadcast);
  } catch (error) {
    logger.error('Error creating broadcast', { error });
    res.status(500).json({ error: 'Failed to create broadcast' });
  }
});

/**
 * PUT /api/broadcasts/:id
 * Update a broadcast
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const {
      started_at,
      ended_at,
      duration_minutes,
      peak_viewers,
      total_tokens,
      followers_gained,
      summary,
      notes,
      tags,
      room_subject,
    } = req.body;

    const broadcast = await MyBroadcastService.update(req.params.id, {
      started_at: started_at ? new Date(started_at) : undefined,
      ended_at: ended_at ? new Date(ended_at) : undefined,
      duration_minutes,
      peak_viewers,
      total_tokens,
      followers_gained,
      summary,
      notes,
      tags,
      room_subject,
    });

    if (!broadcast) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    res.json(broadcast);
  } catch (error) {
    logger.error('Error updating broadcast', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to update broadcast' });
  }
});

/**
 * POST /api/broadcasts/:id/end
 * End a broadcast
 */
router.post('/:id/end', async (req: Request, res: Response) => {
  try {
    const { peak_viewers, total_tokens, followers_gained } = req.body;

    const broadcast = await MyBroadcastService.endBroadcast(req.params.id, {
      peak_viewers,
      total_tokens,
      followers_gained,
    });

    if (!broadcast) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    res.json(broadcast);
  } catch (error) {
    logger.error('Error ending broadcast', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to end broadcast' });
  }
});

/**
 * POST /api/broadcasts/merge
 * Merge two broadcasts
 */
router.post('/merge', async (req: Request, res: Response) => {
  try {
    const { id1, id2 } = req.body;

    if (!id1 || !id2) {
      return res.status(400).json({ error: 'Both id1 and id2 are required' });
    }

    const merged = await MyBroadcastService.mergeBroadcasts(id1, id2);

    if (!merged) {
      return res.status(404).json({ error: 'One or both broadcasts not found' });
    }

    res.json(merged);
  } catch (error) {
    logger.error('Error merging broadcasts', { error });
    res.status(500).json({ error: 'Failed to merge broadcasts' });
  }
});

/**
 * DELETE /api/broadcasts/:id
 * Delete a broadcast
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await MyBroadcastService.delete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting broadcast', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to delete broadcast' });
  }
});

// ============================================
// AI Summary Endpoints
// ============================================

/**
 * GET /api/broadcasts/ai/status
 * Check if AI summary generation is available
 */
router.get('/ai/status', async (_req: Request, res: Response) => {
  res.json({
    available: aiSummaryService.isAvailable(),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  });
});

/**
 * POST /api/broadcasts/ai/preview
 * Generate a preview summary without saving to database
 * Used for analyzing other broadcasters' transcripts
 */
router.post('/ai/preview', async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    if (!aiSummaryService.isAvailable()) {
      return res.status(503).json({ error: 'AI summary service is not configured' });
    }

    const result = await aiSummaryService.generatePreview(transcript);
    res.json(result);
  } catch (error) {
    logger.error('Error generating preview summary', { error });
    res.status(500).json({ error: 'Failed to generate preview summary' });
  }
});

/**
 * GET /api/broadcasts/:id/summary
 * Get the AI summary for a broadcast
 */
router.get('/:id/summary', async (req: Request, res: Response) => {
  try {
    const summary = await summaryDataCollectorService.getSummaryByBroadcastId(req.params.id);
    if (!summary) {
      return res.status(404).json({ error: 'Summary not found' });
    }
    res.json(summary);
  } catch (error) {
    logger.error('Error fetching summary', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

/**
 * POST /api/broadcasts/:id/summary/generate
 * Generate an AI summary for a broadcast
 */
router.post('/:id/summary/generate', async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    if (!aiSummaryService.isAvailable()) {
      return res.status(503).json({ error: 'AI summary service is not configured' });
    }

    // Verify broadcast exists
    const broadcast = await MyBroadcastService.getById(req.params.id);
    if (!broadcast) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    const summary = await aiSummaryService.generateSummary(req.params.id, transcript);
    res.json(summary);
  } catch (error) {
    logger.error('Error generating summary', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

/**
 * POST /api/broadcasts/:id/summary/regenerate
 * Regenerate summary using stored transcript
 */
router.post('/:id/summary/regenerate', async (req: Request, res: Response) => {
  try {
    if (!aiSummaryService.isAvailable()) {
      return res.status(503).json({ error: 'AI summary service is not configured' });
    }

    const summary = await aiSummaryService.regenerateSummary(req.params.id);
    res.json(summary);
  } catch (error) {
    logger.error('Error regenerating summary', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to regenerate summary' });
  }
});

/**
 * PUT /api/broadcasts/:id/summary
 * Update a summary (manual edits)
 */
router.put('/:id/summary', async (req: Request, res: Response) => {
  try {
    const summary = await summaryDataCollectorService.updateSummary(req.params.id, req.body);
    if (!summary) {
      return res.status(404).json({ error: 'Summary not found' });
    }
    res.json(summary);
  } catch (error) {
    logger.error('Error updating summary', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to update summary' });
  }
});

/**
 * DELETE /api/broadcasts/:id/summary
 * Delete a summary
 */
router.delete('/:id/summary', async (req: Request, res: Response) => {
  try {
    const deleted = await summaryDataCollectorService.deleteSummary(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Summary not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting summary', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to delete summary' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { ProfileScraperService } from '../services/profile-scraper.service.js';
import { ProfileService } from '../services/profile.service.js';
import { PersonService } from '../services/person.service.js';
import { ProfileEnrichmentService } from '../services/profile-enrichment.service.js';
import { BroadcastSessionService } from '../services/broadcast-session.service.js';
import { logger } from '../config/logger.js';
import { query } from '../db/client.js';

const router = Router();

/**
 * GET /api/profile/:username
 * Get enriched profile data with all available information
 */
router.get('/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    logger.info(`Fetching enriched profile for: ${username}`);

    // Get or create person
    const person = await PersonService.findOrCreate({ username, role: 'MODEL' });

    // Get latest broadcast session
    const latestSession = await BroadcastSessionService.getLatestSession(person.id);

    // Get session statistics
    const sessionStats = await BroadcastSessionService.getSessionStats(person.id, 30);

    // Get recent sessions
    const sessionsSql = `
      SELECT *
      FROM affiliate_api_snapshots
      WHERE person_id = $1
      ORDER BY observed_at DESC
      LIMIT 20
    `;
    const sessionsResult = await query(sessionsSql, [person.id]);
    const sessions = sessionsResult.rows;

    // Get profile data from profiles table
    const profileSql = `
      SELECT *
      FROM profiles
      WHERE person_id = $1
      LIMIT 1
    `;
    const profileResult = await query(profileSql, [person.id]);
    const profile = profileResult.rows[0] || null;

    // Get recent interactions
    const interactionsSql = `
      SELECT *
      FROM interactions
      WHERE person_id = $1
      ORDER BY timestamp DESC
      LIMIT 50
    `;
    const interactionsResult = await query(interactionsSql, [person.id]);
    const interactions = interactionsResult.rows;

    // Get latest Statbate snapshot for additional metrics
    const snapshotSql = `
      SELECT *
      FROM snapshots
      WHERE person_id = $1
      ORDER BY captured_at DESC
      LIMIT 1
    `;
    const snapshotResult = await query(snapshotSql, [person.id]);
    const latestSnapshot = snapshotResult.rows[0] || null;

    // Compile response - merge all data sources
    const response = {
      person,
      profile,
      latestSession,
      sessionStats,
      sessions,
      interactions,
      latestSnapshot, // Add Statbate snapshot data
    };

    res.json(response);
  } catch (error) {
    logger.error('Get profile error', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/:username/scrape
 * Force scrape profile data (bypasses cache)
 */
router.post('/:username/scrape', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    logger.info(`Force scraping profile for ${username}`);

    // Find or create person record
    const person = await PersonService.findOrCreate({
      username,
      role: 'MODEL',
    });

    if (!person) {
      return res.status(500).json({ error: 'Failed to create person record' });
    }

    // Scrape profile data
    const scrapedData = await ProfileScraperService.scrapeProfile(username);

    if (!scrapedData) {
      return res.status(404).json({ error: 'Profile not found or unavailable' });
    }

    // Save to database
    const profile = await ProfileService.upsertProfile(person.id, scrapedData);

    res.json({
      person,
      profile,
      scraped: true,
    });
  } catch (error) {
    logger.error('Error scraping profile', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/profile/list
 * Get all cached profiles
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = 100 } = req.query;

    const profiles = await ProfileService.getAll(parseInt(limit as string, 10));

    res.json({
      profiles,
      count: profiles.length,
    });
  } catch (error) {
    logger.error('Error listing profiles', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/profile/:username
 * Delete cached profile
 */
router.delete('/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const deleted = await ProfileService.deleteByPersonId(person.id);

    res.json({ deleted });
  } catch (error) {
    logger.error('Error deleting profile', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

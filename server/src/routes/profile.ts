import { Router, Request, Response } from 'express';
import { ProfileScraperService } from '../services/profile-scraper.service.js';
import { ChaturbateScraperService } from '../services/chaturbate-scraper.service.js';
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
 * POST /api/profile/:username/scrape-authenticated
 * Scrape profile using authenticated Chaturbate session (requires cookies)
 * This extracts bio, photos, and profile data from the actual profile page
 */
router.post('/:username/scrape-authenticated', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    // Check if cookies are available
    const hasCookies = await ChaturbateScraperService.hasCookies();
    if (!hasCookies) {
      return res.status(400).json({
        error: 'No cookies available. Please import cookies from your browser first.',
      });
    }

    logger.info(`Starting authenticated profile scrape for ${username}`);

    // Find or create person record
    const person = await PersonService.findOrCreate({
      username,
      role: 'MODEL',
    });

    if (!person) {
      return res.status(500).json({ error: 'Failed to create person record' });
    }

    // Scrape profile using authenticated session
    const scrapedData = await ChaturbateScraperService.scrapeProfile(username);

    if (!scrapedData) {
      return res.status(404).json({
        error: 'Profile not found or not accessible. Make sure your cookies are valid.',
      });
    }

    // Merge scraped data with existing profile
    const profile = await ProfileService.mergeScrapedProfile(person.id, scrapedData);

    res.json({
      person,
      profile,
      scraped: true,
      isOnline: scrapedData.isOnline,
      photoCount: scrapedData.photos.length,
      hasBio: !!scrapedData.bio,
    });
  } catch (error) {
    logger.error('Error in authenticated profile scrape', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/scrape-batch
 * Scrape multiple profiles with authenticated session
 */
router.post('/scrape-batch', async (req: Request, res: Response) => {
  try {
    const { usernames } = req.body;

    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'Usernames array required' });
    }

    // Check if cookies are available
    const hasCookies = await ChaturbateScraperService.hasCookies();
    if (!hasCookies) {
      return res.status(400).json({
        error: 'No cookies available. Please import cookies from your browser first.',
      });
    }

    logger.info(`Starting batch profile scrape for ${usernames.length} users`);

    const results: any[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const username of usernames) {
      try {
        // Find or create person
        const person = await PersonService.findOrCreate({
          username,
          role: 'MODEL',
        });

        if (!person) {
          results.push({ username, success: false, error: 'Failed to create person record' });
          failCount++;
          continue;
        }

        // Scrape profile
        const scrapedData = await ChaturbateScraperService.scrapeProfile(username);

        if (!scrapedData) {
          results.push({ username, success: false, error: 'Profile not found or inaccessible' });
          failCount++;
          continue;
        }

        // Merge with existing
        await ProfileService.mergeScrapedProfile(person.id, scrapedData);

        results.push({
          username,
          success: true,
          isOnline: scrapedData.isOnline,
          photoCount: scrapedData.photos.length,
          hasBio: !!scrapedData.bio,
        });
        successCount++;

        // Small delay between profiles
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error(`Failed to scrape profile for ${username}`, { error });
        results.push({ username, success: false, error: 'Scrape failed' });
        failCount++;
      }
    }

    res.json({
      total: usernames.length,
      success: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    logger.error('Error in batch profile scrape', { error });
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
 * PATCH /api/profile/:username
 * Update profile fields (notes, banned_me, active_sub, first_service_date, last_service_date, friend_tier, etc.)
 */
router.patch('/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const {
      notes,
      banned_me,
      active_sub,
      first_service_date,
      last_service_date,
      friend_tier,
    } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Find or create person
    const person = await PersonService.findOrCreate({ username, role: 'MODEL' });
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }

    if (banned_me !== undefined) {
      updates.push(`banned_me = $${paramIndex++}`);
      values.push(banned_me);
      // Auto-set banned_at when setting banned_me to true
      if (banned_me === true) {
        updates.push(`banned_at = COALESCE(banned_at, NOW())`);
      }
    }

    if (active_sub !== undefined) {
      updates.push(`active_sub = $${paramIndex++}`);
      values.push(active_sub);
      // Auto-set last_service_date when unchecking active_sub
      if (active_sub === false) {
        updates.push(`last_service_date = COALESCE(last_service_date, CURRENT_DATE)`);
      }
    }

    if (first_service_date !== undefined) {
      updates.push(`first_service_date = $${paramIndex++}`);
      values.push(first_service_date || null);
    }

    if (last_service_date !== undefined) {
      updates.push(`last_service_date = $${paramIndex++}`);
      values.push(last_service_date || null);
    }

    if (friend_tier !== undefined) {
      updates.push(`friend_tier = $${paramIndex++}`);
      values.push(friend_tier);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    values.push(person.id);

    const sql = `
      UPDATE profiles
      SET ${updates.join(', ')}
      WHERE person_id = $${paramIndex}
      RETURNING *
    `;

    // First ensure profile exists
    const existingProfile = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (existingProfile.rows.length === 0) {
      // Create minimal profile if it doesn't exist
      await query(
        `INSERT INTO profiles (person_id, notes, banned_me, active_sub, first_service_date, last_service_date, friend_tier)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          person.id,
          notes || null,
          banned_me || false,
          active_sub || false,
          first_service_date || null,
          last_service_date || null,
          friend_tier || null,
        ]
      );
    }

    const result = await query(sql, values);
    const profile = result.rows[0];

    logger.info(`Updated profile for ${username}`, {
      notes: !!notes,
      banned_me,
      active_sub,
      first_service_date,
      last_service_date,
      friend_tier,
    });

    res.json({ success: true, profile });
  } catch (error) {
    logger.error('Error updating profile', { error, username: req.params.username });
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

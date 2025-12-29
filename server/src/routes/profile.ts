import { Router, Request, Response } from 'express';
import { ProfileScraperService } from '../services/profile-scraper.service.js';
import { ChaturbateScraperService } from '../services/chaturbate-scraper.service.js';
import { ProfileService } from '../services/profile.service.js';
import { PersonService } from '../services/person.service.js';
import { ProfileEnrichmentService } from '../services/profile-enrichment.service.js';
import { BroadcastSessionService } from '../services/broadcast-session.service.js';
import { statbateClient } from '../api/statbate/client.js';
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
 * Update profile fields (notes, banned_me, active_sub, first_service_date, last_service_date, friend_tier, stream_summary, watch_list, etc.)
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
      stream_summary,
      watch_list,
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
      // Auto-set last_service_date when unchecking active_sub (only if not explicitly provided)
      if (active_sub === false && last_service_date === undefined) {
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

    if (stream_summary !== undefined) {
      updates.push(`stream_summary = $${paramIndex++}`);
      values.push(stream_summary);
    }

    if (watch_list !== undefined) {
      updates.push(`watch_list = $${paramIndex++}`);
      values.push(watch_list);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');

    // First ensure profile exists using UPSERT
    const existingProfile = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (existingProfile.rows.length === 0) {
      // Create minimal profile if it doesn't exist
      await query(
        `INSERT INTO profiles (person_id, notes, banned_me, active_sub, first_service_date, last_service_date, friend_tier, stream_summary, watch_list)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          person.id,
          notes !== undefined ? notes : null,
          banned_me !== undefined ? banned_me : false,
          active_sub !== undefined ? active_sub : false,
          first_service_date !== undefined ? first_service_date : null,
          last_service_date !== undefined ? last_service_date : null,
          friend_tier !== undefined ? friend_tier : null,
          stream_summary !== undefined ? stream_summary : null,
          watch_list !== undefined ? watch_list : false,
        ]
      );

      // Return the newly created profile
      const newProfile = await query('SELECT * FROM profiles WHERE person_id = $1', [person.id]);
      const profile = newProfile.rows[0];

      logger.info(`Created new profile for ${username}`, {
        notes: !!notes,
        banned_me,
        active_sub,
        first_service_date,
        last_service_date,
        friend_tier,
        stream_summary: !!stream_summary,
      });

      return res.json({ success: true, profile });
    }

    // Profile exists, run UPDATE
    values.push(person.id);
    const sql = `
      UPDATE profiles
      SET ${updates.join(', ')}
      WHERE person_id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, values);
    const profile = result.rows[0];

    logger.info(`Updated profile for ${username}`, {
      notes: !!notes,
      banned_me,
      active_sub,
      first_service_date,
      last_service_date,
      friend_tier,
      stream_summary: !!stream_summary,
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

/**
 * GET /api/profile/:username/member-info
 * Get member activity info from Statbate API
 * Returns: first_message_date, first_tip_date, last_tip_date, last_tip_amount,
 *          models_messaged_2weeks, models_tipped_2weeks, all_time_tokens
 */
router.get('/:username/member-info', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    logger.info(`Fetching Statbate member info for: ${username}`);

    const memberInfo = await statbateClient.getMemberInfo('chaturbate', username);

    if (!memberInfo) {
      return res.status(404).json({ error: 'Member not found in Statbate' });
    }

    // Fetch recent tips to get the last tip recipient
    let last_tip_to: string | null = null;
    try {
      const tipsResponse = await statbateClient.getMemberTips('chaturbate', username, {
        perPage: 1,
      });
      if (tipsResponse.data && tipsResponse.data.length > 0) {
        // API returns model_name for member tips
        const tip = tipsResponse.data[0] as any;
        last_tip_to = tip.model_name || tip.model || null;
      }
    } catch (tipError) {
      logger.warn('Failed to fetch member tips for last_tip_to', { username, error: tipError });
    }

    // Add last_tip_to to the response
    res.json({
      ...memberInfo,
      data: {
        ...memberInfo.data,
        last_tip_to,
      },
    });
  } catch (error) {
    logger.error('Error fetching member info from Statbate', { error, username: req.params.username });
    res.status(500).json({ error: 'Failed to fetch member info from Statbate' });
  }
});

export default router;

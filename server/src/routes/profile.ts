import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ProfileScraperService } from '../services/profile-scraper.service.js';
import { ChaturbateScraperService } from '../services/chaturbate-scraper.service.js';
import { ProfileService } from '../services/profile.service.js';
import { PersonService } from '../services/person.service.js';
import { ProfileEnrichmentService } from '../services/profile-enrichment.service.js';
import { BroadcastSessionService } from '../services/broadcast-session.service.js';
import { ServiceRelationshipService } from '../services/service-relationship.service.js';
import { RelationshipService } from '../services/relationship.service.js';
import { RelationshipHistoryService, type HistoryFieldType } from '../services/relationship-history.service.js';
import { ProfileNotesService } from '../services/profile-notes.service.js';
import { ProfileImagesService } from '../services/profile-images.service.js';
import { SocialLinksService, type SocialPlatform } from '../services/social-links.service.js';
import { SnapshotService } from '../services/snapshot.service.js';
import { RoomVisitsService } from '../services/room-visits.service.js';
import { statbateClient } from '../api/statbate/client.js';
import { normalizeModelInfo, normalizeMemberInfo } from '../api/statbate/normalizer.js';
import { cbhoursClient, type CBHoursLiveModel } from '../api/cbhours/cbhours-client.js';
import { SOCIAL_PLATFORMS, normalizeSocialUrl } from '../constants/social-platforms.js';
import { logger } from '../config/logger.js';
import { query } from '../db/client.js';

// Configure multer for memory storage (we handle file saving ourselves)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  },
});

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

    // Get all interactions for this person
    // Use DISTINCT ON to deduplicate based on content, type, and timestamp (within same second)
    const interactionsSql = `
      SELECT * FROM (
        SELECT DISTINCT ON (type, content, DATE_TRUNC('second', timestamp))
          *
        FROM interactions
        WHERE person_id = $1
        ORDER BY type, content, DATE_TRUNC('second', timestamp), id
      ) deduped
      ORDER BY timestamp DESC
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
 * Also checks Affiliate API for current online status and images
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

    // Check CBHours first - this is the authoritative source for online status if available
    // Also provides rich data: rank, grank, viewers, followers, current_show, room_subject, tags
    let cbhoursData: CBHoursLiveModel | null = null;
    let cbhoursOnline: boolean | null = null;
    try {
      const cbhoursResponse = await cbhoursClient.getLiveStats([username]);
      if (cbhoursResponse.data && cbhoursResponse.data[username.toLowerCase()]) {
        cbhoursData = cbhoursResponse.data[username.toLowerCase()];
        cbhoursOnline = cbhoursData.room_status === 'Online';
        logger.info(`CBHours status: ${cbhoursData.room_status}`, {
          username,
          viewers: cbhoursData.viewers,
          rank: cbhoursData.rank,
          grank: cbhoursData.grank,
        });

        // Save CBHours data as a snapshot if online (rich data worth tracking)
        if (cbhoursOnline && cbhoursData.viewers !== undefined) {
          await SnapshotService.create({
            personId: person.id,
            source: 'cbhours',
            rawPayload: cbhoursData as unknown as Record<string, unknown>,
            normalizedMetrics: {
              viewers: cbhoursData.viewers,
              followers: cbhoursData.followers,
              rank: cbhoursData.rank,
              genderRank: cbhoursData.grank,
              currentShow: cbhoursData.current_show,
              roomSubject: cbhoursData.room_subject,
              tags: cbhoursData.tags,
              isNew: cbhoursData.is_new,
              gender: cbhoursData.gender,
            },
          });
          logger.info(`Saved CBHours snapshot`, { username, rank: cbhoursData.rank });
        }
      }
    } catch (cbhoursError) {
      // Non-fatal - user may not be in CBHours trophy database
      logger.debug(`CBHours fetch skipped`, { username });
    }

    // Also check Affiliate API for current online status and latest image
    let affiliateData = null;
    try {
      affiliateData = await ProfileEnrichmentService.enrichFromAffiliateAPI(username);
      if (affiliateData) {
        logger.info(`Also enriched from Affiliate API - user is LIVE`, { username });
      }
    } catch (affiliateError) {
      // Non-fatal - user may just be offline
      logger.debug(`Affiliate API enrichment skipped (user likely offline)`, { username });
    }

    // Also fetch Statbate data (try model first, then member)
    let statbateData = null;
    let statbateSource = null;
    try {
      // Try as model first
      const modelData = await statbateClient.getModelInfo('chaturbate', username);
      if (modelData) {
        const normalized = normalizeModelInfo(modelData.data);
        await SnapshotService.create({
          personId: person.id,
          source: 'statbate_model',
          rawPayload: modelData.data as unknown as Record<string, unknown>,
          normalizedMetrics: normalized,
        });
        statbateData = modelData.data;
        statbateSource = 'model';

        // Update RID if available
        if (modelData.data.rid && !person.rid) {
          await PersonService.update(person.id, {
            rid: modelData.data.rid,
            role: 'MODEL'
          });
        }
        logger.info(`Fetched Statbate model data`, { username, rid: modelData.data.rid });
      } else {
        // Try as member if not found as model
        const memberData = await statbateClient.getMemberInfo('chaturbate', username);
        if (memberData) {
          const normalized = normalizeMemberInfo(memberData.data);
          await SnapshotService.create({
            personId: person.id,
            source: 'statbate_member',
            rawPayload: memberData.data as unknown as Record<string, unknown>,
            normalizedMetrics: normalized,
          });
          statbateData = memberData.data;
          statbateSource = 'member';

          // Update DID if available
          if (memberData.data.did && !person.did) {
            await PersonService.update(person.id, {
              did: memberData.data.did,
              role: 'VIEWER'
            });
          }
          logger.info(`Fetched Statbate member data`, { username, did: memberData.data.did });
        }
      }
    } catch (statbateError) {
      // Non-fatal - user may not exist in Statbate
      logger.debug(`Statbate fetch skipped`, { username, error: (statbateError as Error).message });
    }

    // Determine online status with priority: CBHours > Affiliate API > fallback to false
    const isLive = cbhoursOnline !== null ? cbhoursOnline : !!affiliateData;
    const onlineSource = cbhoursOnline !== null ? 'cbhours' : (affiliateData ? 'affiliate_api' : null);

    res.json({
      person,
      profile,
      scraped: true,
      isLive,
      onlineSource,
      cbhours: cbhoursData,
      affiliateSession: affiliateData?.session || null,
      statbate: statbateData ? { source: statbateSource, data: statbateData } : null,
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

    // Check CBHours first - this is the authoritative source for online status if available
    // Also provides rich data: rank, grank, viewers, followers, current_show, room_subject, tags
    let cbhoursData: CBHoursLiveModel | null = null;
    let cbhoursOnline: boolean | null = null;
    try {
      const cbhoursResponse = await cbhoursClient.getLiveStats([username]);
      if (cbhoursResponse.data && cbhoursResponse.data[username.toLowerCase()]) {
        cbhoursData = cbhoursResponse.data[username.toLowerCase()];
        cbhoursOnline = cbhoursData.room_status === 'Online';
        logger.info(`CBHours status: ${cbhoursData.room_status}`, {
          username,
          viewers: cbhoursData.viewers,
          rank: cbhoursData.rank,
          grank: cbhoursData.grank,
        });

        // Save CBHours data as a snapshot if online (rich data worth tracking)
        if (cbhoursOnline && cbhoursData.viewers !== undefined) {
          await SnapshotService.create({
            personId: person.id,
            source: 'cbhours',
            rawPayload: cbhoursData as unknown as Record<string, unknown>,
            normalizedMetrics: {
              viewers: cbhoursData.viewers,
              followers: cbhoursData.followers,
              rank: cbhoursData.rank,
              genderRank: cbhoursData.grank,
              currentShow: cbhoursData.current_show,
              roomSubject: cbhoursData.room_subject,
              tags: cbhoursData.tags,
              isNew: cbhoursData.is_new,
              gender: cbhoursData.gender,
            },
          });
          logger.info(`Saved CBHours snapshot`, { username, rank: cbhoursData.rank });
        }
      }
    } catch (cbhoursError) {
      logger.debug(`CBHours fetch skipped`, { username });
    }

    // Also check Affiliate API for current online status and latest image
    let affiliateData = null;
    try {
      affiliateData = await ProfileEnrichmentService.enrichFromAffiliateAPI(username);
      if (affiliateData) {
        logger.info(`Also enriched from Affiliate API - user is LIVE`, { username });
      }
    } catch (affiliateError) {
      logger.debug(`Affiliate API enrichment skipped (user likely offline)`, { username });
    }

    // Also fetch Statbate data (try model first, then member)
    let statbateData = null;
    let statbateSource = null;
    try {
      const modelData = await statbateClient.getModelInfo('chaturbate', username);
      if (modelData) {
        const normalized = normalizeModelInfo(modelData.data);
        await SnapshotService.create({
          personId: person.id,
          source: 'statbate_model',
          rawPayload: modelData.data as unknown as Record<string, unknown>,
          normalizedMetrics: normalized,
        });
        statbateData = modelData.data;
        statbateSource = 'model';

        if (modelData.data.rid && !person.rid) {
          await PersonService.update(person.id, { rid: modelData.data.rid, role: 'MODEL' });
        }
        logger.info(`Fetched Statbate model data`, { username });
      } else {
        const memberData = await statbateClient.getMemberInfo('chaturbate', username);
        if (memberData) {
          const normalized = normalizeMemberInfo(memberData.data);
          await SnapshotService.create({
            personId: person.id,
            source: 'statbate_member',
            rawPayload: memberData.data as unknown as Record<string, unknown>,
            normalizedMetrics: normalized,
          });
          statbateData = memberData.data;
          statbateSource = 'member';

          if (memberData.data.did && !person.did) {
            await PersonService.update(person.id, { did: memberData.data.did, role: 'VIEWER' });
          }
          logger.info(`Fetched Statbate member data`, { username });
        }
      }
    } catch (statbateError) {
      logger.debug(`Statbate fetch skipped`, { username });
    }

    // Determine online status with priority: CBHours > Affiliate API > scraped isOnline
    const isLive = cbhoursOnline !== null ? cbhoursOnline : (affiliateData ? true : scrapedData.isOnline);
    const onlineSource = cbhoursOnline !== null ? 'cbhours' : (affiliateData ? 'affiliate_api' : 'scrape');

    res.json({
      person,
      profile,
      scraped: true,
      isOnline: scrapedData.isOnline,
      isLive,
      onlineSource,
      photoCount: scrapedData.photos.length,
      hasBio: !!scrapedData.bio,
      cbhours: cbhoursData,
      affiliateSession: affiliateData?.session || null,
      statbate: statbateData ? { source: statbateSource, data: statbateData } : null,
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
 * Update profile fields (notes, banned_me, banned_by_me, active_sub, first_service_date, last_service_date, friend_tier, stream_summary, watch_list, etc.)
 */
router.patch('/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const {
      notes,
      banned_me,
      banned_by_me,
      active_sub,
      first_service_date,
      last_service_date,
      friend_tier,
      stream_summary,
      watch_list,
      rating,
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

    if (banned_by_me !== undefined) {
      updates.push(`banned_by_me = $${paramIndex++}`);
      values.push(banned_by_me);
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

    if (rating !== undefined) {
      const ratingValue = parseInt(rating, 10);
      if (isNaN(ratingValue) || ratingValue < 0 || ratingValue > 5) {
        return res.status(400).json({ error: 'Rating must be between 0 and 5' });
      }
      updates.push(`rating = $${paramIndex++}`);
      values.push(ratingValue);
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
        `INSERT INTO profiles (person_id, notes, banned_me, banned_by_me, active_sub, first_service_date, last_service_date, friend_tier, stream_summary, watch_list, rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          person.id,
          notes !== undefined ? notes : null,
          banned_me !== undefined ? banned_me : false,
          banned_by_me !== undefined ? banned_by_me : false,
          active_sub !== undefined ? active_sub : false,
          first_service_date !== undefined ? first_service_date : null,
          last_service_date !== undefined ? last_service_date : null,
          friend_tier !== undefined ? friend_tier : null,
          stream_summary !== undefined ? stream_summary : null,
          watch_list !== undefined ? watch_list : false,
          rating !== undefined ? Math.min(5, Math.max(0, parseInt(rating, 10) || 0)) : 0,
        ]
      );

      // Return the newly created profile
      const newProfile = await query('SELECT * FROM profiles WHERE person_id = $1', [person.id]);
      const profile = newProfile.rows[0];

      logger.info(`Created new profile for ${username}`, {
        notes: !!notes,
        banned_me,
        banned_by_me,
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
      banned_by_me,
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

// ============================================================
// NOTES ENDPOINTS
// ============================================================

/**
 * GET /api/profile/:username/notes
 * Get all notes for a profile (paginated)
 */
router.get('/:username/notes', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { limit = '20', offset = '0' } = req.query;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get person and profile
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      return res.json({ notes: [], total: 0 });
    }

    const profileId = profileResult.rows[0].id;
    const result = await ProfileNotesService.getNotes(
      profileId,
      parseInt(limit as string, 10),
      parseInt(offset as string, 10)
    );

    res.json(result);
  } catch (error) {
    logger.error('Error getting profile notes', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/:username/notes
 * Add a new note to a profile
 */
router.post('/:username/notes', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { content } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    // Get or create person
    const person = await PersonService.findOrCreate({ username, role: 'MODEL' });
    if (!person) {
      return res.status(500).json({ error: 'Failed to get person record' });
    }

    // Get or create profile
    let profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      await query('INSERT INTO profiles (person_id) VALUES ($1)', [person.id]);
      profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    }

    const profileId = profileResult.rows[0].id;
    const note = await ProfileNotesService.addNote(profileId, content.trim());

    res.status(201).json(note);
  } catch (error) {
    logger.error('Error adding profile note', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/profile/:username/notes/:noteId
 * Update an existing note (content and/or created_at date)
 */
router.patch('/:username/notes/:noteId', async (req: Request, res: Response) => {
  try {
    const { noteId } = req.params;
    const { content, created_at } = req.body;

    // At least one field must be provided
    if (!content && !created_at) {
      return res.status(400).json({ error: 'At least content or created_at is required' });
    }

    // Validate content if provided
    if (content !== undefined && (typeof content !== 'string' || content.trim().length === 0)) {
      return res.status(400).json({ error: 'Note content cannot be empty' });
    }

    // Validate created_at if provided
    let parsedDate: Date | undefined;
    if (created_at) {
      parsedDate = new Date(created_at);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format for created_at' });
      }
    }

    const note = await ProfileNotesService.updateNote(noteId, {
      content: content?.trim(),
      created_at: parsedDate,
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json(note);
  } catch (error) {
    logger.error('Error updating profile note', { error, noteId: req.params.noteId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/profile/:username/notes/:noteId
 * Delete a note
 */
router.delete('/:username/notes/:noteId', async (req: Request, res: Response) => {
  try {
    const { noteId } = req.params;

    const deleted = await ProfileNotesService.deleteNote(noteId);
    if (!deleted) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting profile note', { error, noteId: req.params.noteId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// SERVICE RELATIONSHIPS ENDPOINTS
// ============================================================

/**
 * GET /api/profile/:username/service-relationships
 * Get all service relationships for a profile
 */
router.get('/:username/service-relationships', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get person and profile
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      return res.json({ relationships: [] });
    }

    const profileId = profileResult.rows[0].id;
    const relationships = await ServiceRelationshipService.getByProfileId(profileId);

    res.json({ relationships });
  } catch (error) {
    logger.error('Error getting service relationships', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/profile/:username/service-relationships
 * Create or update a service relationship
 */
router.put('/:username/service-relationships', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { serviceRole, serviceLevel, serviceTypes, startedAt, endedAt, notes } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!serviceRole || !['sub', 'dom'].includes(serviceRole)) {
      return res.status(400).json({ error: 'Valid serviceRole (sub or dom) is required' });
    }

    if (!serviceLevel) {
      return res.status(400).json({ error: 'serviceLevel is required' });
    }

    // Validate service level based on role
    const subLevels = ['Current', 'Occasional', 'Potential', 'Decommissioned', 'Banished', 'Paused'];
    const domLevels = ['Potential', 'Actively Serving', 'Ended', 'Paused'];
    const validLevels = serviceRole === 'sub' ? subLevels : domLevels;

    if (!validLevels.includes(serviceLevel)) {
      return res.status(400).json({
        error: `Invalid serviceLevel for ${serviceRole}. Valid options: ${validLevels.join(', ')}`,
      });
    }

    // Get or create person
    const person = await PersonService.findOrCreate({ username, role: 'MODEL' });
    if (!person) {
      return res.status(500).json({ error: 'Failed to get person record' });
    }

    // Get or create profile
    let profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      await query('INSERT INTO profiles (person_id) VALUES ($1)', [person.id]);
      profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    }

    const profileId = profileResult.rows[0].id;
    const relationship = await ServiceRelationshipService.upsert(profileId, {
      serviceRole,
      serviceLevel,
      serviceTypes: serviceTypes || [],
      startedAt: startedAt || null,
      endedAt: endedAt || null,
      notes: notes || null,
    });

    res.json(relationship);
  } catch (error) {
    logger.error('Error upserting service relationship', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/profile/:username/service-relationships/:role
 * Delete a service relationship
 */
router.delete('/:username/service-relationships/:role', async (req: Request, res: Response) => {
  try {
    const { username, role } = req.params;

    if (!role || !['sub', 'dom'].includes(role)) {
      return res.status(400).json({ error: 'Valid role (sub or dom) is required' });
    }

    // Get person and profile
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profileId = profileResult.rows[0].id;
    const deleted = await ServiceRelationshipService.delete(profileId, role as 'sub' | 'dom');

    if (!deleted) {
      return res.status(404).json({ error: 'Relationship not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting service relationship', {
      error,
      username: req.params.username,
      role: req.params.role,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// UNIFIED RELATIONSHIPS ENDPOINTS (NEW)
// ============================================================

/**
 * GET /api/profile/:username/relationship
 * Get unified relationship for a profile
 */
router.get('/:username/relationship', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get person and profile
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      return res.json({ relationship: null });
    }

    const profileId = profileResult.rows[0].id;
    const relationship = await RelationshipService.getByProfileId(profileId);

    res.json({ relationship });
  } catch (error) {
    logger.error('Error getting relationship', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/profile/:username/relationship
 * Create or update unified relationship
 */
router.put('/:username/relationship', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { roles, custom_role_label, status, traits, since_date, until_date, notes } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: 'At least one role is required' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['Potential', 'Occasional', 'Active', 'On Hold', 'Inactive', 'Decommissioned', 'Banished'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Valid options: ${validStatuses.join(', ')}`,
      });
    }

    // Get or create person
    const person = await PersonService.findOrCreate({ username, role: 'MODEL' });
    if (!person) {
      return res.status(500).json({ error: 'Failed to get person record' });
    }

    // Get or create profile
    let profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      await query('INSERT INTO profiles (person_id) VALUES ($1)', [person.id]);
      profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    }

    const profileId = profileResult.rows[0].id;
    const relationship = await RelationshipService.upsert(profileId, {
      roles,
      custom_role_label: custom_role_label || null,
      status,
      traits: traits || [],
      since_date: since_date || null,
      until_date: until_date || null,
      notes: notes || null,
    });

    res.json(relationship);
  } catch (error) {
    logger.error('Error upserting relationship', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/profile/:username/relationship
 * Delete unified relationship
 */
router.delete('/:username/relationship', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    // Get person and profile
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profileId = profileResult.rows[0].id;
    const deleted = await RelationshipService.delete(profileId);

    if (!deleted) {
      return res.status(404).json({ error: 'Relationship not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting relationship', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/profile/:username/relationship/history
 * Get relationship history with filters
 * Query params: fieldType (Status|Dates|Roles), startDate, endDate, limit=50, offset=0
 */
router.get('/:username/relationship/history', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { fieldType, startDate, endDate, limit = '50', offset = '0' } = req.query;

    // Get person and profile
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      return res.json({ entries: [], total: 0 });
    }

    const profileId = profileResult.rows[0].id;

    // Get relationship to get its ID
    const relationship = await RelationshipService.getByProfileId(profileId);
    if (!relationship) {
      return res.json({ entries: [], total: 0 });
    }

    const result = await RelationshipHistoryService.getHistory(relationship.id, {
      fieldType: fieldType as HistoryFieldType | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json(result);
  } catch (error) {
    logger.error('Error getting relationship history', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/profile/:username/names
 * Get profile names (irl_name, identity_name, address_as)
 */
router.get('/:username/names', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    // Get person and profile
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profileId = profileResult.rows[0].id;
    const names = await ProfileService.getNames(profileId);

    res.json({ names });
  } catch (error) {
    logger.error('Error fetching profile names', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/profile/:username/names
 * Update profile names (irl_name, identity_name, address_as)
 */
router.patch('/:username/names', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { irl_name, identity_name, address_as } = req.body;

    // Get person and profile
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profileId = profileResult.rows[0].id;
    const names = await ProfileService.updateNames(profileId, {
      irl_name,
      identity_name,
      address_as,
    });

    res.json({ names });
  } catch (error) {
    logger.error('Error updating profile names', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// PROFILE ATTRIBUTES ENDPOINTS
// ============================================================

/**
 * GET /api/profile/:username/attributes
 * Get profile attributes (smoke_on_cam, leather_fetish, profile_smoke, had_interaction)
 */
router.get('/:username/attributes', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get person
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const attributes = await ProfileService.getAttributes(person.id);
    if (!attributes) {
      // Return defaults if no profile exists
      return res.json({
        attributes: {
          smoke_on_cam: false,
          leather_fetish: false,
          profile_smoke: false,
          had_interaction: false,
        },
      });
    }

    res.json({ attributes });
  } catch (error) {
    logger.error('Error getting profile attributes', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/profile/:username/attributes
 * Update profile attributes (smoke_on_cam, leather_fetish, had_interaction)
 * Note: profile_smoke is auto-populated and cannot be manually updated
 */
router.patch('/:username/attributes', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { smoke_on_cam, leather_fetish, had_interaction } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Validate inputs are booleans if provided
    if (smoke_on_cam !== undefined && typeof smoke_on_cam !== 'boolean') {
      return res.status(400).json({ error: 'smoke_on_cam must be a boolean' });
    }
    if (leather_fetish !== undefined && typeof leather_fetish !== 'boolean') {
      return res.status(400).json({ error: 'leather_fetish must be a boolean' });
    }
    if (had_interaction !== undefined && typeof had_interaction !== 'boolean') {
      return res.status(400).json({ error: 'had_interaction must be a boolean' });
    }

    // Get or create person
    const person = await PersonService.findOrCreate({ username, role: 'MODEL' });
    if (!person) {
      return res.status(500).json({ error: 'Failed to get person record' });
    }

    // Ensure profile exists
    let profileResult = await query('SELECT id FROM profiles WHERE person_id = $1', [person.id]);
    if (profileResult.rows.length === 0) {
      await query('INSERT INTO profiles (person_id) VALUES ($1)', [person.id]);
    }

    const attributes = await ProfileService.updateAttributes(person.id, {
      smoke_on_cam,
      leather_fetish,
      had_interaction,
    });

    logger.info('Profile attributes updated', { username, attributes });
    res.json({ attributes });
  } catch (error) {
    logger.error('Error updating profile attributes', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// PROFILE IMAGES ENDPOINTS
// ============================================================

/**
 * GET /api/profile/:username/images/current
 * Get the current/primary image for a profile
 */
router.get('/:username/images/current', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get person
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const currentImage = await ProfileImagesService.getCurrentByPersonId(person.id);

    res.json({ image: currentImage });
  } catch (error) {
    logger.error('Error getting current image', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/profile/:username/images
 * Get all images for a profile (uploaded + affiliate)
 */
router.get('/:username/images', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { limit, offset = '0' } = req.query;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get person
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    // Get uploaded images from profile_images table
    const uploadedResult = await ProfileImagesService.getByPersonId(
      person.id,
      limit ? parseInt(limit as string, 10) : undefined,
      parseInt(offset as string, 10)
    );

    // Get affiliate API images from affiliate_api_snapshots
    const affiliateImagesSql = `
      SELECT DISTINCT ON (image_path)
        id,
        image_path as file_path,
        'affiliate_api' as source,
        observed_at as captured_at,
        num_users as viewers
      FROM affiliate_api_snapshots
      WHERE person_id = $1
        AND image_path IS NOT NULL
      ORDER BY image_path, observed_at DESC
      LIMIT 50
    `;
    const affiliateResult = await query(affiliateImagesSql, [person.id]);
    const affiliateImages = affiliateResult.rows.map(row => ({
      id: row.id,
      person_id: person.id,
      file_path: row.file_path,
      original_filename: null,
      source: 'affiliate_api',
      description: null,
      captured_at: row.captured_at,
      uploaded_at: row.captured_at,
      viewers: row.viewers,
      is_current: false, // Affiliate images cannot be set as current
      media_type: 'image' as const, // Affiliate API only has images
      duration_seconds: null,
      photoset_id: null,
      title: null,
    }));

    // Combine and sort by date
    const allImages = [...uploadedResult.images, ...affiliateImages].sort((a, b) => {
      const dateA = new Date(a.captured_at || a.uploaded_at).getTime();
      const dateB = new Date(b.captured_at || b.uploaded_at).getTime();
      return dateB - dateA;
    });

    res.json({
      images: allImages,
      uploadedCount: uploadedResult.total,
      affiliateCount: affiliateImages.length,
      total: uploadedResult.total + affiliateImages.length,
    });
  } catch (error) {
    logger.error('Error getting profile images', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/:username/images
 * Upload a new image for a profile
 */
router.post('/:username/images', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { source = 'manual_upload', description, captured_at } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    // Validate source
    const validSources = ['manual_upload', 'screensnap', 'external', 'imported'];
    if (!validSources.includes(source)) {
      return res.status(400).json({
        error: `Invalid source. Valid options: ${validSources.join(', ')}`,
      });
    }

    // Get or create person
    const person = await PersonService.findOrCreate({ username, role: 'MODEL' });
    if (!person) {
      return res.status(500).json({ error: 'Failed to get person record' });
    }

    // Initialize storage if needed
    await ProfileImagesService.init();

    // Save the uploaded file
    const image = await ProfileImagesService.saveUploadedFile(
      {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
      person.id,
      {
        source: source as 'manual_upload' | 'screensnap' | 'external' | 'imported',
        description: description || undefined,
        capturedAt: captured_at ? new Date(captured_at) : undefined,
        username, // Use S3 storage with username-based paths
      }
    );

    logger.info('Profile image uploaded', {
      username,
      imageId: image.id,
      source,
      size: req.file.size,
    });

    res.status(201).json(image);
  } catch (error: any) {
    if (error.message?.includes('Invalid file type')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Error uploading profile image', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/profile/:username/images/:imageId
 * Update image metadata
 */
router.patch('/:username/images/:imageId', async (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;
    const { description, source, captured_at } = req.body;

    // Validate source if provided
    if (source) {
      const validSources = ['manual_upload', 'screensnap', 'external', 'imported'];
      if (!validSources.includes(source)) {
        return res.status(400).json({
          error: `Invalid source. Valid options: ${validSources.join(', ')}`,
        });
      }
    }

    const image = await ProfileImagesService.update(imageId, {
      description,
      source,
      capturedAt: captured_at ? new Date(captured_at) : undefined,
    });

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.json(image);
  } catch (error) {
    logger.error('Error updating profile image', { error, imageId: req.params.imageId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/:username/images/:imageId/set-current
 * Set an image as the current/primary image for a profile
 */
router.post('/:username/images/:imageId/set-current', async (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;

    const image = await ProfileImagesService.setAsCurrent(imageId);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    logger.info('Image set as current', { imageId, personId: image.person_id });
    res.json(image);
  } catch (error) {
    logger.error('Error setting image as current', { error, imageId: req.params.imageId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/profile/:username/images/:imageId
 * Delete an uploaded image
 */
router.delete('/:username/images/:imageId', async (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;

    // First check if this is an uploaded image (not affiliate API)
    const image = await ProfileImagesService.getById(imageId);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const deleted = await ProfileImagesService.delete(imageId);
    if (!deleted) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting profile image', { error, imageId: req.params.imageId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/:username/images/import-affiliate
 * Import an affiliate API image into profile_images so it can be set as current
 */
router.post('/:username/images/import-affiliate', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { snapshotId, imageUrl, capturedAt, viewers } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }

    // Get person
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    // Initialize storage if needed
    await ProfileImagesService.init();

    // Download the image and save it
    const https = await import('https');
    const http = await import('http');
    const path = await import('path');
    const fs = await import('fs/promises');
    const crypto = await import('crypto');

    // Determine protocol
    const protocol = imageUrl.startsWith('https') ? https : http;

    // Download image
    const imageBuffer = await new Promise<Buffer>((resolve, reject) => {
      const request = protocol.get(imageUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirect
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            const redirectProtocol = redirectUrl.startsWith('https') ? https : http;
            redirectProtocol.get(redirectUrl, (redirectResponse) => {
              const chunks: Buffer[] = [];
              redirectResponse.on('data', (chunk) => chunks.push(chunk));
              redirectResponse.on('end', () => resolve(Buffer.concat(chunks)));
              redirectResponse.on('error', reject);
            }).on('error', reject);
          } else {
            reject(new Error('Redirect without location'));
          }
        } else if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
        } else {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        }
      });
      request.on('error', reject);
    });

    // Save to profile_images using the service
    const image = await ProfileImagesService.saveUploadedFile(
      {
        buffer: imageBuffer,
        originalname: path.basename(imageUrl) || 'imported-image.jpg',
        mimetype: 'image/jpeg',
        size: imageBuffer.length,
      },
      person.id,
      {
        source: 'imported',
        description: viewers ? `Imported from broadcast (${viewers} viewers)` : 'Imported from affiliate API',
        capturedAt: capturedAt ? new Date(capturedAt) : undefined,
        username, // Use S3 storage with username-based paths
      }
    );

    logger.info('Affiliate image imported', { username, imageId: image.id, originalUrl: imageUrl });
    res.status(201).json(image);
  } catch (error: any) {
    logger.error('Error importing affiliate image', { error, username: req.params.username });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ============================================================
// SOCIAL LINKS ENDPOINTS
// ============================================================

/**
 * GET /api/profile/:username/social-links
 * Get all social links for a profile
 */
router.get('/:username/social-links', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get person
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const links = await SocialLinksService.getByPersonId(person.id);

    res.json({
      links,
      platforms: SOCIAL_PLATFORMS,
    });
  } catch (error) {
    logger.error('Error getting social links', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/profile/:username/social-links
 * Update all social links (replaces entire object)
 */
router.put('/:username/social-links', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { links } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!links || typeof links !== 'object') {
      return res.status(400).json({ error: 'Links object is required' });
    }

    // Validate all platforms
    for (const platform of Object.keys(links)) {
      if (!SocialLinksService.isValidPlatform(platform)) {
        return res.status(400).json({
          error: `Invalid platform: ${platform}. Valid options: ${Object.keys(SOCIAL_PLATFORMS).join(', ')}`,
        });
      }
    }

    // Normalize URLs
    const normalizedLinks: Record<string, string> = {};
    for (const [platform, url] of Object.entries(links)) {
      if (url && typeof url === 'string' && url.trim()) {
        normalizedLinks[platform] = normalizeSocialUrl(platform, url.trim());
      }
    }

    // Get or create person
    const person = await PersonService.findOrCreate({ username, role: 'MODEL' });
    if (!person) {
      return res.status(500).json({ error: 'Failed to get person record' });
    }

    const updatedLinks = await SocialLinksService.update(person.id, normalizedLinks);

    logger.info('Social links updated', {
      username,
      platforms: Object.keys(normalizedLinks),
    });

    res.json({ links: updatedLinks });
  } catch (error) {
    logger.error('Error updating social links', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/profile/:username/social-links
 * Add or update a single social link
 */
router.patch('/:username/social-links', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { platform, url } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!platform) {
      return res.status(400).json({ error: 'Platform is required' });
    }

    if (!SocialLinksService.isValidPlatform(platform)) {
      return res.status(400).json({
        error: `Invalid platform: ${platform}. Valid options: ${Object.keys(SOCIAL_PLATFORMS).join(', ')}`,
      });
    }

    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Get or create person
    const person = await PersonService.findOrCreate({ username, role: 'MODEL' });
    if (!person) {
      return res.status(500).json({ error: 'Failed to get person record' });
    }

    // Normalize the URL
    const normalizedUrl = normalizeSocialUrl(platform, url.trim());

    const updatedLinks = await SocialLinksService.addLink(
      person.id,
      platform as SocialPlatform,
      normalizedUrl
    );

    logger.info('Social link added', { username, platform });

    res.json({ links: updatedLinks });
  } catch (error) {
    logger.error('Error adding social link', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/profile/:username/social-links/:platform
 * Remove a single social link
 */
router.delete('/:username/social-links/:platform', async (req: Request, res: Response) => {
  try {
    const { username, platform } = req.params;

    if (!SocialLinksService.isValidPlatform(platform)) {
      return res.status(400).json({
        error: `Invalid platform: ${platform}. Valid options: ${Object.keys(SOCIAL_PLATFORMS).join(', ')}`,
      });
    }

    // Get person
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const updatedLinks = await SocialLinksService.removeLink(person.id, platform as SocialPlatform);

    logger.info('Social link removed', { username, platform });

    res.json({ links: updatedLinks });
  } catch (error) {
    logger.error('Error removing social link', {
      error,
      username: req.params.username,
      platform: req.params.platform,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Room Visits Endpoints
// ============================================

/**
 * GET /api/profile/:username/visits
 * Get room visit history for a user
 */
router.get('/:username/visits', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const result = await RoomVisitsService.getVisitsByPersonId(
      person.id,
      parseInt(limit as string, 10),
      parseInt(offset as string, 10)
    );

    res.json(result);
  } catch (error) {
    logger.error('Error getting room visits', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/profile/:username/visits/stats
 * Get room visit statistics for a user
 */
router.get('/:username/visits/stats', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const stats = await RoomVisitsService.getVisitStats(person.id);

    res.json({
      ...stats,
      visit_count: person.room_visit_count || 0,
      last_visit_at: person.last_room_visit_at,
    });
  } catch (error) {
    logger.error('Error getting room visit stats', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/:username/visits
 * Manually record a room visit (for testing or manual entry)
 * @param is_broadcasting - Whether the broadcaster was live during this visit (default: false for manual entries)
 */
router.post('/:username/visits', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { visited_at, is_broadcasting = false } = req.body;

    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const visitDate = visited_at ? new Date(visited_at) : new Date();
    if (isNaN(visitDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const visit = await RoomVisitsService.recordVisit(
      person.id,
      visitDate,
      undefined, // eventId
      is_broadcasting,
      undefined  // sessionId
    );

    if (!visit) {
      return res.status(409).json({ error: 'Duplicate visit (within 5 minutes of previous visit)' });
    }

    res.status(201).json(visit);
  } catch (error) {
    logger.error('Error recording room visit', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/profile/:username/my-visits/stats
 * Get stats for how many times I visited this user's room
 */
router.get('/:username/my-visits/stats', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const stats = await RoomVisitsService.getMyVisitStats(person.id);

    res.json({
      ...stats,
      my_visit_count: person.my_visit_count || 0,
      last_my_visit_at: person.last_my_visit_at,
    });
  } catch (error) {
    logger.error('Error getting my visit stats', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/:username/my-visits
 * Record a visit to this user's room (I visited them)
 */
router.post('/:username/my-visits', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { visited_at, notes } = req.body;

    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const visitDate = visited_at ? new Date(visited_at) : new Date();
    if (isNaN(visitDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const visit = await RoomVisitsService.recordMyVisit(person.id, visitDate, notes);

    res.status(201).json(visit);
  } catch (error) {
    logger.error('Error recording my visit', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/profile/:username/my-visits
 * Get my visit history for this user
 */
router.get('/:username/my-visits', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const result = await RoomVisitsService.getMyVisitsByPersonId(
      person.id,
      parseInt(limit as string, 10),
      parseInt(offset as string, 10)
    );

    res.json(result);
  } catch (error) {
    logger.error('Error getting my visits', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/profile/:username/my-visits/:visitId
 * Delete a my visit record
 */
router.delete('/:username/my-visits/:visitId', async (req: Request, res: Response) => {
  try {
    const { visitId } = req.params;

    const deleted = await RoomVisitsService.deleteMyVisit(visitId);

    if (!deleted) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting my visit', { error, visitId: req.params.visitId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/profile/visits/recent
 * Get recent visitors across all users
 */
router.get('/visits/recent', async (req: Request, res: Response) => {
  try {
    const { days = '7', limit = '50' } = req.query;

    const visitors = await RoomVisitsService.getRecentVisitors(
      parseInt(days as string, 10),
      parseInt(limit as string, 10)
    );

    res.json({ visitors });
  } catch (error) {
    logger.error('Error getting recent visitors', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/profile/visits/top
 * Get top visitors (all time)
 */
router.get('/visits/top', async (req: Request, res: Response) => {
  try {
    const { limit = '50' } = req.query;

    const visitors = await RoomVisitsService.getTopVisitors(
      parseInt(limit as string, 10)
    );

    res.json({ visitors });
  } catch (error) {
    logger.error('Error getting top visitors', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/visits/backfill
 * Backfill room visits from existing interactions
 */
router.post('/visits/backfill', async (req: Request, res: Response) => {
  try {
    const broadcasterUsername = process.env.CHATURBATE_USERNAME;
    if (!broadcasterUsername) {
      return res.status(500).json({ error: 'CHATURBATE_USERNAME not configured' });
    }

    const result = await RoomVisitsService.backfillFromInteractions(broadcasterUsername);

    res.json({
      message: 'Backfill complete',
      processed: result.processed,
      recorded: result.recorded,
    });
  } catch (error) {
    logger.error('Error backfilling room visits', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/my-visits/backfill
 * Backfill my visits (visits to other rooms) from event_logs
 * Uses interactions in other broadcasters' rooms to track visits
 */
router.post('/my-visits/backfill', async (req: Request, res: Response) => {
  try {
    const broadcasterUsername = process.env.CHATURBATE_USERNAME;
    if (!broadcasterUsername) {
      return res.status(500).json({ error: 'CHATURBATE_USERNAME not configured' });
    }

    const result = await RoomVisitsService.backfillMyVisitsFromEventLogs(broadcasterUsername);

    res.json({
      message: 'My visits backfill complete',
      processed: result.processed,
      recorded: result.recorded,
      skipped: result.skipped,
    });
  } catch (error) {
    logger.error('Error backfilling my visits', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// COMMUNICATIONS ENDPOINTS
// ============================================================

/**
 * GET /api/profile/:username/communications
 * Get all communications (DMs, PMs) for a user
 * Classifies messages as:
 * - direct_messages: PRIVATE_MESSAGE where broadcaster is null/empty
 * - pm_my_room: PRIVATE_MESSAGE where broadcaster matches CHATURBATE_USERNAME env var
 * - pm_their_room: PRIVATE_MESSAGE where broadcaster is set and != our username
 */
router.get('/:username/communications', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get person
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    // Get all PRIVATE_MESSAGE and DIRECT_MESSAGE interactions involving this person (both directions)
    // Query by metadata fromUser/toUser to get both sent and received messages
    // Use DISTINCT ON with a subquery to deduplicate messages with same content and timestamp
    // but maintain proper ORDER BY timestamp DESC for display
    const result = await query(
      `SELECT * FROM (
         SELECT DISTINCT ON (content, DATE_TRUNC('second', timestamp))
           id,
           type,
           content,
           timestamp,
           source,
           metadata,
           stream_session_id
         FROM interactions
         WHERE type IN ('PRIVATE_MESSAGE', 'DIRECT_MESSAGE')
           AND (
             metadata->>'fromUser' ILIKE $1
             OR metadata->>'toUser' ILIKE $1
           )
         ORDER BY content, DATE_TRUNC('second', timestamp), id
       ) deduped
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3`,
      [username, parseInt(limit as string), parseInt(offset as string)]
    );

    // Get total count (deduplicated)
    const countResult = await query(
      `SELECT COUNT(*) as total FROM (
         SELECT DISTINCT ON (content, DATE_TRUNC('second', timestamp)) id
         FROM interactions
         WHERE type IN ('PRIVATE_MESSAGE', 'DIRECT_MESSAGE')
           AND (
             metadata->>'fromUser' ILIKE $1
             OR metadata->>'toUser' ILIKE $1
           )
         ORDER BY content, DATE_TRUNC('second', timestamp), id
       ) deduped`,
      [username]
    );

    // Classify messages
    const directMessages: any[] = [];
    const pmMyRoom: any[] = [];
    const pmTheirRoom: any[] = [];

    for (const row of result.rows) {
      const broadcaster = row.metadata?.broadcaster;
      const message = {
        id: row.id,
        content: row.content,
        timestamp: row.timestamp,
        source: row.source,
        metadata: row.metadata,
        stream_session_id: row.stream_session_id,
      };

      // Get broadcaster username from environment
      const myUsername = process.env.CHATURBATE_USERNAME?.toLowerCase();
      const broadcasterLower = broadcaster?.toLowerCase();

      // Use type field as primary classification, fall back to broadcaster check for legacy data
      if (row.type === 'DIRECT_MESSAGE' || !broadcaster) {
        directMessages.push(message);
      } else if (myUsername && broadcasterLower === myUsername) {
        pmMyRoom.push(message);
      } else {
        pmTheirRoom.push({ ...message, broadcaster });
      }
    }

    res.json({
      username,
      direct_messages: directMessages,
      pm_my_room: pmMyRoom,
      pm_their_room: pmTheirRoom,
      total: parseInt(countResult.rows[0].total),
    });
  } catch (error) {
    logger.error('Error fetching communications', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/profile/:username/timeline
 * Get a chronological timeline of all interactions for a user
 * Query params:
 *   - types: Comma-separated event types to filter (e.g., "TIP_EVENT,PRIVATE_MESSAGE")
 *   - limit: Number of events per page (default 50)
 *   - offset: Pagination offset (default 0)
 */
router.get('/:username/timeline', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { limit = '50', offset = '0', types = '' } = req.query;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get person
    const person = await PersonService.findByUsername(username);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    // All valid timeline event types
    const allEventTypes = ['USER_ENTER', 'USER_LEAVE', 'CHAT_MESSAGE', 'PRIVATE_MESSAGE', 'DIRECT_MESSAGE', 'TIP_EVENT', 'MEDIA_PURCHASE', 'FANCLUB_JOIN'];

    // Parse and validate event types filter
    let selectedTypes: string[];
    if (types && typeof types === 'string' && types.trim()) {
      selectedTypes = types.split(',')
        .map(t => t.trim().toUpperCase())
        .filter(t => allEventTypes.includes(t));
      // If no valid types provided, use all
      if (selectedTypes.length === 0) {
        selectedTypes = allEventTypes;
      }
    } else {
      selectedTypes = allEventTypes;
    }

    // Build dynamic SQL with parameterized type list
    const typePlaceholders = selectedTypes.map((_, i) => `$${i + 2}`).join(', ');
    const limitParam = selectedTypes.length + 2;
    const offsetParam = selectedTypes.length + 3;

    // Get timeline events - filtered by selected types and deduplicated
    const result = await query(
      `SELECT * FROM (
         SELECT DISTINCT ON (type, content, DATE_TRUNC('second', timestamp))
           id,
           type,
           content,
           timestamp,
           source,
           metadata,
           stream_session_id
         FROM interactions
         WHERE person_id = $1
           AND type IN (${typePlaceholders})
         ORDER BY type, content, DATE_TRUNC('second', timestamp), id
       ) deduped
       ORDER BY timestamp DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [person.id, ...selectedTypes, parseInt(limit as string), parseInt(offset as string)]
    );

    // Get total count for selected types (deduplicated)
    const countResult = await query(
      `SELECT COUNT(*) as total FROM (
         SELECT DISTINCT ON (type, content, DATE_TRUNC('second', timestamp)) id
         FROM interactions
         WHERE person_id = $1
           AND type IN (${typePlaceholders})
         ORDER BY type, content, DATE_TRUNC('second', timestamp), id
       ) deduped`,
      [person.id, ...selectedTypes]
    );

    const events = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      content: row.content,
      timestamp: row.timestamp,
      source: row.source,
      metadata: row.metadata,
      stream_session_id: row.stream_session_id,
    }));

    res.json({
      username,
      events,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      selectedTypes,
      availableTypes: allEventTypes,
    });
  } catch (error) {
    logger.error('Error fetching timeline', { error, username: req.params.username });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/bulk/validate-usernames
 * Validate which usernames exist in the database
 */
router.post('/bulk/validate-usernames', async (req: Request, res: Response) => {
  try {
    const { usernames } = req.body;

    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'usernames array is required' });
    }

    // Query all persons with matching usernames (case-insensitive)
    const lowerUsernames = usernames.map((u: string) => u.toLowerCase());
    const placeholders = lowerUsernames.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `
      SELECT username
      FROM persons
      WHERE LOWER(username) IN (${placeholders})
    `;
    const result = await query(sql, lowerUsernames);

    const foundUsernames = new Set(result.rows.map((r) => (r as { username: string }).username.toLowerCase()));

    const found: string[] = [];
    const notFound: string[] = [];

    for (const username of usernames) {
      if (foundUsernames.has(username.toLowerCase())) {
        found.push(username);
      } else {
        notFound.push(username);
      }
    }

    res.json({ found, notFound });
  } catch (error) {
    logger.error('Error validating usernames', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/bulk/upload
 * Upload multiple images with usernames parsed from filenames
 * Filename format: {username}.{ext} or {username}-{suffix}.{ext}
 */
router.post('/bulk/upload', upload.array('images', 500), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploaded: { filename: string; username: string; imageId: string }[] = [];
    const skipped: { filename: string; reason: string; username?: string }[] = [];

    // Initialize profile images service
    await ProfileImagesService.init();

    for (const file of files) {
      // Parse username from filename
      // Pattern: username.ext or username-suffix.ext
      const filenameMatch = file.originalname.match(/^([^-\.]+)(?:-[^\.]+)?\.(?:jpe?g|png|gif|webp)$/i);

      if (!filenameMatch) {
        skipped.push({
          filename: file.originalname,
          reason: 'Invalid filename format. Expected: username.ext or username-suffix.ext',
        });
        continue;
      }

      const username = filenameMatch[1];

      // Find person by username
      const person = await PersonService.findByUsername(username);

      if (!person) {
        skipped.push({
          filename: file.originalname,
          username,
          reason: 'User not found',
        });
        continue;
      }

      try {
        // Save the image
        const image = await ProfileImagesService.saveUploadedFile(
          {
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          },
          person.id,
          { source: 'manual_upload', username } // Use S3 storage with username-based paths
        );

        uploaded.push({
          filename: file.originalname,
          username,
          imageId: image.id,
        });
      } catch (err) {
        skipped.push({
          filename: file.originalname,
          username,
          reason: err instanceof Error ? err.message : 'Failed to save image',
        });
      }
    }

    res.json({
      uploaded,
      skipped,
      summary: {
        total: files.length,
        uploadedCount: uploaded.length,
        skippedCount: skipped.length,
      },
    });
  } catch (error) {
    logger.error('Error in bulk upload', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

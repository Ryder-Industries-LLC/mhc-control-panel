import { PersonService } from './person.service.js';
import { chaturbateAffiliateClient, type OnlineRoom } from '../api/chaturbate/affiliate-client.js';
import { BroadcastSessionService } from './broadcast-session.service.js';
import { FollowerHistoryService } from './follower-history.service.js';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface EnrichedProfile {
  person: any; // From persons table
  profile: {
    // Basic info
    display_name: string | null;
    age: number | null;
    birthday: string | null;
    gender: string | null;
    location: string | null;
    country: string | null;
    spoken_languages: string | null;

    // Status
    is_new: boolean;
    last_seen_online: Date | null;

    // Phase 2 fields (from authenticated scraping)
    interested_in: string | null;
    body_type: string | null;
    smoke_drink: string | null;
    body_decorations: string | null;

    // Meta
    data_source: string;
    scraped_at: Date | null;
  } | null;
  latestSession: any | null; // Latest broadcast session
  sessionStats: any | null; // 30-day session statistics
  snapshots: any[]; // Stats API snapshots
  interactions: any[]; // Recent interactions
}

export class ProfileEnrichmentService {
  /**
   * Fetch and update profile from Chaturbate Affiliate API
   */
  static async enrichFromAffiliateAPI(username: string): Promise<{
    person: any;
    profile: any;
    session: any;
  } | null> {
    try {
      logger.info(`Enriching profile from Affiliate API`, { username });

      // Fetch from Affiliate API
      const roomData = await chaturbateAffiliateClient.getRoomByUsername(username);

      if (!roomData) {
        logger.info(`User not currently online in Affiliate API`, { username });
        return null;
      }

      // Find or create person
      const person = await PersonService.findOrCreate({
        username: roomData.username,
        role: 'MODEL',
      });

      if (!person) {
        throw new Error('Failed to create person record');
      }

      // Upsert profile data
      const profile = await this.upsertProfileFromAffiliateAPI(person.id, roomData);

      // Record broadcast session
      const session = await BroadcastSessionService.recordSession(person.id, roomData);

      // Record follower count history (for trend tracking)
      if (roomData.num_followers > 0) {
        await FollowerHistoryService.recordCount(person.id, roomData.num_followers, 'affiliate_api');
      }

      logger.info(`Profile enriched from Affiliate API`, {
        username,
        personId: person.id,
        sessionId: session.id,
      });

      return { person, profile, session };
    } catch (error) {
      logger.error('Error enriching from Affiliate API', { error, username });
      throw error;
    }
  }

  /**
   * Upsert profile data from Affiliate API response
   */
  private static async upsertProfileFromAffiliateAPI(personId: string, roomData: OnlineRoom): Promise<any> {
    const sql = `
      INSERT INTO profiles (
        person_id,
        display_name,
        age,
        birthday_public,
        gender,
        location,
        country,
        spoken_languages,
        is_new,
        last_seen_online,
        tags,
        data_source,
        scraped_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, 'affiliate_api', NOW()
      )
      ON CONFLICT (person_id) DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
        age = COALESCE(EXCLUDED.age, profiles.age),
        birthday_public = COALESCE(EXCLUDED.birthday_public, profiles.birthday_public),
        gender = COALESCE(EXCLUDED.gender, profiles.gender),
        location = COALESCE(EXCLUDED.location, profiles.location),
        country = COALESCE(EXCLUDED.country, profiles.country),
        spoken_languages = COALESCE(EXCLUDED.spoken_languages, profiles.spoken_languages),
        is_new = EXCLUDED.is_new,
        last_seen_online = NOW(),
        tags = EXCLUDED.tags,
        scraped_at = NOW()
      RETURNING *
    `;

    // Convert spoken_languages string to array (e.g., "English, Spanish" -> ["English", "Spanish"])
    const spokenLanguagesArray = roomData.spoken_languages
      ? roomData.spoken_languages.split(',').map(lang => lang.trim()).filter(lang => lang.length > 0)
      : [];

    const values = [
      personId,
      roomData.display_name || null,
      roomData.age,
      roomData.birthday || null,
      roomData.gender,
      roomData.location || null,
      roomData.country || null,
      spokenLanguagesArray,
      roomData.is_new,
      roomData.tags,
    ];

    const result = await query(sql, values);
    return result.rows[0];
  }

  /**
   * Get comprehensive enriched profile
   */
  static async getEnrichedProfile(username: string): Promise<EnrichedProfile | null> {
    try {
      // Get person
      const person = await PersonService.findByUsername(username);
      if (!person) {
        return null;
      }

      // Get profile
      const profileSql = 'SELECT * FROM profiles WHERE person_id = $1';
      const profileResult = await query(profileSql, [person.id]);
      const profile = profileResult.rows[0] || null;

      // Get latest session
      const latestSession = await BroadcastSessionService.getLatestSession(person.id);

      // Get session stats (last 30 days)
      const sessionStats = await BroadcastSessionService.getSessionStats(person.id, 30);

      // Get polling data (from statbate_api_polling table)
      const snapshotsSql = `
        SELECT * FROM statbate_api_polling
        WHERE person_id = $1
        ORDER BY captured_at DESC
        LIMIT 30
      `;
      const snapshotsResult = await query(snapshotsSql, [person.id]);
      const snapshots = snapshotsResult.rows;

      // Get recent interactions
      const interactionsSql = `
        SELECT * FROM interactions
        WHERE person_id = $1
        ORDER BY timestamp DESC
        LIMIT 50
      `;
      const interactionsResult = await query(interactionsSql, [person.id]);
      const interactions = interactionsResult.rows;

      return {
        person,
        profile: profile ? {
          display_name: profile.display_name,
          age: profile.age,
          birthday: profile.birthday_public,
          gender: profile.gender,
          location: profile.location,
          country: profile.country,
          spoken_languages: profile.spoken_languages,
          is_new: profile.is_new,
          last_seen_online: profile.last_seen_online,
          interested_in: profile.interested_in,
          body_type: profile.body_type,
          smoke_drink: profile.smoke_drink,
          body_decorations: profile.body_decorations,
          data_source: profile.data_source,
          scraped_at: profile.scraped_at,
        } : null,
        latestSession,
        sessionStats,
        snapshots,
        interactions,
      };
    } catch (error) {
      logger.error('Error getting enriched profile', { error, username });
      throw error;
    }
  }

  /**
   * Batch enrich profiles from Affiliate API
   * Useful for importing all currently online broadcasters
   */
  static async batchEnrichFromAffiliateAPI(options?: {
    gender?: 'f' | 'm' | 't' | 'c';
    limit?: number;
  }): Promise<{ success: number; failed: number }> {
    const { gender, limit = 100 } = options || {};

    let success = 0;
    let failed = 0;

    try {
      // Get online rooms
      const response = await chaturbateAffiliateClient.getOnlineRooms({
        gender,
        limit,
      });

      logger.info(`Batch enriching ${response.results.length} profiles from Affiliate API`);

      // Process each room
      for (const roomData of response.results) {
        try {
          await this.enrichFromAffiliateAPI(roomData.username);
          success++;
        } catch (error) {
          logger.error('Error enriching profile in batch', { error, username: roomData.username });
          failed++;
        }

        // Small delay to avoid overwhelming database
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info(`Batch enrichment complete`, { success, failed, total: response.results.length });

      return { success, failed };
    } catch (error) {
      logger.error('Error in batch enrichment', { error });
      throw error;
    }
  }
}

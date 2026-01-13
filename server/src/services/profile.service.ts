import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import { FollowHistoryService } from './follow-history.service.js';
import type { ChaturbateProfile } from './profile-scraper.service.js';
import type { ScrapedProfileData } from './chaturbate-scraper.service.js';

export interface Profile {
  id: number;
  person_id: string;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  age: number | null;
  gender: string | null;
  interested_in: string | null;
  body_type: string | null;
  ethnicity: string | null;
  height: string | null;
  spoken_languages: string | null;
  tags: string[];
  photos: Array<{ url: string; isPrimary: boolean }>;
  tip_menu: Array<{ item: string; tokens: number }>;
  goal_description: string | null;
  goal_tokens: number | null;
  goal_progress: number | null;
  social_links: Array<{ platform: string; url: string }>;
  fanclub_price: number | null;
  fanclub_count: number | null;
  last_broadcast: Date | null;
  scraped_at: Date;
  created_at: Date;
  updated_at: Date;
  country: string | null;
  is_new: boolean;
  location_detail: string | null;
  birthday_public: string | null;
  smoke_drink: string | null;
  body_decorations: string | null;
  data_source: string;
  last_seen_online: Date | null;
  // Profile attribute flags
  smoke_on_cam: boolean;
  leather_fetish: boolean;
  profile_smoke: boolean;
  had_interaction: boolean;
}

export class ProfileService {
  /**
   * Save or update profile from scraped data
   */
  static async upsertProfile(personId: string, profileData: ChaturbateProfile): Promise<Profile> {
    const sql = `
      INSERT INTO profiles (
        person_id, display_name, bio, location, age,
        gender, interested_in, body_type, ethnicity, height,
        spoken_languages, tags, photos, tip_menu,
        goal_description, goal_tokens, goal_progress,
        social_links, fanclub_price, fanclub_count,
        last_broadcast, scraped_at,
        country, is_new, location_detail, birthday_public,
        smoke_drink, body_decorations, data_source, last_seen_online
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17,
        $18, $19, $20,
        $21, $22,
        $23, $24, $25, $26,
        $27, $28, $29, $30
      )
      ON CONFLICT (person_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio,
        location = EXCLUDED.location,
        age = EXCLUDED.age,
        gender = EXCLUDED.gender,
        interested_in = EXCLUDED.interested_in,
        body_type = EXCLUDED.body_type,
        ethnicity = EXCLUDED.ethnicity,
        height = EXCLUDED.height,
        spoken_languages = EXCLUDED.spoken_languages,
        tags = EXCLUDED.tags,
        photos = EXCLUDED.photos,
        tip_menu = EXCLUDED.tip_menu,
        goal_description = EXCLUDED.goal_description,
        goal_tokens = EXCLUDED.goal_tokens,
        goal_progress = EXCLUDED.goal_progress,
        social_links = EXCLUDED.social_links,
        fanclub_price = EXCLUDED.fanclub_price,
        fanclub_count = EXCLUDED.fanclub_count,
        last_broadcast = EXCLUDED.last_broadcast,
        scraped_at = EXCLUDED.scraped_at,
        country = EXCLUDED.country,
        is_new = EXCLUDED.is_new,
        location_detail = EXCLUDED.location_detail,
        birthday_public = EXCLUDED.birthday_public,
        smoke_drink = EXCLUDED.smoke_drink,
        body_decorations = EXCLUDED.body_decorations,
        data_source = EXCLUDED.data_source,
        last_seen_online = EXCLUDED.last_seen_online,
        updated_at = NOW()
      RETURNING *
    `;

    const values = [
      personId,
      profileData.displayName,
      profileData.bio,
      profileData.location,
      profileData.age,
      profileData.gender,
      profileData.interestedIn,
      profileData.bodyType,
      profileData.ethnicity,
      profileData.height,
      profileData.spokenLanguages,
      profileData.tags,
      JSON.stringify(profileData.photos || []),
      JSON.stringify(profileData.tipMenu || []),
      profileData.goalDescription,
      profileData.goalTokens,
      profileData.goalProgress,
      JSON.stringify(profileData.socialLinks || []),
      profileData.fanclubPrice,
      profileData.fanclubCount,
      profileData.lastBroadcast,
      profileData.scrapedAt,
      profileData.country,
      profileData.isNew,
      profileData.locationDetail,
      profileData.birthdayPublic,
      profileData.smokeDrink,
      profileData.bodyDecorations,
      profileData.dataSource,
      profileData.lastSeenOnline,
    ];

    try {
      const result = await query(sql, values);
      const row = result.rows[0];

      logger.info('Profile upserted', { personId, username: profileData.username });

      // Auto-populate profile_smoke based on smoke_drink field
      if (profileData.smokeDrink !== undefined) {
        await this.updateProfileSmoke(personId, profileData.smokeDrink);
      }

      return this.mapRowToProfile(row);
    } catch (error) {
      logger.error('Error upserting profile', { error, personId });
      throw error;
    }
  }

  /**
   * Get profile by person ID
   */
  static async getByPersonId(personId: string): Promise<Profile | null> {
    const sql = 'SELECT * FROM profiles WHERE person_id = $1';

    try {
      const result = await query(sql, [personId]);
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToProfile(result.rows[0]);
    } catch (error) {
      logger.error('Error getting profile', { error, personId });
      throw error;
    }
  }

  /**
   * Get all profiles
   */
  static async getAll(limit = 100): Promise<Profile[]> {
    const sql = 'SELECT * FROM profiles ORDER BY scraped_at DESC LIMIT $1';

    try {
      const result = await query(sql, [limit]);
      return result.rows.map(this.mapRowToProfile);
    } catch (error) {
      logger.error('Error getting all profiles', { error });
      throw error;
    }
  }

  /**
   * Delete profile by person ID
   */
  static async deleteByPersonId(personId: string): Promise<boolean> {
    const sql = 'DELETE FROM profiles WHERE person_id = $1 RETURNING id';

    try {
      const result = await query(sql, [personId]);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      logger.error('Error deleting profile', { error, personId });
      throw error;
    }
  }

  /**
   * Check if profile needs refresh (older than N days)
   * Uses browser_scraped_at to track Puppeteer-based scraping separately
   */
  static async needsRefresh(personId: string, maxAgeDays = 7): Promise<boolean> {
    const sql = `
      SELECT browser_scraped_at
      FROM profiles
      WHERE person_id = $1
        AND browser_scraped_at IS NOT NULL
        AND browser_scraped_at > NOW() - INTERVAL '${maxAgeDays} days'
    `;

    try {
      const result = await query(sql, [personId]);
      return result.rows.length === 0; // True if no recent browser scrape found
    } catch (error) {
      logger.error('Error checking profile freshness', { error, personId });
      return true; // Default to refresh on error
    }
  }

  /**
   * Map database row to Profile object
   */
  private static mapRowToProfile(row: any): Profile {
    return {
      id: row.id,
      person_id: row.person_id,
      display_name: row.display_name,
      bio: row.bio,
      location: row.location,
      age: row.age,
      gender: row.gender,
      interested_in: row.interested_in,
      body_type: row.body_type,
      ethnicity: row.ethnicity,
      height: row.height,
      spoken_languages: row.spoken_languages,
      tags: row.tags || [],
      photos: row.photos || [],
      tip_menu: row.tip_menu || [],
      goal_description: row.goal_description,
      goal_tokens: row.goal_tokens,
      goal_progress: row.goal_progress,
      social_links: row.social_links || [],
      fanclub_price: row.fanclub_price,
      fanclub_count: row.fanclub_count,
      last_broadcast: row.last_broadcast,
      scraped_at: row.scraped_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      country: row.country,
      is_new: row.is_new || false,
      location_detail: row.location_detail,
      birthday_public: row.birthday_public,
      smoke_drink: row.smoke_drink,
      body_decorations: row.body_decorations,
      data_source: row.data_source,
      last_seen_online: row.last_seen_online,
      // Profile attribute flags
      smoke_on_cam: row.smoke_on_cam || false,
      leather_fetish: row.leather_fetish || false,
      profile_smoke: row.profile_smoke || false,
      had_interaction: row.had_interaction || false,
    };
  }

  /**
   * Merge scraped profile data with existing profile
   * Scraped data takes priority (source of truth), but fills in blanks from existing
   * Photos are merged: new photos are added, background images marked appropriately
   */
  static async mergeScrapedProfile(personId: string, scrapedData: ScrapedProfileData): Promise<Profile> {
    // Get existing profile if any
    const existingProfile = await this.getByPersonId(personId);

    // Process detected follow status if available
    if (scrapedData.detectedFollowStatus && scrapedData.detectedFollowStatus !== 'unknown') {
      await this.processDetectedFollowStatus(personId, scrapedData.detectedFollowStatus);
    }

    // Build photos array - filter out backgrounds for primary use, keep all for storage
    const profilePhotos = scrapedData.photos
      .filter(p => !p.isLocked)
      .map(p => ({
        url: p.url,
        localPath: p.localPath,
        isPrimary: p.isPrimary && !p.isBackground,
        isBackground: p.isBackground,
      }));

    // If we have existing photos, merge them (add new ones, keep unique)
    let mergedPhotos: any[] = profilePhotos;
    if (existingProfile?.photos && existingProfile.photos.length > 0) {
      const existingUrls = new Set(existingProfile.photos.map((p: any) => p.url));
      const newPhotos = profilePhotos.filter(p => !existingUrls.has(p.url));
      mergedPhotos = [...existingProfile.photos, ...newPhotos];
    }

    // Build merged social links
    let mergedSocialLinks = scrapedData.socialLinks;
    if (existingProfile?.social_links && existingProfile.social_links.length > 0) {
      const existingPlatforms = new Set(existingProfile.social_links.map((s: any) => s.platform));
      const newLinks = scrapedData.socialLinks.filter(s => !existingPlatforms.has(s.platform));
      mergedSocialLinks = [...existingProfile.social_links, ...newLinks];
    }

    // Build merged tags
    let mergedTags = scrapedData.tags;
    if (existingProfile?.tags && existingProfile.tags.length > 0 && scrapedData.tags.length === 0) {
      mergedTags = existingProfile.tags;
    }

    // SQL for upsert with scraped data priority (COALESCE for fallback to existing)
    // Also set browser_scraped_at to track when Puppeteer scraping last occurred
    const sql = `
      INSERT INTO profiles (
        person_id, display_name, bio, location, age,
        gender, interested_in, body_type, ethnicity, height,
        spoken_languages, tags, photos, tip_menu,
        social_links, fanclub_price,
        scraped_at, browser_scraped_at, data_source,
        birthday_public, smoke_drink, body_decorations
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16,
        $17, $18, $19,
        $20, $21, $22
      )
      ON CONFLICT (person_id) DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
        bio = COALESCE(EXCLUDED.bio, profiles.bio),
        location = COALESCE(EXCLUDED.location, profiles.location),
        age = COALESCE(EXCLUDED.age, profiles.age),
        gender = COALESCE(EXCLUDED.gender, profiles.gender),
        interested_in = COALESCE(EXCLUDED.interested_in, profiles.interested_in),
        body_type = COALESCE(EXCLUDED.body_type, profiles.body_type),
        ethnicity = COALESCE(EXCLUDED.ethnicity, profiles.ethnicity),
        height = COALESCE(EXCLUDED.height, profiles.height),
        spoken_languages = COALESCE(EXCLUDED.spoken_languages, profiles.spoken_languages),
        tags = CASE WHEN array_length(EXCLUDED.tags, 1) > 0 THEN EXCLUDED.tags ELSE profiles.tags END,
        photos = EXCLUDED.photos,
        tip_menu = CASE WHEN jsonb_array_length(EXCLUDED.tip_menu) > 0 THEN EXCLUDED.tip_menu ELSE profiles.tip_menu END,
        social_links = EXCLUDED.social_links,
        fanclub_price = COALESCE(EXCLUDED.fanclub_price, profiles.fanclub_price),
        scraped_at = EXCLUDED.scraped_at,
        browser_scraped_at = EXCLUDED.browser_scraped_at,
        data_source = EXCLUDED.data_source,
        birthday_public = COALESCE(EXCLUDED.birthday_public, profiles.birthday_public),
        smoke_drink = COALESCE(EXCLUDED.smoke_drink, profiles.smoke_drink),
        body_decorations = COALESCE(EXCLUDED.body_decorations, profiles.body_decorations),
        updated_at = NOW()
      RETURNING *
    `;

    const values = [
      personId,
      scrapedData.displayName,
      scrapedData.bio,
      scrapedData.location,
      scrapedData.age,
      scrapedData.gender,
      scrapedData.interestedIn,
      scrapedData.bodyType,
      scrapedData.ethnicity,
      scrapedData.height,
      scrapedData.languages.length > 0 ? scrapedData.languages : null,
      mergedTags,
      JSON.stringify(mergedPhotos),
      JSON.stringify(scrapedData.tipMenu || []),
      JSON.stringify(mergedSocialLinks),
      scrapedData.fanclubPrice,
      scrapedData.scrapedAt,
      scrapedData.scrapedAt, // browser_scraped_at - same as scrapedAt for browser scrapes
      'chaturbate_profile_scrape',
      scrapedData.birthdayPublic,
      scrapedData.smokeDrink,
      scrapedData.bodyDecorations,
    ];

    try {
      const result = await query(sql, values);
      const row = result.rows[0];

      // Auto-populate profile_smoke based on smoke_drink field
      if (scrapedData.smokeDrink) {
        await this.updateProfileSmoke(personId, scrapedData.smokeDrink);
      }

      logger.info('Profile merged from scrape', {
        personId,
        username: scrapedData.username,
        photoCount: mergedPhotos.length,
        hasBio: !!scrapedData.bio,
      });

      return this.mapRowToProfile(row);
    } catch (error) {
      logger.error('Error merging scraped profile', { error, personId });
      throw error;
    }
  }

  /**
   * Process detected follow status from profile scrape
   * Updates profiles.following if it differs from current status
   * Records the change in follow_history
   */
  static async processDetectedFollowStatus(
    personId: string,
    detectedStatus: 'following' | 'not_following'
  ): Promise<void> {
    try {
      // Get current following status from profiles
      const result = await query(
        `SELECT following FROM profiles WHERE person_id = $1`,
        [personId]
      );

      const currentlyFollowing = result.rows[0]?.following || false;
      const shouldBeFollowing = detectedStatus === 'following';

      // Only update if status differs
      if (currentlyFollowing !== shouldBeFollowing) {
        logger.info('Follow status differs from profile scrape detection', {
          personId,
          current: currentlyFollowing,
          detected: shouldBeFollowing,
        });

        if (shouldBeFollowing) {
          // Update to following
          await query(
            `INSERT INTO profiles (person_id, following, following_checked_at, following_since, unfollowed_at)
             VALUES ($1, TRUE, NOW(), NOW(), NULL)
             ON CONFLICT (person_id) DO UPDATE SET
               following = TRUE,
               following_checked_at = NOW(),
               following_since = COALESCE(profiles.following_since, NOW()),
               unfollowed_at = NULL`,
            [personId]
          );

          // Record in follow_history
          await FollowHistoryService.record({
            personId,
            direction: 'following',
            action: 'follow',
            source: 'profile_scrape',
          });

          logger.info('Marked as following from profile scrape detection', { personId });
        } else {
          // Update to not following
          await query(
            `UPDATE profiles SET
               following = FALSE,
               following_checked_at = NOW(),
               unfollowed_at = NOW()
             WHERE person_id = $1`,
            [personId]
          );

          // Record in follow_history
          await FollowHistoryService.record({
            personId,
            direction: 'following',
            action: 'unfollow',
            source: 'profile_scrape',
          });

          logger.info('Marked as unfollowed from profile scrape detection', { personId });
        }
      } else {
        // Status matches, just update the checked timestamp
        await query(
          `UPDATE profiles SET following_checked_at = NOW() WHERE person_id = $1`,
          [personId]
        );
      }
    } catch (error) {
      logger.error('Error processing detected follow status', { error, personId });
      // Don't throw - this is non-critical, profile merge should continue
    }
  }

  /**
   * Get profile names (irl_name, identity_name, address_as)
   */
  static async getNames(profileId: number): Promise<{
    irl_name: string | null;
    identity_name: string | null;
    address_as: string[];
  } | null> {
    const sql = `SELECT irl_name, identity_name, address_as FROM profiles WHERE id = $1`;

    try {
      const result = await query(sql, [profileId]);
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        irl_name: row.irl_name,
        identity_name: row.identity_name,
        address_as: row.address_as || [],
      };
    } catch (error) {
      logger.error('Error getting profile names', { error, profileId });
      throw error;
    }
  }

  /**
   * Update profile names (irl_name, identity_name, address_as)
   */
  static async updateNames(
    profileId: number,
    names: {
      irl_name?: string | null;
      identity_name?: string | null;
      address_as?: string[];
    }
  ): Promise<{
    irl_name: string | null;
    identity_name: string | null;
    address_as: string[];
  }> {
    // Build dynamic update
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if ('irl_name' in names) {
      setClauses.push(`irl_name = $${paramIndex++}`);
      values.push(names.irl_name?.trim() || null);
    }

    if ('identity_name' in names) {
      setClauses.push(`identity_name = $${paramIndex++}`);
      values.push(names.identity_name?.trim() || null);
    }

    if ('address_as' in names) {
      setClauses.push(`address_as = $${paramIndex++}`);
      // Normalize: trim, filter empty, dedupe
      const normalized = (names.address_as || [])
        .map((t) => t.trim())
        .filter((t) => t !== '')
        .filter((t, i, arr) => arr.indexOf(t) === i);
      values.push(normalized);
    }

    if (setClauses.length === 0) {
      // Nothing to update, just return current values
      const current = await this.getNames(profileId);
      if (!current) {
        throw new Error('Profile not found');
      }
      return current;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(profileId);

    const sql = `
      UPDATE profiles
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING irl_name, identity_name, address_as
    `;

    try {
      const result = await query(sql, values);
      if (result.rows.length === 0) {
        throw new Error('Profile not found');
      }
      const row = result.rows[0];
      logger.info('Profile names updated', { profileId });
      return {
        irl_name: row.irl_name,
        identity_name: row.identity_name,
        address_as: row.address_as || [],
      };
    } catch (error) {
      logger.error('Error updating profile names', { error, profileId });
      throw error;
    }
  }

  /**
   * Get profile attributes (smoke_on_cam, leather_fetish, profile_smoke, had_interaction, room_banned)
   */
  static async getAttributes(personId: string): Promise<{
    smoke_on_cam: boolean;
    leather_fetish: boolean;
    profile_smoke: boolean;
    had_interaction: boolean;
    room_banned: boolean; // MHC-1104
  } | null> {
    const sql = `
      SELECT smoke_on_cam, leather_fetish, profile_smoke, had_interaction, room_banned
      FROM profiles
      WHERE person_id = $1
    `;

    try {
      const result = await query(sql, [personId]);
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        smoke_on_cam: row.smoke_on_cam || false,
        leather_fetish: row.leather_fetish || false,
        profile_smoke: row.profile_smoke || false,
        had_interaction: row.had_interaction || false,
        room_banned: row.room_banned || false, // MHC-1104
      };
    } catch (error) {
      logger.error('Error getting profile attributes', { error, personId });
      throw error;
    }
  }

  /**
   * Update profile attributes
   * Only smoke_on_cam, leather_fetish, had_interaction, and room_banned can be manually updated
   * profile_smoke is auto-populated from smoke_drink
   */
  static async updateAttributes(
    personId: string,
    attributes: {
      smoke_on_cam?: boolean;
      leather_fetish?: boolean;
      had_interaction?: boolean;
      room_banned?: boolean; // MHC-1104
    }
  ): Promise<{
    smoke_on_cam: boolean;
    leather_fetish: boolean;
    profile_smoke: boolean;
    had_interaction: boolean;
    room_banned: boolean; // MHC-1104
  }> {
    // Build dynamic update
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if ('smoke_on_cam' in attributes) {
      setClauses.push(`smoke_on_cam = $${paramIndex++}`);
      values.push(attributes.smoke_on_cam || false);
    }

    if ('leather_fetish' in attributes) {
      setClauses.push(`leather_fetish = $${paramIndex++}`);
      values.push(attributes.leather_fetish || false);
    }

    if ('had_interaction' in attributes) {
      setClauses.push(`had_interaction = $${paramIndex++}`);
      values.push(attributes.had_interaction || false);
    }

    // MHC-1104: room_banned attribute
    if ('room_banned' in attributes) {
      setClauses.push(`room_banned = $${paramIndex++}`);
      values.push(attributes.room_banned || false);
    }

    if (setClauses.length === 0) {
      // Nothing to update, just return current values
      const current = await this.getAttributes(personId);
      if (!current) {
        throw new Error('Profile not found');
      }
      return current;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(personId);

    const sql = `
      UPDATE profiles
      SET ${setClauses.join(', ')}
      WHERE person_id = $${paramIndex}
      RETURNING smoke_on_cam, leather_fetish, profile_smoke, had_interaction, room_banned
    `;

    try {
      const result = await query(sql, values);
      if (result.rows.length === 0) {
        throw new Error('Profile not found');
      }
      const row = result.rows[0];
      logger.info('Profile attributes updated', { personId });
      return {
        smoke_on_cam: row.smoke_on_cam || false,
        leather_fetish: row.leather_fetish || false,
        profile_smoke: row.profile_smoke || false,
        had_interaction: row.had_interaction || false,
        room_banned: row.room_banned || false, // MHC-1104
      };
    } catch (error) {
      logger.error('Error updating profile attributes', { error, personId });
      throw error;
    }
  }

  /**
   * Parse smoke_drink field to determine if person smokes
   * Format: "YES/YES", "NO/YES", "Sometimes", etc.
   * First value (before /) indicates smoke status
   */
  static parseProfileSmoke(smokeDrink: string | null): boolean {
    if (!smokeDrink) return false;
    const firstPart = smokeDrink.split('/')[0]?.trim().toUpperCase();
    return ['YES', 'YEAH', 'SOMETIMES'].includes(firstPart);
  }

  /**
   * Auto-populate profile_smoke based on smoke_drink field
   * Called during profile scraping/update
   */
  static async updateProfileSmoke(personId: string, smokeDrink: string | null): Promise<void> {
    const profileSmoke = this.parseProfileSmoke(smokeDrink);

    try {
      await query(
        `UPDATE profiles SET profile_smoke = $1, updated_at = NOW() WHERE person_id = $2`,
        [profileSmoke, personId]
      );
      logger.debug('Profile smoke status updated', { personId, profileSmoke, smokeDrink });
    } catch (error) {
      logger.error('Error updating profile smoke', { error, personId });
      // Don't throw - this is non-critical
    }
  }
}

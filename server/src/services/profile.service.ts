import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import type { ChaturbateProfile } from './profile-scraper.service.js';

export interface Profile {
  id: number;
  person_id: string;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  age: number | null;
  gender: string | null;
  sexual_orientation: string | null;
  interested_in: string | null;
  body_type: string | null;
  ethnicity: string | null;
  hair_color: string | null;
  eye_color: string | null;
  height: string | null;
  weight: string | null;
  languages: string[];
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
}

export class ProfileService {
  /**
   * Save or update profile from scraped data
   */
  static async upsertProfile(personId: string, profileData: ChaturbateProfile): Promise<Profile> {
    const sql = `
      INSERT INTO profiles (
        person_id, display_name, bio, location, age,
        gender, sexual_orientation, interested_in, body_type, ethnicity,
        hair_color, eye_color, height, weight,
        languages, tags, photos, tip_menu,
        goal_description, goal_tokens, goal_progress,
        social_links, fanclub_price, fanclub_count,
        last_broadcast, scraped_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21,
        $22, $23, $24,
        $25, $26
      )
      ON CONFLICT (person_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio,
        location = EXCLUDED.location,
        age = EXCLUDED.age,
        gender = EXCLUDED.gender,
        sexual_orientation = EXCLUDED.sexual_orientation,
        interested_in = EXCLUDED.interested_in,
        body_type = EXCLUDED.body_type,
        ethnicity = EXCLUDED.ethnicity,
        hair_color = EXCLUDED.hair_color,
        eye_color = EXCLUDED.eye_color,
        height = EXCLUDED.height,
        weight = EXCLUDED.weight,
        languages = EXCLUDED.languages,
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
      profileData.sexualOrientation,
      profileData.interestedIn,
      profileData.bodyType,
      profileData.ethnicity,
      profileData.hairColor,
      profileData.eyeColor,
      profileData.height,
      profileData.weight,
      profileData.languages,
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
    ];

    try {
      const result = await query(sql, values);
      const row = result.rows[0];

      logger.info('Profile upserted', { personId, username: profileData.username });

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
   */
  static async needsRefresh(personId: string, maxAgeDays = 7): Promise<boolean> {
    const sql = `
      SELECT scraped_at
      FROM profiles
      WHERE person_id = $1
        AND scraped_at > NOW() - INTERVAL '${maxAgeDays} days'
    `;

    try {
      const result = await query(sql, [personId]);
      return result.rows.length === 0; // True if no recent profile found
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
      sexual_orientation: row.sexual_orientation,
      interested_in: row.interested_in,
      body_type: row.body_type,
      ethnicity: row.ethnicity,
      hair_color: row.hair_color,
      eye_color: row.eye_color,
      height: row.height,
      weight: row.weight,
      languages: row.languages || [],
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
    };
  }
}

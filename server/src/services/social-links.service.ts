import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export type SocialPlatform =
  | 'twitter'
  | 'bluesky'
  | 'linktree'
  | 'alllinks'
  | 'throne'
  | 'revolut'
  | 'cashapp'
  | 'telegram'
  | 'snapchat'
  | 'instagram'
  | 'amazon_wishlist'
  | 'onlyfans'
  | 'fansly'
  | 'website'
  | 'other';

export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export class SocialLinksService {
  /**
   * Get all social links for a person (via their profile)
   */
  static async getByPersonId(personId: string): Promise<SocialLinks> {
    const sql = `
      SELECT social_links
      FROM profiles
      WHERE person_id = $1
    `;

    try {
      const result = await query(sql, [personId]);
      if (result.rows.length === 0 || !result.rows[0].social_links) {
        return {};
      }
      return result.rows[0].social_links as SocialLinks;
    } catch (error) {
      logger.error('Error getting social links', { error, personId });
      throw error;
    }
  }

  /**
   * Update all social links (replaces entire object)
   */
  static async update(personId: string, links: SocialLinks): Promise<SocialLinks> {
    const sql = `
      UPDATE profiles
      SET social_links = $2, updated_at = NOW()
      WHERE person_id = $1
      RETURNING social_links
    `;

    try {
      const result = await query(sql, [personId, JSON.stringify(links)]);
      if (result.rows.length === 0) {
        // Profile doesn't exist, create it
        const insertSql = `
          INSERT INTO profiles (person_id, social_links)
          VALUES ($1, $2)
          ON CONFLICT (person_id) DO UPDATE
          SET social_links = $2, updated_at = NOW()
          RETURNING social_links
        `;
        const insertResult = await query(insertSql, [personId, JSON.stringify(links)]);
        logger.info('Social links created', { personId, platforms: Object.keys(links) });
        return insertResult.rows[0].social_links as SocialLinks;
      }
      logger.info('Social links updated', { personId, platforms: Object.keys(links) });
      return result.rows[0].social_links as SocialLinks;
    } catch (error) {
      logger.error('Error updating social links', { error, personId });
      throw error;
    }
  }

  /**
   * Add or update a single link
   */
  static async addLink(personId: string, platform: SocialPlatform, url: string): Promise<SocialLinks> {
    // First get existing links
    const currentLinks = await this.getByPersonId(personId);

    // Add/update the platform
    const updatedLinks = {
      ...currentLinks,
      [platform]: url,
    };

    return this.update(personId, updatedLinks);
  }

  /**
   * Remove a single link
   */
  static async removeLink(personId: string, platform: SocialPlatform): Promise<SocialLinks> {
    // First get existing links
    const currentLinks = await this.getByPersonId(personId);

    // Remove the platform
    const { [platform]: _, ...remainingLinks } = currentLinks;

    return this.update(personId, remainingLinks);
  }

  /**
   * Check if a person has any social links
   */
  static async hasLinks(personId: string): Promise<boolean> {
    const links = await this.getByPersonId(personId);
    return Object.keys(links).length > 0;
  }

  /**
   * Get count of social links
   */
  static async getCount(personId: string): Promise<number> {
    const links = await this.getByPersonId(personId);
    return Object.keys(links).length;
  }

  /**
   * Validate a social platform name
   */
  static isValidPlatform(platform: string): platform is SocialPlatform {
    const validPlatforms: SocialPlatform[] = [
      'twitter',
      'bluesky',
      'linktree',
      'alllinks',
      'throne',
      'revolut',
      'cashapp',
      'telegram',
      'snapchat',
      'instagram',
      'amazon_wishlist',
      'onlyfans',
      'fansly',
      'website',
      'other',
    ];
    return validPlatforms.includes(platform as SocialPlatform);
  }
}

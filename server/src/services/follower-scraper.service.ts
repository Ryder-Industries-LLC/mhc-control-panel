import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import * as cheerio from 'cheerio';
import { PersonService } from './person.service.js';

export interface FollowerStats {
  totalFollowing: number;
  totalFollowers: number;
  newFollowing: number;
  newFollowers: number;
  unfollowed: number;
  unfollowers: number;
}

export class FollowerScraperService {
  /**
   * Parse HTML from Chaturbate followed-cams page
   * Extracts usernames from the room list
   */
  static parseFollowingHTML(html: string): string[] {
    const $ = cheerio.load(html);
    const usernames: string[] = [];

    // Look for room cards - typical Chaturbate structure
    $('li.room_list_room').each((_, element) => {
      const username = $(element).find('a').attr('href')?.replace(/^\//, '').replace(/\/$/, '');
      if (username && username.length > 0) {
        usernames.push(username.toLowerCase());
      }
    });

    // Alternative: look for data-room attribute
    if (usernames.length === 0) {
      $('[data-room]').each((_, element) => {
        const username = $(element).attr('data-room');
        if (username && username.length > 0) {
          usernames.push(username.toLowerCase());
        }
      });
    }

    return [...new Set(usernames)]; // Remove duplicates
  }

  /**
   * Parse HTML from Chaturbate followers page
   * Extracts usernames from the follower list
   */
  static parseFollowersHTML(html: string): string[] {
    const $ = cheerio.load(html);
    const usernames: string[] = [];

    // Look for username links in follower table/list
    $('a[href^="/"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && href !== '/' && !href.includes('/') && href.length > 1) {
        const username = href.replace(/^\//, '').toLowerCase();
        // Filter out common non-username links
        if (username &&
            !username.startsWith('accounts') &&
            !username.startsWith('tipping') &&
            !username.startsWith('supporter') &&
            username.length > 2) {
          usernames.push(username);
        }
      }
    });

    return [...new Set(usernames)]; // Remove duplicates
  }

  /**
   * Update following status for users
   * Marks users as following=true, unmarks previous following that are not in the new list
   */
  static async updateFollowing(usernames: string[]): Promise<FollowerStats> {
    try {
      // Get current following list
      const currentResult = await query(
        `SELECT person_id FROM profiles WHERE following = TRUE`
      );
      const currentFollowing = new Set(currentResult.rows.map(r => r.person_id));

      let newFollowing = 0;
      let unfollowed = 0;

      // Find or create persons and mark as following
      const newFollowingSet = new Set<string>();
      for (const username of usernames) {
        const person = await PersonService.findOrCreate({
          username,
          role: 'MODEL',
        });
        newFollowingSet.add(person.id);

        // Update profile to mark as following
        await query(
          `INSERT INTO profiles (person_id, following, following_checked_at, following_since, unfollowed_at)
           VALUES ($1, TRUE, NOW(), NOW(), NULL)
           ON CONFLICT (person_id) DO UPDATE SET
             following = TRUE,
             following_checked_at = NOW(),
             following_since = COALESCE(profiles.following_since, NOW()),
             unfollowed_at = NULL`,
          [person.id]
        );

        if (!currentFollowing.has(person.id)) {
          newFollowing++;
        }
      }

      // Mark users no longer followed as not following
      for (const personId of currentFollowing) {
        if (!newFollowingSet.has(personId)) {
          await query(
            `UPDATE profiles SET
               following = FALSE,
               following_checked_at = NOW(),
               unfollowed_at = NOW()
             WHERE person_id = $1`,
            [personId]
          );
          unfollowed++;
        }
      }

      logger.info('Following list updated', {
        total: usernames.length,
        new: newFollowing,
        unfollowed,
      });

      return {
        totalFollowing: usernames.length,
        totalFollowers: 0,
        newFollowing,
        newFollowers: 0,
        unfollowed,
        unfollowers: 0,
      };
    } catch (error) {
      logger.error('Error updating following list', { error });
      throw error;
    }
  }

  /**
   * Update follower status for users
   * Marks users as follower=true, unmarks previous followers that are not in the new list
   */
  static async updateFollowers(usernames: string[]): Promise<FollowerStats> {
    try {
      // Get current followers list
      const currentResult = await query(
        `SELECT person_id FROM profiles WHERE follower = TRUE`
      );
      const currentFollowers = new Set(currentResult.rows.map(r => r.person_id));

      let newFollowers = 0;
      let unfollowers = 0;

      // Find or create persons and mark as follower
      const newFollowersSet = new Set<string>();
      for (const username of usernames) {
        const person = await PersonService.findOrCreate({
          username,
          role: 'VIEWER', // People following me are typically viewers
        });
        newFollowersSet.add(person.id);

        // Update profile to mark as follower
        await query(
          `INSERT INTO profiles (person_id, follower, follower_checked_at, follower_since, unfollower_at)
           VALUES ($1, TRUE, NOW(), NOW(), NULL)
           ON CONFLICT (person_id) DO UPDATE SET
             follower = TRUE,
             follower_checked_at = NOW(),
             follower_since = COALESCE(profiles.follower_since, NOW()),
             unfollower_at = NULL`,
          [person.id]
        );

        if (!currentFollowers.has(person.id)) {
          newFollowers++;
        }
      }

      // Mark users no longer following as not follower
      for (const personId of currentFollowers) {
        if (!newFollowersSet.has(personId)) {
          await query(
            `UPDATE profiles SET
               follower = FALSE,
               follower_checked_at = NOW(),
               unfollower_at = NOW()
             WHERE person_id = $1`,
            [personId]
          );
          unfollowers++;
        }
      }

      logger.info('Followers list updated', {
        total: usernames.length,
        new: newFollowers,
        unfollowers,
      });

      return {
        totalFollowing: 0,
        totalFollowers: usernames.length,
        newFollowing: 0,
        newFollowers,
        unfollowed: 0,
        unfollowers,
      };
    } catch (error) {
      logger.error('Error updating followers list', { error });
      throw error;
    }
  }

  /**
   * Get all users I'm following
   */
  static async getFollowing(): Promise<any[]> {
    const result = await query(
      `SELECT
        p.*,
        pr.following_checked_at,
        pr.following,
        pr.follower,
        pr.following_since,
        pr.follower_since,
        pr.banned_me,
        (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
        (SELECT COUNT(*) FROM snapshots WHERE person_id = p.id) as snapshot_count,
        (SELECT COUNT(DISTINCT image_path_360x270) FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL) as image_count,
        (SELECT image_path_360x270 FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL ORDER BY observed_at DESC LIMIT 1) as image_url,
        (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as current_show,
        (SELECT observed_at FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as session_observed_at,
        (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as tags
       FROM persons p
       INNER JOIN profiles pr ON pr.person_id = p.id
       WHERE pr.following = TRUE
       ORDER BY p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get all users following me
   */
  static async getFollowers(): Promise<any[]> {
    const result = await query(
      `SELECT
        p.*,
        pr.follower_checked_at,
        pr.following,
        pr.follower,
        pr.following_since,
        pr.follower_since,
        pr.banned_me,
        (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
        (SELECT COUNT(*) FROM snapshots WHERE person_id = p.id) as snapshot_count,
        (SELECT COUNT(DISTINCT image_path_360x270) FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL) as image_count,
        (SELECT image_path_360x270 FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL ORDER BY observed_at DESC LIMIT 1) as image_url,
        (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as current_show,
        (SELECT observed_at FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as session_observed_at,
        (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as tags
       FROM persons p
       INNER JOIN profiles pr ON pr.person_id = p.id
       WHERE pr.follower = TRUE
       ORDER BY p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get all users who unfollowed me
   */
  static async getUnfollowed(): Promise<any[]> {
    const result = await query(
      `SELECT
        p.*,
        pr.follower_since,
        pr.unfollower_at,
        pr.following,
        pr.follower,
        pr.following_since,
        pr.banned_me,
        EXTRACT(EPOCH FROM (pr.unfollower_at - pr.follower_since))/86400 as days_followed,
        (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
        (SELECT COUNT(*) FROM snapshots WHERE person_id = p.id) as snapshot_count,
        (SELECT COUNT(DISTINCT image_path_360x270) FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL) as image_count,
        (SELECT image_path_360x270 FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL ORDER BY observed_at DESC LIMIT 1) as image_url,
        (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as current_show,
        (SELECT observed_at FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as session_observed_at,
        (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as tags
       FROM persons p
       INNER JOIN profiles pr ON pr.person_id = p.id
       WHERE pr.unfollower_at IS NOT NULL
       ORDER BY pr.unfollower_at DESC`
    );
    return result.rows;
  }

  /**
   * Clear all following records (for debugging/reset)
   */
  static async clearFollowing(): Promise<number> {
    const result = await query(
      `UPDATE profiles SET
        following = FALSE,
        following_since = NULL,
        following_checked_at = NULL,
        unfollowed_at = NOW()
       WHERE following = TRUE`
    );
    return result.rowCount || 0;
  }

  /**
   * Get all subscribers (current or past)
   * Filter: 'all' | 'active' | 'inactive'
   */
  static async getSubs(filter: string = 'all'): Promise<any[]> {
    let whereClause = '(pr.active_sub = TRUE OR pr.first_service_date IS NOT NULL)';
    if (filter === 'active') {
      whereClause = 'pr.active_sub = TRUE';
    } else if (filter === 'inactive') {
      whereClause = 'pr.active_sub = FALSE AND pr.first_service_date IS NOT NULL';
    }

    const result = await query(
      `SELECT
        p.*,
        pr.active_sub,
        pr.first_service_date,
        pr.last_service_date,
        pr.notes,
        pr.friend_tier,
        pr.following,
        pr.follower,
        pr.banned_me,
        pr.watch_list,
        (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
        (SELECT COUNT(DISTINCT image_path_360x270) FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL) as image_count,
        (SELECT image_path_360x270 FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL ORDER BY observed_at DESC LIMIT 1) as image_url,
        (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as current_show,
        (SELECT observed_at FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as session_observed_at,
        (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as tags
       FROM persons p
       INNER JOIN profiles pr ON pr.person_id = p.id
       WHERE ${whereClause}
       ORDER BY pr.first_service_date DESC NULLS LAST, p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get all friends with tier assigned
   * Optional tier filter (1-4)
   * Excludes active subs - they appear in the Subs tab instead
   */
  static async getFriends(tier?: number): Promise<any[]> {
    const tierFilter = tier ? `AND pr.friend_tier = ${tier}` : '';

    const result = await query(
      `SELECT
        p.*,
        pr.friend_tier,
        pr.notes,
        pr.active_sub,
        pr.first_service_date,
        pr.last_service_date,
        pr.following,
        pr.follower,
        pr.banned_me,
        pr.watch_list,
        (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
        (SELECT COUNT(DISTINCT image_path_360x270) FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL) as image_count,
        (SELECT image_path_360x270 FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL ORDER BY observed_at DESC LIMIT 1) as image_url,
        (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as current_show,
        (SELECT observed_at FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as session_observed_at,
        (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as tags
       FROM persons p
       INNER JOIN profiles pr ON pr.person_id = p.id
       WHERE pr.friend_tier IS NOT NULL
         AND (pr.active_sub IS NULL OR pr.active_sub = FALSE)
         ${tierFilter}
       ORDER BY pr.friend_tier ASC, p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get all users who have banned me
   */
  static async getBans(): Promise<any[]> {
    const result = await query(
      `SELECT
        p.*,
        pr.banned_me,
        pr.banned_at,
        pr.notes,
        pr.friend_tier,
        pr.active_sub,
        pr.following,
        pr.follower,
        pr.watch_list,
        (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
        (SELECT COUNT(DISTINCT image_path_360x270) FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL) as image_count,
        (SELECT image_path_360x270 FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL ORDER BY observed_at DESC LIMIT 1) as image_url,
        (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as current_show,
        (SELECT observed_at FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as session_observed_at,
        (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as tags
       FROM persons p
       INNER JOIN profiles pr ON pr.person_id = p.id
       WHERE pr.banned_me = TRUE
       ORDER BY pr.banned_at DESC NULLS LAST, p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get all users on the watchlist
   */
  static async getWatchlist(): Promise<any[]> {
    const result = await query(
      `SELECT
        p.*,
        pr.watch_list,
        pr.notes,
        pr.friend_tier,
        pr.active_sub,
        pr.first_service_date,
        pr.last_service_date,
        pr.following,
        pr.follower,
        pr.banned_me,
        (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
        (SELECT COUNT(DISTINCT image_path_360x270) FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL) as image_count,
        (SELECT image_path_360x270 FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL ORDER BY observed_at DESC LIMIT 1) as image_url,
        (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as current_show,
        (SELECT observed_at FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as session_observed_at,
        (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as tags
       FROM persons p
       INNER JOIN profiles pr ON pr.person_id = p.id
       WHERE pr.watch_list = TRUE
       ORDER BY p.last_seen_at DESC`
    );
    return result.rows;
  }

  /**
   * Get all users who are Doms (from service_relationships table)
   * filter: 'all' | service level filter
   */
  static async getDoms(filter: string = 'all'): Promise<any[]> {
    let whereClause = `sr.service_role = 'dom'`;
    if (filter !== 'all') {
      whereClause += ` AND sr.service_level = $1`;
    }

    const queryParams = filter !== 'all' ? [filter] : [];

    const result = await query(
      `SELECT
        p.*,
        pr.following,
        pr.follower,
        pr.banned_me,
        pr.active_sub,
        pr.friend_tier,
        pr.watch_list,
        pr.notes,
        sr.service_level,
        sr.service_types,
        sr.started_at as dom_started_at,
        sr.ended_at as dom_ended_at,
        sr.notes as dom_notes,
        (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
        (SELECT COUNT(DISTINCT image_path_360x270) FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL) as image_count,
        (SELECT image_path_360x270 FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL ORDER BY observed_at DESC LIMIT 1) as image_url,
        (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as current_show,
        (SELECT observed_at FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as session_observed_at,
        (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as tags
       FROM persons p
       INNER JOIN profiles pr ON pr.person_id = p.id
       INNER JOIN service_relationships sr ON sr.profile_id = pr.id
       WHERE ${whereClause}
       ORDER BY sr.started_at DESC NULLS LAST, p.last_seen_at DESC`,
      queryParams
    );
    return result.rows;
  }

  /**
   * Get all users who have tipped me (in my room)
   * Returns users with aggregated tip data
   */
  static async getTippedMe(): Promise<any[]> {
    const result = await query(
      `SELECT
        p.*,
        pr.following,
        pr.follower,
        pr.banned_me,
        pr.active_sub,
        pr.friend_tier,
        pr.watch_list,
        pr.notes,
        SUM((i.metadata->>'tokens')::int) as total_tokens_received,
        COUNT(*) as tip_count,
        MAX(i.timestamp) as last_tip_at,
        MIN(i.timestamp) as first_tip_at,
        (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
        (SELECT COUNT(DISTINCT image_path_360x270) FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL) as image_count,
        (SELECT image_path_360x270 FROM affiliate_api_snapshots WHERE person_id = p.id AND image_path_360x270 IS NOT NULL ORDER BY observed_at DESC LIMIT 1) as image_url,
        (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as current_show,
        (SELECT observed_at FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as session_observed_at,
        (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as tags
       FROM persons p
       INNER JOIN profiles pr ON pr.person_id = p.id
       INNER JOIN interactions i ON i.person_id = p.id
       WHERE i.type = 'TIP_EVENT'
         AND i.metadata->>'broadcaster' = 'hudson_cage'
       GROUP BY p.id, pr.id
       ORDER BY total_tokens_received DESC`
    );
    return result.rows;
  }

  /**
   * Get all users/models I have tipped (in their rooms)
   * Returns models with aggregated tip data from my tipping activity
   */
  static async getTippedByMe(): Promise<any[]> {
    // Find models I've tipped: TIP_EVENTs where hudson_cage is the tipper
    // This is recorded when the person_id is MY person_id, and broadcaster is the model's room
    const result = await query(
      `SELECT
        model_person.id,
        model_person.username,
        model_person.role,
        model_person.last_seen_at,
        model_person.first_seen_at,
        model_pr.following,
        model_pr.follower,
        model_pr.banned_me,
        model_pr.active_sub,
        model_pr.friend_tier,
        model_pr.watch_list,
        model_pr.notes,
        SUM((i.metadata->>'tokens')::int) as total_tokens_sent,
        COUNT(*) as tip_count,
        MAX(i.timestamp) as last_tip_at,
        MIN(i.timestamp) as first_tip_at,
        i.metadata->>'broadcaster' as broadcaster,
        (SELECT COUNT(*) FROM interactions WHERE person_id = model_person.id) as interaction_count,
        (SELECT COUNT(DISTINCT image_path_360x270) FROM affiliate_api_snapshots WHERE person_id = model_person.id AND image_path_360x270 IS NOT NULL) as image_count,
        (SELECT image_path_360x270 FROM affiliate_api_snapshots WHERE person_id = model_person.id AND image_path_360x270 IS NOT NULL ORDER BY observed_at DESC LIMIT 1) as image_url,
        (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = model_person.id ORDER BY observed_at DESC LIMIT 1) as current_show,
        (SELECT observed_at FROM affiliate_api_snapshots WHERE person_id = model_person.id ORDER BY observed_at DESC LIMIT 1) as session_observed_at,
        (SELECT tags FROM affiliate_api_snapshots WHERE person_id = model_person.id ORDER BY observed_at DESC LIMIT 1) as tags
       FROM interactions i
       INNER JOIN persons my_person ON my_person.id = i.person_id AND my_person.username = 'hudson_cage'
       INNER JOIN persons model_person ON LOWER(model_person.username) = LOWER(i.metadata->>'broadcaster')
       LEFT JOIN profiles model_pr ON model_pr.person_id = model_person.id
       WHERE i.type = 'TIP_EVENT'
         AND i.metadata->>'broadcaster' IS NOT NULL
         AND i.metadata->>'broadcaster' != 'hudson_cage'
       GROUP BY model_person.id, model_pr.id, i.metadata->>'broadcaster'
       ORDER BY total_tokens_sent DESC`
    );
    return result.rows;
  }
}

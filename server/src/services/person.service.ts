import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import type { Person, PersonRole, Platform, PersonAlias } from '../types/models.js';

export interface CreatePersonParams {
  username: string;
  platform?: Platform;
  role?: PersonRole;
  rid?: number | null;
  did?: number | null;
}

export class PersonService {
  /**
   * Find person by ID
   */
  static async findById(id: string): Promise<Person | null> {
    const result = await query<Person>('SELECT * FROM persons WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  /**
   * Find person by username (checks both persons.username and person_aliases.alias)
   */
  static async findByUsername(
    username: string,
    platform: Platform = 'chaturbate'
  ): Promise<Person | null> {
    const normalizedUsername = username.toLowerCase();

    // First check direct username match
    let result = await query<Person>(
      'SELECT * FROM persons WHERE LOWER(username) = $1 AND platform = $2',
      [normalizedUsername, platform]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Check aliases
    result = await query<Person>(
      `SELECT p.* FROM persons p
       INNER JOIN person_aliases pa ON p.id = pa.person_id
       WHERE LOWER(pa.alias) = $1 AND pa.platform = $2`,
      [normalizedUsername, platform]
    );

    return result.rows[0] || null;
  }

  /**
   * Find or create a person
   * Auto-excludes if username is 'smk_lover'
   */
  static async findOrCreate(params: CreatePersonParams): Promise<Person> {
    const { username, platform = 'chaturbate', role = 'UNKNOWN', rid = null, did = null } = params;

    const normalizedUsername = username.toLowerCase();

    // Check if person exists
    let person = await this.findByUsername(normalizedUsername, platform);

    if (person) {
      // Update last_seen_at and refresh person data
      await query(
        'UPDATE persons SET last_seen_at = NOW(), rid = COALESCE($1, rid), did = COALESCE($2, did) WHERE id = $3',
        [rid, did, person.id]
      );
      // Refetch to get updated data
      const updated = await this.findById(person.id);
      return updated!;
    }

    // Create new person
    const now = new Date();
    const isExcluded = normalizedUsername === 'smk_lover';

    const result = await query<Person>(
      `INSERT INTO persons (username, platform, role, rid, did, first_seen_at, last_seen_at, is_excluded)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [normalizedUsername, platform, role, rid, did, now, now, isExcluded]
    );

    person = result.rows[0];

    if (isExcluded) {
      logger.info(`Auto-excluded user: ${normalizedUsername}`);
    }

    logger.info(`Created person: ${person.id} (${person.username})`);
    return person;
  }

  /**
   * Update person role and IDs
   */
  static async update(
    id: string,
    updates: Partial<Pick<Person, 'role' | 'rid' | 'did' | 'is_excluded'>>
  ): Promise<Person | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.role !== undefined) {
      setClauses.push(`role = $${paramIndex++}`);
      values.push(updates.role);
    }
    if (updates.rid !== undefined) {
      setClauses.push(`rid = $${paramIndex++}`);
      values.push(updates.rid);
    }
    if (updates.did !== undefined) {
      setClauses.push(`did = $${paramIndex++}`);
      values.push(updates.did);
    }
    if (updates.is_excluded !== undefined) {
      setClauses.push(`is_excluded = $${paramIndex++}`);
      values.push(updates.is_excluded);
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = await query<Person>(
      `UPDATE persons SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Add an alias for a person (username change tracking)
   */
  static async addAlias(
    personId: string,
    alias: string,
    platform: Platform = 'chaturbate'
  ): Promise<PersonAlias> {
    const normalizedAlias = alias.toLowerCase();

    // Invalidate any current aliases
    await query(
      `UPDATE person_aliases
       SET valid_to = NOW()
       WHERE person_id = $1 AND platform = $2 AND valid_to IS NULL`,
      [personId, platform]
    );

    // Create new alias
    const result = await query<PersonAlias>(
      `INSERT INTO person_aliases (person_id, alias, platform, valid_from)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [personId, normalizedAlias, platform]
    );

    logger.info(`Added alias for person ${personId}: ${normalizedAlias}`);
    return result.rows[0];
  }

  /**
   * Get all aliases for a person
   */
  static async getAliases(personId: string): Promise<PersonAlias[]> {
    const result = await query<PersonAlias>(
      'SELECT * FROM person_aliases WHERE person_id = $1 ORDER BY valid_from DESC',
      [personId]
    );
    return result.rows;
  }

  /**
   * Find all non-excluded persons (for aggregates)
   */
  static async findAllNonExcluded(limit = 100, offset = 0): Promise<Person[]> {
    const result = await query<Person>(
      `SELECT * FROM persons
       WHERE is_excluded = false
       ORDER BY last_seen_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  /**
   * Search usernames for autocomplete
   */
  static async searchUsernames(searchQuery: string, limit = 10): Promise<string[]> {
    const normalizedQuery = searchQuery.toLowerCase();

    const result = await query<{ username: string }>(
      `SELECT DISTINCT username FROM persons
       WHERE LOWER(username) LIKE $1
       AND is_excluded = false
       ORDER BY username ASC
       LIMIT $2`,
      [`${normalizedQuery}%`, limit]
    );

    return result.rows.map((row) => row.username);
  }

  /**
   * Get all persons with source information
   * @param limit - Maximum number of results
   * @param offset - Offset for pagination
   * @param ownerUsername - Username to deprioritize (push to bottom of results)
   */
  static async findAllWithSource(limit = 100, offset = 0, ownerUsername?: string): Promise<any[]> {
    // Build ORDER BY clause to deprioritize own profile
    const orderByClause = ownerUsername
      ? `ORDER BY CASE WHEN LOWER(p.username) = LOWER($3) THEN 1 ELSE 0 END, last_seen_at DESC`
      : `ORDER BY last_seen_at DESC`;

    const queryText = `SELECT
        p.*,
        COALESCE(
          (SELECT source FROM snapshots WHERE person_id = p.id ORDER BY created_at ASC LIMIT 1),
          (SELECT source FROM interactions WHERE person_id = p.id ORDER BY created_at ASC LIMIT 1),
          'manual'
        ) as source,
        (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
        (SELECT COUNT(*) FROM snapshots WHERE person_id = p.id) as snapshot_count,
        (SELECT COUNT(*) FROM media_locator WHERE person_id = p.id) as image_count,
        COALESCE(
          (SELECT file_path FROM media_locator WHERE person_id = p.id AND is_primary = true LIMIT 1),
          (SELECT file_path FROM media_locator WHERE person_id = p.id ORDER BY uploaded_at DESC LIMIT 1)
        ) as image_url,
        COALESCE(
          (SELECT COALESCE(captured_at, uploaded_at) FROM media_locator WHERE person_id = p.id AND is_primary = true LIMIT 1),
          (SELECT COALESCE(captured_at, uploaded_at) FROM media_locator WHERE person_id = p.id ORDER BY uploaded_at DESC LIMIT 1)
        ) as image_captured_at,
        (SELECT current_show FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as current_show,
        (SELECT observed_at FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as session_observed_at,
        (SELECT tags FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1) as tags,
        (SELECT age FROM profiles WHERE person_id = p.id LIMIT 1) as age,
        (SELECT following FROM profiles WHERE person_id = p.id LIMIT 1) as following,
        (SELECT follower FROM profiles WHERE person_id = p.id LIMIT 1) as follower,
        (SELECT following_since FROM profiles WHERE person_id = p.id LIMIT 1) as following_since,
        (SELECT follower_since FROM profiles WHERE person_id = p.id LIMIT 1) as follower_since,
        (SELECT unfollowed_at FROM profiles WHERE person_id = p.id LIMIT 1) as unfollowed_at,
        (SELECT unfollower_at FROM profiles WHERE person_id = p.id LIMIT 1) as unfollower_at,
        (SELECT banned_me FROM profiles WHERE person_id = p.id LIMIT 1) as banned_me,
        (SELECT has_videos FROM profiles WHERE person_id = p.id LIMIT 1) as has_videos,
        (SELECT rating FROM profiles WHERE person_id = p.id LIMIT 1) as rating
       FROM persons p
       WHERE is_excluded = false
       ${orderByClause}
       LIMIT $1 OFFSET $2`;

    const params = ownerUsername ? [limit, offset, ownerUsername] : [limit, offset];
    const result = await query(queryText, params);
    return result.rows;
  }

  /**
   * Delete a person and all related data
   */
  static async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM persons WHERE id = $1 RETURNING id', [id]);
    return result.rows.length > 0;
  }

  /**
   * Get image history for a person (unique images, most recent first)
   * Uses media_locator as the single source of truth
   */
  static async getImageHistory(personId: string, limit: number = 10): Promise<any[]> {
    const result = await query(
      `SELECT DISTINCT ON (ml.file_path)
        ml.file_path as image_url,
        aas.observed_at,
        aas.session_start,
        aas.current_show,
        aas.num_users,
        aas.room_subject
       FROM media_locator ml
       LEFT JOIN affiliate_api_snapshots aas ON aas.media_locator_id = ml.id
       WHERE ml.person_id = $1
       ORDER BY ml.file_path, aas.observed_at DESC NULLS LAST`,
      [personId]
    );

    // Sort by observed_at descending and limit
    const sorted = result.rows.sort(
      (a, b) => {
        const dateA = a.observed_at ? new Date(a.observed_at).getTime() : 0;
        const dateB = b.observed_at ? new Date(b.observed_at).getTime() : 0;
        return dateB - dateA;
      }
    );

    return sorted.slice(0, limit);
  }
}

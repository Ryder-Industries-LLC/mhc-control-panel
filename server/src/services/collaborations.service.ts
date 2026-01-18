/**
 * Collaborations Service
 *
 * Manages collaborations between broadcasters - tracking who has appeared on cam together.
 * Uses a symmetric relationship model where a single row represents both directions.
 */

import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface Collaboration {
  id: string;
  collaboratorPersonId: string;
  collaboratorUsername: string;
  notes: string | null;
  firstSeenAt: Date;
  createdAt: Date;
}

export interface CollaborationRow {
  id: string;
  person_id: string;
  collaborator_id: string;
  collaborator_username: string;
  notes: string | null;
  first_seen_at: Date;
  created_at: Date;
}

export class CollaborationsService {
  /**
   * Get all collaborators for a person
   */
  static async getCollaborators(personId: string): Promise<Collaboration[]> {
    const sql = `
      SELECT
        cv.id,
        cv.person_id,
        cv.collaborator_id,
        p.username AS collaborator_username,
        cv.notes,
        cv.first_seen_at,
        cv.created_at
      FROM collaborations_view cv
      JOIN persons p ON p.id = cv.collaborator_id
      WHERE cv.person_id = $1
      ORDER BY cv.first_seen_at DESC
    `;

    try {
      const result = await query(sql, [personId]);
      return result.rows.map(this.mapRowToCollaboration);
    } catch (error) {
      logger.error('Error getting collaborators', { error, personId });
      throw error;
    }
  }

  /**
   * Add a collaboration between two people (handles ordering internally via SQL function)
   */
  static async addCollaboration(
    person1Id: string,
    person2Id: string,
    notes?: string
  ): Promise<string | null> {
    const sql = `SELECT add_collaboration($1, $2, $3) AS id`;

    try {
      const result = await query(sql, [person1Id, person2Id, notes || null]);
      const id = result.rows[0]?.id;

      if (id) {
        logger.info('Collaboration added', { person1Id, person2Id, id });
      } else {
        logger.warn('Collaboration not added (possibly self-reference)', { person1Id, person2Id });
      }

      return id;
    } catch (error) {
      logger.error('Error adding collaboration', { error, person1Id, person2Id });
      throw error;
    }
  }

  /**
   * Remove a collaboration between two people
   */
  static async removeCollaboration(person1Id: string, person2Id: string): Promise<boolean> {
    const sql = `SELECT remove_collaboration($1, $2) AS removed`;

    try {
      const result = await query(sql, [person1Id, person2Id]);
      const removed = result.rows[0]?.removed === true;

      if (removed) {
        logger.info('Collaboration removed', { person1Id, person2Id });
      }

      return removed;
    } catch (error) {
      logger.error('Error removing collaboration', { error, person1Id, person2Id });
      throw error;
    }
  }

  /**
   * Check if two people are collaborators
   */
  static async areCollaborators(person1Id: string, person2Id: string): Promise<boolean> {
    // Ensure consistent ordering for query
    const [a, b] = person1Id < person2Id ? [person1Id, person2Id] : [person2Id, person1Id];

    const sql = `
      SELECT EXISTS(
        SELECT 1 FROM collaborations
        WHERE person_a_id = $1 AND person_b_id = $2
      ) AS exists
    `;

    try {
      const result = await query(sql, [a, b]);
      return result.rows[0]?.exists === true;
    } catch (error) {
      logger.error('Error checking collaboration', { error, person1Id, person2Id });
      throw error;
    }
  }

  /**
   * Add collaborations for a group of people who appeared together
   * Creates a collaboration between each pair
   */
  static async addCollaborationGroup(personIds: string[], notes?: string): Promise<number> {
    if (personIds.length < 2) {
      return 0;
    }

    let added = 0;

    // Create pairs from the group
    for (let i = 0; i < personIds.length; i++) {
      for (let j = i + 1; j < personIds.length; j++) {
        const id = await this.addCollaboration(personIds[i], personIds[j], notes);
        if (id) {
          added++;
        }
      }
    }

    logger.info('Collaboration group added', { personCount: personIds.length, collaborationsAdded: added });
    return added;
  }

  /**
   * Get collaboration by ID
   */
  static async getById(collaborationId: string): Promise<Collaboration | null> {
    const sql = `
      SELECT
        c.id,
        c.person_a_id AS person_id,
        c.person_b_id AS collaborator_id,
        p.username AS collaborator_username,
        c.notes,
        c.first_seen_at,
        c.created_at
      FROM collaborations c
      JOIN persons p ON p.id = c.person_b_id
      WHERE c.id = $1
    `;

    try {
      const result = await query(sql, [collaborationId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToCollaboration(result.rows[0]);
    } catch (error) {
      logger.error('Error getting collaboration by ID', { error, collaborationId });
      throw error;
    }
  }

  /**
   * Update collaboration notes
   */
  static async updateNotes(collaborationId: string, notes: string | null): Promise<boolean> {
    const sql = `
      UPDATE collaborations
      SET notes = $2
      WHERE id = $1
      RETURNING id
    `;

    try {
      const result = await query(sql, [collaborationId, notes]);
      const updated = result.rowCount !== null && result.rowCount > 0;

      if (updated) {
        logger.info('Collaboration notes updated', { collaborationId });
      }

      return updated;
    } catch (error) {
      logger.error('Error updating collaboration notes', { error, collaborationId });
      throw error;
    }
  }

  /**
   * Get total collaboration count for a person
   */
  static async getCount(personId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) FROM collaborations_view
      WHERE person_id = $1
    `;

    try {
      const result = await query(sql, [personId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Error getting collaboration count', { error, personId });
      throw error;
    }
  }

  /**
   * Map database row to Collaboration object
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mapRowToCollaboration(row: any): Collaboration {
    return {
      id: row.id,
      collaboratorPersonId: row.collaborator_id,
      collaboratorUsername: row.collaborator_username,
      notes: row.notes,
      firstSeenAt: row.first_seen_at,
      createdAt: row.created_at,
    };
  }
}

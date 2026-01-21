/**
 * Alternate Accounts Service
 *
 * Manages links between profiles that belong to the same person (alternate accounts/usernames).
 * Uses a symmetric relationship model where a single row represents both directions.
 */

import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface AlternateAccount {
  id: string;
  alternatePersonId: string;
  alternateUsername: string;
  notes: string | null;
  createdAt: Date;
}

export interface AlternateAccountRow {
  id: string;
  person_id: string;
  alternate_person_id: string;
  alternate_username: string;
  notes: string | null;
  created_at: Date;
}

export class AlternateAccountsService {
  /**
   * Get all alternate accounts for a person
   */
  static async getAlternateAccounts(personId: string): Promise<AlternateAccount[]> {
    const sql = `
      SELECT
        av.id,
        av.person_id,
        av.alternate_person_id,
        p.username AS alternate_username,
        av.notes,
        av.created_at
      FROM alternate_accounts_view av
      JOIN persons p ON p.id = av.alternate_person_id
      WHERE av.person_id = $1
      ORDER BY av.created_at DESC
    `;

    try {
      const result = await query(sql, [personId]);
      return result.rows.map(this.mapRowToAlternateAccount);
    } catch (error) {
      logger.error('Error getting alternate accounts', { error, personId });
      throw error;
    }
  }

  /**
   * Add an alternate account link between two people (handles ordering internally via SQL function)
   */
  static async addAlternateAccount(
    person1Id: string,
    person2Id: string,
    notes?: string
  ): Promise<string | null> {
    const sql = `SELECT add_alternate_account($1, $2, $3) AS id`;

    try {
      const result = await query(sql, [person1Id, person2Id, notes || null]);
      const id = result.rows[0]?.id;

      if (id) {
        logger.info('Alternate account link added', { person1Id, person2Id, id });
      } else {
        logger.warn('Alternate account link not added (possibly self-reference or duplicate)', { person1Id, person2Id });
      }

      return id;
    } catch (error) {
      logger.error('Error adding alternate account link', { error, person1Id, person2Id });
      throw error;
    }
  }

  /**
   * Remove an alternate account link between two people
   */
  static async removeAlternateAccount(person1Id: string, person2Id: string): Promise<boolean> {
    const sql = `SELECT remove_alternate_account($1, $2) AS removed`;

    try {
      const result = await query(sql, [person1Id, person2Id]);
      const removed = result.rows[0]?.removed === true;

      if (removed) {
        logger.info('Alternate account link removed', { person1Id, person2Id });
      }

      return removed;
    } catch (error) {
      logger.error('Error removing alternate account link', { error, person1Id, person2Id });
      throw error;
    }
  }

  /**
   * Check if two people are linked as alternate accounts
   */
  static async areAlternateAccounts(person1Id: string, person2Id: string): Promise<boolean> {
    // Ensure consistent ordering for query
    const [a, b] = person1Id < person2Id ? [person1Id, person2Id] : [person2Id, person1Id];

    const sql = `
      SELECT EXISTS(
        SELECT 1 FROM alternate_accounts
        WHERE person_a_id = $1 AND person_b_id = $2
      ) AS exists
    `;

    try {
      const result = await query(sql, [a, b]);
      return result.rows[0]?.exists === true;
    } catch (error) {
      logger.error('Error checking alternate account link', { error, person1Id, person2Id });
      throw error;
    }
  }

  /**
   * Get alternate account link by ID
   */
  static async getById(linkId: string): Promise<AlternateAccount | null> {
    const sql = `
      SELECT
        aa.id,
        aa.person_a_id AS person_id,
        aa.person_b_id AS alternate_person_id,
        p.username AS alternate_username,
        aa.notes,
        aa.created_at
      FROM alternate_accounts aa
      JOIN persons p ON p.id = aa.person_b_id
      WHERE aa.id = $1
    `;

    try {
      const result = await query(sql, [linkId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToAlternateAccount(result.rows[0]);
    } catch (error) {
      logger.error('Error getting alternate account link by ID', { error, linkId });
      throw error;
    }
  }

  /**
   * Update alternate account link notes
   */
  static async updateNotes(linkId: string, notes: string | null): Promise<boolean> {
    const sql = `
      UPDATE alternate_accounts
      SET notes = $2
      WHERE id = $1
      RETURNING id
    `;

    try {
      const result = await query(sql, [linkId, notes]);
      const updated = result.rowCount !== null && result.rowCount > 0;

      if (updated) {
        logger.info('Alternate account link notes updated', { linkId });
      }

      return updated;
    } catch (error) {
      logger.error('Error updating alternate account link notes', { error, linkId });
      throw error;
    }
  }

  /**
   * Get total alternate account count for a person
   */
  static async getCount(personId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) FROM alternate_accounts_view
      WHERE person_id = $1
    `;

    try {
      const result = await query(sql, [personId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Error getting alternate account count', { error, personId });
      throw error;
    }
  }

  /**
   * Map database row to AlternateAccount object
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mapRowToAlternateAccount(row: any): AlternateAccount {
    return {
      id: row.id,
      alternatePersonId: row.alternate_person_id,
      alternateUsername: row.alternate_username,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }
}

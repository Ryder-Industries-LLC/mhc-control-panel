import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface ProfileNote {
  id: string;
  profile_id: number;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export class ProfileNotesService {
  /**
   * Get all notes for a profile (paginated, newest first)
   */
  static async getNotes(
    profileId: number,
    limit = 20,
    offset = 0
  ): Promise<{ notes: ProfileNote[]; total: number }> {
    const countSql = `SELECT COUNT(*) FROM profile_notes WHERE profile_id = $1`;
    const notesSql = `
      SELECT * FROM profile_notes
      WHERE profile_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const [countResult, notesResult] = await Promise.all([
        query(countSql, [profileId]),
        query(notesSql, [profileId, limit, offset]),
      ]);

      return {
        notes: notesResult.rows.map(this.mapRowToNote),
        total: parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      logger.error('Error getting profile notes', { error, profileId });
      throw error;
    }
  }

  /**
   * Get a single note by ID
   */
  static async getById(noteId: string): Promise<ProfileNote | null> {
    const sql = `SELECT * FROM profile_notes WHERE id = $1`;

    try {
      const result = await query(sql, [noteId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToNote(result.rows[0]);
    } catch (error) {
      logger.error('Error getting note by ID', { error, noteId });
      throw error;
    }
  }

  /**
   * Add a new note to a profile
   */
  static async addNote(profileId: number, content: string): Promise<ProfileNote> {
    const sql = `
      INSERT INTO profile_notes (profile_id, content)
      VALUES ($1, $2)
      RETURNING *
    `;

    try {
      const result = await query(sql, [profileId, content]);
      logger.info('Profile note added', { profileId, noteId: result.rows[0].id });
      return this.mapRowToNote(result.rows[0]);
    } catch (error) {
      logger.error('Error adding profile note', { error, profileId });
      throw error;
    }
  }

  /**
   * Update an existing note
   */
  static async updateNote(noteId: string, content: string): Promise<ProfileNote | null> {
    const sql = `
      UPDATE profile_notes
      SET content = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await query(sql, [noteId, content]);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Profile note updated', { noteId });
      return this.mapRowToNote(result.rows[0]);
    } catch (error) {
      logger.error('Error updating profile note', { error, noteId });
      throw error;
    }
  }

  /**
   * Delete a note
   */
  static async deleteNote(noteId: string): Promise<boolean> {
    const sql = `DELETE FROM profile_notes WHERE id = $1 RETURNING id`;

    try {
      const result = await query(sql, [noteId]);
      const deleted = result.rowCount !== null && result.rowCount > 0;
      if (deleted) {
        logger.info('Profile note deleted', { noteId });
      }
      return deleted;
    } catch (error) {
      logger.error('Error deleting profile note', { error, noteId });
      throw error;
    }
  }

  /**
   * Get total note count for a profile
   */
  static async getCount(profileId: number): Promise<number> {
    const sql = `SELECT COUNT(*) FROM profile_notes WHERE profile_id = $1`;

    try {
      const result = await query(sql, [profileId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Error getting note count', { error, profileId });
      throw error;
    }
  }

  /**
   * Map database row to ProfileNote object
   */
  private static mapRowToNote(row: any): ProfileNote {
    return {
      id: row.id,
      profile_id: row.profile_id,
      content: row.content,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

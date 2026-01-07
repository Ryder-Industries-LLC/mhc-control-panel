import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export type PriorityLevel = 1 | 2; // 1 = initial population, 2 = frequent tracking
export type PriorityStatus = 'pending' | 'completed' | 'active';

export interface PriorityLookup {
  id: string;
  username: string;
  priority_level: PriorityLevel;
  status: PriorityStatus;
  created_at: Date;
  completed_at: Date | null;
  last_checked_at: Date | null;
  notes: string | null;
}

export class PriorityLookupService {
  /**
   * Add a user to the priority lookup queue
   */
  static async add(
    username: string,
    priorityLevel: PriorityLevel,
    notes?: string
  ): Promise<PriorityLookup> {
    const status: PriorityStatus = priorityLevel === 2 ? 'active' : 'pending';

    const sql = `
      INSERT INTO priority_lookups (username, priority_level, status, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username) DO UPDATE SET
        priority_level = EXCLUDED.priority_level,
        status = EXCLUDED.status,
        notes = COALESCE(EXCLUDED.notes, priority_lookups.notes),
        created_at = NOW()
      RETURNING *
    `;

    const result = await query(sql, [username.toLowerCase(), priorityLevel, status, notes || null]);

    logger.info('Priority lookup added', {
      username,
      priorityLevel,
      status,
    });

    return result.rows[0] as PriorityLookup;
  }

  /**
   * Remove a user from the priority lookup queue
   */
  static async remove(username: string): Promise<boolean> {
    const sql = 'DELETE FROM priority_lookups WHERE username = $1';
    const result = await query(sql, [username.toLowerCase()]);

    logger.info('Priority lookup removed', {
      username,
      deleted: (result.rowCount || 0) > 0,
    });

    return (result.rowCount || 0) > 0;
  }

  /**
   * Get all priority lookups
   */
  static async getAll(): Promise<PriorityLookup[]> {
    const sql = `
      SELECT * FROM priority_lookups
      ORDER BY priority_level DESC, created_at ASC
    `;
    const result = await query(sql);
    return result.rows as PriorityLookup[];
  }

  /**
   * Get priority lookups by status
   */
  static async getByStatus(status: PriorityStatus): Promise<PriorityLookup[]> {
    const sql = `
      SELECT * FROM priority_lookups
      WHERE status = $1
      ORDER BY priority_level DESC, created_at ASC
    `;
    const result = await query(sql, [status]);
    return result.rows as PriorityLookup[];
  }

  /**
   * Get priority lookups by level
   */
  static async getByLevel(level: PriorityLevel): Promise<PriorityLookup[]> {
    const sql = `
      SELECT * FROM priority_lookups
      WHERE priority_level = $1
      ORDER BY created_at ASC
    `;
    const result = await query(sql, [level]);
    return result.rows as PriorityLookup[];
  }

  /**
   * Get active tracking users (Priority 2 with status='active')
   */
  static async getActiveTracking(): Promise<PriorityLookup[]> {
    const sql = `
      SELECT * FROM priority_lookups
      WHERE priority_level = 2 AND status = 'active'
      ORDER BY created_at ASC
    `;
    const result = await query(sql);
    return result.rows as PriorityLookup[];
  }

  /**
   * Get pending initial population users (Priority 1 with status='pending')
   */
  static async getPendingInitial(): Promise<PriorityLookup[]> {
    const sql = `
      SELECT * FROM priority_lookups
      WHERE priority_level = 1 AND status = 'pending'
      ORDER BY created_at ASC
    `;
    const result = await query(sql);
    return result.rows as PriorityLookup[];
  }

  /**
   * Mark a lookup as completed (for Priority 1)
   */
  static async markCompleted(username: string): Promise<void> {
    const sql = `
      UPDATE priority_lookups
      SET status = 'completed', completed_at = NOW(), last_checked_at = NOW()
      WHERE username = $1
    `;
    await query(sql, [username.toLowerCase()]);

    logger.info('Priority lookup marked completed', { username });
  }

  /**
   * Update last_checked_at timestamp
   */
  static async updateLastChecked(username: string): Promise<void> {
    const sql = `
      UPDATE priority_lookups
      SET last_checked_at = NOW()
      WHERE username = $1
    `;
    await query(sql, [username.toLowerCase()]);
  }

  /**
   * Batch update last_checked_at for multiple users
   */
  static async batchUpdateLastChecked(usernames: string[]): Promise<void> {
    if (usernames.length === 0) return;

    const lowercaseUsernames = usernames.map(u => u.toLowerCase());

    const sql = `
      UPDATE priority_lookups
      SET last_checked_at = NOW()
      WHERE username = ANY($1)
    `;
    await query(sql, [lowercaseUsernames]);

    logger.debug('Batch updated last_checked_at', { count: usernames.length });
  }

  /**
   * Get a specific priority lookup
   */
  static async get(username: string): Promise<PriorityLookup | null> {
    const sql = 'SELECT * FROM priority_lookups WHERE username = $1';
    const result = await query(sql, [username.toLowerCase()]);
    return (result.rows[0] as PriorityLookup) || null;
  }

  /**
   * Check if a user is in the priority queue
   */
  static async exists(username: string): Promise<boolean> {
    const sql = 'SELECT 1 FROM priority_lookups WHERE username = $1';
    const result = await query(sql, [username.toLowerCase()]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Get statistics
   */
  static async getStats(): Promise<{
    total: number;
    byPriority: { priority1: number; priority2: number };
    byStatus: { pending: number; completed: number; active: number };
  }> {
    const sql = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE priority_level = 1) as priority1,
        COUNT(*) FILTER (WHERE priority_level = 2) as priority2,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'active') as active
      FROM priority_lookups
    `;

    const result = await query(sql);
    const row = result.rows[0];

    return {
      total: parseInt(row.total),
      byPriority: {
        priority1: parseInt(row.priority1),
        priority2: parseInt(row.priority2),
      },
      byStatus: {
        pending: parseInt(row.pending),
        completed: parseInt(row.completed),
        active: parseInt(row.active),
      },
    };
  }
}

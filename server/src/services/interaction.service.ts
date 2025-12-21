import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import type { Interaction, InteractionType, InteractionSource } from '../types/models.js';

export interface CreateInteractionParams {
  personId: string;
  type: InteractionType;
  content: string;
  timestamp?: Date;
  source: InteractionSource;
  metadata?: Record<string, unknown> | null;
  streamSessionId?: string | null;
}

export class InteractionService {
  /**
   * Create a new interaction
   */
  static async create(params: CreateInteractionParams): Promise<Interaction> {
    const {
      personId,
      type,
      content,
      timestamp = new Date(),
      source,
      metadata = null,
      streamSessionId = null,
    } = params;

    const result = await query<Interaction>(
      `INSERT INTO interactions (person_id, type, content, timestamp, source, metadata, stream_session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [personId, type, content, timestamp, source, JSON.stringify(metadata), streamSessionId]
    );

    logger.debug(`Created interaction for person ${personId}: ${type}`);
    return result.rows[0];
  }

  /**
   * Get interactions by person
   */
  static async getByPerson(
    personId: string,
    options?: {
      type?: InteractionType;
      source?: InteractionSource;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<Interaction[]> {
    const { type, source, limit = 50, offset = 0, startDate, endDate } = options || {};

    let sql = 'SELECT * FROM interactions WHERE person_id = $1';
    const params: unknown[] = [personId];
    let paramIndex = 2;

    if (type) {
      sql += ` AND type = $${paramIndex++}`;
      params.push(type);
    }

    if (source) {
      sql += ` AND source = $${paramIndex++}`;
      params.push(source);
    }

    if (startDate) {
      sql += ` AND timestamp >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND timestamp <= $${paramIndex++}`;
      params.push(endDate);
    }

    sql += ` ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await query<Interaction>(sql, params);
    return result.rows;
  }

  /**
   * Get interactions by session
   */
  static async getBySession(sessionId: string): Promise<Interaction[]> {
    const result = await query<Interaction>(
      'SELECT * FROM interactions WHERE stream_session_id = $1 ORDER BY timestamp ASC',
      [sessionId]
    );
    return result.rows;
  }

  /**
   * Get interaction count by person
   */
  static async countByPerson(personId: string): Promise<number> {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM interactions WHERE person_id = $1',
      [personId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get latest interaction for a person
   */
  static async getLatest(personId: string): Promise<Interaction | null> {
    const result = await query<Interaction>(
      'SELECT * FROM interactions WHERE person_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [personId]
    );
    return result.rows[0] || null;
  }
}

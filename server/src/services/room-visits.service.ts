import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface RoomVisit {
  id: string;
  person_id: string;
  visited_at: Date;
  event_id: string | null;
  is_broadcasting: boolean;
  session_id: string | null;
  created_at: Date;
}

export interface RoomVisitStats {
  total_visits: number;
  first_visit: Date | null;
  last_visit: Date | null;
  visits_this_week: number;
  visits_this_month: number;
}

export class RoomVisitsService {
  /**
   * Record a room visit for a user
   * Includes deduplication: won't record if user visited within last 5 minutes
   */
  static async recordVisit(
    personId: string,
    visitedAt: Date = new Date(),
    eventId?: string,
    isBroadcasting: boolean = true,
    sessionId?: string | null
  ): Promise<RoomVisit | null> {
    // Check for recent visit (within 5 minutes) to deduplicate
    const recentCheckSql = `
      SELECT id FROM room_visits
      WHERE person_id = $1
        AND visited_at > ($2::timestamptz - INTERVAL '5 minutes')
      LIMIT 1
    `;

    try {
      const recentResult = await query(recentCheckSql, [personId, visitedAt]);
      if (recentResult.rows.length > 0) {
        logger.debug('Skipping duplicate room visit', { personId, visitedAt });
        return null;
      }

      // Insert the visit
      const insertSql = `
        INSERT INTO room_visits (person_id, visited_at, event_id, is_broadcasting, session_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const insertResult = await query(insertSql, [personId, visitedAt, eventId || null, isBroadcasting, sessionId || null]);

      // Update the person's visit count and last visit
      const updatePersonSql = `
        UPDATE persons
        SET room_visit_count = room_visit_count + 1,
            last_room_visit_at = GREATEST(COALESCE(last_room_visit_at, $2), $2)
        WHERE id = $1
      `;
      await query(updatePersonSql, [personId, visitedAt]);

      logger.info('Room visit recorded', { personId, visitedAt, isBroadcasting });
      return this.mapRowToVisit(insertResult.rows[0]);
    } catch (error) {
      logger.error('Error recording room visit', { error, personId });
      throw error;
    }
  }

  /**
   * Get visit history for a person
   */
  static async getVisitsByPersonId(
    personId: string,
    limit = 50,
    offset = 0
  ): Promise<{ visits: RoomVisit[]; total: number }> {
    const countSql = `SELECT COUNT(*) FROM room_visits WHERE person_id = $1`;
    const visitsSql = `
      SELECT * FROM room_visits
      WHERE person_id = $1
      ORDER BY visited_at DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const [countResult, visitsResult] = await Promise.all([
        query(countSql, [personId]),
        query(visitsSql, [personId, limit, offset]),
      ]);

      return {
        visits: visitsResult.rows.map(this.mapRowToVisit),
        total: parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      logger.error('Error getting room visits', { error, personId });
      throw error;
    }
  }

  /**
   * Get visit statistics for a person
   */
  static async getVisitStats(personId: string): Promise<RoomVisitStats> {
    const sql = `
      SELECT
        COUNT(*) as total_visits,
        MIN(visited_at) as first_visit,
        MAX(visited_at) as last_visit,
        COUNT(*) FILTER (WHERE visited_at > NOW() - INTERVAL '7 days') as visits_this_week,
        COUNT(*) FILTER (WHERE visited_at > NOW() - INTERVAL '30 days') as visits_this_month
      FROM room_visits
      WHERE person_id = $1
    `;

    try {
      const result = await query(sql, [personId]);
      const row = result.rows[0];

      return {
        total_visits: parseInt(row.total_visits, 10),
        first_visit: row.first_visit,
        last_visit: row.last_visit,
        visits_this_week: parseInt(row.visits_this_week, 10),
        visits_this_month: parseInt(row.visits_this_month, 10),
      };
    } catch (error) {
      logger.error('Error getting visit stats', { error, personId });
      throw error;
    }
  }

  /**
   * Get recent visitors (users who visited in a time period)
   */
  static async getRecentVisitors(
    days = 7,
    limit = 50
  ): Promise<Array<{
    person_id: string;
    username: string;
    visit_count: number;
    last_visit: Date;
  }>> {
    const sql = `
      SELECT
        p.id as person_id,
        p.username,
        COUNT(rv.id) as visit_count,
        MAX(rv.visited_at) as last_visit
      FROM room_visits rv
      JOIN persons p ON rv.person_id = p.id
      WHERE rv.visited_at > NOW() - INTERVAL '1 day' * $1
      GROUP BY p.id, p.username
      ORDER BY visit_count DESC, last_visit DESC
      LIMIT $2
    `;

    try {
      const result = await query(sql, [days, limit]);
      return result.rows.map(row => ({
        person_id: row.person_id,
        username: row.username,
        visit_count: parseInt(row.visit_count, 10),
        last_visit: row.last_visit,
      }));
    } catch (error) {
      logger.error('Error getting recent visitors', { error });
      throw error;
    }
  }

  /**
   * Get top visitors (all time)
   */
  static async getTopVisitors(limit = 50): Promise<Array<{
    person_id: string;
    username: string;
    visit_count: number;
    first_visit: Date;
    last_visit: Date;
  }>> {
    const sql = `
      SELECT
        p.id as person_id,
        p.username,
        p.room_visit_count as visit_count,
        MIN(rv.visited_at) as first_visit,
        MAX(rv.visited_at) as last_visit
      FROM persons p
      LEFT JOIN room_visits rv ON rv.person_id = p.id
      WHERE p.room_visit_count > 0
      GROUP BY p.id, p.username, p.room_visit_count
      ORDER BY p.room_visit_count DESC
      LIMIT $1
    `;

    try {
      const result = await query(sql, [limit]);
      return result.rows.map(row => ({
        person_id: row.person_id,
        username: row.username,
        visit_count: parseInt(row.visit_count, 10),
        first_visit: row.first_visit,
        last_visit: row.last_visit,
      }));
    } catch (error) {
      logger.error('Error getting top visitors', { error });
      throw error;
    }
  }

  /**
   * Backfill visits from existing interactions (USER_ENTER events)
   */
  static async backfillFromInteractions(broadcasterUsername: string): Promise<{
    processed: number;
    recorded: number;
  }> {
    // Get USER_ENTER interactions where broadcaster is the given username (stored in metadata JSONB)
    const interactionsSql = `
      SELECT DISTINCT ON (i.person_id, date_trunc('hour', i.timestamp))
        i.person_id,
        i.timestamp,
        i.id::text as event_id
      FROM interactions i
      JOIN persons p ON i.person_id = p.id
      WHERE i.type = 'USER_ENTER'
        AND i.metadata->>'broadcaster' = $1
      ORDER BY i.person_id, date_trunc('hour', i.timestamp), i.timestamp
    `;

    try {
      const result = await query(interactionsSql, [broadcasterUsername.toLowerCase()]);
      let processed = 0;
      let recorded = 0;

      for (const row of result.rows) {
        processed++;
        const visit = await this.recordVisit(row.person_id, row.timestamp, row.event_id);
        if (visit) {
          recorded++;
        }
      }

      logger.info('Backfill complete', { processed, recorded, broadcasterUsername });
      return { processed, recorded };
    } catch (error) {
      logger.error('Error backfilling visits', { error, broadcasterUsername });
      throw error;
    }
  }

  /**
   * Map database row to RoomVisit object
   */
  private static mapRowToVisit(row: any): RoomVisit {
    return {
      id: row.id,
      person_id: row.person_id,
      visited_at: row.visited_at,
      event_id: row.event_id,
      is_broadcasting: row.is_broadcasting ?? true,
      session_id: row.session_id,
      created_at: row.created_at,
    };
  }
}

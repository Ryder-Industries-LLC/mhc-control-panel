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
   * Deduplication: Only one visit per person per broadcast session.
   * If no session is active, falls back to 5-minute time window.
   */
  static async recordVisit(
    personId: string,
    visitedAt: Date = new Date(),
    eventId?: string,
    isBroadcasting: boolean = true,
    sessionId?: string | null
  ): Promise<RoomVisit | null> {
    try {
      // Deduplicate by session if we have a session ID
      if (sessionId) {
        const sessionCheckSql = `
          SELECT id FROM room_visits
          WHERE person_id = $1 AND session_id = $2
          LIMIT 1
        `;
        const sessionResult = await query(sessionCheckSql, [personId, sessionId]);
        if (sessionResult.rows.length > 0) {
          logger.debug('Skipping duplicate room visit (same session)', { personId, sessionId });
          return null;
        }
      } else {
        // Fallback to time-based deduplication when not broadcasting
        const recentCheckSql = `
          SELECT id FROM room_visits
          WHERE person_id = $1
            AND visited_at > ($2::timestamptz - INTERVAL '5 minutes')
          LIMIT 1
        `;
        const recentResult = await query(recentCheckSql, [personId, visitedAt]);
        if (recentResult.rows.length > 0) {
          logger.debug('Skipping duplicate room visit (within 5 min)', { personId, visitedAt });
          return null;
        }
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

  // ============================================
  // MY VISITS - When broadcaster visits others
  // ============================================

  /**
   * Record a visit to another user's room (my visit to them)
   */
  static async recordMyVisit(
    personId: string,
    visitedAt: Date = new Date(),
    notes?: string
  ): Promise<{ id: string; person_id: string; visited_at: Date; notes: string | null } | null> {
    try {
      // Insert the visit
      const insertSql = `
        INSERT INTO my_visits (person_id, visited_at, notes)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const insertResult = await query(insertSql, [personId, visitedAt, notes || null]);

      // Update the person's my_visit count
      const updatePersonSql = `
        UPDATE persons
        SET my_visit_count = my_visit_count + 1,
            last_my_visit_at = GREATEST(COALESCE(last_my_visit_at, $2), $2)
        WHERE id = $1
      `;
      await query(updatePersonSql, [personId, visitedAt]);

      logger.info('My visit recorded', { personId, visitedAt });
      return {
        id: insertResult.rows[0].id,
        person_id: insertResult.rows[0].person_id,
        visited_at: insertResult.rows[0].visited_at,
        notes: insertResult.rows[0].notes,
      };
    } catch (error) {
      logger.error('Error recording my visit', { error, personId });
      throw error;
    }
  }

  /**
   * Get my visit stats for a person (how many times I visited them)
   */
  static async getMyVisitStats(personId: string): Promise<{
    total_visits: number;
    first_visit: Date | null;
    last_visit: Date | null;
  }> {
    const sql = `
      SELECT
        COUNT(*) as total_visits,
        MIN(visited_at) as first_visit,
        MAX(visited_at) as last_visit
      FROM my_visits
      WHERE person_id = $1
    `;

    try {
      const result = await query(sql, [personId]);
      const row = result.rows[0];

      return {
        total_visits: parseInt(row.total_visits, 10),
        first_visit: row.first_visit,
        last_visit: row.last_visit,
      };
    } catch (error) {
      logger.error('Error getting my visit stats', { error, personId });
      throw error;
    }
  }

  /**
   * Get my visit history for a person
   */
  static async getMyVisitsByPersonId(
    personId: string,
    limit = 50,
    offset = 0
  ): Promise<{ visits: Array<{ id: string; visited_at: Date; notes: string | null }>; total: number }> {
    const countSql = `SELECT COUNT(*) FROM my_visits WHERE person_id = $1`;
    const visitsSql = `
      SELECT id, visited_at, notes FROM my_visits
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
        visits: visitsResult.rows.map((row) => ({
          id: row.id as string,
          visited_at: row.visited_at as Date,
          notes: row.notes as string | null,
        })),
        total: parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      logger.error('Error getting my visits', { error, personId });
      throw error;
    }
  }

  /**
   * Delete a my visit record
   */
  static async deleteMyVisit(visitId: string): Promise<boolean> {
    try {
      // Get the visit to update person count
      const visitResult = await query('SELECT person_id FROM my_visits WHERE id = $1', [visitId]);
      if (visitResult.rows.length === 0) {
        return false;
      }

      const personId = visitResult.rows[0].person_id;

      // Delete the visit
      await query('DELETE FROM my_visits WHERE id = $1', [visitId]);

      // Decrement the person's visit count
      await query(
        'UPDATE persons SET my_visit_count = GREATEST(0, my_visit_count - 1) WHERE id = $1',
        [personId]
      );

      logger.info('My visit deleted', { visitId, personId });
      return true;
    } catch (error) {
      logger.error('Error deleting my visit', { error, visitId });
      throw error;
    }
  }

  /**
   * Backfill my_visits from event_logs
   * Counts one visit per broadcaster per day based on interactions in OTHER rooms
   *
   * Logic: A "my visit" occurs when raw_event.broadcaster != our username
   * This means the event happened in someone else's room (we visited them)
   *
   * For PMs specifically:
   * - If fromUser=us, toUser=other, broadcaster=other -> we're in their room
   * - If fromUser=other, toUser=us, broadcaster=other -> we're in their room
   *
   * For chat messages:
   * - If broadcaster != us -> we're chatting in their room
   */
  static async backfillMyVisitsFromEventLogs(broadcasterUsername: string): Promise<{
    processed: number;
    recorded: number;
    skipped: number;
  }> {
    // Find all unique broadcaster rooms visited per day
    // The raw_event->>'broadcaster' tells us WHICH ROOM the event occurred in
    // If broadcaster != our username, we were visiting that broadcaster's room
    const sql = `
      SELECT
        raw_event->>'broadcaster' as visited_broadcaster,
        DATE(e.created_at) as visit_date,
        MIN(e.created_at) as first_interaction
      FROM event_logs e
      WHERE raw_event->>'broadcaster' IS NOT NULL
        AND raw_event->>'broadcaster' <> ''
        AND LOWER(raw_event->>'broadcaster') <> LOWER($1)
        AND e.method IN ('chatMessage', 'privateMessage', 'tip', 'userEnter')
      GROUP BY raw_event->>'broadcaster', DATE(e.created_at)
      ORDER BY visit_date, visited_broadcaster
    `;

    try {
      const result = await query(sql, [broadcasterUsername.toLowerCase()]);
      let processed = 0;
      let recorded = 0;
      let skipped = 0;

      for (const row of result.rows) {
        processed++;

        // Skip if broadcaster is empty or null
        if (!row.visited_broadcaster || row.visited_broadcaster.trim() === '') {
          skipped++;
          continue;
        }

        // Get or create the person for the visited broadcaster
        let personResult = await query(
          'SELECT id FROM persons WHERE LOWER(username) = LOWER($1)',
          [row.visited_broadcaster]
        );

        if (personResult.rows.length === 0) {
          // Create the person if they don't exist
          const insertPerson = await query(
            `INSERT INTO persons (username, platform, role)
             VALUES ($1, 'chaturbate', 'MODEL')
             ON CONFLICT (username, platform) DO UPDATE SET username = EXCLUDED.username
             RETURNING id`,
            [row.visited_broadcaster]
          );
          if (insertPerson.rows.length > 0) {
            personResult = insertPerson;
          } else {
            // Try to fetch again in case of race condition
            personResult = await query(
              'SELECT id FROM persons WHERE LOWER(username) = LOWER($1)',
              [row.visited_broadcaster]
            );
          }
        }

        const personId = personResult.rows[0]?.id;

        if (!personId) {
          skipped++;
          continue;
        }

        // Check if we already have a visit for this person on this date
        const existingVisit = await query(
          `SELECT id FROM my_visits
           WHERE person_id = $1 AND DATE(visited_at) = $2`,
          [personId, row.visit_date]
        );

        if (existingVisit.rows.length > 0) {
          skipped++;
          continue;
        }

        // Record the visit
        await this.recordMyVisit(personId, new Date(row.first_interaction));
        recorded++;
      }

      logger.info('My visits backfill complete', { processed, recorded, skipped, broadcasterUsername });
      return { processed, recorded, skipped };
    } catch (error) {
      logger.error('Error backfilling my visits', { error, broadcasterUsername });
      throw error;
    }
  }
}

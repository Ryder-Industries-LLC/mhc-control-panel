import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import { EventEmitter } from 'events';
import { NotesService } from './notes.service.js';

export interface RoomOccupant {
  person_id: string;
  username: string;
  entered_at: Date;
  user_data?: {
    inFanclub?: boolean;
    hasTipped?: boolean;
    isMod?: boolean;
    [key: string]: unknown;
  };
}

export interface RoomOccupantWithProfile extends RoomOccupant {
  // Profile data
  notes_preview?: string;
  tags?: string[];
  friend_tier?: number;
  following?: boolean;
  is_follower?: boolean;
  banned_me?: boolean;
  watch_list?: boolean;
  // Stats
  total_tips?: number;
  tip_count?: number;
  stream_visit_count: number; // Visits this stream (unique entries)
  total_visit_count: number;  // All-time visits
  last_visit_at?: Date;
  // Service relationship
  sub_level?: string;
  dom_level?: string;
}

export type RoomEventType = 'user_enter' | 'user_leave' | 'presence_sync';

export interface RoomEvent {
  type: RoomEventType;
  timestamp: Date;
  user?: RoomOccupantWithProfile;
  occupants?: RoomOccupantWithProfile[];
  occupantCount?: number;
}

// Event emitter for SSE broadcasts (local to this process)
class RoomPresenceEmitter extends EventEmitter {}
export const roomPresenceEmitter = new RoomPresenceEmitter();

// Users to exclude from room presence (never show in Live Monitor)
const EXCLUDED_USERNAMES = new Set(['smk_lover']);

// Track recent enter/leave events to prevent duplicate emissions
// Key: personId, Value: timestamp of last event
const recentEnterEvents: Map<string, number> = new Map();
const recentLeaveEvents: Map<string, number> = new Map();
const DEDUP_WINDOW_MS = 60000; // 1 minute deduplication window

/**
 * Service to track who is currently in the room during a broadcast
 * Uses database for cross-process communication between worker and web
 */
export class RoomPresenceService {
  // Track users who entered this stream (for per-stream visit counting) - per process
  private static streamVisitors: Set<string> = new Set();

  /**
   * Start a new broadcast session - clears presence
   */
  static async startSession(sessionId: string) {
    try {
      // Clear any existing presence
      await query('DELETE FROM room_presence');

      // Update session state
      await query(
        `UPDATE room_presence_state
         SET current_session_id = $1, broadcast_started_at = NOW(), updated_at = NOW()
         WHERE id = 1`,
        [sessionId]
      );

      this.streamVisitors.clear();
      logger.info('Room presence session started', { sessionId });
    } catch (error) {
      logger.error('Error starting room presence session', { error, sessionId });
    }
  }

  /**
   * End the broadcast session - clears presence
   */
  static async endSession() {
    try {
      const countResult = await query('SELECT COUNT(*) as count FROM room_presence');
      const count = parseInt(countResult.rows[0]?.count || '0', 10);

      // Clear presence
      await query('DELETE FROM room_presence');

      // Update session state
      await query(
        `UPDATE room_presence_state
         SET current_session_id = NULL, broadcast_started_at = NULL, updated_at = NOW()
         WHERE id = 1`
      );

      this.streamVisitors.clear();
      logger.info('Room presence session ended', { finalOccupantCount: count });

      // Emit empty presence to all connected clients
      roomPresenceEmitter.emit('room_event', {
        type: 'presence_sync',
        timestamp: new Date(),
        occupants: [],
        occupantCount: 0,
      } as RoomEvent);
    } catch (error) {
      logger.error('Error ending room presence session', { error });
    }
  }

  /**
   * Record a user entering the room
   */
  static async userEnter(
    personId: string,
    username: string,
    userData?: RoomOccupant['user_data']
  ): Promise<RoomOccupantWithProfile | null> {
    // Skip excluded users
    if (EXCLUDED_USERNAMES.has(username.toLowerCase())) {
      logger.debug('Skipping excluded user', { username });
      return null;
    }

    // Check for duplicate enter event within dedup window
    const now = Date.now();
    const lastEnter = recentEnterEvents.get(personId);
    if (lastEnter && (now - lastEnter) < DEDUP_WINDOW_MS) {
      logger.debug('Skipping duplicate user enter event', { username, personId });
      return null;
    }
    recentEnterEvents.set(personId, now);

    // Clean up old entries periodically (every 100 entries)
    if (recentEnterEvents.size > 100) {
      for (const [pid, ts] of recentEnterEvents) {
        if (now - ts > DEDUP_WINDOW_MS) {
          recentEnterEvents.delete(pid);
        }
      }
    }

    try {
      // Track that this user visited this stream
      const isFirstVisitThisStream = !this.streamVisitors.has(personId);
      this.streamVisitors.add(personId);

      // Get current session
      const sessionResult = await query(
        'SELECT current_session_id FROM room_presence_state WHERE id = 1'
      );
      const sessionId = sessionResult.rows[0]?.current_session_id;

      // Upsert into room_presence
      await query(
        `INSERT INTO room_presence (person_id, username, entered_at, session_id, user_data)
         VALUES ($1, $2, NOW(), $3, $4)
         ON CONFLICT (person_id) DO UPDATE
         SET entered_at = NOW(), session_id = $3, user_data = $4`,
        [personId, username, sessionId, JSON.stringify(userData || {})]
      );

      // Get enriched data
      const enrichedOccupant = await this.enrichOccupant(
        { person_id: personId, username, entered_at: new Date(), user_data: userData },
        isFirstVisitThisStream
      );

      logger.debug('User entered room', { username, isFirstVisitThisStream });

      // Emit event for SSE
      const count = await this.getOccupantCount();
      roomPresenceEmitter.emit('room_event', {
        type: 'user_enter',
        timestamp: new Date(),
        user: enrichedOccupant,
        occupantCount: count,
      } as RoomEvent);

      return enrichedOccupant;
    } catch (error) {
      logger.error('Error recording user enter', { error, personId, username });
      return null;
    }
  }

  /**
   * Record a user leaving the room
   */
  static async userLeave(personId: string): Promise<RoomOccupantWithProfile | null> {
    // Check for duplicate leave event within dedup window
    const now = Date.now();
    const lastLeave = recentLeaveEvents.get(personId);
    if (lastLeave && (now - lastLeave) < DEDUP_WINDOW_MS) {
      logger.debug('Skipping duplicate user leave event', { personId });
      return null;
    }
    recentLeaveEvents.set(personId, now);

    // Clean up old entries periodically (every 100 entries)
    if (recentLeaveEvents.size > 100) {
      for (const [pid, ts] of recentLeaveEvents) {
        if (now - ts > DEDUP_WINDOW_MS) {
          recentLeaveEvents.delete(pid);
        }
      }
    }

    try {
      // Get user data before deleting
      const result = await query(
        'SELECT * FROM room_presence WHERE person_id = $1',
        [personId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const occupant: RoomOccupant = {
        person_id: row.person_id,
        username: row.username,
        entered_at: row.entered_at,
        user_data: row.user_data,
      };

      // Delete from room_presence
      await query('DELETE FROM room_presence WHERE person_id = $1', [personId]);

      const enrichedOccupant = await this.enrichOccupant(occupant, false);

      logger.debug('User left room', { username: occupant.username });

      // Emit event for SSE
      const count = await this.getOccupantCount();
      roomPresenceEmitter.emit('room_event', {
        type: 'user_leave',
        timestamp: new Date(),
        user: enrichedOccupant,
        occupantCount: count,
      } as RoomEvent);

      return enrichedOccupant;
    } catch (error) {
      logger.error('Error recording user leave', { error, personId });
      return null;
    }
  }

  /**
   * Get all current occupants with enriched profile data
   * Note: Uses SQL subquery for notes_preview (not NotesService) for performance -
   * avoids N+1 queries when fetching multiple occupants at once.
   */
  static async getCurrentOccupants(): Promise<RoomOccupantWithProfile[]> {
    try {
      const result = await query(
        `SELECT rp.*,
                p.room_visit_count as total_visit_count,
                p.last_room_visit_at as last_visit_at,
                prof.tags,
                prof.friend_tier,
                prof.following,
                prof.follower as is_follower,
                prof.banned_me,
                prof.watch_list,
                (SELECT service_level FROM service_relationships WHERE profile_id = prof.id AND service_role = 'sub' LIMIT 1) as sub_level,
                (SELECT service_level FROM service_relationships WHERE profile_id = prof.id AND service_role = 'dom' LIMIT 1) as dom_level,
                (SELECT content FROM profile_notes pn
                 WHERE pn.profile_id = prof.id
                 ORDER BY created_at DESC LIMIT 1) as notes_preview,
                COALESCE(
                  (SELECT SUM((metadata->>'tokens')::int)
                   FROM interactions
                   WHERE person_id = p.id
                     AND type = 'TIP_EVENT'
                     AND metadata->>'tokens' IS NOT NULL
                  ), 0
                ) as total_tips,
                COALESCE(
                  (SELECT COUNT(*)
                   FROM interactions
                   WHERE person_id = p.id
                     AND type = 'TIP_EVENT'
                  ), 0
                ) as tip_count
         FROM room_presence rp
         JOIN persons p ON rp.person_id = p.id
         LEFT JOIN profiles prof ON prof.person_id = p.id
         ORDER BY rp.entered_at DESC`
      );

      // Filter out excluded users
      return result.rows
        .filter(row => !EXCLUDED_USERNAMES.has(row.username.toLowerCase()))
        .map(row => ({
        person_id: row.person_id,
        username: row.username,
        entered_at: row.entered_at,
        user_data: row.user_data,
        notes_preview: row.notes_preview ?
          (row.notes_preview.length > 100 ? row.notes_preview.substring(0, 100) + '...' : row.notes_preview) : undefined,
        tags: row.tags || [],
        friend_tier: row.friend_tier,
        following: row.following,
        is_follower: row.is_follower,
        banned_me: row.banned_me,
        watch_list: row.watch_list,
        sub_level: row.sub_level,
        dom_level: row.dom_level,
        total_tips: parseInt(row.total_tips, 10) || 0,
        tip_count: parseInt(row.tip_count, 10) || 0,
        stream_visit_count: this.streamVisitors.has(row.person_id) ? 1 : 0,
        total_visit_count: parseInt(row.total_visit_count, 10) || 0,
        last_visit_at: row.last_visit_at,
      }));
    } catch (error) {
      logger.error('Error getting current occupants', { error });
      return [];
    }
  }

  /**
   * Get current occupant count
   */
  static async getOccupantCount(): Promise<number> {
    try {
      const result = await query('SELECT COUNT(*) as count FROM room_presence');
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch (error) {
      logger.error('Error getting occupant count', { error });
      return 0;
    }
  }

  /**
   * Check if a user is currently in the room
   */
  static async isInRoom(personId: string): Promise<boolean> {
    try {
      const result = await query(
        'SELECT 1 FROM room_presence WHERE person_id = $1',
        [personId]
      );
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get stream visitors count (unique users who entered this stream)
   */
  static getStreamVisitorCount(): number {
    return this.streamVisitors.size;
  }

  /**
   * Check if user has visited this stream before
   */
  static hasVisitedThisStream(personId: string): boolean {
    return this.streamVisitors.has(personId);
  }

  /**
   * Get current session info
   */
  static async getSessionInfo(): Promise<{ sessionId: string | null; startedAt: Date | null }> {
    try {
      const result = await query(
        'SELECT current_session_id, broadcast_started_at FROM room_presence_state WHERE id = 1'
      );
      const row = result.rows[0];
      return {
        sessionId: row?.current_session_id || null,
        startedAt: row?.broadcast_started_at || null,
      };
    } catch (error) {
      return { sessionId: null, startedAt: null };
    }
  }

  /**
   * Enrich an occupant with profile data
   */
  private static async enrichOccupant(
    occupant: RoomOccupant,
    isFirstVisitThisStream: boolean
  ): Promise<RoomOccupantWithProfile> {
    try {
      const sql = `
        SELECT
          p.id as person_id,
          p.username,
          prof.tags,
          prof.friend_tier,
          prof.following,
          prof.follower as is_follower,
          prof.banned_me,
          prof.watch_list,
          (SELECT service_level FROM service_relationships WHERE profile_id = prof.id AND service_role = 'sub' LIMIT 1) as sub_level,
          (SELECT service_level FROM service_relationships WHERE profile_id = prof.id AND service_role = 'dom' LIMIT 1) as dom_level,
          p.room_visit_count as total_visit_count,
          p.last_room_visit_at as last_visit_at,
          COALESCE(
            (SELECT SUM((metadata->>'tokens')::int)
             FROM interactions
             WHERE person_id = p.id
               AND type = 'TIP_EVENT'
               AND metadata->>'tokens' IS NOT NULL
            ), 0
          ) as total_tips,
          COALESCE(
            (SELECT COUNT(*)
             FROM interactions
             WHERE person_id = p.id
               AND type = 'TIP_EVENT'
            ), 0
          ) as tip_count
        FROM persons p
        LEFT JOIN profiles prof ON prof.person_id = p.id
        WHERE p.id = $1
      `;

      const result = await query(sql, [occupant.person_id]);
      const row = result.rows[0];

      if (!row) {
        return {
          ...occupant,
          stream_visit_count: isFirstVisitThisStream ? 1 : 0,
          total_visit_count: 0,
        };
      }

      // Get notes preview using NotesService
      const notesPreview = await NotesService.getNotesPreviewByPersonId(occupant.person_id) ?? undefined;

      return {
        ...occupant,
        notes_preview: notesPreview,
        tags: row.tags || [],
        friend_tier: row.friend_tier,
        following: row.following,
        is_follower: row.is_follower,
        banned_me: row.banned_me,
        watch_list: row.watch_list,
        sub_level: row.sub_level,
        dom_level: row.dom_level,
        total_tips: parseInt(row.total_tips, 10) || 0,
        tip_count: parseInt(row.tip_count, 10) || 0,
        stream_visit_count: isFirstVisitThisStream ? 1 : 0,
        total_visit_count: parseInt(row.total_visit_count, 10) || 0,
        last_visit_at: row.last_visit_at,
      };
    } catch (error) {
      logger.error('Error enriching occupant', { error, personId: occupant.person_id });
      return {
        ...occupant,
        stream_visit_count: 0,
        total_visit_count: 0,
      };
    }
  }

  /**
   * Sync presence state - sends full occupant list
   */
  static async syncPresence(): Promise<RoomEvent> {
    const occupants = await this.getCurrentOccupants();
    const event: RoomEvent = {
      type: 'presence_sync',
      timestamp: new Date(),
      occupants,
      occupantCount: occupants.length,
    };

    roomPresenceEmitter.emit('room_event', event);
    return event;
  }
}

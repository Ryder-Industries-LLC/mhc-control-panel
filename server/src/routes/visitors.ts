import { Router, Request, Response } from 'express';
import { RoomVisitsService } from '../services/room-visits.service.js';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/visitors/recent
 * Get recent visitors with enriched profile data
 * Note: Uses SQL subquery for notes_preview (not NotesService) for performance -
 * avoids N+1 queries when fetching multiple visitors at once.
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offlineOnly = req.query.offline === 'true';

    // Get recent visitors with full profile enrichment
    const sql = `
      WITH recent_visits AS (
        SELECT
          rv.person_id,
          COUNT(*) as visit_count,
          COUNT(*) FILTER (WHERE rv.is_broadcasting = false) as offline_visit_count,
          COUNT(*) FILTER (WHERE rv.is_broadcasting = true) as live_visit_count,
          MAX(rv.visited_at) as last_visit,
          MIN(rv.visited_at) as first_visit_in_period,
          bool_or(rv.is_broadcasting = false) as has_offline_visits
        FROM room_visits rv
        WHERE rv.visited_at > NOW() - INTERVAL '1 day' * $1
          ${offlineOnly ? 'AND rv.is_broadcasting = false' : ''}
        GROUP BY rv.person_id
      )
      SELECT
        p.id as person_id,
        p.username,
        rv.visit_count,
        rv.offline_visit_count,
        rv.live_visit_count,
        rv.has_offline_visits,
        rv.last_visit,
        rv.first_visit_in_period,
        p.room_visit_count as total_visit_count,
        prof.tags,
        prof.friend_tier,
        prof.following,
        prof.follower as is_follower,
        (SELECT value FROM attribute_lookup al WHERE al.person_id = p.id AND al.attribute_key = 'banned_me') as banned_me,
        (SELECT value FROM attribute_lookup al WHERE al.person_id = p.id AND al.attribute_key = 'watch_list') as watch_list,
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
      FROM recent_visits rv
      JOIN persons p ON rv.person_id = p.id
      LEFT JOIN profiles prof ON prof.person_id = p.id
      ORDER BY rv.last_visit DESC
      LIMIT $2
    `;

    const result = await query(sql, [days, limit]);

    const visitors = result.rows.map(row => ({
      person_id: row.person_id,
      username: row.username,
      visit_count: parseInt(row.visit_count, 10),
      offline_visit_count: parseInt(row.offline_visit_count, 10) || 0,
      live_visit_count: parseInt(row.live_visit_count, 10) || 0,
      has_offline_visits: row.has_offline_visits,
      last_visit: row.last_visit,
      first_visit_in_period: row.first_visit_in_period,
      total_visit_count: parseInt(row.total_visit_count, 10) || 0,
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
    }));

    res.json({
      visitors,
      count: visitors.length,
      days,
    });
  } catch (error) {
    logger.error('Error getting recent visitors', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/visitors/top
 * Get top visitors of all time with enriched data
 * Note: Uses SQL subquery for notes_preview (not NotesService) for performance -
 * avoids N+1 queries when fetching multiple visitors at once.
 */
router.get('/top', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const sql = `
      SELECT
        p.id as person_id,
        p.username,
        p.room_visit_count as total_visit_count,
        p.last_room_visit_at as last_visit,
        (SELECT MIN(visited_at) FROM room_visits WHERE person_id = p.id) as first_visit,
        prof.tags,
        prof.friend_tier,
        prof.following,
        prof.follower as is_follower,
        (SELECT value FROM attribute_lookup al WHERE al.person_id = p.id AND al.attribute_key = 'banned_me') as banned_me,
        (SELECT value FROM attribute_lookup al WHERE al.person_id = p.id AND al.attribute_key = 'watch_list') as watch_list,
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
      FROM persons p
      LEFT JOIN profiles prof ON prof.person_id = p.id
      WHERE p.room_visit_count > 0
      ORDER BY p.room_visit_count DESC
      LIMIT $1
    `;

    const result = await query(sql, [limit]);

    const visitors = result.rows.map(row => ({
      person_id: row.person_id,
      username: row.username,
      total_visit_count: parseInt(row.total_visit_count, 10) || 0,
      last_visit: row.last_visit,
      first_visit: row.first_visit,
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
    }));

    res.json({
      visitors,
      count: visitors.length,
    });
  } catch (error) {
    logger.error('Error getting top visitors', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/visitors/history
 * Get paginated visit history (all individual visits)
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const username = req.query.username as string;

    let sql: string;
    let params: any[];

    const offlineOnly = req.query.offline === 'true';

    if (username) {
      // Get visits for a specific user
      sql = `
        SELECT
          rv.id,
          rv.visited_at,
          rv.is_broadcasting,
          p.id as person_id,
          p.username
        FROM room_visits rv
        JOIN persons p ON rv.person_id = p.id
        WHERE LOWER(p.username) = LOWER($1)
          ${offlineOnly ? 'AND rv.is_broadcasting = false' : ''}
        ORDER BY rv.visited_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [username, limit, offset];
    } else {
      // Get all visits
      sql = `
        SELECT
          rv.id,
          rv.visited_at,
          rv.is_broadcasting,
          p.id as person_id,
          p.username,
          prof.friend_tier,
          prof.following,
          prof.follower as is_follower
        FROM room_visits rv
        JOIN persons p ON rv.person_id = p.id
        LEFT JOIN profiles prof ON prof.person_id = p.id
        ${offlineOnly ? 'WHERE rv.is_broadcasting = false' : ''}
        ORDER BY rv.visited_at DESC
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
    }

    const result = await query(sql, params);

    // Get total count
    let countSql: string;
    let countParams: any[];
    if (username) {
      countSql = `SELECT COUNT(*) FROM room_visits rv JOIN persons p ON rv.person_id = p.id WHERE LOWER(p.username) = LOWER($1) ${offlineOnly ? 'AND rv.is_broadcasting = false' : ''}`;
      countParams = [username];
    } else {
      countSql = offlineOnly
        ? `SELECT COUNT(*) FROM room_visits WHERE is_broadcasting = false`
        : `SELECT COUNT(*) FROM room_visits`;
      countParams = [];
    }
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      visits: result.rows.map(row => ({
        id: row.id,
        visited_at: row.visited_at,
        is_broadcasting: row.is_broadcasting ?? true,
        person_id: row.person_id,
        username: row.username,
        friend_tier: row.friend_tier,
        following: row.following,
        is_follower: row.is_follower,
      })),
      total,
      limit,
      offset,
      hasMore: offset + result.rows.length < total,
    });
  } catch (error) {
    logger.error('Error getting visit history', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/visitors/stats
 * Get overall visitor statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM room_visits) as total_visits,
        (SELECT COUNT(DISTINCT person_id) FROM room_visits) as unique_visitors,
        (SELECT COUNT(*) FROM room_visits WHERE is_broadcasting = false) as total_offline_visits,
        (SELECT COUNT(DISTINCT person_id) FROM room_visits WHERE is_broadcasting = false) as unique_offline_visitors,
        (SELECT COUNT(*) FROM room_visits WHERE visited_at > NOW() - INTERVAL '24 hours') as visits_today,
        (SELECT COUNT(DISTINCT person_id) FROM room_visits WHERE visited_at > NOW() - INTERVAL '24 hours') as unique_today,
        (SELECT COUNT(*) FROM room_visits WHERE visited_at > NOW() - INTERVAL '24 hours' AND is_broadcasting = false) as offline_visits_today,
        (SELECT COUNT(DISTINCT person_id) FROM room_visits WHERE visited_at > NOW() - INTERVAL '24 hours' AND is_broadcasting = false) as unique_offline_today,
        (SELECT COUNT(*) FROM room_visits WHERE visited_at > NOW() - INTERVAL '7 days') as visits_this_week,
        (SELECT COUNT(DISTINCT person_id) FROM room_visits WHERE visited_at > NOW() - INTERVAL '7 days') as unique_this_week,
        (SELECT COUNT(*) FROM room_visits WHERE visited_at > NOW() - INTERVAL '7 days' AND is_broadcasting = false) as offline_visits_this_week,
        (SELECT COUNT(DISTINCT person_id) FROM room_visits WHERE visited_at > NOW() - INTERVAL '7 days' AND is_broadcasting = false) as unique_offline_this_week,
        (SELECT COUNT(*) FROM room_visits WHERE visited_at > NOW() - INTERVAL '30 days') as visits_this_month,
        (SELECT COUNT(DISTINCT person_id) FROM room_visits WHERE visited_at > NOW() - INTERVAL '30 days') as unique_this_month,
        (SELECT COUNT(*) FROM room_visits WHERE visited_at > NOW() - INTERVAL '30 days' AND is_broadcasting = false) as offline_visits_this_month,
        (SELECT COUNT(DISTINCT person_id) FROM room_visits WHERE visited_at > NOW() - INTERVAL '30 days' AND is_broadcasting = false) as unique_offline_this_month
    `;

    const result = await query(sql, []);
    const row = result.rows[0];

    res.json({
      total_visits: parseInt(row.total_visits, 10),
      unique_visitors: parseInt(row.unique_visitors, 10),
      total_offline_visits: parseInt(row.total_offline_visits, 10) || 0,
      unique_offline_visitors: parseInt(row.unique_offline_visitors, 10) || 0,
      today: {
        visits: parseInt(row.visits_today, 10),
        unique: parseInt(row.unique_today, 10),
        offline_visits: parseInt(row.offline_visits_today, 10) || 0,
        unique_offline: parseInt(row.unique_offline_today, 10) || 0,
      },
      this_week: {
        visits: parseInt(row.visits_this_week, 10),
        unique: parseInt(row.unique_this_week, 10),
        offline_visits: parseInt(row.offline_visits_this_week, 10) || 0,
        unique_offline: parseInt(row.unique_offline_this_week, 10) || 0,
      },
      this_month: {
        visits: parseInt(row.visits_this_month, 10),
        unique: parseInt(row.unique_this_month, 10),
        offline_visits: parseInt(row.offline_visits_this_month, 10) || 0,
        unique_offline: parseInt(row.unique_offline_this_month, 10) || 0,
      },
    });
  } catch (error) {
    logger.error('Error getting visitor stats', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/visitors/:personId/stats
 * Get visit statistics for a specific person
 */
router.get('/:personId/stats', async (req: Request, res: Response) => {
  try {
    const { personId } = req.params;
    const stats = await RoomVisitsService.getVisitStats(personId);
    res.json(stats);
  } catch (error) {
    logger.error('Error getting person visit stats', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { RelationshipService, RoleType, RelationshipStatus } from '../services/relationship.service.js';
import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/relationship/list
 * Bulk fetch relationships with joined person data
 * Query params:
 *   - roles[]: Filter by roles (Dom, Sub, Friend, Custom) - array
 *   - status: Filter by status (Potential, Active, etc.) - single or array
 *   - limit: Number of results (default 100)
 *   - offset: Pagination offset (default 0)
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    // Parse query params
    const rolesParam = req.query.roles;
    const statusParam = req.query.status;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    // Build roles array from query params
    let roles: RoleType[] | undefined;
    if (rolesParam) {
      if (Array.isArray(rolesParam)) {
        roles = rolesParam as RoleType[];
      } else {
        roles = [rolesParam as RoleType];
      }
    }

    // Build status array from query params
    let status: RelationshipStatus[] | undefined;
    if (statusParam) {
      if (Array.isArray(statusParam)) {
        status = statusParam as RelationshipStatus[];
      } else {
        status = [statusParam as RelationshipStatus];
      }
    }

    // Build the SQL query with person join
    const values: any[] = [];
    let paramIndex = 1;
    let whereClause = '';

    if (roles && roles.length > 0) {
      whereClause += ` AND r.roles && $${paramIndex}`;
      values.push(roles);
      paramIndex++;
    }

    if (status && status.length > 0) {
      whereClause += ` AND r.status = ANY($${paramIndex})`;
      values.push(status);
      paramIndex++;
    }

    const sql = `
      SELECT
        r.id as relationship_id,
        r.profile_id,
        r.roles,
        r.custom_role_label,
        r.status,
        r.traits,
        r.since_date,
        r.until_date,
        r.notes as relationship_notes,
        r.created_at as relationship_created_at,
        r.updated_at as relationship_updated_at,
        p.id as person_id,
        p.username,
        p.platform,
        p.role,
        p.image_url,
        p.age,
        p.tags,
        p.notes as person_notes,
        p.session_observed_at,
        p.current_show,
        p.banned_me,
        p.following,
        p.follower,
        p.friend_tier
      FROM relationships r
      INNER JOIN persons p ON r.profile_id = p.id
      WHERE 1=1 ${whereClause}
      ORDER BY r.updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);

    const countSql = `
      SELECT COUNT(*) as total
      FROM relationships r
      INNER JOIN persons p ON r.profile_id = p.id
      WHERE 1=1 ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      query(sql, values),
      query(countSql, values.slice(0, -2)),
    ]);

    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    // Map results to a clean format
    const items = dataResult.rows.map((row: any) => ({
      // Relationship data
      relationship: {
        id: row.relationship_id,
        profile_id: row.profile_id,
        roles: row.roles || [],
        custom_role_label: row.custom_role_label,
        status: row.status,
        traits: row.traits || [],
        since_date: row.since_date ? new Date(row.since_date).toISOString().split('T')[0] : null,
        until_date: row.until_date ? new Date(row.until_date).toISOString().split('T')[0] : null,
        notes: row.relationship_notes,
        created_at: row.relationship_created_at,
        updated_at: row.relationship_updated_at,
      },
      // Person data
      person: {
        id: row.person_id,
        username: row.username,
        platform: row.platform,
        role: row.role,
        image_url: row.image_url,
        age: row.age,
        tags: row.tags || [],
        notes: row.person_notes,
        session_observed_at: row.session_observed_at,
        current_show: row.current_show,
        banned_me: row.banned_me,
        following: row.following,
        follower: row.follower,
        friend_tier: row.friend_tier,
      },
    }));

    res.json({
      items,
      total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Error fetching relationships list', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/relationship/seeds
 * Get seed lists for traits and address terms
 */
router.get('/seeds', async (_req: Request, res: Response) => {
  try {
    const [traits, addressTerms] = await Promise.all([
      RelationshipService.getTraitsSeed(),
      RelationshipService.getAddressTermsSeed(),
    ]);

    res.json({
      traits,
      addressTerms,
    });
  } catch (error) {
    logger.error('Error getting relationship seeds', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/relationship/counts
 * Get counts by role and status
 */
router.get('/counts', async (_req: Request, res: Response) => {
  try {
    const counts = await RelationshipService.getCounts();
    res.json(counts);
  } catch (error) {
    logger.error('Error getting relationship counts', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

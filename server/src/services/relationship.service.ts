import { query } from '../db/client.js';
import { logger } from '../config/logger.js';
import { RelationshipHistoryService } from './relationship-history.service.js';

// Types
export type RoleType = 'Dom' | 'Sub' | 'Friend' | 'Custom';
export type RelationshipStatus =
  | 'Potential'
  | 'Occasional'
  | 'Active'
  | 'On Hold'
  | 'Inactive'
  | 'Decommissioned'
  | 'Banished';

export interface Relationship {
  id: string;
  profile_id: number;
  roles: RoleType[];
  custom_role_label: string | null;
  status: RelationshipStatus;
  traits: string[];
  since_date: string | null; // DATE as ISO string (YYYY-MM-DD)
  until_date: string | null; // DATE as ISO string (YYYY-MM-DD)
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RelationshipTraitSeed {
  id: number;
  name: string;
  category: 'dom' | 'sub' | 'friend' | 'general';
  display_order: number;
}

export interface AddressTermSeed {
  id: number;
  name: string;
  display_order: number;
}

export interface UpsertRelationshipInput {
  roles: RoleType[];
  custom_role_label?: string | null;
  status: RelationshipStatus;
  traits?: string[];
  since_date?: string | null; // DATE as ISO string
  until_date?: string | null; // DATE as ISO string
  notes?: string | null;
}

// Known role values for normalization
const KNOWN_ROLES: RoleType[] = ['Dom', 'Sub', 'Friend', 'Custom'];

export class RelationshipService {
  /**
   * Normalize roles array: trim, map to known values, dedupe, sort
   */
  private static normalizeRoles(roles: string[]): RoleType[] {
    const normalized = roles
      .map((r) => r.trim())
      .map((r) => {
        // Map to known roles (case-insensitive)
        const lower = r.toLowerCase();
        const known = KNOWN_ROLES.find((k) => k.toLowerCase() === lower);
        return known || ('Custom' as RoleType);
      })
      .filter((r, i, arr) => arr.indexOf(r) === i) // dedupe
      .sort();
    return normalized as RoleType[];
  }

  /**
   * Normalize traits array: trim, filter empty, dedupe (preserve casing)
   */
  private static normalizeTraits(traits: string[]): string[] {
    return traits
      .map((t) => t.trim())
      .filter((t) => t !== '')
      .filter((t, i, arr) => arr.indexOf(t) === i); // dedupe
  }

  /**
   * Get relationship by profile ID
   * Returns null if no relationship exists (not created until first save)
   */
  static async getByProfileId(profileId: number): Promise<Relationship | null> {
    const sql = `SELECT * FROM relationships WHERE profile_id = $1`;

    try {
      const result = await query(sql, [profileId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToRelationship(result.rows[0]);
    } catch (error) {
      logger.error('Error getting relationship', { error, profileId });
      throw error;
    }
  }

  /**
   * Create or update a relationship
   * - Creates row on first save
   * - Records history on update for tracked fields
   * - Normalizes roles (sorted, deduped) and traits (trimmed, deduped)
   * - Clears custom_role_label when 'Custom' is not in roles
   * - Sets updated_at = NOW() on update
   */
  static async upsert(
    profileId: number,
    data: UpsertRelationshipInput
  ): Promise<Relationship> {
    // Normalize inputs
    const normalizedRoles = this.normalizeRoles(data.roles);
    const normalizedTraits = this.normalizeTraits(data.traits || []);

    // Clear custom_role_label if Custom not in roles
    const customRoleLabel = normalizedRoles.includes('Custom')
      ? data.custom_role_label?.trim() || null
      : null;

    // Check if relationship exists for history tracking
    const existing = await this.getByProfileId(profileId);

    const sql = `
      INSERT INTO relationships (
        profile_id, roles, custom_role_label, status, traits,
        since_date, until_date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (profile_id) DO UPDATE SET
        roles = EXCLUDED.roles,
        custom_role_label = EXCLUDED.custom_role_label,
        status = EXCLUDED.status,
        traits = EXCLUDED.traits,
        since_date = EXCLUDED.since_date,
        until_date = EXCLUDED.until_date,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `;

    const values = [
      profileId,
      normalizedRoles,
      customRoleLabel,
      data.status,
      normalizedTraits,
      data.since_date || null,
      data.until_date || null,
      data.notes?.trim() || null,
    ];

    try {
      const result = await query(sql, values);
      const newRelationship = this.mapRowToRelationship(result.rows[0]);

      // Record history for tracked fields (if this is an update, not create)
      if (existing) {
        await this.recordHistoryChanges(existing, newRelationship);
      } else {
        // First save - record initial history entries
        await RelationshipHistoryService.recordChange(
          newRelationship.id,
          'status',
          null,
          newRelationship.status,
          'Initial relationship created',
          'ui'
        );
        await RelationshipHistoryService.recordChange(
          newRelationship.id,
          'roles',
          null,
          newRelationship.roles,
          'Initial relationship created',
          'ui'
        );
        if (newRelationship.since_date) {
          await RelationshipHistoryService.recordChange(
            newRelationship.id,
            'since_date',
            null,
            newRelationship.since_date,
            'Initial relationship created',
            'ui'
          );
        }
        if (newRelationship.until_date) {
          await RelationshipHistoryService.recordChange(
            newRelationship.id,
            'until_date',
            null,
            newRelationship.until_date,
            'Initial relationship created',
            'ui'
          );
        }
      }

      logger.info('Relationship upserted', {
        profileId,
        roles: normalizedRoles,
        status: data.status,
        isNew: !existing,
      });

      return newRelationship;
    } catch (error) {
      logger.error('Error upserting relationship', { error, profileId, data });
      throw error;
    }
  }

  /**
   * Record history changes for tracked fields
   */
  private static async recordHistoryChanges(
    existing: Relationship,
    updated: Relationship
  ): Promise<void> {
    // Status change
    if (existing.status !== updated.status) {
      await RelationshipHistoryService.recordChange(
        updated.id,
        'status',
        existing.status,
        updated.status
      );
    }

    // Roles change (compare sorted arrays)
    const oldRolesSorted = JSON.stringify([...existing.roles].sort());
    const newRolesSorted = JSON.stringify([...updated.roles].sort());
    if (oldRolesSorted !== newRolesSorted) {
      await RelationshipHistoryService.recordChange(
        updated.id,
        'roles',
        existing.roles.sort(),
        updated.roles.sort()
      );
    }

    // Since date change
    if (existing.since_date !== updated.since_date) {
      await RelationshipHistoryService.recordChange(
        updated.id,
        'since_date',
        existing.since_date,
        updated.since_date
      );
    }

    // Until date change
    if (existing.until_date !== updated.until_date) {
      await RelationshipHistoryService.recordChange(
        updated.id,
        'until_date',
        existing.until_date,
        updated.until_date
      );
    }
  }

  /**
   * Delete a relationship
   */
  static async delete(profileId: number): Promise<boolean> {
    const sql = `DELETE FROM relationships WHERE profile_id = $1 RETURNING id`;

    try {
      const result = await query(sql, [profileId]);
      const deleted = result.rowCount !== null && result.rowCount > 0;
      if (deleted) {
        logger.info('Relationship deleted', { profileId });
      }
      return deleted;
    } catch (error) {
      logger.error('Error deleting relationship', { error, profileId });
      throw error;
    }
  }

  /**
   * Get seed traits list
   */
  static async getTraitsSeed(): Promise<RelationshipTraitSeed[]> {
    const sql = `SELECT * FROM relationship_traits_seed ORDER BY category, display_order, name`;

    try {
      const result = await query(sql);
      return result.rows as RelationshipTraitSeed[];
    } catch (error) {
      logger.error('Error getting traits seed', { error });
      throw error;
    }
  }

  /**
   * Get seed address terms list
   */
  static async getAddressTermsSeed(): Promise<AddressTermSeed[]> {
    const sql = `SELECT * FROM address_terms_seed ORDER BY display_order, name`;

    try {
      const result = await query(sql);
      return result.rows as AddressTermSeed[];
    } catch (error) {
      logger.error('Error getting address terms seed', { error });
      throw error;
    }
  }

  /**
   * Find relationships by roles and/or status
   */
  static async findByRolesAndStatus(options?: {
    roles?: RoleType[];
    status?: RelationshipStatus | RelationshipStatus[];
    limit?: number;
    offset?: number;
  }): Promise<{ relationships: Relationship[]; total: number }> {
    const { roles, status, limit = 50, offset = 0 } = options || {};

    let sql = `SELECT * FROM relationships WHERE 1=1`;
    const countSql = `SELECT COUNT(*) as total FROM relationships WHERE 1=1`;
    const values: any[] = [];
    let paramIndex = 1;
    let whereClause = '';

    if (roles && roles.length > 0) {
      whereClause += ` AND roles && $${paramIndex}`;
      values.push(roles);
      paramIndex++;
    }

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      whereClause += ` AND status = ANY($${paramIndex})`;
      values.push(statuses);
      paramIndex++;
    }

    sql += whereClause + ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    try {
      const [dataResult, countResult] = await Promise.all([
        query(sql, values),
        query(countSql + whereClause, values.slice(0, -2)),
      ]);

      return {
        relationships: dataResult.rows.map(this.mapRowToRelationship),
        total: parseInt(countResult.rows[0]?.total || '0', 10),
      };
    } catch (error) {
      logger.error('Error finding relationships', { error, options });
      throw error;
    }
  }

  /**
   * Get counts by role and status
   */
  static async getCounts(): Promise<{
    byRole: { [key: string]: number };
    byStatus: { [key: string]: number };
  }> {
    const roleSql = `
      SELECT unnest(roles) as role, COUNT(*) as count
      FROM relationships
      GROUP BY role
    `;
    const statusSql = `
      SELECT status, COUNT(*) as count
      FROM relationships
      GROUP BY status
    `;

    try {
      const [roleResult, statusResult] = await Promise.all([
        query(roleSql),
        query(statusSql),
      ]);

      const byRole: { [key: string]: number } = {};
      for (const row of roleResult.rows) {
        byRole[row.role] = parseInt(row.count, 10);
      }

      const byStatus: { [key: string]: number } = {};
      for (const row of statusResult.rows) {
        byStatus[row.status] = parseInt(row.count, 10);
      }

      return { byRole, byStatus };
    } catch (error) {
      logger.error('Error getting relationship counts', { error });
      throw error;
    }
  }

  /**
   * Map database row to Relationship object
   */
  private static mapRowToRelationship(row: any): Relationship {
    return {
      id: row.id,
      profile_id: row.profile_id,
      roles: row.roles || [],
      custom_role_label: row.custom_role_label,
      status: row.status,
      traits: row.traits || [],
      since_date: row.since_date
        ? new Date(row.since_date).toISOString().split('T')[0]
        : null,
      until_date: row.until_date
        ? new Date(row.until_date).toISOString().split('T')[0]
        : null,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

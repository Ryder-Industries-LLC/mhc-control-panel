import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export type ServiceRole = 'sub' | 'dom';

export type SubServiceLevel = 'Current' | 'Occasional' | 'Potential' | 'Decommissioned' | 'Banished' | 'Paused';
export type DomServiceLevel = 'Potential' | 'Actively Serving' | 'Ended' | 'Paused';
export type ServiceLevel = SubServiceLevel | DomServiceLevel;

export interface ServiceRelationship {
  id: string;
  profile_id: number;
  service_role: ServiceRole;
  service_level: ServiceLevel;
  service_types: string[];
  started_at: Date | null;
  ended_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertServiceRelationshipInput {
  serviceRole: ServiceRole;
  serviceLevel: ServiceLevel;
  serviceTypes?: string[];
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
  notes?: string | null;
}

export class ServiceRelationshipService {
  /**
   * Get all service relationships for a profile
   */
  static async getByProfileId(profileId: number): Promise<ServiceRelationship[]> {
    const sql = `
      SELECT * FROM service_relationships
      WHERE profile_id = $1
      ORDER BY service_role
    `;

    try {
      const result = await query(sql, [profileId]);
      return result.rows.map(this.mapRowToRelationship);
    } catch (error) {
      logger.error('Error getting service relationships', { error, profileId });
      throw error;
    }
  }

  /**
   * Get a specific relationship by profile ID and role
   */
  static async getByProfileIdAndRole(
    profileId: number,
    role: ServiceRole
  ): Promise<ServiceRelationship | null> {
    const sql = `
      SELECT * FROM service_relationships
      WHERE profile_id = $1 AND service_role = $2
    `;

    try {
      const result = await query(sql, [profileId, role]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToRelationship(result.rows[0]);
    } catch (error) {
      logger.error('Error getting service relationship', { error, profileId, role });
      throw error;
    }
  }

  /**
   * Create or update a service relationship
   */
  static async upsert(
    profileId: number,
    data: UpsertServiceRelationshipInput
  ): Promise<ServiceRelationship> {
    const sql = `
      INSERT INTO service_relationships (
        profile_id, service_role, service_level, service_types,
        started_at, ended_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (profile_id, service_role) DO UPDATE SET
        service_level = EXCLUDED.service_level,
        service_types = EXCLUDED.service_types,
        started_at = EXCLUDED.started_at,
        ended_at = EXCLUDED.ended_at,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `;

    const values = [
      profileId,
      data.serviceRole,
      data.serviceLevel,
      data.serviceTypes || [],
      data.startedAt || null,
      data.endedAt || null,
      data.notes || null,
    ];

    try {
      const result = await query(sql, values);
      logger.info('Service relationship upserted', {
        profileId,
        role: data.serviceRole,
        level: data.serviceLevel,
      });
      return this.mapRowToRelationship(result.rows[0]);
    } catch (error) {
      logger.error('Error upserting service relationship', { error, profileId, data });
      throw error;
    }
  }

  /**
   * Delete a service relationship
   */
  static async delete(profileId: number, role: ServiceRole): Promise<boolean> {
    const sql = `
      DELETE FROM service_relationships
      WHERE profile_id = $1 AND service_role = $2
      RETURNING id
    `;

    try {
      const result = await query(sql, [profileId, role]);
      const deleted = result.rowCount !== null && result.rowCount > 0;
      if (deleted) {
        logger.info('Service relationship deleted', { profileId, role });
      }
      return deleted;
    } catch (error) {
      logger.error('Error deleting service relationship', { error, profileId, role });
      throw error;
    }
  }

  /**
   * Get all profiles with a specific service role and level
   */
  static async findByRoleAndLevel(
    role: ServiceRole,
    level?: ServiceLevel
  ): Promise<ServiceRelationship[]> {
    let sql = `
      SELECT sr.* FROM service_relationships sr
      WHERE sr.service_role = $1
    `;
    const values: any[] = [role];

    if (level) {
      sql += ` AND sr.service_level = $2`;
      values.push(level);
    }

    sql += ` ORDER BY sr.updated_at DESC`;

    try {
      const result = await query(sql, values);
      return result.rows.map(this.mapRowToRelationship);
    } catch (error) {
      logger.error('Error finding service relationships', { error, role, level });
      throw error;
    }
  }

  /**
   * Get counts by role and level
   */
  static async getCounts(): Promise<{
    subs: { [key: string]: number };
    doms: { [key: string]: number };
  }> {
    const sql = `
      SELECT service_role, service_level, COUNT(*) as count
      FROM service_relationships
      GROUP BY service_role, service_level
    `;

    try {
      const result = await query(sql);
      const subs: { [key: string]: number } = {};
      const doms: { [key: string]: number } = {};

      for (const row of result.rows) {
        const count = parseInt(row.count, 10);
        if (row.service_role === 'sub') {
          subs[row.service_level] = count;
        } else {
          doms[row.service_level] = count;
        }
      }

      return { subs, doms };
    } catch (error) {
      logger.error('Error getting service relationship counts', { error });
      throw error;
    }
  }

  /**
   * Map database row to ServiceRelationship object
   */
  private static mapRowToRelationship(row: any): ServiceRelationship {
    return {
      id: row.id,
      profile_id: row.profile_id,
      service_role: row.service_role,
      service_level: row.service_level,
      service_types: row.service_types || [],
      started_at: row.started_at,
      ended_at: row.ended_at,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

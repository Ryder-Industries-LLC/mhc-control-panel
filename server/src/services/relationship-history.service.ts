import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export type HistoryFieldName = 'status' | 'since_date' | 'until_date' | 'roles';
export type HistoryEventSource = 'ui' | 'migration' | 'api' | 'system';

export interface RelationshipHistoryEntry {
  id: string;
  relationship_id: string;
  field_name: HistoryFieldName;
  old_value: any; // JSONB - string for status/dates, string[] for roles
  new_value: any;
  change_note: string | null;
  changed_at: Date;
  changed_by: string;
  event_source: HistoryEventSource;
}

export type HistoryFieldType = 'Status' | 'Dates' | 'Roles';

export interface GetHistoryOptions {
  fieldType?: HistoryFieldType;
  startDate?: Date | string;
  endDate?: Date | string;
  limit?: number;
  offset?: number;
}

export class RelationshipHistoryService {
  /**
   * Record a change to a tracked field
   * Only creates entry if oldValue !== newValue
   * For roles: stores arrays sorted to prevent order-only noise
   * Returns null if no change detected (idempotent save)
   */
  static async recordChange(
    relationshipId: string,
    fieldName: HistoryFieldName,
    oldValue: any,
    newValue: any,
    note?: string,
    eventSource: HistoryEventSource = 'ui',
    changedBy: string = 'system'
  ): Promise<RelationshipHistoryEntry | null> {
    // Normalize values for comparison
    const normalizedOld = this.normalizeValue(fieldName, oldValue);
    const normalizedNew = this.normalizeValue(fieldName, newValue);

    // Compare - for roles, compare sorted JSON strings
    if (fieldName === 'roles') {
      const oldSorted = JSON.stringify(normalizedOld);
      const newSorted = JSON.stringify(normalizedNew);
      if (oldSorted === newSorted) {
        return null; // No change
      }
    } else {
      if (normalizedOld === normalizedNew) {
        return null; // No change
      }
    }

    const sql = `
      INSERT INTO relationship_history (
        relationship_id, field_name, old_value, new_value,
        change_note, changed_by, event_source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      relationshipId,
      fieldName,
      normalizedOld !== null ? JSON.stringify(normalizedOld) : null,
      normalizedNew !== null ? JSON.stringify(normalizedNew) : null,
      note || null,
      changedBy,
      eventSource,
    ];

    try {
      const result = await query(sql, values);
      logger.debug('Relationship history recorded', {
        relationshipId,
        fieldName,
        oldValue: normalizedOld,
        newValue: normalizedNew,
      });
      return this.mapRowToEntry(result.rows[0]);
    } catch (error) {
      logger.error('Error recording relationship history', {
        error,
        relationshipId,
        fieldName,
      });
      throw error;
    }
  }

  /**
   * Normalize value for storage and comparison
   * - Roles: sort arrays
   * - Dates: convert to ISO string
   * - Status: pass through as-is
   */
  private static normalizeValue(fieldName: HistoryFieldName, value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (fieldName === 'roles') {
      if (Array.isArray(value)) {
        return [...value].sort();
      }
      return [];
    }

    if (fieldName === 'since_date' || fieldName === 'until_date') {
      if (value instanceof Date) {
        return value.toISOString().split('T')[0];
      }
      return value;
    }

    return value;
  }

  /**
   * Get history entries for a relationship
   * fieldType: 'Status' | 'Dates' | 'Roles'
   * Dates expands to both since_date and until_date
   * Default: limit=50, offset=0, order=newest-first
   */
  static async getHistory(
    relationshipId: string,
    options?: GetHistoryOptions
  ): Promise<{ entries: RelationshipHistoryEntry[]; total: number }> {
    const { fieldType, startDate, endDate, limit = 50, offset = 0 } = options || {};

    let sql = `SELECT * FROM relationship_history WHERE relationship_id = $1`;
    let countSql = `SELECT COUNT(*) as total FROM relationship_history WHERE relationship_id = $1`;
    const values: any[] = [relationshipId];
    let paramIndex = 2;

    // Field type filter
    if (fieldType) {
      const fieldNames = this.fieldTypeToFieldNames(fieldType);
      sql += ` AND field_name = ANY($${paramIndex})`;
      countSql += ` AND field_name = ANY($${paramIndex})`;
      values.push(fieldNames);
      paramIndex++;
    }

    // Date range filters
    if (startDate) {
      sql += ` AND changed_at >= $${paramIndex}`;
      countSql += ` AND changed_at >= $${paramIndex}`;
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      sql += ` AND changed_at <= $${paramIndex}`;
      countSql += ` AND changed_at <= $${paramIndex}`;
      values.push(endDate);
      paramIndex++;
    }

    // Pagination (newest first)
    sql += ` ORDER BY changed_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const paginationValues = [...values, limit, offset];

    try {
      const [dataResult, countResult] = await Promise.all([
        query(sql, paginationValues),
        query(countSql, values),
      ]);

      return {
        entries: dataResult.rows.map(this.mapRowToEntry),
        total: parseInt(countResult.rows[0]?.total || '0', 10),
      };
    } catch (error) {
      logger.error('Error getting relationship history', {
        error,
        relationshipId,
        options,
      });
      throw error;
    }
  }

  /**
   * Get history for a specific relationship by ID
   */
  static async getByRelationshipId(
    relationshipId: string
  ): Promise<RelationshipHistoryEntry[]> {
    const result = await this.getHistory(relationshipId, { limit: 1000 });
    return result.entries;
  }

  /**
   * Map fieldType to database field_name values
   */
  private static fieldTypeToFieldNames(fieldType: HistoryFieldType): HistoryFieldName[] {
    switch (fieldType) {
      case 'Status':
        return ['status'];
      case 'Dates':
        return ['since_date', 'until_date'];
      case 'Roles':
        return ['roles'];
      default:
        return ['status', 'since_date', 'until_date', 'roles'];
    }
  }

  /**
   * Map database row to entry object
   */
  private static mapRowToEntry(row: any): RelationshipHistoryEntry {
    return {
      id: row.id,
      relationship_id: row.relationship_id,
      field_name: row.field_name,
      old_value: row.old_value,
      new_value: row.new_value,
      change_note: row.change_note,
      changed_at: row.changed_at,
      changed_by: row.changed_by,
      event_source: row.event_source,
    };
  }

  /**
   * Format roles change for display
   * Returns { added: string[], removed: string[] }
   */
  static formatRolesChange(
    oldRoles: string[] | null,
    newRoles: string[] | null
  ): { added: string[]; removed: string[] } {
    const old = oldRoles || [];
    const current = newRoles || [];

    const added = current.filter((r) => !old.includes(r));
    const removed = old.filter((r) => !current.includes(r));

    return { added, removed };
  }
}

import { query } from '../db/client.js';
import { logger } from '../config/logger.js';

export interface AttributeDefinition {
  id: number;
  key: string;
  label: string;
  description?: string;
  color: string;
  icon?: string;
  isSystem: boolean;
  isAutoDerived: boolean;
  showAsBadge: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface PersonAttribute {
  key: string;
  value: boolean;
  setAt: Date;
  definition: AttributeDefinition;
}

export interface AttributeHistoryEntry {
  id: string;
  personId: string;
  attributeKey: string;
  oldValue: boolean | null;
  newValue: boolean;
  changedAt: Date;
  label?: string;
}

/**
 * Service for managing person attributes (formerly flags)
 * Uses person_id for site-wide flexibility (works in Profile, Live Monitor, Visitors, etc.)
 */
export class AttributeService {
  // ==================== Attribute Definitions CRUD ====================

  /**
   * Get all attribute definitions, ordered by sort_order
   */
  static async getDefinitions(): Promise<AttributeDefinition[]> {
    const sql = `
      SELECT id, key, label, description, color, icon, is_system, is_auto_derived, show_as_badge, sort_order, created_at
      FROM attribute_definitions
      ORDER BY sort_order, key
    `;

    try {
      const result = await query(sql);
      return result.rows.map(this.mapDefinitionRow);
    } catch (error) {
      logger.error('Error getting attribute definitions', { error });
      return [];
    }
  }

  /**
   * Get a single attribute definition by key
   */
  static async getDefinition(key: string): Promise<AttributeDefinition | null> {
    const sql = `
      SELECT id, key, label, description, color, icon, is_system, is_auto_derived, show_as_badge, sort_order, created_at
      FROM attribute_definitions
      WHERE key = $1
    `;

    try {
      const result = await query(sql, [key]);
      if (result.rows.length === 0) return null;
      return this.mapDefinitionRow(result.rows[0]);
    } catch (error) {
      logger.error('Error getting attribute definition', { error, key });
      return null;
    }
  }

  /**
   * Create a new attribute definition
   */
  static async createDefinition(data: {
    key: string;
    label: string;
    description?: string;
    color?: string;
    icon?: string;
    showAsBadge?: boolean;
    sortOrder?: number;
  }): Promise<AttributeDefinition | null> {
    const sql = `
      INSERT INTO attribute_definitions (key, label, description, color, icon, show_as_badge, sort_order, is_system, is_auto_derived)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false, false)
      RETURNING id, key, label, description, color, icon, is_system, is_auto_derived, show_as_badge, sort_order, created_at
    `;

    try {
      const result = await query(sql, [
        data.key,
        data.label,
        data.description || null,
        data.color || 'gray',
        data.icon || null,
        data.showAsBadge || false,
        data.sortOrder || 100,
      ]);
      logger.info('Created attribute definition', { key: data.key });
      return this.mapDefinitionRow(result.rows[0]);
    } catch (error) {
      logger.error('Error creating attribute definition', { error, data });
      return null;
    }
  }

  /**
   * Update an attribute definition (only non-system attributes can have key/label changed)
   */
  static async updateDefinition(
    key: string,
    data: Partial<{
      label: string;
      description: string;
      color: string;
      icon: string;
      showAsBadge: boolean;
      sortOrder: number;
    }>
  ): Promise<AttributeDefinition | null> {
    // Build dynamic update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.label !== undefined) {
      updates.push(`label = $${paramIndex++}`);
      values.push(data.label);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(data.color);
    }
    if (data.icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(data.icon);
    }
    if (data.showAsBadge !== undefined) {
      updates.push(`show_as_badge = $${paramIndex++}`);
      values.push(data.showAsBadge);
    }
    if (data.sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(data.sortOrder);
    }

    if (updates.length === 0) return this.getDefinition(key);

    values.push(key);
    const sql = `
      UPDATE attribute_definitions
      SET ${updates.join(', ')}
      WHERE key = $${paramIndex}
      RETURNING id, key, label, description, color, icon, is_system, is_auto_derived, show_as_badge, sort_order, created_at
    `;

    try {
      const result = await query(sql, values);
      if (result.rows.length === 0) return null;
      logger.info('Updated attribute definition', { key });
      return this.mapDefinitionRow(result.rows[0]);
    } catch (error) {
      logger.error('Error updating attribute definition', { error, key, data });
      return null;
    }
  }

  /**
   * Delete an attribute definition (only non-system attributes)
   * Also deletes all associated attribute_lookup and attribute_history records
   */
  static async deleteDefinition(key: string): Promise<boolean> {
    // First check if it's a system attribute
    const checkSql = `SELECT is_system FROM attribute_definitions WHERE key = $1`;
    try {
      const checkResult = await query(checkSql, [key]);
      if (checkResult.rows.length === 0) {
        logger.warn('Attribute definition not found for deletion', { key });
        return false;
      }
      if (checkResult.rows[0].is_system) {
        logger.warn('Cannot delete system attribute', { key });
        return false;
      }

      // Delete the definition (cascades to attribute_lookup due to FK)
      const deleteSql = `DELETE FROM attribute_definitions WHERE key = $1 AND is_system = false`;
      const result = await query(deleteSql, [key]);
      const deleted = (result.rowCount ?? 0) > 0;
      if (deleted) {
        logger.info('Deleted attribute definition', { key });
      }
      return deleted;
    } catch (error) {
      logger.error('Error deleting attribute definition', { error, key });
      return false;
    }
  }

  // ==================== Person Attribute Operations ====================

  /**
   * Get all attributes for a person (includes definition details)
   */
  static async getAttributes(personId: string): Promise<PersonAttribute[]> {
    const sql = `
      SELECT
        al.attribute_key, al.value, al.set_at,
        ad.id, ad.key, ad.label, ad.description, ad.color, ad.icon,
        ad.is_system, ad.is_auto_derived, ad.show_as_badge, ad.sort_order, ad.created_at
      FROM attribute_lookup al
      JOIN attribute_definitions ad ON ad.key = al.attribute_key
      WHERE al.person_id = $1
      ORDER BY ad.sort_order, ad.key
    `;

    try {
      const result = await query(sql, [personId]);
      return result.rows.map(row => ({
        key: row.attribute_key,
        value: row.value,
        setAt: row.set_at,
        definition: this.mapDefinitionRow(row),
      }));
    } catch (error) {
      logger.error('Error getting person attributes', { error, personId });
      return [];
    }
  }

  /**
   * Get a single attribute value for a person
   */
  static async getAttribute(personId: string, key: string): Promise<boolean> {
    const sql = `SELECT value FROM attribute_lookup WHERE person_id = $1 AND attribute_key = $2`;
    try {
      const result = await query(sql, [personId, key]);
      return result.rows.length > 0 ? result.rows[0].value : false;
    } catch (error) {
      logger.error('Error getting person attribute', { error, personId, key });
      return false;
    }
  }

  /**
   * Set a single attribute for a person
   * If value is true, upserts the record
   * If value is false, deletes the record (cleaner than storing false values)
   */
  static async setAttribute(personId: string, key: string, value: boolean): Promise<void> {
    try {
      if (value) {
        // Upsert: insert or update to true
        const sql = `
          INSERT INTO attribute_lookup (person_id, attribute_key, value, set_at)
          VALUES ($1, $2, true, NOW())
          ON CONFLICT (person_id, attribute_key)
          DO UPDATE SET value = true, set_at = NOW()
        `;
        await query(sql, [personId, key]);
      } else {
        // Delete the record (trigger will log this as setting to false)
        const sql = `DELETE FROM attribute_lookup WHERE person_id = $1 AND attribute_key = $2`;
        await query(sql, [personId, key]);
      }
      logger.debug('Set attribute', { personId, key, value });
    } catch (error) {
      logger.error('Error setting person attribute', { error, personId, key, value });
      throw error;
    }
  }

  /**
   * Set multiple attributes for a person at once
   */
  static async setAttributes(personId: string, attrs: Record<string, boolean>): Promise<void> {
    try {
      for (const [key, value] of Object.entries(attrs)) {
        await this.setAttribute(personId, key, value);
      }
    } catch (error) {
      logger.error('Error setting person attributes', { error, personId, attrs });
      throw error;
    }
  }

  /**
   * Get all attributes for a person as a simple key-value object
   */
  static async getAttributesAsObject(personId: string): Promise<Record<string, boolean>> {
    const attributes = await this.getAttributes(personId);
    const result: Record<string, boolean> = {};
    for (const attr of attributes) {
      result[attr.key] = attr.value;
    }
    return result;
  }

  // ==================== Filtered Attribute Queries ====================

  /**
   * Get badge attributes (show_as_badge = true) for a person
   */
  static async getBadgeAttributes(personId: string): Promise<PersonAttribute[]> {
    const sql = `
      SELECT
        al.attribute_key, al.value, al.set_at,
        ad.id, ad.key, ad.label, ad.description, ad.color, ad.icon,
        ad.is_system, ad.is_auto_derived, ad.show_as_badge, ad.sort_order, ad.created_at
      FROM attribute_lookup al
      JOIN attribute_definitions ad ON ad.key = al.attribute_key
      WHERE al.person_id = $1 AND ad.show_as_badge = true AND al.value = true
      ORDER BY ad.sort_order, ad.key
    `;

    try {
      const result = await query(sql, [personId]);
      return result.rows.map(row => ({
        key: row.attribute_key,
        value: row.value,
        setAt: row.set_at,
        definition: this.mapDefinitionRow(row),
      }));
    } catch (error) {
      logger.error('Error getting badge attributes', { error, personId });
      return [];
    }
  }

  /**
   * Get checkbox attributes - includes all non-auto-derived definitions for display
   * Note: show_as_badge means "also show as badge when true", not "only show as badge"
   * So banned_me (show_as_badge=true) still appears as a checkbox for toggling
   */
  static async getCheckboxAttributes(personId: string): Promise<PersonAttribute[]> {
    // Get all non-auto-derived definitions (user can toggle these)
    const defSql = `
      SELECT id, key, label, description, color, icon, is_system, is_auto_derived, show_as_badge, sort_order, created_at
      FROM attribute_definitions
      WHERE is_auto_derived = false
      ORDER BY sort_order, key
    `;

    // Get person's current attribute values
    const valSql = `
      SELECT attribute_key, value, set_at
      FROM attribute_lookup
      WHERE person_id = $1
    `;

    try {
      const [defResult, valResult] = await Promise.all([
        query(defSql),
        query(valSql, [personId]),
      ]);

      // Build a map of current values
      const valueMap = new Map<string, { value: boolean; setAt: Date }>();
      for (const row of valResult.rows) {
        valueMap.set(row.attribute_key, { value: row.value, setAt: row.set_at });
      }

      // Map definitions with their values (default to false if not set)
      return defResult.rows.map(row => {
        const current = valueMap.get(row.key);
        return {
          key: row.key,
          value: current?.value ?? false,
          setAt: current?.setAt ?? new Date(),
          definition: this.mapDefinitionRow(row),
        };
      });
    } catch (error) {
      logger.error('Error getting checkbox attributes', { error, personId });
      return [];
    }
  }

  // ==================== History ====================

  /**
   * Get attribute change history for a person
   */
  static async getHistory(
    personId: string,
    options?: { key?: string; limit?: number }
  ): Promise<AttributeHistoryEntry[]> {
    let sql = `
      SELECT ah.id, ah.person_id, ah.attribute_key, ah.old_value, ah.new_value, ah.changed_at,
             ad.label
      FROM attribute_history ah
      LEFT JOIN attribute_definitions ad ON ad.key = ah.attribute_key
      WHERE ah.person_id = $1
    `;
    const params: unknown[] = [personId];

    if (options?.key) {
      sql += ` AND ah.attribute_key = $2`;
      params.push(options.key);
    }

    sql += ` ORDER BY ah.changed_at DESC`;

    if (options?.limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    try {
      const result = await query(sql, params);
      return result.rows.map(row => ({
        id: row.id,
        personId: row.person_id,
        attributeKey: row.attribute_key,
        oldValue: row.old_value,
        newValue: row.new_value,
        changedAt: row.changed_at,
        label: row.label,
      }));
    } catch (error) {
      logger.error('Error getting attribute history', { error, personId, options });
      return [];
    }
  }

  // ==================== Helper Methods ====================

  private static mapDefinitionRow(row: Record<string, unknown>): AttributeDefinition {
    return {
      id: row.id as number,
      key: row.key as string,
      label: row.label as string,
      description: row.description as string | undefined,
      color: row.color as string,
      icon: row.icon as string | undefined,
      isSystem: row.is_system as boolean,
      isAutoDerived: row.is_auto_derived as boolean,
      showAsBadge: row.show_as_badge as boolean,
      sortOrder: row.sort_order as number,
      createdAt: row.created_at as Date,
    };
  }
}

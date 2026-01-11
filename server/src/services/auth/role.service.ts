import { query, getClient } from '../../db/client.js';
import { logger } from '../../config/logger.js';

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  priority: number;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  category: string;
  createdAt: Date;
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export class RoleService {
  /**
   * Get all roles
   */
  static async getAll(): Promise<Role[]> {
    const result = await query<any>(
      'SELECT * FROM roles ORDER BY priority DESC'
    );
    return result.rows.map(this.mapRoleRow);
  }

  /**
   * Get role by ID
   */
  static async getById(id: string): Promise<Role | null> {
    const result = await query<any>(
      'SELECT * FROM roles WHERE id = $1',
      [id]
    );
    if (!result.rows[0]) return null;
    return this.mapRoleRow(result.rows[0]);
  }

  /**
   * Get role by name
   */
  static async getByName(name: string): Promise<Role | null> {
    const result = await query<any>(
      'SELECT * FROM roles WHERE name = $1',
      [name]
    );
    if (!result.rows[0]) return null;
    return this.mapRoleRow(result.rows[0]);
  }

  /**
   * Get role with its permissions
   */
  static async getWithPermissions(roleId: string): Promise<RoleWithPermissions | null> {
    const role = await this.getById(roleId);
    if (!role) return null;

    const permissions = await this.getPermissionsForRole(roleId);
    return { ...role, permissions };
  }

  /**
   * Create a new role
   */
  static async create(
    name: string,
    displayName: string,
    description?: string,
    priority = 50
  ): Promise<Role> {
    const result = await query<any>(
      `INSERT INTO roles (name, display_name, description, priority, is_system)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING *`,
      [name.toLowerCase(), displayName, description || null, priority]
    );

    logger.info('Role created', { roleName: name });
    return this.mapRoleRow(result.rows[0]);
  }

  /**
   * Update a role (non-system roles only)
   */
  static async update(
    id: string,
    updates: { displayName?: string; description?: string; priority?: number }
  ): Promise<Role | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.displayName !== undefined) {
      setClauses.push(`display_name = $${paramIndex}`);
      values.push(updates.displayName);
      paramIndex++;
    }

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex}`);
      values.push(updates.description);
      paramIndex++;
    }

    if (updates.priority !== undefined) {
      setClauses.push(`priority = $${paramIndex}`);
      values.push(updates.priority);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const result = await query<any>(
      `UPDATE roles SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex} AND is_system = FALSE
       RETURNING *`,
      values
    );

    if (!result.rows[0]) return null;
    logger.info('Role updated', { roleId: id });
    return this.mapRoleRow(result.rows[0]);
  }

  /**
   * Delete a role (non-system roles only)
   */
  static async delete(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM roles WHERE id = $1 AND is_system = FALSE`,
      [id]
    );
    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      logger.info('Role deleted', { roleId: id });
    }
    return deleted;
  }

  /**
   * Get all permissions
   */
  static async getAllPermissions(): Promise<Permission[]> {
    const result = await query<any>(
      'SELECT * FROM permissions ORDER BY category, name'
    );
    return result.rows.map(this.mapPermissionRow);
  }

  /**
   * Get permissions grouped by category
   */
  static async getPermissionsByCategory(): Promise<Record<string, Permission[]>> {
    const permissions = await this.getAllPermissions();
    const grouped: Record<string, Permission[]> = {};

    for (const permission of permissions) {
      if (!grouped[permission.category]) {
        grouped[permission.category] = [];
      }
      grouped[permission.category].push(permission);
    }

    return grouped;
  }

  /**
   * Get permissions for a role
   */
  static async getPermissionsForRole(roleId: string): Promise<Permission[]> {
    const result = await query<any>(
      `SELECT p.* FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1
       ORDER BY p.category, p.name`,
      [roleId]
    );
    return result.rows.map(this.mapPermissionRow);
  }

  /**
   * Set permissions for a role (replace all)
   */
  static async setPermissions(roleId: string, permissionIds: string[]): Promise<void> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Remove existing permissions
      await client.query(
        'DELETE FROM role_permissions WHERE role_id = $1',
        [roleId]
      );

      // Add new permissions
      if (permissionIds.length > 0) {
        const values = permissionIds
          .map((_, i) => `($1, $${i + 2})`)
          .join(', ');
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ${values}`,
          [roleId, ...permissionIds]
        );
      }

      await client.query('COMMIT');
      logger.info('Role permissions updated', { roleId, permissionCount: permissionIds.length });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add a permission to a role
   */
  static async addPermission(roleId: string, permissionId: string): Promise<boolean> {
    const result = await query(
      `INSERT INTO role_permissions (role_id, permission_id)
       VALUES ($1, $2)
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [roleId, permissionId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Remove a permission from a role
   */
  static async removePermission(roleId: string, permissionId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
      [roleId, permissionId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get users with a specific role
   */
  static async getUsersWithRole(roleId: string): Promise<Array<{ id: string; displayName: string | null; email: string | null }>> {
    const result = await query<any>(
      `SELECT u.id, u.display_name, u.email
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       WHERE ur.role_id = $1 AND u.is_active = TRUE
       ORDER BY u.display_name`,
      [roleId]
    );
    return result.rows.map(r => ({
      id: r.id,
      displayName: r.display_name,
      email: r.email
    }));
  }

  /**
   * Map database row to Role interface
   */
  private static mapRoleRow(row: any): Role {
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      priority: row.priority,
      isSystem: row.is_system,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  /**
   * Map database row to Permission interface
   */
  private static mapPermissionRow(row: any): Permission {
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      category: row.category,
      createdAt: new Date(row.created_at)
    };
  }
}

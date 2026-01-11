-- Migration 073: Create roles and permissions tables
-- RBAC (Role-Based Access Control) system

-- Roles table
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Permissions table
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Role-Permission junction table
CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- User-Role junction table
CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

-- Indexes
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_roles_priority ON roles(priority DESC);
CREATE INDEX idx_permissions_category ON permissions(category);

-- Update trigger for roles
CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE roles IS 'User roles for access control';
COMMENT ON COLUMN roles.priority IS 'Higher priority = more privileged role';
COMMENT ON COLUMN roles.is_system IS 'System roles cannot be deleted';
COMMENT ON TABLE permissions IS 'Individual permissions that can be assigned to roles';
COMMENT ON COLUMN permissions.category IS 'Permission category for grouping in UI (auth, users, content, admin, billing)';

-- Seed default roles
INSERT INTO roles (name, display_name, description, priority, is_system) VALUES
  ('owner', 'Owner', 'Full system access. Can manage all users, roles, and settings.', 100, TRUE),
  ('admin', 'Administrator', 'Administrative access. Can manage most settings and users.', 80, TRUE),
  ('member', 'Member', 'Registered user with standard access to view content.', 50, TRUE),
  ('guest', 'Guest', 'Limited read-only access. Cannot perform actions.', 10, TRUE);

-- Seed default permissions
INSERT INTO permissions (name, display_name, category, description) VALUES
  -- Authentication
  ('auth.login', 'Can log in', 'auth', 'Permission to authenticate and access the system'),

  -- User management
  ('users.view', 'View users', 'users', 'View list of users and their profiles'),
  ('users.create', 'Create users', 'users', 'Create new user accounts'),
  ('users.edit', 'Edit users', 'users', 'Modify user account details'),
  ('users.delete', 'Delete users', 'users', 'Delete or deactivate user accounts'),
  ('users.manage_roles', 'Manage user roles', 'users', 'Assign and remove roles from users'),

  -- Content/Data access
  ('content.view_profiles', 'View broadcaster profiles', 'content', 'Access broadcaster profile pages and data'),
  ('content.edit_profiles', 'Edit profile data', 'content', 'Modify notes and attributes on profiles'),
  ('content.view_stats', 'View statistics', 'content', 'Access statistical dashboards and reports'),
  ('content.view_inbox', 'View inbox/messages', 'content', 'Access the messages inbox'),
  ('content.view_broadcasts', 'View broadcasts', 'content', 'View broadcast sessions and history'),
  ('content.view_event_log', 'View event log', 'content', 'Access the Chaturbate events log'),
  ('content.manage_media', 'Manage media', 'content', 'Upload, delete, and organize media files'),

  -- Admin functions
  ('admin.view_dashboard', 'View admin dashboard', 'admin', 'Access the admin control panel'),
  ('admin.manage_jobs', 'Control background jobs', 'admin', 'Start, stop, and configure background jobs'),
  ('admin.manage_settings', 'Modify system settings', 'admin', 'Change application configuration settings'),
  ('admin.view_logs', 'View system logs', 'admin', 'Access application and system logs'),
  ('admin.manage_roles', 'Manage roles', 'admin', 'Create, edit, and delete roles and permissions'),

  -- Billing (future use)
  ('billing.view', 'View billing info', 'billing', 'View subscription and billing information'),
  ('billing.manage', 'Manage billing', 'billing', 'Modify subscription and payment methods');

-- Assign all permissions to Owner role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'owner';

-- Assign admin permissions to Admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.name IN (
    'auth.login',
    'users.view',
    'users.edit',
    'content.view_profiles',
    'content.edit_profiles',
    'content.view_stats',
    'content.view_inbox',
    'content.view_broadcasts',
    'content.view_event_log',
    'content.manage_media',
    'admin.view_dashboard',
    'admin.manage_jobs',
    'admin.manage_settings',
    'admin.view_logs'
  );

-- Assign member permissions to Member role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'member'
  AND p.name IN (
    'auth.login',
    'content.view_profiles',
    'content.view_stats',
    'content.view_inbox',
    'content.view_broadcasts',
    'content.view_event_log'
  );

-- Assign minimal permissions to Guest role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'guest'
  AND p.name IN (
    'auth.login',
    'content.view_profiles'
  );

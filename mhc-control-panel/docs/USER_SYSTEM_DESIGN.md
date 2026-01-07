# User System Design

## Overview

The system needs to handle TWO distinct types of users:

1. **Platform Users** (Chaturbate models/viewers) - External users we track
2. **System Users** (Application users) - Internal users who access the control panel

## Current State

**Table: `persons`**
- Represents Chaturbate users (models and viewers)
- Fields: id, username, platform, role, rid, did, first_seen_at, last_seen_at, is_excluded

**Issue**: Need to add system users without conflicting with platform users.

## Proposed Design

### Option 1: Separate Tables (RECOMMENDED)

Keep platform users and system users completely separate:

**`persons`** (existing - Chaturbate users)
- Keep as-is for platform users
- Add `person_type` ENUM: 'MODEL', 'VIEWER', 'BOTH'

**`system_users`** (new - Application users)
- id (UUID)
- username (unique)
- email (unique)
- password_hash
- role_id (FK to system_roles)
- created_at
- updated_at
- last_login_at
- is_active

**`system_roles`** (new - Application roles)
- id (SERIAL)
- name (e.g., 'admin', 'subscriber', 'viewer')
- description
- created_at

**`system_permissions`** (new - Granular permissions)
- id (SERIAL)
- name (e.g., 'view_users', 'manage_users', 'view_stats', 'manage_jobs')
- resource (e.g., 'users', 'jobs', 'stats')
- action (e.g., 'read', 'write', 'delete')
- created_at

**`system_role_permissions`** (junction table)
- role_id (FK to system_roles)
- permission_id (FK to system_permissions)
- created_at

### Benefits of Separate Tables

✅ **Clear separation** - Platform users vs system users never confused
✅ **Different schemas** - Can evolve independently
✅ **Security** - System users have authentication, platform users don't
✅ **Simpler queries** - No need to filter by user type everywhere
✅ **Future-proof** - Easy to add OAuth, SSO for system users

## Enhanced Following/Follower Tracking

### Add to `profiles` table:

```sql
ALTER TABLE profiles
  -- Existing fields
  ADD COLUMN IF NOT EXISTS following_since TIMESTAMP,
  ADD COLUMN IF NOT EXISTS follower_since TIMESTAMP,
  ADD COLUMN IF NOT EXISTS unfollowed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS unfollower_at TIMESTAMP;
```

**Logic**:
- When user appears in following list for first time → Set `following_since = NOW()`
- When user no longer in following list → Set `following = FALSE`, `unfollowed_at = NOW()`
- When user reappears → Set `following = TRUE`, `unfollowed_at = NULL`
- Same logic for followers

This allows us to track:
- **Following tab**: `following = TRUE` (shows `following_since`)
- **Followers tab**: `follower = TRUE` (shows `follower_since`)
- **Unfollowed tab**: `unfollowed_at IS NOT NULL` (shows when they unfollowed)

## Navigation Structure

```
┌─────────────────────────────────────────────────────────────┐
│ MHC Control Panel                                            │
├─────────────────────────────────────────────────────────────┤
│ Users | Profile | Hudson | Events | Admin                    │
└─────────────────────────────────────────────────────────────┘
```

### **Users Page** (combines Lookup + Users + Follow)

#### Tab 1: Directory
**Platform users (Chaturbate models/viewers)**

- **Toggle filter**: All | Models | Viewers
- **Search box**: Username lookup
  - If found → Shows in results
  - If not found → "Add to Queue" button (adds to P2 priority)
  - Shows queue status: "Queued", "Processing", "Complete"

**Table Columns**:
| Username | Image | Age | Role | Tags | Priority | Followers | Rank | Events | Snapshots | Last Seen | Actions |

**Actions**:
- 🔍 View Profile
- 📝 Scrape Profile
- ⭐ Add to P1
- 🔄 Refresh Data

#### Tab 2: Following
**Models I'm following**

- **Button**: "Update Following List" → Browser automation
- **Auto-tracks**: First followed date, unfollowed date, re-followed

**Table Columns**:
| Username | Image | Age | Role | Tags | Followers | Rank | Following Since | Last Seen | Actions |

#### Tab 3: Followers
**Users following me**

- **Button**: "Update Followers List" → Browser automation
- **Filter**: All | Models | Viewers
- **Auto-tracks**: First followed date

**Table Columns**:
| Username | Image | Age | Role | Tags | Following Since | Last Seen | Actions |

#### Tab 4: Unfollowed
**Users who unfollowed me**

- **Auto-populated**: When user disappears from followers list
- **Shows**: When they originally followed, when they unfollowed
- **Can filter**: Recently unfollowed (7d, 30d, 90d)

**Table Columns**:
| Username | Image | Age | Role | Followed On | Unfollowed On | Days Followed | Last Seen | Actions |

**Insights**:
- Total unfollows this week/month
- Average follow duration
- Unfollow rate percentage

## Database Migrations Needed

### Migration 019: Enhanced follower tracking

```sql
-- Add tracking timestamps
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS following_since TIMESTAMP,
  ADD COLUMN IF NOT EXISTS follower_since TIMESTAMP,
  ADD COLUMN IF NOT EXISTS unfollowed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS unfollower_at TIMESTAMP;

COMMENT ON COLUMN profiles.following_since IS 'When I started following this user';
COMMENT ON COLUMN profiles.follower_since IS 'When this user started following me';
COMMENT ON COLUMN profiles.unfollowed_at IS 'When I unfollowed this user (if applicable)';
COMMENT ON COLUMN profiles.unfollower_at IS 'When this user unfollowed me (if applicable)';

-- Create index for unfollowed queries
CREATE INDEX IF NOT EXISTS idx_profiles_unfollowed
  ON profiles(unfollower_at)
  WHERE unfollower_at IS NOT NULL;
```

### Migration 020: System users (future)

```sql
-- System roles
CREATE TABLE IF NOT EXISTS system_roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- System permissions
CREATE TABLE IF NOT EXISTS system_permissions (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Role-permission junction
CREATE TABLE IF NOT EXISTS system_role_permissions (
  role_id INTEGER REFERENCES system_roles(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES system_permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- System users
CREATE TABLE IF NOT EXISTS system_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INTEGER REFERENCES system_roles(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_system_users_email ON system_users(email);
CREATE INDEX IF NOT EXISTS idx_system_users_role ON system_users(role_id);

-- Default roles
INSERT INTO system_roles (name, description) VALUES
  ('admin', 'Full system access'),
  ('subscriber', 'Paid subscriber with advanced features'),
  ('viewer', 'Basic read-only access')
ON CONFLICT (name) DO NOTHING;

-- Default permissions (examples)
INSERT INTO system_permissions (name, resource, action, description) VALUES
  ('view_users', 'users', 'read', 'View platform users'),
  ('manage_users', 'users', 'write', 'Add/edit platform users'),
  ('view_stats', 'stats', 'read', 'View system statistics'),
  ('manage_jobs', 'jobs', 'write', 'Start/stop background jobs'),
  ('manage_priorities', 'priorities', 'write', 'Manage priority queues'),
  ('scrape_profiles', 'profiles', 'write', 'Trigger profile scraping')
ON CONFLICT (name) DO NOTHING;

-- Grant all permissions to admin
INSERT INTO system_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM system_roles r
CROSS JOIN system_permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;
```

## Implementation Priority

1. ✅ **Follower tracking enhancement** (following_since, unfollowed_at)
2. ✅ **Unfollowed tab** implementation
3. ✅ **Add Age to directory**
4. ⏳ **System users** (when auth needed)

## Age Data

Age should come from:
1. **Affiliate API** (when online)
2. **Profile scraping** (manual/on-demand)
3. **Cached in profiles table**

Already exists in:
- `affiliate_api_snapshots.age`
- `profiles.age`
- Should be added to `v_person_current_state` view

## Updated View

```sql
-- Add age to aggregation view
CREATE OR REPLACE VIEW v_person_current_state AS
SELECT
  p.*,
  -- Profile data
  COALESCE(
    (SELECT age FROM affiliate_api_snapshots WHERE person_id = p.id ORDER BY observed_at DESC LIMIT 1),
    pr.age
  ) as age,

  -- ... rest of view fields

  -- Following/Follower tracking
  pr.following,
  pr.follower,
  pr.following_since,
  pr.follower_since,
  pr.unfollowed_at,
  pr.unfollower_at

FROM persons p
LEFT JOIN profiles pr ON pr.person_id = p.id
WHERE p.is_excluded = FALSE;
```

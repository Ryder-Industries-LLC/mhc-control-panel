# User Settings Page Design

**Status**: Planning Phase
**Priority**: High (enables multi-user support)

---

## Overview

Create a Settings page that allows users to configure the application for their own Chaturbate broadcasting account without modifying environment variables or redeploying.

---

## Current State (Single User)

The application currently requires all configuration via environment variables:
- `CHATURBATE_USERNAME` - Broadcaster username
- `CHATURBATE_EVENTS_TOKEN` - Events API token
- `CHATURBATE_STATS_TOKEN` - Stats API token
- `STATBATE_TOKEN` - Statbate Premium API token
- `EXCLUDED_USERNAMES` - Comma-separated list

**Limitations**:
- Requires code/environment changes to switch accounts
- No support for multiple users
- Credentials in plaintext environment files
- Requires container restart for changes

---

## Phase 1: Single User Settings Page

### Features

#### 1. Settings Storage
Create new database table for application settings:

```sql
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  encrypted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_app_settings_key ON app_settings(key);
```

#### 2. Settings API Endpoints

**GET /api/settings**
- Returns all non-encrypted settings
- Encrypted values returned as `[ENCRYPTED]`

**PUT /api/settings**
- Update multiple settings at once
- Validates required fields
- Encrypts sensitive values

**POST /api/settings/test-connection**
- Test Chaturbate API credentials
- Verify tokens are valid
- Return connection status

#### 3. Settings Page UI

**Location**: `/settings`

**Sections**:

1. **Chaturbate Configuration**
   - Broadcaster Username (text input)
   - Events API Token (password input with show/hide toggle)
   - Stats API Token (password input with show/hide toggle)
   - Test Connection button (validates credentials)

2. **Statbate Integration** (Optional)
   - Statbate Premium API Token (password input)
   - Enable/Disable toggle
   - Test Connection button

3. **Exclusion List**
   - Username exclusion list (textarea, comma-separated)
   - Example: `smk_lover, spammer123`
   - Apply button

4. **Preferences**
   - Auto-refresh intervals (dropdowns)
     - Hudson page: 10s / 30s / 60s / Off
     - Events page: 5s / 10s / 30s / Off
   - Interaction display limit (number input)
   - Theme preference (Light / Dark / Auto)
   - Timezone selection

5. **Actions**
   - Save All Settings button
   - Reset to Defaults button
   - Clear Cache button

#### 4. Encryption Strategy

Use Node.js `crypto` module for AES-256-GCM encryption:

```typescript
// server/src/utils/encryption.ts
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32-byte key from env
const ALGORITHM = 'aes-256-gcm';

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, encryptedText] = encrypted.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Keys to Encrypt**:
- `chaturbate.events_token`
- `chaturbate.stats_token`
- `statbate.api_token`

**Keys NOT Encrypted** (safe to display):
- `chaturbate.username`
- `excluded_usernames`
- `preferences.*`

#### 5. Migration from Environment Variables

On first run, seed `app_settings` table from environment variables:

```typescript
// server/src/db/migrations/011_create_app_settings.sql
-- Table creation

-- Seed from environment variables (if not exists)
INSERT INTO app_settings (key, value, encrypted)
VALUES
  ('chaturbate.username', '${CHATURBATE_USERNAME}', FALSE),
  ('chaturbate.events_token', '[ENCRYPTED]', TRUE),
  ('chaturbate.stats_token', '[ENCRYPTED]', TRUE)
ON CONFLICT (key) DO NOTHING;
```

#### 6. Settings Service

```typescript
// server/src/services/settings.service.ts

export class SettingsService {
  static async get(key: string): Promise<string | null>;
  static async getAll(): Promise<Record<string, string>>;
  static async set(key: string, value: string, encrypted?: boolean): Promise<void>;
  static async setMultiple(settings: Record<string, string>): Promise<void>;
  static async getChaturbateUsername(): Promise<string>;
  static async getChaturbateEventsToken(): Promise<string>;
  static async testChaturbateConnection(): Promise<boolean>;
}
```

---

## Phase 2: Multi-User Support (Future)

### Authentication System

#### 1. User Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  broadcaster_username VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  encrypted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, key)
);
```

#### 2. Authentication Flow
- JWT-based authentication
- bcrypt password hashing
- Session management
- Password reset via email
- Email verification

#### 3. Multi-Tenancy
- Each user has isolated data:
  - Own persons/interactions
  - Own sessions
  - Own snapshots
- Global data remains shared:
  - event_logs (all users)
  - Directory shows all persons (with user filtering option)

#### 4. Security Considerations
- Per-user encryption keys (derived from password)
- Rate limiting on API endpoints
- CORS configuration for production
- HTTPS-only cookies
- CSRF protection
- SQL injection prevention (already using parameterized queries)

---

## Phase 3: Profile Information Fetching

### Option 1: Chaturbate WebSocket Interface

**Pros**:
- Real-time data
- Official API (if available)
- Reliable

**Cons**:
- May require authentication
- Documentation likely limited
- More complex implementation

**Implementation**:
```typescript
// server/src/api/chaturbate/websocket-client.ts
import WebSocket from 'ws';

export class ChaturbateWebSocketClient {
  private ws: WebSocket;

  async connect(username: string, token: string): Promise<void> {
    this.ws = new WebSocket(`wss://chaturbate.com/websocket`);

    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      this.handleMessage(message);
    });
  }

  async getProfile(username: string): Promise<ProfileData> {
    // Send profile request via WebSocket
  }
}
```

### Option 2: Web Scraping (Authenticated)

**Pros**:
- Access to any public profile data
- Can get data not available via API

**Cons**:
- Fragile (breaks if HTML changes)
- Requires cookie management
- May violate ToS
- Slower than API

**Implementation**:
```typescript
// server/src/api/chaturbate/profile-scraper.ts
import axios from 'axios';
import * as cheerio from 'cheerio';

export class ChaturbateProfileScraper {
  async getProfile(username: string, cookies: string): Promise<ProfileData> {
    const response = await axios.get(
      `https://chaturbate.com/${username}/`,
      {
        headers: {
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0...'
        }
      }
    );

    const $ = cheerio.load(response.data);

    return {
      bio: $('.bio-text').text(),
      location: $('.location').text(),
      age: $('.age').text(),
      followers: $('.followers-count').text(),
      // ... more fields
    };
  }
}
```

### Option 3: Chaturbate Stats API Extension

Check if Stats API already provides profile information:
- Review `CHATURBATE_STATS_API.md`
- Test additional endpoints
- May already have what we need

---

## Profile Data to Capture

### Basic Info
- Display name
- Bio/About text
- Location
- Age
- Gender
- Spoken languages

### Stats
- Total followers (from Stats API - already have)
- Member since date
- Last broadcast date
- Average viewers
- Total hours streamed

### Media
- Profile picture URL
- Background image URL
- Recent photo URLs

### Settings (if available)
- Room subject/title
- Tags/categories
- Tip menu items
- Private show rate
- Fanclub price

---

## Implementation Priority

### High Priority (Phase 1)
1. Settings table and API
2. Basic Settings page UI
3. Encryption utilities
4. Migration from env vars
5. Test connection functionality

**Estimated Effort**: 1-2 days

### Medium Priority (Phase 2)
1. User authentication system
2. User-specific data isolation
3. Login/register UI
4. Password reset flow

**Estimated Effort**: 3-5 days

### Low Priority (Phase 3)
1. Profile fetching (research which method works best)
2. Profile display UI
3. Profile change tracking

**Estimated Effort**: 1-2 days (after research)

---

## Security Best Practices

### Encryption
- Use AES-256-GCM (authenticated encryption)
- Store encryption key in environment (never in database)
- Rotate keys periodically
- Use unique IV for each encryption

### Password Storage (Multi-user)
- bcrypt with salt rounds ≥ 12
- Never store plaintext passwords
- Implement password strength requirements
- Rate limit login attempts

### API Security
- Validate all inputs
- Sanitize user-provided data
- Use prepared statements (already doing)
- Implement CSRF tokens for forms
- Add rate limiting middleware

### Token Storage
- Never log tokens
- Never return tokens in API responses (except on first save)
- Clear tokens from memory after use
- Implement token refresh if using JWT

---

## User Experience Considerations

### First-Time Setup Flow
1. User installs application
2. Docker containers start
3. Navigate to `http://localhost:3001/settings`
4. See "Welcome to MHC Control Panel" screen
5. Form to enter:
   - Broadcaster username
   - Chaturbate tokens
   - (Optional) Statbate token
6. Test Connection button validates credentials
7. Save and redirect to Hudson dashboard

### Settings Validation
- Real-time validation (client-side)
- Test connection before saving
- Clear error messages
- Success confirmations
- Undo/rollback on errors

### Settings Export/Import
- Export settings as JSON (tokens encrypted)
- Import settings from file
- Useful for:
  - Backup/restore
  - Moving between environments
  - Sharing config (without secrets)

---

## Questions to Answer

### Technical
- [ ] Does Chaturbate have a WebSocket API for profile data?
- [ ] What profile fields are available via Stats API?
- [ ] Should we cache profile data? For how long?
- [ ] How to handle token rotation/expiry?

### Product
- [ ] Should settings require restart or apply immediately?
- [ ] Allow multiple broadcaster accounts per user?
- [ ] Implement settings versioning/history?
- [ ] Add settings import/export feature?

### Security
- [ ] Encrypt encryption key with user password (multi-user)?
- [ ] Implement 2FA for sensitive operations?
- [ ] Add audit log for settings changes?
- [ ] Require re-authentication for viewing tokens?

---

## Next Steps

1. **Research Phase** (1-2 hours)
   - Investigate Chaturbate profile data sources
   - Review existing Stats API response for profile fields
   - Test if Events API includes profile updates

2. **Design Phase** (2-3 hours)
   - Finalize database schema
   - Design Settings page UI mockup
   - Plan encryption key management

3. **Implementation Phase 1** (1-2 days)
   - Create app_settings table
   - Build Settings service
   - Implement encryption utils
   - Create Settings API endpoints
   - Build Settings page UI

4. **Testing Phase** (2-3 hours)
   - Test encryption/decryption
   - Test connection validation
   - Test migration from env vars
   - Security audit

5. **Documentation** (1 hour)
   - Update FRONTEND_UPDATE.md
   - Add settings to README
   - Document encryption process
   - Add setup guide

---

## Success Criteria

### Phase 1 Complete When:
- ✅ User can configure all tokens via Settings page
- ✅ Tokens are encrypted in database
- ✅ Application reads settings from database (not env vars)
- ✅ Test connection validates credentials
- ✅ No restart required for settings changes
- ✅ Settings persist across container restarts

### Phase 2 Complete When:
- ✅ User can register account
- ✅ User can login/logout
- ✅ Each user has isolated data
- ✅ Password reset works
- ✅ JWT authentication secure

### Phase 3 Complete When:
- ✅ Profile data fetched successfully
- ✅ Profile displayed on Hudson page
- ✅ Profile changes tracked over time
- ✅ Profile photos displayed

---

**Document Status**: Draft for Planning
**Last Updated**: 2025-12-22

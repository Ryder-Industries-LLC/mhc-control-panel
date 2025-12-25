# Follow Management System

## Overview

The Follow Management system tracks your Chaturbate following/follower relationships using automated scraping with Puppeteer. This system handles authentication (including 2FA), pagination for large lists, and database tracking of relationship changes over time.

## Features

- **Auto-Scrape Following**: Automatically scrape your full following list (both online and offline users)
- **Auto-Scrape Followers**: Automatically scrape users who follow you
- **Cookie-Based Authentication**: Import cookies from your browser to maintain authenticated sessions (works with 2FA)
- **Pagination Support**: Handles large following lists by scrolling to load all results (tested with 1,305+ users)
- **Manual Upload Fallback**: Upload HTML files manually if auto-scraping doesn't work
- **Relationship Tracking**: Tracks when you followed/unfollowed users and when they followed/unfollowed you
- **Profile Integration**: Links to full profile pages with interaction history, snapshots, and stats

## Architecture

### Components

1. **Frontend**: React-based UI in `client/src/pages/Follow.tsx`
2. **API Routes**: Express endpoints in `server/src/routes/followers.ts`
3. **Scraper Service**: Puppeteer-based scraping in `server/src/services/chaturbate-scraper.service.ts`
4. **Parser Service**: HTML parsing and database updates in `server/src/services/follower-scraper.service.ts`
5. **Database**: PostgreSQL profiles table with following/follower tracking fields

### Data Flow

```
Browser Cookies → Import to Server → Puppeteer Browser → Scrape HTML → Parse Usernames → Update Database → Display in UI
```

## Setup Instructions

### First-Time Setup

1. **Import Cookies** (one-time setup):
   - Click "Import Cookies" button on Follow page
   - Follow the detailed instructions in the dialog:
     - Log in to Chaturbate in your browser
     - Open DevTools (F12) → Application tab → Cookies
     - Copy full cookie string from Network tab → Request Headers
     - Run the provided JavaScript snippet to format cookies
     - Paste formatted cookies into the dialog

2. **Test Auto-Scrape**:
   - Click "Auto-Scrape Following" to fetch your following list
   - This will scrape both online and offline users
   - Pagination automatically handles large lists (1000+ users)

### Cookie Import Details

The cookie import method captures ALL cookies including httpOnly cookies like `sessionid` which are essential for authentication but not accessible via `document.cookie`.

**Why Network Tab Method?**
- `document.cookie` cannot access httpOnly cookies
- Network tab shows the full cookie string sent with HTTP requests
- This includes the critical `sessionid` cookie needed for authentication

**Cookie Storage**:
- Cookies are stored in: `server/data/chaturbate-cookies.json`
- This file is gitignored for security
- Cookies persist across container restarts via volume mount

## API Endpoints

### GET /api/followers/following
Returns list of users you're following with profile data.

**Response**:
```json
{
  "following": [
    {
      "id": "uuid",
      "username": "username",
      "platform": "CHATURBATE",
      "role": "MODEL",
      "last_seen_at": "timestamp",
      "interaction_count": 0,
      "snapshot_count": 0,
      "image_url": "url or path",
      "current_show": "title or null",
      "tags": ["tag1", "tag2"],
      "following_checked_at": "timestamp"
    }
  ],
  "total": 1305
}
```

### GET /api/followers/followers
Returns list of users following you.

### GET /api/followers/unfollowed
Returns list of users who unfollowed you with duration data.

### POST /api/followers/import-cookies
Import cookies from browser for authentication.

**Request**:
```json
{
  "cookies": [
    {
      "name": "sessionid",
      "value": "...",
      "domain": ".chaturbate.com",
      "path": "/",
      "secure": true,
      "httpOnly": true,
      "sameSite": "Lax"
    }
  ]
}
```

### GET /api/followers/cookies-status
Check if cookies are imported and ready for scraping.

### POST /api/followers/scrape-following
Automatically scrape following list using Puppeteer with pagination.

**Response**:
```json
{
  "success": true,
  "stats": {
    "totalFollowing": 1305,
    "newFollowing": 15,
    "unfollowed": 2
  },
  "usernames": ["user1", "user2", ...]
}
```

### POST /api/followers/scrape-followers
Automatically scrape followers list.

### POST /api/followers/update-following
Manually upload HTML from followed-cams page.

**Request**:
```json
{
  "html": "<html>...</html>"
}
```

### POST /api/followers/update-followers
Manually upload HTML from followers page.

### DELETE /api/followers/clear-following
Clear all following records (for debugging/reset).

## Pagination Implementation

The scraper uses scroll-based pagination to handle Chaturbate's infinite scroll interface:

1. **Scroll to Bottom**: `window.scrollTo(0, document.body.scrollHeight)`
2. **Wait for Content**: 1500ms delay for new content to load
3. **Check Height Change**: Compares current vs previous page height
4. **Repeat**: Continues until height stops changing
5. **Safety Limits**:
   - Max 100 scrolls to prevent infinite loops
   - Stops after 3 consecutive iterations with no height change

**Performance**:
- Typical scrape time: 30-60 seconds for 1305 users
- Both online and offline pages are scraped with full pagination
- Logs show progress: "Loaded more content (scroll N)"

## HTML Parsing

### Following Pages
Parses usernames from `li.room_list_room` elements or `[data-room]` attributes.

**Selectors**:
```javascript
$('li.room_list_room').each((_, element) => {
  const username = $(element).find('a').attr('href')?.replace(/^\//, '').replace(/\/$/, '');
  if (username && username.length > 0) {
    usernames.push(username.toLowerCase());
  }
});
```

**Fallback**:
```javascript
$('[data-room]').each((_, element) => {
  const username = $(element).attr('data-room');
  if (username && username.length > 0) {
    usernames.push(username.toLowerCase());
  }
});
```

### Followers Page
Parses usernames from links, filtering out common non-username paths.

**Filters**:
- Excludes `/accounts/*`
- Excludes `/tipping/*`
- Excludes `/supporter/*`
- Minimum 2 characters
- Must be root-level paths (no slashes)

## Database Schema

### profiles table

| Field | Type | Description |
|-------|------|-------------|
| person_id | UUID | Foreign key to persons table |
| following | BOOLEAN | Currently following this user |
| following_since | TIMESTAMP | When you started following |
| following_checked_at | TIMESTAMP | Last time following status was checked |
| unfollowed_at | TIMESTAMP | When you unfollowed (if applicable) |
| follower | BOOLEAN | Currently following you |
| follower_since | TIMESTAMP | When they started following you |
| follower_checked_at | TIMESTAMP | Last time follower status was checked |
| unfollower_at | TIMESTAMP | When they unfollowed you (if applicable) |

### Update Logic

**Following**:
1. Get current following list from database
2. For each scraped username:
   - Find or create person record
   - Set `following = TRUE`
   - Update `following_checked_at = NOW()`
   - Set `following_since` to NOW() if first time
   - Clear `unfollowed_at`
3. For users no longer in scraped list:
   - Set `following = FALSE`
   - Set `unfollowed_at = NOW()`

**Followers**: Same logic but with follower-specific fields.

## Docker Configuration

### Puppeteer in Docker

The web container includes Chromium for Puppeteer:

```dockerfile
# Install Chromium and dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Configure Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### Volume Mounts

```yaml
volumes:
  - ./server/data:/app/data  # Persistent storage for cookies and browser profile
```

**Persisted Data**:
- `server/data/chaturbate-cookies.json` - Imported cookies
- `server/data/browser-profile/` - Puppeteer browser profile (session data)

## Troubleshooting

### Authentication Issues

**Symptom**: Redirected to `/?next=/followed-cams/`

**Cause**: Cookies are missing or expired

**Fix**: Re-import cookies from your browser

### Incomplete Scraping

**Symptom**: Only ~100-200 users scraped when you have 1000+

**Cause**: Pagination not working or timing too aggressive

**Fix**: Check logs for "Paginating through all results" and "Finished pagination after N scrolls"

### Performance Issues

**Symptom**: Scraping times out or takes extremely long

**Fix**: Adjust scroll timing in `chaturbate-scraper.service.ts`:
```typescript
await new Promise(resolve => setTimeout(resolve, 1500)); // Increase if needed
```

### Cookie Import Fails

**Symptom**: "Invalid JSON format" error

**Cause**: Cookie string wasn't properly formatted

**Fix**:
1. Ensure you copied the ENTIRE cookie string from Network tab
2. Run the JavaScript snippet exactly as provided
3. The output should start with `[{` and be valid JSON

### Browser Not Launching

**Symptom**: "Failed to launch browser" errors in logs

**Cause**: Missing Chromium dependencies in Docker

**Fix**: Rebuild web container to ensure all dependencies are installed

## Monitoring

### Check Logs

```bash
# Watch live logs
docker-compose logs -f web

# Look for scraping activity
docker-compose logs web | grep -i "scraping"

# Check pagination
docker-compose logs web | grep -i "paginating"
```

### Key Log Messages

**Successful Scraping**:
```
[info]: Navigating to homepage first to establish session...
[info]: Cookies applied to page {"count":5}
[info]: Reloading page to activate cookies...
[info]: Navigating to https://chaturbate.com/followed-cams/...
[info]: Final URL after navigation: https://chaturbate.com/followed-cams/
[info]: Paginating through all results...
[info]: Loaded more content (scroll 1)
[info]: Loaded more content (scroll 2)
...
[info]: Finished pagination after 15 scrolls
[info]: Successfully extracted HTML from https://chaturbate.com/followed-cams/ (1234567 characters)
[info]: Successfully scraped following list {"online":856,"offline":449,"total":1305}
```

**Authentication Failure**:
```
[warn]: Redirected to login page even with cookies - cookies may be expired. Please re-import cookies.
```

**No Cookies**:
```
[warn]: No cookies available to apply to page
[warn]: Redirected to login page - not authenticated. Please import cookies first.
```

## Manual Upload Alternative

If auto-scraping doesn't work, you can manually upload HTML files:

### Following

1. Visit https://chaturbate.com/followed-cams
2. Save page as HTML (Ctrl+S or Cmd+S)
3. Visit https://chaturbate.com/followed-cams/offline/
4. Save page as HTML
5. Upload both files via "Upload Following HTML" button

**Note**: This method requires saving ALL pages manually if you have 1000+ users (could be 15+ pages), which is why auto-scraping with pagination is strongly preferred.

### Followers

1. Visit https://chaturbate.com/accounts/followers/
2. Save page as HTML
3. Upload via "Upload Followers HTML" button

## Future Enhancements

- [ ] Schedule periodic auto-scraping (cron job)
- [ ] Email notifications for new followers/unfollowers
- [ ] Analytics dashboard (follower growth over time)
- [ ] Export following/follower lists to CSV
- [ ] Bulk actions (follow/unfollow from UI)
- [ ] Filter and search capabilities
- [ ] Recommended users section (ignore in scraping)

## Security Considerations

- Cookies contain authentication tokens - never commit to git
- Cookie files are stored in gitignored `server/data/` directory
- Cookies are only accessible to backend server
- Frontend never sees raw cookie values
- Use HTTPS in production to protect cookie transmission
- Consider implementing cookie encryption at rest
- Rotate cookies periodically by re-importing

## Testing

### Test Cookie Import

```bash
# Check if cookies file exists
docker-compose exec web ls -la /app/data/chaturbate-cookies.json

# View cookie count (not values!)
docker-compose exec web cat /app/data/chaturbate-cookies.json | jq 'length'
```

### Test Scraping

```bash
# Start scrape and watch logs
curl -X POST http://localhost:3000/api/followers/scrape-following
docker-compose logs -f web
```

### Test Database Updates

```bash
# Check following count
docker-compose exec db psql -U postgres -d mhc -c "SELECT COUNT(*) FROM profiles WHERE following = TRUE;"

# View recent follows
docker-compose exec db psql -U postgres -d mhc -c "SELECT p.username, pr.following_since FROM persons p JOIN profiles pr ON pr.person_id = p.id WHERE pr.following = TRUE ORDER BY pr.following_since DESC LIMIT 10;"
```

## Support

If you encounter issues:

1. Check logs: `docker-compose logs -f web`
2. Verify cookies: Visit `/api/followers/cookies-status`
3. Clear following: `curl -X DELETE http://localhost:3000/api/followers/clear-following`
4. Re-import cookies and try again
5. Check this documentation for troubleshooting steps

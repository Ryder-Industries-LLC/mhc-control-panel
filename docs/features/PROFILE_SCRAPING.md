# Profile Scraping Feature

## Overview

The MHC Control Panel now includes automated profile scraping for Chaturbate broadcasters. This feature collects detailed profile information that is not available through the official APIs, including bio text, photos, tip menus, and more.

## Why Scraping?

While the Statbate Premium API provides excellent performance metrics (rank, income, sessions), it does **not** include:
- Bio/description text
- Profile photos
- Tip menu items and pricing
- Goal descriptions
- Social media links
- Physical attributes (height, weight, etc.)
- Fanclub information

This profile data is essential for:
- AI-powered insights and recommendations
- Profile optimization audits
- Content strategy analysis
- Comprehensive broadcaster analytics

## Architecture

### Components

1. **ProfileScraperService** ([server/src/services/profile-scraper.service.ts](server/src/services/profile-scraper.service.ts))
   - Uses Puppeteer for headless browser automation
   - Scrapes Chaturbate profile pages
   - Returns structured `ChaturbateProfile` data

2. **ProfileService** ([server/src/services/profile.service.ts](server/src/services/profile.service.ts))
   - Manages profile data in database
   - Upsert (insert or update) operations
   - Cache management with staleness detection

3. **Database Table** (`profiles`)
   - Stores scraped profile data
   - One-to-one relationship with `persons` table
   - Includes `scraped_at` timestamp for cache invalidation

4. **API Routes** ([server/src/routes/profile.ts](server/src/routes/profile.ts))
   - GET `/api/profile/:username` - Get profile (cached or fresh)
   - POST `/api/profile/:username/scrape` - Force re-scrape
   - GET `/api/profile/` - List all cached profiles
   - DELETE `/api/profile/:username` - Delete cached profile

## Data Model

### ChaturbateProfile Interface

```typescript
interface ChaturbateProfile {
  // Basic Info
  username: string;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  age: number | null;

  // Physical Attributes
  gender: string | null;
  sexualOrientation: string | null;
  interestedIn: string | null;
  bodyType: string | null;
  ethnicity: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  height: string | null;
  weight: string | null;

  // Arrays
  languages: string[];
  tags: string[];

  // Rich Data
  photos: Array<{ url: string; isPrimary: boolean }>;
  tipMenu: Array<{ item: string; tokens: number }>;

  // Goals
  goalDescription: string | null;
  goalTokens: number | null;
  goalProgress: number | null;

  // Social
  socialLinks: Array<{ platform: string; url: string }>;

  // Fanclub
  fanclubPrice: number | null;
  fanclubCount: number | null;

  // Metadata
  lastBroadcast: Date | null;
  scrapedAt: Date;
}
```

## Usage

### API Endpoints

#### Get Profile (with caching)

```bash
GET /api/profile/:username

# Example
curl http://localhost:3000/api/profile/somemodel

# Force refresh
curl http://localhost:3000/api/profile/somemodel?force=true
```

**Response:**
```json
{
  "person": { "id": 123, "username": "somemodel", ... },
  "profile": {
    "bio": "Hey there! I'm ...",
    "tags": ["brunette", "petite", "english"],
    "photos": [
      { "url": "https://...", "isPrimary": true }
    ],
    ...
  },
  "cached": false
}
```

#### Force Scrape Profile

```bash
POST /api/profile/:username/scrape

# Example
curl -X POST http://localhost:3000/api/profile/somemodel/scrape
```

#### List All Profiles

```bash
GET /api/profile?limit=50

# Example
curl http://localhost:3000/api/profile?limit=100
```

### Code Usage

```typescript
import { ProfileScraperService } from './services/profile-scraper.service.js';
import { ProfileService } from './services/profile.service.js';

// Scrape a profile
const profileData = await ProfileScraperService.scrapeProfile('somemodel');

// Save to database
const profile = await ProfileService.upsertProfile(personId, profileData);

// Get cached profile
const cachedProfile = await ProfileService.getByPersonId(personId);

// Check if needs refresh (default: 7 days)
const needsRefresh = await ProfileService.needsRefresh(personId, 7);
```

## Caching Strategy

Profiles are cached for **7 days** by default to minimize scraping overhead.

**Cache Invalidation:**
- Automatic: Profiles older than 7 days are automatically refreshed
- Manual: Use `?force=true` query parameter or POST to `/scrape` endpoint
- On-demand: Delete cached profile with DELETE endpoint

**Benefits:**
- Reduces load on Chaturbate servers
- Faster response times for repeated requests
- Lower resource usage (Puppeteer is heavy)

## Rate Limiting & Best Practices

### Rate Limiting

The `ProfileScraperService.scrapeProfiles()` method includes built-in rate limiting:

```typescript
const profiles = await ProfileScraperService.scrapeProfiles(
  ['model1', 'model2', 'model3'],
  {
    delayMs: 2000,      // 2 second delay between batches
    maxConcurrent: 3,   // Max 3 concurrent scrapes
  }
);
```

### Best Practices

1. **Use caching**: Always check cache before scraping
2. **Batch operations**: Use `scrapeProfiles()` for multiple users
3. **Respect delays**: Don't scrape too aggressively
4. **Handle failures**: Profile may not exist or be unavailable
5. **Close browser**: Call `ProfileScraperService.closeBrowser()` when done

## Puppeteer Configuration

### Browser Args

The scraper uses optimized Puppeteer settings:

```typescript
{
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
  ]
}
```

### Docker Considerations

Puppeteer requires additional dependencies in Docker. The Dockerfile must include:

```dockerfile
# Install Chromium dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

**Note:** This is not yet added to the Dockerfiles. For now, profile scraping works in development but may need Docker updates for production use.

## Selector Maintenance

Chaturbate may change their HTML structure over time. If scraping breaks:

1. Inspect the profile page in browser DevTools
2. Update selectors in `profile-scraper.service.ts`
3. Key selectors to maintain:
   - `.bio` or `.description` - Bio text
   - `.profile-photo img` - Photos
   - `.tip-menu-item` - Tip menu
   - `.tag` or `.room-tag` - Tags
   - Social link selectors for Twitter, Instagram, etc.

## Error Handling

The scraper includes comprehensive error handling:

- **404/Banned**: Returns `null` if profile doesn't exist
- **Timeout**: 30-second navigation timeout
- **Network errors**: Logged and returns `null`
- **Parse errors**: Gracefully handles missing elements

Check logs for debugging:
```bash
docker-compose logs -f web | grep profile
```

## Future Enhancements

Potential improvements:

1. **Screenshot capture**: Save profile screenshots for AI analysis
2. **Change detection**: Alert when profile content changes
3. **Historical tracking**: Store profile snapshots over time
4. **Bulk import**: CLI tool to scrape multiple profiles
5. **Webhook notifications**: Alert when goals are met, bio changes, etc.
6. **OpenAI Vision**: Analyze profile photos for quality/content

## Integration with AI Insights

Profile data feeds into the AI Insights system:

```typescript
// In InsightsService.aggregateBroadcasterData()
const profile = await ProfileService.getByPersonId(person.id);

const insightsData = {
  // ... other data
  profile: {
    bio: profile?.bio,
    bioWordCount: profile?.bio?.split(/\s+/).length || 0,
    photoCount: profile?.photos?.length || 0,
    tipMenuItems: profile?.tip_menu?.length || 0,
    socialLinkCount: profile?.social_links?.length || 0,
    hasFanclub: !!profile?.fanclub_price,
  },
};
```

This enables AI-powered recommendations like:
- "Your bio is too short - expand to 150+ words"
- "Add more profile photos (you have 2, top performers have 8+)"
- "Enable a fan club at $19.99/month to match industry average"

## Security & Privacy

### Ethical Considerations

- Scraping publicly available profile data only
- No authentication bypassing
- Respects robots.txt (where applicable)
- Data used for legitimate analytics purposes

### Data Storage

- Profiles stored in encrypted PostgreSQL database
- No sensitive personal information collected
- Can delete cached profiles on request

### Compliance

- GDPR: Profile owners can request data deletion
- 2257: No age verification data is scraped
- Platform ToS: Review Chaturbate's Terms of Service for scraping policies

## Troubleshooting

### "Browser not found" error

Install Chromium dependencies:
```bash
# macOS
brew install chromium

# Ubuntu/Debian
apt-get install -y chromium-browser
```

### Slow scraping

Reduce concurrent scrapes or increase delays:
```typescript
await ProfileScraperService.scrapeProfiles(usernames, {
  maxConcurrent: 1,  // One at a time
  delayMs: 5000,     // 5 second delays
});
```

### Empty profile data

Check if selectors are still valid:
```bash
# Test in browser console on profile page
document.querySelector('.bio')?.textContent
document.querySelectorAll('.tag').length
```

### Memory leaks

Always close browser when done:
```typescript
try {
  const profile = await ProfileScraperService.scrapeProfile('user');
} finally {
  await ProfileScraperService.closeBrowser();
}
```

## Migration

To apply the database migration:

```bash
npm run migrate

# Or in Docker
docker-compose exec web npm run migrate
```

This creates the `profiles` table and necessary indexes.

## Testing

Manual testing:
```bash
# Test single scrape
curl http://localhost:3000/api/profile/somemodel

# Test force refresh
curl http://localhost:3000/api/profile/somemodel?force=true

# Test batch list
curl http://localhost:3000/api/profile?limit=10
```

Unit tests (future):
```bash
npm test server/tests/unit/profile-scraper.test.ts
```

## Performance Metrics

Expected performance:
- **Single scrape**: 3-5 seconds
- **Cached response**: < 100ms
- **Memory usage**: ~200MB per browser instance
- **Database size**: ~50KB per profile (with photos as URLs)

## Questions & Support

For issues or questions:
1. Check logs: `docker-compose logs -f web`
2. Verify migration ran: Check `profiles` table exists
3. Test with known username: `curl http://localhost:3000/api/profile/hudson_cage`
4. Review this documentation for common issues

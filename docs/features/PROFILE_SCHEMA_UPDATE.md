# Profile Schema Update

## Summary
Updated the profiles table schema to better match the Chaturbate Affiliate API data structure and remove unused fields.

## Changes Made

### Removed Fields
- `sexual_orientation` - Removed in favor of `interested_in` which already exists
- `hair_color` - Removed (not provided by Affiliate API)
- `eye_color` - Removed (not provided by Affiliate API)
- `weight` - Removed (not provided by Affiliate API)
- `languages` - Renamed to `spoken_languages`

### Renamed Fields
- `languages` (TEXT[]) → `spoken_languages` (TEXT)
  - Changed from array to single string since Affiliate API returns languages as a comma-separated string

### Added Fields
- `country` (TEXT) - Country code from Affiliate API
- `is_new` (BOOLEAN) - Whether the model is marked as "new" on Chaturbate
- `location_detail` (TEXT) - Additional location information
- `birthday_public` (TEXT) - Public birthday information
- `smoke_drink` (TEXT) - Smoking/drinking preferences
- `body_decorations` (TEXT) - Tattoos, piercings, etc.
- `data_source` (TEXT) - Source of the profile data (default: 'scraper', but can be 'affiliate_api')
- `last_seen_online` (TIMESTAMP) - Last time the model was seen online

## Updated Files

### Database
- `server/src/db/migrations/012_update_profiles_schema.sql` - Migration file

### TypeScript Interfaces
- `server/src/services/profile-scraper.service.ts` - Updated `ChaturbateProfile` interface
- `server/src/services/profile.service.ts` - Updated `Profile` interface and database operations

### Changes to Code
1. **Interface Updates**: Removed old fields, added new fields
2. **SQL Updates**: Modified INSERT and UPDATE queries to use new schema
3. **Scraper Updates**: Updated field mapping (removed references to removed fields)

## Migration Status
✅ Migration completed successfully
✅ All code updated to match new schema
✅ Ready for use

## Data Source Priority
The profile data now intelligently combines data from multiple sources:
1. **Affiliate API** (`latestSession`) - Most current, real-time data when broadcasting
2. **Scraped Profile Data** (`profile`) - Detailed profile information
3. **Statbate API** (`latestSnapshot`) - Historical metrics and stats

## Frontend Display
The Profile page now shows:
- **Display Name** - From Affiliate API or scraped profile
- **Age** - From Affiliate API or scraped profile
- **Gender** - From Affiliate API or scraped profile
- **Location** - From Affiliate API or scraped profile (with country code)
- **Spoken Languages** - From Affiliate API (as comma-separated string)
- **Country** - From Affiliate API
- **Is New** - Whether marked as new model

All removed fields (hair_color, eye_color, weight, sexual_orientation) are no longer displayed or stored.

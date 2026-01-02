# Changelog

All notable changes to MHC Control Panel will be documented in this file.

## [1.18.0] - 2026-01-02

### Added

- Admin page: Active Doms and Watchlist stat cards in User Segments section
- Communications tab: "Show Raw" toggle to view raw JSON message data
- Visitors page: Offline sort button (sort by offline visit count)
- Profile tab merge: Combined Snapshot + Profile + History tabs into single "Profile" tab
  - Profile Details section with bio, age, location, etc.
  - Social Media Links section (collapsible)
  - Member History section (collapsible, Statbate data)
  - Raw Data toggle

### Changed

- Profile page: "LIVE SESSION" header now shows "LAST SESSION" when user is offline
- Profile page: Left-aligned Model/Follower badges above profile image
- Visitors: Manual visit recording now defaults to `is_broadcasting=false` (offline)

### Fixed

- Offline visitors tracking: POST `/api/profile/:username/visits` now properly accepts `is_broadcasting` parameter

## [1.17.1] - 2026-01-02

### Changed

- Renamed "My Broadcasts" to "Broadcasts" in navigation bar

### Documentation

- Added /visitors review and offline visitors fix to TODO.md

## [1.17.0] - 2026-01-02

### Added
- New Visitors page (`/visitors`) for tracking room visitors
- Offline visitor tracking - distinguishes between visits during broadcasts vs. profile visits when offline
- Visitor statistics with daily/weekly/monthly breakdowns
- Filter visitors by: following, followers, tippers, regulars, new visitors, and offline visits
- Visit history view with broadcast status indicators
- Database migration for `is_broadcasting` and `session_id` columns on room_visits

### Fixed
- Profile page social links rendering error (React error #31) - now handles multiple data formats
- Social links now properly support array, object with strings, and object with objects formats

### Changed
- Reorganized TODO.md with page prefixes for clarity (e.g., `/profile - Info Card:`)

## [1.16.1] - 2026-01-02

### Changed
- Updated Docker ports to avoid conflicts with pims-ops-portal
  - PostgreSQL: 5432 -> 5433
  - Backend API: 3000 -> 3002
  - Frontend remains on 8080

## [1.16.0] - 2025-12-31

### Added
- Pagination for large data sets
- Inline search functionality
- Twitter validation for profiles
- PM formatting improvements

## [1.15.0] - 2025-12-30

### Fixed
- Badge display issues
- Event handling improvements
- Admin jobs merge functionality

## [1.14.0] - 2025-12-29

### Added
- Occasional subscription sub-level
- Live monitoring improvements

### Fixed
- HistoryTab functionality

## [1.13.0] - 2025-12-28

### Changed
- Profile page reorganization
- New profile features

## [1.12.0] - 2025-12-27

### Added
- Drag & drop for profile images
- Multi-upload support
- Set-as-current functionality for profile images

# Session Summary - v1.34.7

**Date**: 2026-01-14
**Mode**: BUILD

## What Was Accomplished

### v1.34.7 - Image Sorting & Gate Fix

1. **Media Section Image Ordering**
   - Images now sorted with most recent first
   - Profile pictures (source: 'profile') grouped at the end
   - Sorting applies within each group (non-profile images, then profile images)

2. **Gate Persistence Fix (from v1.34.6 bugfix)**
   - Changed gate access storage from sessionStorage to localStorage
   - Gate access now persists across browser tabs
   - Users no longer prompted for gate password on every new tab

### Previous: v1.34.6 - Authentication System

Complete two-factor authentication system with OAuth and password gate:

1. **Login Page Redesign**
   - Google OAuth is now the primary login method (prominent at top)
   - Other login methods (email, username, subscriber ID) moved to collapsible "Show other sign-in options"
   - Default redirect after login changed to `/gate` for second authentication step

2. **Second Gate (Password Gate)**
   - New `SecondGate.tsx` page created
   - Fetches configurable password from `/api/settings/gate_password`
   - If no password configured, automatically grants access and redirects
   - Access granted for 24 hours (stored in localStorage)
   - Shows "Restricted Access" screen with password input
   - Shows "Access Granted" confirmation before redirect

3. **GatedRoute Component**
   - New route guard that requires both OAuth AND second gate
   - Checks OAuth authentication via AuthContext
   - Checks localStorage for valid gate access (within 24 hours)
   - Redirects to `/login` if not authenticated, `/gate` if gate not passed

4. **Protected Routes**
   - All routes now wrapped with `<GatedRoute>` in App.tsx
   - Auth routes (`/login`, `/signup`, `/verify-2fa`, `/unauthorized`, `/gate`) remain unprotected

5. **Admin Settings - Security Section**
   - New "Security" collapsible section in Settings tab
   - Gate password input field with save button
   - Uses `/api/settings/gate_password` endpoint
   - Empty password disables the second gate

6. **Google Account Linking**
   - Fixed "Email already registered with different login method" error
   - Users can now login with Google even if they registered with email
   - Google account is automatically linked to existing user by email

## Auth Flow

1. User visits any protected route → redirected to `/login`
2. User logs in via Google (or other methods) → redirected to `/gate`
3. If gate password is configured, user enters password → redirected to `/people` (Directory)
4. If no gate password configured, user bypasses gate → redirected to `/people`
5. Access persists for 24 hours via localStorage (works across tabs)

## Files Modified (v1.34.7)

- `client/src/pages/Profile.tsx` - Image sorting with profile pictures last
- `client/src/pages/SecondGate.tsx` - Changed to localStorage
- `client/src/components/auth/GatedRoute.tsx` - Changed to localStorage

## Current State

- **Docker containers**: Running
- **Git**: On main branch, ready for release
- **API**: Fully functional
- **UI**: Working at http://localhost:8080
- **Authentication**: Fully functional with Google OAuth + password gate

## Remaining Tasks

### Profile UI Polish
1. Tighten space between username and top navigation
2. Fix rounded corners gap between profile card and media section
3. Add image timestamp for uploaded images as primary
4. Brighten CB/UN buttons and filled rating stars (contrast)
5. Fix hover image endless loop

### Investigation
1. Investigate duplicate affiliate images (4+ copies appearing)
2. Fix rating not working on Directory/People page
3. Fix quick labels on Media section

## Next Steps

Ready for release as v1.34.7.

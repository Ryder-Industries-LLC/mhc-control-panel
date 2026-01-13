# QA Checklist: MHC-1101 through MHC-1109

**Created:** 2026-01-12
**Version:** v1.34.0

This checklist validates all changes from the interim UI consistency pass.

---

## MHC-1101: Profile Page Header and Browser Tab Polish

### Test Steps
1. Navigate to any profile page (e.g., `/profile/someuser`)
2. Verify browser tab title shows `MHC: {username}`
3. Verify username and online status appear at the top of the page as a page title
4. Verify reduced vertical padding between top nav and title
5. Verify "Profile Viewer" header is removed
6. Verify username link navigates to external Chaturbate profile
7. Navigate to the nav search - verify it is centered and wider

### Expected Results
- [ ] Browser tab shows `MHC: someuser` format
- [ ] Online/Offline status above username (left aligned)
- [ ] Username at top of page, styled as page title
- [ ] Tighter spacing from nav to page content
- [ ] No redundant "Profile Viewer" header
- [ ] Username NOT duplicated in profile card (removed)
- [ ] Username links to `https://chaturbate.com/{username}`
- [ ] Search input centered and wider than before

### Validation Notes

**2026-01-12 QA Session:**

- Fixed: Online status now appears ABOVE username, left-aligned (per user feedback)
- Fixed: Username removed from profile card (was duplicate)
- Fixed: Navigation search now centered with wider input (w-80 default, w-96 on focus)
- Files modified: Profile.tsx, App.tsx, GlobalLookup.tsx

---

## MHC-1102: Profile Overview Card Option B Layout

### Test Steps
1. Navigate to any profile page
2. Verify T1 (always visible) fields are displayed:
   - Model/Viewer badge
   - Profile image
   - Username link
   - Following/Followed pill
   - Watchlist pill
   - Tags (verify clickable, navigate to Directory with tag filter)
   - Source links (CB, UN)
   - Attribute flags (Banned Me, Smoking, Fetish Gear)
   - Image timestamp (reduced padding)
   - Visits to Me count
   - Rating control
   - Add Note CTA
3. Verify T2 fields appear in expandable section:
   - Room Banned flag
   - Seen With field
   - # of Sessions
   - Room Subject/Goal
4. Test expand/collapse (+ More / - Less)
5. Verify initial state is expanded

### Expected Results
- [ ] Image anchored on left
- [ ] Right column has grouped layout (pills/tags, flags, rating/note)
- [ ] T2 expands as full-width row below T1
- [ ] "+ More" / "- Less" toggle works
- [ ] Default state is expanded
- [ ] Tags navigate to Directory with filter applied
- [ ] Source buttons show "CB" and "UN"

### Validation Notes
_To be filled during QA_

---

## MHC-1103: Visits Naming Clarification

### Test Steps
1. Navigate to profile with visit data
2. Check label for visits count

### Expected Results
- [ ] Label shows "Visits to Me" (or approved alternative)
- [ ] Tooltip clarifies: count of times they appeared in your context

### Validation Notes
_To be filled during QA_

---

## MHC-1104: Room Banned Flag

### Test Steps
1. Navigate to any profile
2. Expand T2 section
3. Verify "Room Banned" checkbox exists
4. Toggle the flag on/off
5. Refresh page - verify state persists

### Expected Results
- [ ] Room Banned checkbox in T2 section
- [ ] Toggle saves to database
- [ ] Value persists on refresh

### Validation Notes
_To be filled during QA_

---

## MHC-1105: Seen With Field

### Test Steps
1. Navigate to any profile
2. Expand T2 section
3. Locate "Seen With" field
4. Click "+ Add Username" - verify autocomplete from directory
5. Add a username
6. Verify display shows username with remove option
7. Add multiple usernames
8. Remove a username
9. Refresh - verify list persists

### Expected Results
- [ ] "Seen With: [ + Add Username ]" displays correctly
- [ ] Autocomplete suggests usernames from directory
- [ ] Added usernames display with remove option
- [ ] Multiple usernames supported
- [ ] Removal works
- [ ] Data persists on refresh

### Validation Notes
_To be filled during QA_

---

## MHC-1106: Directory Rename and Filter Reorganization

### Test Steps
1. Navigate to Directory page (/people)
2. Verify page header shows "People" (not "Directory")
3. Verify navigation link shows "People" (not "Directory")
4. Verify Quick Filters row exists with badge-style filters
5. Verify Card Filters section is collapsible and collapsed by default
6. Verify "With Media" filter renamed to "With Images" and only counts images
7. Verify Watchlist and Friends filters show correct (non-zero) counts
8. Verify Search filters row is in its own expandable section
9. Verify result count updates in header
10. Verify directory cards spell out "images" not "imgs"

### Expected Results
- [ ] Header and nav show "People"
- [ ] No duplicate "Directory" headers
- [ ] Quick Filters as badge row
- [ ] Card Filters collapsible, collapsed by default
- [ ] "With Images" filter (not "With Media")
- [ ] Watchlist and Friends counts correct
- [ ] Followers, Unfollowed, Tipped By Me moved to Card Filters
- [ ] Search section collapsible
- [ ] Dynamic result count in header
- [ ] Cards show "images" spelled out

### Validation Notes
_To be filled during QA_

---

## MHC-1107: Gender Normalization

### Test Steps
1. Navigate to profile `kinkracc` (or similar with "A Man" raw value)
2. Verify gender displays as "Male" (not "A Man")
3. Navigate to profile `naughtyleo5` (or similar with "Male" value)
4. Verify gender still displays as "Male"
5. Test Female, Trans, Couple variations if possible

### Expected Results
- [ ] "A Man" normalizes to "Male"
- [ ] "A Woman" normalizes to "Female"
- [ ] "Shemale" / "TS" normalize to "Trans"
- [ ] "Couple" stays "Couple"
- [ ] Already normalized values remain unchanged

### Validation Notes
_To be filled during QA_

---

## MHC-1108: Media Consolidation and AUTO Image Selection

### Test Steps
1. Navigate to profile with multiple image types (Profile, Auto, Upload, Snap)
2. Verify total image count is consistent
3. Verify per-type counts are displayed
4. Navigate to Media tab
5. Attempt to select an AUTO image as main profile image
6. Verify selection succeeds
7. Verify the selected image appears in Directory listing

### Expected Results
- [ ] Total image count consistent everywhere
- [ ] Per-type counts (Profile, Auto, Upload, Snap) visible
- [ ] AUTO images can be selected as main profile image
- [ ] Selected image shows in Directory

### Validation Notes
_To be filled during QA_

---

## MHC-1109: Auto Photo Source Investigation

### Test Steps
1. Review `studforyouall` profile images
2. Check if Snap photos from Jan 9-11 are mislabeled (broadcaster banned Jan 1)
3. Review image source pipeline code
4. Add diagnostic logging if needed
5. Document findings

### Expected Results
- [ ] Source attribution correctly identifies Auto vs Snap vs Profile images
- [ ] Findings documented in SESSION_SUMMARY.md
- [ ] Diagnostic logging added if issue found

### Validation Notes
_To be filled during QA_

---

## Overall Regression Tests

### Visual Consistency
- [ ] Fonts remain Inter throughout
- [ ] 400-500 weight for body text
- [ ] 600 for column headers
- [ ] 700 for section titles (sparingly)

### Navigation
- [ ] All routes work correctly
- [ ] Back/forward navigation works
- [ ] No broken links

### Data Integrity
- [ ] Profile attributes save correctly
- [ ] No data loss during operations
- [ ] Refresh shows saved state

---

## Sign-off

| Tester | Date | Status |
|--------|------|--------|
| | | |

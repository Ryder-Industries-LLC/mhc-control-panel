# Claude Code Prompt

Summary: Interim UI consistency pass…, Profile Overview Card Option B layout…, directory filter cleanup…, media normalization fixes…, plus new “Seen With” field.

Created Timestamp: 2026-01-11

Type: Rework…, BugFix…, New Feature

Resources:
- GitHub Repo: Ryder-Industries-LLC/mhc-control-panel
- Working Local Directory: /Volumes/Imago/Development/MHC/mhc-control-panel
- Reference Repo Snapshot (zip, if needed): /mnt/data/mhc-control-panel.zip

Critical Instructions (read first…, no hallucinations):
- Confirm the working directory BEFORE any dev work…, ask Master Tracy to confirm: /Volumes/Imago/Development/MHC/mhc-control-panel
- Review latest docs in /docs/*.md…, especially SESSION_SUMMARY.md and AGENTS.md…, follow any established patterns and conventions
- Do not invent components, routes, or tables…, if something is unclear, search the repo first
- Prefer minimal, safe refactors…, ship this interim layout first…, full redesign comes later
- Maintain UI consistency…, fonts must remain Inter
  - 400–500 for body rows
  - 600 for column headers
  - 700 sparingly for section titles or key stats
- Pages should be separated into Sections that are expandable/collapsible and initially collapsed…, EXCEPT where explicitly noted below

Issue Tracking:
- For each item below…, create an entry in /docs/ISSUE_TRACKER.md under an appropriate section
- Use the Bug Keys provided…, do NOT create your own numbering scheme
- Track status…, notes…, and link commits where helpful

---

## Change List / Requirements

### MHC-1101…, Profiles…, Page header and browser tab polish

1) Browser tab title
- Change tab title to: `MHC: {username}` when viewing a profile page
- Keep default elsewhere as appropriate

2) Profile page top header
- Move model name/link and online status to the top of the page…, similar to a page title
- Reduce vertical padding between top nav and title to be much tighter
- Remove the redundant “Profile Viewer” header at the top of the profile page
- Username must remain a link to the external Chaturbate profile

3) Navigation search
- Center the “Search users…” control
- Make the input box a bit wider


### MHC-1102…, Profiles…, Profile Overview Card interim refactor…, Option B layout

Goal:
- Improve scanability and reduce cognitive load…, without doing the full redesign yet
- Implement Option B layout…, image anchored…, clear “action strip” and groupings

Scope:
- ONLY the Profile Overview card
- Do not redesign the entire profile page layout beyond the header changes in MHC-1101

Tier Model:
- T1…, always visible within the Overview Card
- T2…, expandable “More” section inside the Overview Card

T1 fields (always visible):
- Model/Viewer badge
- Profile Image
- Username link (external Chaturbate link), even if the page header already shows the username
- Following/Followed pill
- Watchlist pill
- Other existing pill style tags currently shown in the card
- Tags…, must be clickable and navigate to Directory search with the tag filter applied
- Source links…, rename buttons:
  - “Chaturbate” -> “CB”
  - “UN Cams” -> “UN”
  - Keep buttons wide enough for balance and clickability
- Attribute flags for quick marking while viewing a cam:
  - Banned Me
  - Smoking (UI label change from “Smoke on Cam”… DB field name can remain unchanged)
  - Fetish Gear (UI label change from “Leather/Fetish”… DB field name can remain unchanged)
- Image date/time…, reduce padding between image and timestamp
- Visits count…, rename field label to reduce confusion…, see MHC-1103 for naming
- Rating control…, keep always visible
- Add Note CTA…, keep always visible

Goal / Room Subject:
- NOT always visible
- Move to T2

Option B layout guidance:
- Keep image left
- Right column should be vertically grouped:
  - Top group…, pills and tags
  - Middle group…, fast attribute flags (Banned Me, Smoking, Fetish Gear), in a compact horizontal or tight grid arrangement
  - Bottom group…, Rating and Add Note
- T2 expansion area should appear as a full-width row beneath the T1 layout region

Expand/Collapse control:
- Add “+ More” when collapsed…, “- Less” when expanded
- Prefer icon button with label
- Place it so it’s obvious and does not interfere with the image or pill rows
- The initial state for this interim implementation should be Expanded by default
- NOTE: This is a pattern exception…, add inline comments noting that later we will refactor to match global expandable Section patterns

T2 fields (inside expandable area):
- New attribute flag…, “Room Banned” (see MHC-1104 for details)
- New “Seen With” field (see MHC-1105)
- # of Sessions
- Room Subject / Goal


### MHC-1103…, Profiles…, Clarify “Visits” naming and semantics

Problem:
- Current label reads like “did I visit him”… but it actually means the user visited you…, by entering your broadcast or viewing your profile
- Source: room_visits table populated by Events API

Requirement:
- Rename the UI label to one of the following…, pick the best after reviewing surrounding UI wording:
  - Preferred: “Visits to Me”
  - Acceptable: “Room Visits to Me”, “Visits (to me)”
- Ensure any tooltip/help text clarifies: count of times they appeared in your context (entered room or viewed profile)
- Do not change underlying tracking logic unless you find a bug


### MHC-1104…, Profiles…, New flag…, Room Banned

Add a new attribute/flag:
- “Room Banned” means: the model’s room has been banned (site level)
- This is separate from “Banned Me” and “Banned User”

Implementation notes:
- Determine whether this is sourced from scraper data or manual flag
- If manual…, store as a profile flag like others
- Place in T2


### MHC-1105…, Profiles…, New field…, Seen With (multi-value, autocomplete)

Add a lightweight field:
- “Seen With” allows adding one or more usernames associated with the profile
- This is a simple curated list…, no history required

UI behavior:
- Show as:
  - `Seen With: [ + Add Username ]` (autocomplete from directory)
  - Once added:
    - `Seen With: username  | remove | Add Another`
- Allow multiple entries
- Allow remove
- No history table needed
- Place in T2 within the Overview Card

Data:
- Create a storage mechanism consistent with existing profile metadata patterns
- Prefer normalized table if the app already uses relational patterns for similar multi-values
- Otherwise store as array with hygiene and normalization consistent with relationship arrays


### MHC-1106…, Directory…, rename and reorganize filters and headers

Goals:
- Clean up duplicated headers
- Create two filter tiers:
  - Quick Filters…, first row as badges with different color text
  - Card Filters…, expandable section with larger boxed filters

Changes:
- Change header and navigation label from “Directory” to “People”
- Remove the second “Directory” header under Quick Filters
- Change filter label:
  - “With Media” -> “With Images”, ensure it only includes images, not videos
- Fix Watchlist and Friends filters showing 0 in Card Filters
- Move these from Quick Filters to Card Filters:
  - Followers
  - Unfollowed
  - Tipped By Me
- Change Quick Filter label from “Directory” to “People”
- Make the Card Filter badge card expandable/collapsible, collapsed by default
- Proposed structure:
  - Filter <expand>
    - Card Filters <expand>
    - Tag Filters
  - Search Usernames, Filter Results, Filter by Tag, All | Models | Viewers <expand>
- Move the Search filters row into its own expandable section outside of Card Filters, collapsed by default
- When the result set changes, update the number after People in the header
- Directory cards:
  - Spell out “images” instead of using “imgs”


### MHC-1107…, Profiles…, Data normalization…, gender consistency

Problem:
- Some profiles show “A Man” (raw CB value) while others show “Male”
- Source variance: Affiliate API, Stats/Statesbate, Profile Scraper

Requirements:
- Create or use a single normalization function that returns consistent gender labels across the site
- Apply it in all relevant display points
- Examples to validate:
  - kinkracc shows “A Man” currently, should display normalized “Male”
  - naughtyleo5 shows “Male” already, must remain consistent


### MHC-1108…, Media…, consolidate image totals…, and fix selecting AUTO images

Requirements:
1) Consolidate image totals
- Ensure totals are consistent across all site areas
- Provide:
  - Total images (all images regardless of type)
  - Totals per type (Profile, Auto, Upload, Snap, etc)
- Update all UI areas to use the consolidated functions

2) Main profile image selection
- Currently cannot select AUTO images as the main profile image for the card
- Fix so all images, regardless of source/type, can be designated as the main image used in directory listings and wherever profile images appear


### MHC-1109…, Media…, investigate potential bad Auto photo source or saving bug

Problem hypothesis:
- There may be an issue with saving or labeling Auto photos
- Example:
  - studforyouall shows Snap photos from Jan 9 to Jan 11, but the broadcaster was banned on Jan 1
  - These could be mislabeled Auto photos, or sourced from another feed

Requirements:
- Debug and validate the image source pipeline
- Confirm sources are correctly attributed
- Ensure any future ingestion uses correct source labels
- Add logging or diagnostics if needed to prevent recurrence
- Document findings in SESSION_SUMMARY.md


---

## QA Acceptance (Claude Code must generate and maintain)

Before coding:
- Create: /docs/QA_CHECKLIST_MHC-1101_1109.md
- Include each Bug Key as a section
- For each…, list test steps, expected results, and validation notes

After coding:
- Run checks and update the QA checklist with results
- If any item fails…, investigate and fix until all pass

Minimum acceptance criteria:
- Profile page header shows username and status at top…, with tighter spacing
- Browser tab title on profile pages shows “MHC: {username}”
- Overview card implements Option B layout and tiering
- T1 shows: Add Note, Rating, fast flags (Banned Me, Smoking, Fetish Gear)
- T2 contains: Room Banned, Seen With, Sessions, Room Subject/Goal
- Directory header and filters match “People” naming and structure
- “With Images” filter only reflects images
- Watchlist and Friends card filters show correct counts
- Gender labels consistent across all profile views
- Image totals consistent everywhere
- Auto images can be selected as main profile image
- Image source attribution validated…, findings documented

---

## Documentation Updates

- Update any relevant /docs/*.md files for new fields and behaviors
- Update SESSION_SUMMARY.md with:
  - Summary of work
  - Notes on any edge cases
  - Media source investigation results
- Update AGENTS.md only if workflow expectations changed
- Update /docs/ISSUE_TRACKER.md with all Bug Keys and statuses

---

## Claude Code Final Output Requirements

In your final summary:
- Repeat the original request Summary, Type, and Created Timestamp
- List each Bug Key with:
  - What changed
  - Files touched
  - How to verify quickly
- Confirm working directory used

# Documentation Review Checklist

Use this checklist any time a repo moves, ownership changes, or paths/env vars change.

## Triggers
- Repo moved to a new directory
- Org profile defaultSubdir changed
- Repo ownership changed (Ryder, Refineo, etc)
- Project type changed (docs → node, node → clasp)
- Environment vars changed (CLAUDE_BASELINE_DIR, PHASE2_DEV_DIR, PERSONAL_DEV_DIR)

## Required Updates
- [ ] docs/CLAUDE.md, update Name, Environment, Org Profile, Repo URL, Path
- [ ] README.md, update local paths, commands, setup references
- [ ] docs/ARCHITECTURE.md, update any referenced directories
- [ ] scripts, update any hardcoded paths to use env vars when possible

## Path Rules
- Prefer env vars over absolute paths
- Do not reference /Volumes/Imago/Development directly unless necessary
- For personal repos, prefer $PERSONAL_DEV_DIR + /code/<Org>
- For phase2 repos, prefer $PHASE2_DEV_DIR

## Sanity Check
- [ ] grep for old path fragments, update them:
  - [ ] "/Volumes/Imago/Development/"
  - [ ] "~/Development/"
  - [ ] "MHC/" (if migrated to Ryder)
- [ ] Run audit after updates, confirm needsDocReview clears

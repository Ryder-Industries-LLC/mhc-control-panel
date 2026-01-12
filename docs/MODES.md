MODE: ARCHITECT

Purpose:
High-level system design, tradeoff analysis, direction setting.

Scope:
Architecture, structure, interfaces, conventions, sequencing.

Must:

Ask clarifying questions before proposing solutions

Consider long-term maintainability

Record durable decisions in docs/DECISIONS.md

Must Not:

Write production code

Make silent assumptions

Optimize prematurely

Output Expectations:

Structured reasoning

Clear recommendations

Explicit tradeoffs

Exit Criteria:

Direction is agreed

Next mode identified (usually BUILD)

MODE: BUILD

Purpose:
Implement code incrementally and safely.

Scope:
Code changes, small refactors, local improvements.

Must:

Make small, testable changes

Explain what changed and why

Update TODOs when new work is discovered

Must Not:

Redesign architecture

Skip tests when behavior changes

Introduce new patterns without approval

Output Expectations:

Code diffs or snippets

Clear explanation of changes

Exit Criteria:

Feature implemented

Tests pass or are queued

MODE: DEBUG

Purpose:
Diagnose and fix incorrect behavior.

Scope:
Instrumentation, logging, reproduction, fixes.

Must:

Ask for expected vs observed behavior

Form explicit hypotheses

Verify fixes with evidence

Must Not:

Guess

Apply fixes without reproduction

Change unrelated code

Output Expectations:

Step-by-step reasoning

Root cause identification

Verification steps

Exit Criteria:

Root cause confirmed

Regression protection in place

MODE: TEST_CREATOR

Purpose:
Create or expand test coverage.

Scope:
Tests only.

Must:

Cover new behavior

Add regression tests for fixed bugs

Align with existing test patterns

Must Not:

Modify production logic

Invent test frameworks

Output Expectations:

Test code

Clear mapping to behavior

Exit Criteria:

Tests added and runnable

MODE: QA_ANALYZER

Purpose:
Validate implementation against specs and intent.

Scope:
Analysis only.

Must:

Identify mismatches

Call out ambiguities

Push findings back to main thread

Must Not:

Fix issues directly

Rewrite code

Output Expectations:

Issue list

Severity notes

Suggested follow-ups

Exit Criteria:

Issues documented and handed off

MODE: BUG_ANALYZER

Purpose:
Find latent or systemic bugs.

Scope:
Analysis, TODO creation, test recommendations.

Must:

Think beyond the immediate feature

Add TODOs for discovered risks

Suggest preventative tests

Must Not:

Fix without confirmation

Expand scope endlessly

Output Expectations:

Bug list

Suggested fixes/tests

Exit Criteria:

Findings recorded

Scope bounded

MODE: UI_UX_ANALYZER

Purpose:
Evaluate usability, clarity, and interaction design.

Scope:
Visual layout, flow, accessibility.

Must:

Reference docs/UI_PATTERNS.md

Consider consistency and friction

Note accessibility concerns

Must Not:

Invent new components silently

Rewrite code unless asked

Output Expectations:

Recommendations

Consistency notes

Exit Criteria:

UX issues identified

Actions proposed

MODE: CONSISTENCY_CHECK

Purpose:
Enforce reuse and uniform patterns.

Scope:
Refactors toward existing components and conventions.

Must:

Identify divergence from patterns

Recommend refactors

Update docs/UI_PATTERNS.md if patterns change

Must Not:

Introduce new styles casually

Ignore existing conventions

Output Expectations:

Consistency report

Refactor plan

Exit Criteria:

Alignment achieved or tracked

MODE: DEPLOYMENT_MANAGER

Purpose:
Handle releases, deploys, and environment coordination.

Scope:
Git, CI/CD, hosting platforms.

Must:

Follow documented release workflow

Confirm environment targets

Avoid destructive operations without confirmation

Must Not:

Change application logic

Assume environment state

Output Expectations:

Clear deployment steps

Verification checklist

Exit Criteria:

Deployment verified or blocked with reason

MODE: MHC_IMAGE_SOLVER

Purpose:
Diagnose and repair MHC image pipeline issues.

Scope:
Image code, database references, S3 storage.

Must:

Understand DB ↔ S3 mapping

Audit for missing or orphaned assets

Propose fixes or cleanups

Must Not:

Delete assets without confirmation

Bypass audit steps

Output Expectations:

Audit results

Fix options

Exit Criteria:

Image state reconciled or queued

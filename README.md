# LSO Recruitment Scheduler v7 — August 24–29, 2026

GitHub-ready flat deployment package for the Lasallian Symphony Orchestra recruitment interview scheduler.

## Official recruitment schedule

- **Dates:** August 24–29, 2026 (Monday–Saturday)
- **Hours:** 10:00 AM–6:00 PM
- **Duration:** 1 hour per applicant
- **Position:** APPLICANT
- **Total capacity:** 48 interview slots (8 slots × 6 days)

## What changed in v7

- Added **Saturday, August 29, 2026** to the landing-page calendar.
- Updated all date validation to accept August 24 through August 29.
- Updated desktop and print calendar grids from five to six day columns.
- Updated the available-slot counter from 40 to 48 total slots.
- Updated the Supabase RLS date window to allow bookings on August 29.
- Uses new versioned files `lso-ui-v7.css` and `lso-app-v7.js` to avoid stale GitHub/browser cache collisions.
- Existing Supabase booking rows are not deleted by the v7 migration.

## Deployment

1. In Supabase SQL Editor, run `supabase-upgrade-v7.sql` once.
2. Replace the website files in the GitHub Pages repository root with the v7 files.
3. Keep the existing `supabase-config.js` so the site continues to use the same Supabase project.
4. Wait for GitHub Pages to redeploy, then hard-refresh once if necessary.

## Important

Do not run destructive SQL such as `DROP TABLE`, `TRUNCATE`, or blanket `DELETE` statements against `recruitment_bookings`. The included v7 migration does not contain any of those commands.

# LSO Recruitment Scheduler v6 — Fixed Live Build

This build fixes the v5 deployment mismatch that caused the page to stay on **Connecting…** and left the calendar blank.

## What was fixed

- `index.html` now loads **lso-ui-v6.css** and **lso-app-v6.js** (matching files).
- Calendar renders immediately before any network call.
- Landing calendar is fixed to **August 24–28, 2026** only.
- Slots are **10:00 AM–6:00 PM**, one hour each, including **5:00–6:00 PM**.
- Supabase startup now has a timeout; it can no longer stay on Connecting forever.
- If Anonymous Auth is unavailable, v6 can use a constrained `anon` RLS fallback after the SQL migration is run.
- Realtime is used when available, plus a 5-second shared-data refresh fallback.
- Existing booking rows are not deleted by the migration.
- No service worker is used, preventing stale GitHub Pages asset mixing.

## Required deployment order

1. In Supabase → SQL Editor, run `supabase-upgrade-v6.sql` once.
2. In GitHub, delete/replace the old website files.
3. Upload **all files from this folder directly into the repository root**.
4. Make sure `index.html`, `lso-ui-v6.css`, `lso-app-v6.js`, `supabase-config.js`, and `lso-logo.png` are side-by-side.
5. Wait for GitHub Pages deployment to finish.
6. Open the site and do one hard refresh: `Ctrl + Shift + R`.

## Expected status

- `Live` = Supabase + anonymous session + realtime connected.
- `Live · public` = Supabase connected using the constrained public RLS fallback.
- `Connected · auto refresh` = database is connected; websocket realtime is unavailable, so the app refreshes every 5 seconds.
- `Connection issue` = the app will show a specific fix instead of remaining stuck on Connecting.

## Data safety

`supabase-upgrade-v6.sql` does not contain DELETE, TRUNCATE, DROP TABLE, or any UPDATE of booking rows. Existing bookings remain in Supabase.

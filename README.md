# LSO Recruitment Interview Calendar — Premium UI

GitHub-ready, flat-folder deployment for the Lasallian Symphony Orchestra recruitment scheduler.

## Upload to GitHub Pages
Upload every file in this folder directly to the repository root. Keep `index.html`, `styles.css`, `app.js`, `supabase-config.js`, `lso-logo.png`, icons, manifest, service worker, SQL, and deployment files together.

## Supabase
The project URL and browser-safe publishable key are already configured in `supabase-config.js`.

Before going live:
1. Enable Anonymous Sign-Ins in Supabase Authentication.
2. Run `supabase-setup.sql` once in the Supabase SQL Editor.
3. Make sure Realtime is enabled by the SQL setup.
4. Never place a Supabase secret/service-role key in this public repository.

## Scheduling rules
- Position: APPLICANT only
- Interview hours: 10:00 AM–5:00 PM
- Duration: exactly 60 minutes
- Duplicate slots: blocked at database level
- Realtime: Supabase Postgres changes

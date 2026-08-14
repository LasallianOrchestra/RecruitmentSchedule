# LSO Recruitment Interview Scheduler — v5

GitHub Pages + Supabase Realtime deployment package.

## Official schedule
- Interview dates: **August 24–28, 2026**
- Interview hours: **10:00 AM–6:00 PM**
- Interview duration: **60 minutes**
- Final available slot: **5:00 PM–6:00 PM**
- Position: **APPLICANT**

## Important upgrade step
Before or immediately after uploading these v5 files to GitHub, run `supabase-upgrade-v5.sql` once in **Supabase Dashboard → SQL Editor**.

The migration is non-destructive. It only expands the allowed interview start hour from `10–16` to `10–17` and refreshes the insert policy. Existing bookings remain in `recruitment_bookings`.

## GitHub deployment
Upload every file in this folder directly to the repository root. v5 uses versioned filenames (`lso-ui-v5.css` and `lso-app-v5.js`) to avoid stale GitHub Pages/browser cache conflicts.

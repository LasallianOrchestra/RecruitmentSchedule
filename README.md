# LSO Recruitment Interview Scheduler — Supabase Live Edition

A responsive, deployment-ready recruitment scheduling website for the Lasallian Symphony Orchestra.

## Current scheduling rules
- Calendar is the landing page.
- Booking panel appears beside the calendar on desktop and below it on smaller screens.
- Interview hours: 10:00 AM to 5:00 PM Philippine Time.
- Every interview is exactly 1 hour.
- Valid start times: 10 AM, 11 AM, 12 PM, 1 PM, 2 PM, 3 PM, 4 PM.
- Position is permanently fixed to `APPLICANT`.
- No interviewer field.
- Database-level protection prevents two bookings from taking the same date/hour.

## Live architecture
- Frontend: static HTML/CSS/JavaScript, responsive/PWA-ready.
- Backend: Supabase Postgres.
- Authentication: Supabase Anonymous Sign-In, so applicants do not need visible accounts.
- Security: PostgreSQL Row Level Security (RLS) plus explicit table grants.
- Live updates: Supabase Realtime / Postgres Changes.
- Conflict protection: unique database index on `(interview_date, interview_hour)`.

## Setup
1. Create a Supabase project.
2. Enable Anonymous Sign-Ins in Supabase Authentication.
3. Run `supabase-setup.sql` in the Supabase SQL Editor.
4. Copy your Project URL and Publishable Key into `supabase-config.js`.
5. Upload this folder to any static HTTPS host such as Netlify, Vercel, Cloudflare Pages, GitHub Pages, or your existing web host.

Open `SUPABASE_SETUP_GUIDE.html` for the detailed instructions.

## Important security note
Only place the Supabase **Publishable Key** (`sb_publishable_...`) or legacy **anon** key in `supabase-config.js`. Never expose a Supabase Secret Key or `service_role` key in browser code.

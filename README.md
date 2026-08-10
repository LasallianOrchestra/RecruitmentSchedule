# LSO Recruitment Interview Scheduler — Premium UI v4

GitHub Pages-ready, Supabase-connected recruitment interview scheduler for the Lasallian Symphony Orchestra.

## Deployment
Upload every file in this folder directly to the root of the GitHub Pages repository.

## UI v4
- CSS-built concert-hall / orchestral hero background (no decorative background image dependency)
- 3D LSO logo card treatment with brass-gold edge and depth
- Premium Lasallian green, ivory, and brass-gold palette
- Responsive desktop, tablet, and mobile layouts
- Versioned CSS/JS filenames to avoid stale GitHub Pages cache collisions

## Scheduling rules
- Interviews: 10:00 AM–5:00 PM
- Duration: 1 hour
- Position: APPLICANT
- Supabase Realtime is used for shared live updates

Do not expose a Supabase service-role/secret key in browser code. The included frontend uses only the publishable key.

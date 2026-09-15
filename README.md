# LSO Recruitment Scheduler

Static applicant scheduling portal and administrator calendar manager for the Lasallian Symphony Orchestra.

## Current application

- `index.html` — applicant landing page and booking form
- `admin.html` — administrator sign-in, batch manager, booking editor, and official print view
- `lso-app-v18.js` — applicant application logic
- `lso-admin-v18.js` — administrator application logic
- `lso-native-supabase-v18.js` — browser-safe Supabase HTTPS/Auth client
- `lso-ui-v18.css` and `lso-admin-v18.css` — active styles

The applicant form requires an instrument selection. **Other** reveals a required field for the instrument being applied for. The selected instrument is displayed in the admin booking table, editor, applicant booking details, and official printout.

## Supabase setup

For a new project, run `supabase-setup.sql` in the Supabase SQL Editor.

For an existing v13+ project:

1. Run `supabase-upgrade-v13-batches.sql` if dynamic recruitment batches are not installed.
2. Run `supabase-upgrade-v19-instruments.sql` to add instrument selection while preserving existing bookings.
3. Enable anonymous sign-ins if same-device applicant cancellation is required.
4. Add the administrator user UUID to `public.lso_admins`.

The browser configuration belongs in `supabase-config.js`. Only use a Supabase Publishable Key or legacy anon key there; never put a Secret Key or `service_role` key in the frontend.

## Deployment

This is a static site with no build command. Deploy the active HTML, CSS, JavaScript, image, configuration, and SQL documentation files to Netlify, Vercel, GitHub Pages, or another HTTPS static host. `netlify.toml` and `vercel.json` provide basic security headers.

See `ADMIN_SETUP.md` for calendar management instructions.

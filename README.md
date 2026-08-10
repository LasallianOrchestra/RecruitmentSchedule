# LSO Live Recruitment Scheduler — GitHub Ready

This folder is intentionally **flat** for easy GitHub upload. All website files and image assets are in the same directory.

## Main files
- `index.html` — website landing page
- `styles.css` — responsive premium LSO styling
- `app.js` — booking logic + Supabase Realtime
- `supabase-config.js` — configured Supabase project URL and publishable key
- `lso-logo.png` — LSO logo
- `icon-192.png`, `icon-512.png` — web/PWA icons
- `manifest.webmanifest` — installable web app metadata
- `service-worker.js` — offline shell/cache support
- `supabase-setup.sql` — database, RLS, conflict prevention, and Realtime setup
- `SUPABASE_SETUP_GUIDE.html` — Supabase setup guide
- `.nojekyll` — helps GitHub Pages serve the project as plain static files

## Before publishing
1. In Supabase, enable **Anonymous Sign-Ins**.
2. Run `supabase-setup.sql` once in **Supabase > SQL Editor**.
3. Confirm the table `public.recruitment_bookings` exists.
4. Upload every file in this folder to the **root of your GitHub repository**.

## Publish with GitHub Pages
1. Open your GitHub repository.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select your main branch and the repository root (`/`).
5. Save and wait for GitHub Pages to publish the site.

The site uses relative file paths, so it works correctly when hosted from a GitHub Pages project subpath such as `username.github.io/repository-name/`.

## Security
The browser contains only a Supabase **publishable key**. Keep Row Level Security enabled. Never place a `service_role` key or Supabase secret key in this repository.

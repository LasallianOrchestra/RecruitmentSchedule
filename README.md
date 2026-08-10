# LSO Recruitment Scheduler — GitHub Pages Fixed UI v3

This build fixes the broken/mismatched GitHub Pages UI by using unique versioned CSS and JavaScript filenames and by unregistering the legacy service worker from older releases.

## Upload to GitHub
Upload every file in this folder directly to the repository root. Do not place them inside another folder.

The important files are:
- `index.html`
- `lso-ui-v3.css`
- `lso-app-v3.js`
- `supabase-config.js`
- `lso-logo.png`
- `icon-192.png`
- `icon-512.png`
- `supabase-setup.sql`
- `.nojekyll`

## Important after deployment
Open the GitHub Pages site and hard refresh once (`Ctrl+Shift+R`). The new page also automatically unregisters the old LSO service worker and removes only the previous LSO recruitment caches.

Supabase configuration is already included in `supabase-config.js`.

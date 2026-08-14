# LSO Recruitment Scheduler v9 — Official Day-by-Day Printing

GitHub-ready flat deployment package for the Lasallian Symphony Orchestra recruitment interview scheduler.

## Official recruitment schedule

- **Dates:** August 24–29, 2026 (Monday–Saturday)
- **Hours:** 10:00 AM–6:00 PM
- **Duration:** 1 hour per applicant
- **Position:** APPLICANT
- **Total capacity:** 48 interview slots (8 slots × 6 days)

## What changed in v9

- Replaced the old direct browser print action with an **official print selector**.
- The user can choose **August 24, 25, 26, 27, 28, or 29** before printing.
- Added an optional **All 6 Days** print choice; each recruitment day prints as its own official page.
- The print selector displays how many applicants are booked on each day.
- Before opening the print selector, the website refreshes the bookings from Supabase so the printed list is current.
- Official print table has only two columns:
  - **Full Name**
  - **Scheduled Interview**
- Applicant names and interview times use larger, clearer print typography and organized row spacing.
- Added the user-provided **LSO official banner** as `lso-print-header.png`.
- Added the user-provided **LSO contact/social strip** as `lso-print-footer.png`.
- Official print output is formatted for **A4 portrait** documentation.
- The v8 applicant typing/realtime fix remains intact.
- Uses new cache-safe frontend filenames `lso-ui-v9.css` and `lso-app-v9.js`.

## Deployment

Replace the old frontend files in the GitHub Pages repository root with all files from this v9 package. In particular, make sure these files are uploaded beside `index.html`:

- `lso-ui-v9.css`
- `lso-app-v9.js`
- `lso-print-header.png`
- `lso-print-footer.png`
- `supabase-config.js`

Remove old `lso-ui-v8.css` and `lso-app-v8.js` after the v9 deployment is live.

## Supabase

**No new SQL migration is required when upgrading from a working v8 installation to v9.** The print upgrade only changes the website frontend and does not delete, reset, or rewrite existing Supabase bookings.

`supabase-upgrade-v9.sql` is included only as a safe current copy of the existing database rules if you need to re-apply them later.

## Printing workflow

1. Wait for the website status to show **Live** or **Live · public**.
2. Click the printer button in the top-right header.
3. Select the recruitment day to print, or select **All 6 Days**.
4. Click **Print selected day** / **Print all recruitment days**.
5. The browser print dialog opens with the official LSO document layout.

For best official output, use **A4**, **Portrait**, **100% scale**, and enable **Background graphics** if the browser provides that option.

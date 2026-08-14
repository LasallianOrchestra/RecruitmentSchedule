# LSO Recruitment Scheduler v11 — Folio Official Printing

GitHub-ready flat deployment package for the Lasallian Symphony Orchestra recruitment interview scheduler.

## Official recruitment schedule
- **Dates:** August 24–29, 2026 (Monday–Saturday)
- **Hours:** 10:00 AM–6:00 PM
- **Duration:** 1 hour per applicant
- **Position:** APPLICANT
- **Total capacity:** 48 interview slots

## v11 print update
- Official print size is now **Folio / long bond paper (8.5 × 13 in), portrait**.
- The complete uploaded LSO header and footer are fitted proportionally across the usable page width.
- Header and footer use their original aspect ratios, so neither image is cropped or stretched.
- The footer is kept at the bottom of each official schedule page.
- The schedule table remains limited to **Full Name** and **Scheduled Interview**.
- Increased vertical spacing uses the additional Folio page height for a cleaner official-document layout.
- Day-by-day printing and the **All 6 Days** option remain available.
- Existing Supabase bookings are not modified.

## GitHub deployment
Upload all files from this package directly to the repository root. `index.html`, `lso-ui-v11.css`, `lso-app-v11.js`, the LSO images, and Supabase config must be beside one another. Remove older v10 CSS/JS after v11 is live.

## Supabase
No database migration is required for this Folio print-layout change. `supabase-upgrade-v11.sql` is included only as a current recovery copy of the existing database rules. It does not delete existing bookings.

## Recommended browser print settings
- Paper: **Folio / 8.5 × 13 in** (sometimes shown as Long Bond or custom 8.5 × 13)
- Orientation: **Portrait**
- Scale: **100%**
- Margins: **Default/None only if your printer supports it; otherwise keep browser margins compatible with the layout**
- Background graphics: **On**

The website CSS already declares the print page as 8.5 × 13 inches. If the browser does not list Folio, choose a custom paper size of **8.5 × 13 in** in the printer dialog.

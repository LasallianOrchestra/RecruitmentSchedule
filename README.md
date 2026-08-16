# LSO Recruitment Scheduler v16

## Admin Print Isolation Fix
- Fixes the issue where printing from the Admin Portal printed the whole website.
- The selected day or complete selected batch now prints inside an isolated temporary document.
- The dashboard, controls, edit panels, and website navigation cannot appear in the printout.
- Folio / long bond paper: 8.5 × 13 in, portrait.
- Official LSO header and footer are fitted proportionally.
- Table contains only Full Name and Scheduled Interview.
- Existing Supabase bookings and batch configuration remain unchanged.
- No SQL/database migration is required from v13 to v16.

## v16 Admin Sign-In Fix

v16 fixes the admin error `Cannot read properties of null (reading 'auth')`.

Root cause: the login form could be submitted when the Supabase browser SDK/client had not initialized. The admin app now:
- disables Sign In during startup;
- verifies `createClient()` and the resulting `.auth` client before any auth request;
- automatically tries jsDelivr first and unpkg as a fallback for the Supabase browser SDK;
- never calls `sb.auth` while `sb` is null;
- shows a retryable connection message instead of a JavaScript null-reference error.

No database migration is required for this frontend fix. Existing recruitment batches and bookings remain unchanged.


## v16 connection fix
This build no longer downloads the Supabase JavaScript SDK from a CDN. Admin authentication and database operations use the Supabase HTTPS APIs through the included `lso-native-supabase-v16.js` file. This prevents the Admin Sign In screen from remaining stuck on 'Loading secure sign-in…' when a CDN is blocked or slow. No database migration is required when upgrading from v13/v14/v15. Existing bookings and batches are not modified.


## v18 critical admin-login fix
- Fixed a boot-time `ReferenceError` caused by a stale `afterPrint` event handler.
- The missing `afterPrint` function prevented `start()` from running, which left the admin page stuck at `Loading secure sign-in…`.
- Added an admin startup watchdog so future boot failures show a visible diagnostic instead of hanging silently.
- No database migration is required. Existing bookings and recruitment batches are unchanged.


## v18 print authorization update
Before an official schedule can be printed, the admin must enter the full name of the **Authorized Officer (Membership)** and the **Approved By (President)** signatory. Both fields are required. The names are included as authorization/signature lines on every printed Folio page. This is a frontend/document-layout update only and does not modify or delete Supabase bookings.

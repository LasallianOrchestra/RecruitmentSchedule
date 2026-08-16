# LSO Recruitment Scheduler v15

## Admin Print Isolation Fix
- Fixes the issue where printing from the Admin Portal printed the whole website.
- The selected day or complete selected batch now prints inside an isolated temporary document.
- The dashboard, controls, edit panels, and website navigation cannot appear in the printout.
- Folio / long bond paper: 8.5 × 13 in, portrait.
- Official LSO header and footer are fitted proportionally.
- Table contains only Full Name and Scheduled Interview.
- Existing Supabase bookings and batch configuration remain unchanged.
- No SQL/database migration is required from v13 to v15.

## v15 Admin Sign-In Fix

v15 fixes the admin error `Cannot read properties of null (reading 'auth')`.

Root cause: the login form could be submitted when the Supabase browser SDK/client had not initialized. The admin app now:
- disables Sign In during startup;
- verifies `createClient()` and the resulting `.auth` client before any auth request;
- automatically tries jsDelivr first and unpkg as a fallback for the Supabase browser SDK;
- never calls `sb.auth` while `sb` is null;
- shows a retryable connection message instead of a JavaScript null-reference error.

No database migration is required for this frontend fix. Existing recruitment batches and bookings remain unchanged.

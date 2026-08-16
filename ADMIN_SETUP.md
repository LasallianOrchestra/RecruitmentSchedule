# LSO Recruitment Scheduler v13 — Admin + Calendar Manager Setup

## Existing bookings are preserved
This update does **not** delete the current August 24–29 applicant bookings. The migration adds a batch ID and links those existing bookings to the original recruitment batch.

## 1. Run the v13 migration
In **Supabase → SQL Editor**, run `supabase-upgrade-v13-batches.sql` once.

## 2. Keep your existing admin account
Your v12 admin authorization remains valid. If you have not created it yet, create an Email/Password user in Supabase Authentication and add its UUID to `public.lso_admins`.

## 3. Use the Calendar Manager
Open `admin.html` and sign in. At the top you will see **Applicant Landing Calendar**.

- **Edit active calendar** changes the currently published calendar. It refuses changes that would leave an existing booking outside the new dates/hours.
- **Create next batch** creates a new recruitment batch. When you click **Publish next batch**, the new batch becomes live on `index.html` immediately.
- Previous batches and their applicant bookings remain stored and can be selected from the **Batch** filter in Admin.

## 4. No GitHub edit is needed for future batches
After v13 is installed, future recruitment dates/hours are managed entirely from `admin.html`. You do not need to change JavaScript or redeploy the site just to open the next recruitment batch.


## v16 connection fix
This build no longer downloads the Supabase JavaScript SDK from a CDN. Admin authentication and database operations use the Supabase HTTPS APIs through the included `lso-native-supabase-v16.js` file. This prevents the Admin Sign In screen from remaining stuck on 'Loading secure sign-in…' when a CDN is blocked or slow. No database migration is required when upgrading from v13/v14/v15. Existing bookings and batches are not modified.

# LSO Recruitment Scheduler — Admin + Calendar Manager Setup

## Existing bookings are preserved
The batch and instrument upgrades do **not** delete current applicant bookings. Existing bookings remain stored under their original recruitment batch. Older records without an instrument display as **Not specified**.

## 1. Run the database migrations
In **Supabase → SQL Editor**, run `supabase-upgrade-v13-batches.sql` once if the dynamic batch calendar is not installed yet.

Then run `supabase-upgrade-v19-instruments.sql` once. This adds the required instrument field and preserves existing bookings.

For a brand-new Supabase project, `supabase-setup.sql` includes both the booking schema and the instrument field.

## 2. Keep your existing admin account
Your admin authorization remains valid. If you have not created it yet, create an Email/Password user in Supabase Authentication and add its UUID to `public.lso_admins`.

## 3. Use the Calendar Manager
Open `admin.html` and sign in. At the top you will see **Applicant Landing Calendar**.

- **Edit active calendar** changes the currently published calendar. It refuses changes that would leave an existing booking outside the new dates/hours.
- **Create next batch** creates a new recruitment batch. When you click **Publish next batch**, the new recruitment calendar becomes live on `index.html` immediately.
- Previous batches and their applicant bookings remain stored and can be selected from the **Batch** filter in Admin.
- The booking table, booking editor, and official Folio printout include the applicant's instrument.

## 4. No GitHub edit is needed for future batches
After the batch migration is installed, future recruitment dates and hours are managed entirely from `admin.html`. You do not need to change JavaScript or redeploy the site just to open the next recruitment batch.

## 5. Applicant instrument selection
The applicant form requires one of the listed orchestra instruments. Choosing **Other** reveals a required field where the applicant can specify the instrument they are applying for. The value is stored as `Other: [instrument]`.

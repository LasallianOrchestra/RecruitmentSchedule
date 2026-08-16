# LSO Recruitment Scheduler v13

Dynamic Supabase-powered recruitment scheduler for the Lasallian Symphony Orchestra.

## New in v13
- Admin-managed recruitment batches / calendar settings.
- Applicant landing page automatically reads the active batch from Supabase.
- Admin can edit the active calendar or publish the next batch.
- Existing bookings are preserved and linked to their original batch.
- Historical batches remain accessible from the Admin Batch filter.
- Admin can continue editing bookings and printing official Folio schedules.

## Deploy
Upload all files in this folder to the same GitHub Pages repository folder. Run `supabase-upgrade-v13-batches.sql` once in Supabase before using the new Calendar Manager.

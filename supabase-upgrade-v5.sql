-- LSO Recruitment Scheduler v5 — SAFE DATABASE UPGRADE
-- Adds the 5:00 PM–6:00 PM interview slot without deleting existing bookings.
-- Run once in Supabase Dashboard > SQL Editor before deploying v5.

begin;

alter table public.recruitment_bookings
  drop constraint if exists recruitment_bookings_interview_hour_check;

alter table public.recruitment_bookings
  add constraint recruitment_bookings_interview_hour_check
  check (interview_hour between 10 and 17);

drop policy if exists "Users can create their own booking"
  on public.recruitment_bookings;

create policy "Users can create their own booking"
on public.recruitment_bookings
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and position = 'APPLICANT'
  and duration_minutes = 60
  and interview_hour between 10 and 17
);

commit;

-- No rows are deleted or updated by this migration.
-- interview_hour = 17 means 5:00 PM–6:00 PM.

-- LSO Recruitment Scheduler v8 — CURRENT SAFE DATABASE RULES
-- Run ONCE in Supabase Dashboard > SQL Editor.
-- This migration DOES NOT delete, truncate, or overwrite existing booking rows.
-- v8 is primarily a frontend typing/live-refresh fix. These database rules are unchanged from v7.
-- It is safe to re-run and does NOT delete existing booking rows.

begin;

-- Keep current booking-hour rule: 10:00 AM through 5:00 PM START times
-- (final one-hour interview is 5:00 PM–6:00 PM).
alter table public.recruitment_bookings
  drop constraint if exists recruitment_bookings_interview_hour_check;
alter table public.recruitment_bookings
  add constraint recruitment_bookings_interview_hour_check
  check (interview_hour between 10 and 17);

-- Preserve one booking per date/hour.
create unique index if not exists recruitment_bookings_unique_slot
  on public.recruitment_bookings (interview_date, interview_hour);

alter table public.recruitment_bookings enable row level security;

-- Keep the same API grants used by the live scheduler.
revoke all on table public.recruitment_bookings from anon;
revoke all on table public.recruitment_bookings from authenticated;
grant select, insert on table public.recruitment_bookings to anon;
grant select, insert, delete on table public.recruitment_bookings to authenticated;

-- Replace policies only. Existing booking rows are untouched.
drop policy if exists "Authenticated users can view recruitment calendar" on public.recruitment_bookings;
drop policy if exists "Users can create their own booking" on public.recruitment_bookings;
drop policy if exists "Users can cancel their own booking" on public.recruitment_bookings;
drop policy if exists "Public can view recruitment calendar" on public.recruitment_bookings;
drop policy if exists "Public fallback can create recruitment booking" on public.recruitment_bookings;
drop policy if exists "Authenticated users can create recruitment booking" on public.recruitment_bookings;
drop policy if exists "Authenticated users can cancel own recruitment booking" on public.recruitment_bookings;

create policy "Public can view recruitment calendar"
on public.recruitment_bookings
for select
to anon, authenticated
using (true);

create policy "Public fallback can create recruitment booking"
on public.recruitment_bookings
for insert
to anon
with check (
  owner_id is null
  and position = 'APPLICANT'
  and duration_minutes = 60
  and interview_date between date '2026-08-24' and date '2026-08-29'
  and interview_hour between 10 and 17
);

create policy "Authenticated users can create recruitment booking"
on public.recruitment_bookings
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and position = 'APPLICANT'
  and duration_minutes = 60
  and interview_date between date '2026-08-24' and date '2026-08-29'
  and interview_hour between 10 and 17
);

create policy "Authenticated users can cancel own recruitment booking"
on public.recruitment_bookings
for delete
to authenticated
using (owner_id = (select auth.uid()));

-- Ensure Realtime is enabled for the booking table.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'recruitment_bookings'
  ) then
    alter publication supabase_realtime add table public.recruitment_bookings;
  end if;
end $$;

commit;

-- IMPORTANT: No DELETE, TRUNCATE, DROP TABLE, or UPDATE of booking rows occurs here.

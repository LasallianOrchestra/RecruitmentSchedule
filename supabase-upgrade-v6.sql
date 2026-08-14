-- LSO Recruitment Scheduler v6 — SAFE LIVE-CONNECTION UPGRADE
-- Run ONCE in Supabase Dashboard > SQL Editor.
-- This migration DOES NOT delete existing bookings.
-- It keeps 1-hour interviews, opens the 5 PM–6 PM slot,
-- locks new bookings to Aug 24–28, 2026, and adds a constrained
-- public fallback so the site can still load if anonymous Auth is unavailable.

begin;

-- Preserve current rows while allowing public-fallback rows to have owner_id = NULL.
alter table public.recruitment_bookings
  alter column owner_id drop not null;

-- Ensure 5 PM (17:00) is an allowed START time.
alter table public.recruitment_bookings
  drop constraint if exists recruitment_bookings_interview_hour_check;
alter table public.recruitment_bookings
  add constraint recruitment_bookings_interview_hour_check
  check (interview_hour between 10 and 17);

-- Keep one booking per date/hour at database level.
create unique index if not exists recruitment_bookings_unique_slot
  on public.recruitment_bookings (interview_date, interview_hour);

alter table public.recruitment_bookings enable row level security;

-- Explicit API grants.
revoke all on table public.recruitment_bookings from anon;
revoke all on table public.recruitment_bookings from authenticated;
grant select, insert on table public.recruitment_bookings to anon;
grant select, insert, delete on table public.recruitment_bookings to authenticated;

-- Replace only policies; booking ROWS are untouched.
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
  and interview_date between date '2026-08-24' and date '2026-08-28'
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
  and interview_date between date '2026-08-24' and date '2026-08-28'
  and interview_hour between 10 and 17
);

create policy "Authenticated users can cancel own recruitment booking"
on public.recruitment_bookings
for delete
to authenticated
using (owner_id = (select auth.uid()));

-- Realtime publication, safe if already enabled.
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

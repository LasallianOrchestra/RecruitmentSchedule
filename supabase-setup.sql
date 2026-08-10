-- Lasallian Symphony Orchestra Recruitment Scheduler
-- Supabase database, security, conflict prevention, and Realtime setup.
-- Run this entire file once in Supabase Dashboard > SQL Editor.

create table if not exists public.recruitment_bookings (
  id uuid primary key default gen_random_uuid(),
  applicant text not null
    check (char_length(trim(applicant)) between 1 and 120),
  position text not null default 'APPLICANT'
    check (position = 'APPLICANT'),
  notes text not null default ''
    check (char_length(notes) <= 1000),
  interview_date date not null,
  interview_hour smallint not null
    check (interview_hour between 10 and 16),
  duration_minutes smallint not null default 60
    check (duration_minutes = 60),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- The database itself prevents two people from owning the same date/hour,
-- even if both press Confirm at virtually the same moment.
create unique index if not exists recruitment_bookings_unique_slot
  on public.recruitment_bookings (interview_date, interview_hour);

alter table public.recruitment_bookings enable row level security;

-- Explicit API grants. Anonymous sign-in users use the authenticated role.
revoke all on table public.recruitment_bookings from anon;
revoke all on table public.recruitment_bookings from authenticated;
grant select, insert, delete on table public.recruitment_bookings to authenticated;

-- Re-running this file is safe for the policies below.
drop policy if exists "Authenticated users can view recruitment calendar"
  on public.recruitment_bookings;
drop policy if exists "Users can create their own booking"
  on public.recruitment_bookings;
drop policy if exists "Users can cancel their own booking"
  on public.recruitment_bookings;

create policy "Authenticated users can view recruitment calendar"
on public.recruitment_bookings
for select
to authenticated
using (true);

create policy "Users can create their own booking"
on public.recruitment_bookings
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and position = 'APPLICANT'
  and duration_minutes = 60
  and interview_hour between 10 and 16
);

create policy "Users can cancel their own booking"
on public.recruitment_bookings
for delete
to authenticated
using (owner_id = (select auth.uid()));

-- No UPDATE grant or UPDATE policy is provided: bookings are immutable.

-- Enable database change events for Supabase Realtime.
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

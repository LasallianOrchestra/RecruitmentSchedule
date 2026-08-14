-- LSO Recruitment Scheduler v6 — FULL SAFE SETUP
-- Works for a new project and is safe to re-run on the existing project.
-- Existing booking rows are preserved.

create table if not exists public.recruitment_bookings (
  id uuid primary key default gen_random_uuid(),
  applicant text not null check (char_length(trim(applicant)) between 1 and 120),
  position text not null default 'APPLICANT' check (position = 'APPLICANT'),
  notes text not null default '' check (char_length(notes) <= 1000),
  interview_date date not null,
  interview_hour smallint not null,
  duration_minutes smallint not null default 60 check (duration_minutes = 60),
  owner_id uuid default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Apply the same safe v6 migration rules.
alter table public.recruitment_bookings alter column owner_id drop not null;
alter table public.recruitment_bookings drop constraint if exists recruitment_bookings_interview_hour_check;
alter table public.recruitment_bookings add constraint recruitment_bookings_interview_hour_check check (interview_hour between 10 and 17);
create unique index if not exists recruitment_bookings_unique_slot on public.recruitment_bookings (interview_date, interview_hour);
alter table public.recruitment_bookings enable row level security;
revoke all on table public.recruitment_bookings from anon;
revoke all on table public.recruitment_bookings from authenticated;
grant select, insert on table public.recruitment_bookings to anon;
grant select, insert, delete on table public.recruitment_bookings to authenticated;

drop policy if exists "Authenticated users can view recruitment calendar" on public.recruitment_bookings;
drop policy if exists "Users can create their own booking" on public.recruitment_bookings;
drop policy if exists "Users can cancel their own booking" on public.recruitment_bookings;
drop policy if exists "Public can view recruitment calendar" on public.recruitment_bookings;
drop policy if exists "Public fallback can create recruitment booking" on public.recruitment_bookings;
drop policy if exists "Authenticated users can create recruitment booking" on public.recruitment_bookings;
drop policy if exists "Authenticated users can cancel own recruitment booking" on public.recruitment_bookings;

create policy "Public can view recruitment calendar" on public.recruitment_bookings for select to anon, authenticated using (true);
create policy "Public fallback can create recruitment booking" on public.recruitment_bookings for insert to anon with check (
  owner_id is null and position='APPLICANT' and duration_minutes=60
  and interview_date between date '2026-08-24' and date '2026-08-28'
  and interview_hour between 10 and 17
);
create policy "Authenticated users can create recruitment booking" on public.recruitment_bookings for insert to authenticated with check (
  owner_id=(select auth.uid()) and position='APPLICANT' and duration_minutes=60
  and interview_date between date '2026-08-24' and date '2026-08-28'
  and interview_hour between 10 and 17
);
create policy "Authenticated users can cancel own recruitment booking" on public.recruitment_bookings for delete to authenticated using (owner_id=(select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='recruitment_bookings'
  ) then
    alter publication supabase_realtime add table public.recruitment_bookings;
  end if;
end $$;

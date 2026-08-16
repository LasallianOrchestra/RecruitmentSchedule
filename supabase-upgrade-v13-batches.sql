-- LSO Recruitment Scheduler v13 — DYNAMIC RECRUITMENT BATCHES
-- SAFE MIGRATION. Existing applicant names, dates, times, notes, and booking IDs are preserved.
-- This migration DOES NOT DROP, TRUNCATE, or DELETE public.recruitment_bookings.

begin;

-- Administrator membership (safe if v12 was already installed).
create table if not exists public.lso_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.lso_admins enable row level security;
revoke all on table public.lso_admins from anon;
revoke all on table public.lso_admins from authenticated;
grant select on table public.lso_admins to authenticated;
drop policy if exists "Admin can read own membership" on public.lso_admins;
create policy "Admin can read own membership" on public.lso_admins for select to authenticated using (user_id=(select auth.uid()));

create or replace function public.is_lso_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.lso_admins a where a.user_id=auth.uid()); $$;
revoke all on function public.is_lso_admin() from public;
grant execute on function public.is_lso_admin() to authenticated;

-- 1) Recruitment calendar/batch settings. Historical batches remain stored.
create table if not exists public.recruitment_batches (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null check (char_length(trim(batch_name)) between 1 and 100),
  start_date date not null,
  end_date date not null,
  start_hour smallint not null default 10,
  end_hour smallint not null default 18,
  duration_minutes smallint not null default 60 check (duration_minutes=60),
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_batches_date_range check (end_date>=start_date),
  constraint recruitment_batches_start_hour check (start_hour between 0 and 22),
  constraint recruitment_batches_end_hour check (end_hour between 1 and 23 and end_hour>start_hour)
);
create unique index if not exists recruitment_batches_one_active on public.recruitment_batches ((is_active)) where is_active=true;

-- Seed the currently published Aug 24–29 batch only if no active batch exists yet.
insert into public.recruitment_batches(batch_name,start_date,end_date,start_hour,end_hour,duration_minutes,is_active)
select 'Recruitment Batch · August 24–29, 2026',date '2026-08-24',date '2026-08-29',10,18,60,true
where not exists(select 1 from public.recruitment_batches where is_active=true);

-- 2) Link bookings to a batch. This adds metadata only; it does not change the booked date/time.
alter table public.recruitment_bookings add column if not exists batch_id uuid references public.recruitment_batches(id) on delete restrict;

-- Backfill any existing bookings to the best matching batch by their already-booked date.
update public.recruitment_bookings b
set batch_id=(
  select rb.id from public.recruitment_batches rb
  where b.interview_date between rb.start_date and rb.end_date
  order by rb.is_active desc, rb.created_at desc
  limit 1
)
where b.batch_id is null
  and exists(select 1 from public.recruitment_batches rb where b.interview_date between rb.start_date and rb.end_date);

-- Allow future admins to choose different whole-hour windows while keeping one-hour interviews.
alter table public.recruitment_bookings drop constraint if exists recruitment_bookings_interview_hour_check;
alter table public.recruitment_bookings add constraint recruitment_bookings_interview_hour_check check (interview_hour between 0 and 22);
create unique index if not exists recruitment_bookings_unique_slot on public.recruitment_bookings(interview_date,interview_hour);

-- 3) Batch RLS: public sees only the active calendar; admins can see all historical batches.
alter table public.recruitment_batches enable row level security;
revoke all on table public.recruitment_batches from anon;
revoke all on table public.recruitment_batches from authenticated;
grant select on table public.recruitment_batches to anon,authenticated;
grant insert,update on table public.recruitment_batches to authenticated;

drop policy if exists "Public can read active recruitment batch" on public.recruitment_batches;
create policy "Public can read active recruitment batch" on public.recruitment_batches for select to anon,authenticated using (is_active=true);
drop policy if exists "LSO admins can read all recruitment batches" on public.recruitment_batches;
create policy "LSO admins can read all recruitment batches" on public.recruitment_batches for select to authenticated using ((select public.is_lso_admin()));
drop policy if exists "LSO admins can insert recruitment batches" on public.recruitment_batches;
create policy "LSO admins can insert recruitment batches" on public.recruitment_batches for insert to authenticated with check ((select public.is_lso_admin()));
drop policy if exists "LSO admins can update recruitment batches" on public.recruitment_batches;
create policy "LSO admins can update recruitment batches" on public.recruitment_batches for update to authenticated using ((select public.is_lso_admin())) with check ((select public.is_lso_admin()));

-- Atomic admin RPC: edit the live batch or publish a new live batch.
create or replace function public.save_recruitment_batch(
  p_batch_id uuid,
  p_batch_name text,
  p_start_date date,
  p_end_date date,
  p_start_hour smallint,
  p_end_hour smallint,
  p_activate boolean default true
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if not public.is_lso_admin() then raise exception 'Not authorized as an LSO administrator'; end if;
  if p_batch_name is null or char_length(trim(p_batch_name)) not between 1 and 100 then raise exception 'Batch name is required'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Invalid recruitment date range'; end if;
  if p_start_hour<0 or p_start_hour>22 or p_end_hour<1 or p_end_hour>23 or p_end_hour<=p_start_hour then raise exception 'Invalid interview hours'; end if;
  if p_activate then update public.recruitment_batches set is_active=false,updated_at=now() where is_active=true and (p_batch_id is null or id<>p_batch_id); end if;
  if p_batch_id is null then
    insert into public.recruitment_batches(batch_name,start_date,end_date,start_hour,end_hour,duration_minutes,is_active,created_by)
    values(trim(p_batch_name),p_start_date,p_end_date,p_start_hour,p_end_hour,60,p_activate,auth.uid()) returning id into v_id;
  else
    update public.recruitment_batches set batch_name=trim(p_batch_name),start_date=p_start_date,end_date=p_end_date,start_hour=p_start_hour,end_hour=p_end_hour,duration_minutes=60,is_active=p_activate,updated_at=now()
    where id=p_batch_id;
    if not found then raise exception 'Recruitment batch not found'; end if;
    v_id:=p_batch_id;
  end if;
  return v_id;
end $$;
revoke all on function public.save_recruitment_batch(uuid,text,date,date,smallint,smallint,boolean) from public;
grant execute on function public.save_recruitment_batch(uuid,text,date,date,smallint,smallint,boolean) to authenticated;

-- 4) Dynamic booking policies use whichever batch is currently active.
alter table public.recruitment_bookings enable row level security;
revoke all on table public.recruitment_bookings from anon;
revoke all on table public.recruitment_bookings from authenticated;
grant select,insert on table public.recruitment_bookings to anon;
grant select,insert,update,delete on table public.recruitment_bookings to authenticated;

-- Remove old hard-coded date insert rules before creating dynamic rules.
drop policy if exists "Public fallback can create recruitment booking" on public.recruitment_bookings;
drop policy if exists "Authenticated users can create recruitment booking" on public.recruitment_bookings;
drop policy if exists "Users can create their own booking" on public.recruitment_bookings;
drop policy if exists "LSO admins can update all recruitment bookings" on public.recruitment_bookings;
drop policy if exists "LSO admins can delete all recruitment bookings" on public.recruitment_bookings;

-- Keep/read policies safe to recreate.
drop policy if exists "Public can view recruitment calendar" on public.recruitment_bookings;
create policy "Public can view recruitment calendar" on public.recruitment_bookings for select to anon,authenticated using (true);

create policy "Public fallback can create recruitment booking" on public.recruitment_bookings
for insert to anon with check (
  owner_id is null and position='APPLICANT' and duration_minutes=60 and batch_id is not null and
  exists(select 1 from public.recruitment_batches rb where rb.id=batch_id and rb.is_active=true and interview_date between rb.start_date and rb.end_date and interview_hour>=rb.start_hour and interview_hour<rb.end_hour)
);
create policy "Authenticated users can create recruitment booking" on public.recruitment_bookings
for insert to authenticated with check (
  owner_id=(select auth.uid()) and position='APPLICANT' and duration_minutes=60 and batch_id is not null and
  exists(select 1 from public.recruitment_batches rb where rb.id=batch_id and rb.is_active=true and interview_date between rb.start_date and rb.end_date and interview_hour>=rb.start_hour and interview_hour<rb.end_hour)
);

-- Preserve same-device cancellation and admin powers.
drop policy if exists "Authenticated users can cancel own recruitment booking" on public.recruitment_bookings;
drop policy if exists "Users can cancel their own booking" on public.recruitment_bookings;
create policy "Authenticated users can cancel own recruitment booking" on public.recruitment_bookings for delete to authenticated using (owner_id=(select auth.uid()));
create policy "LSO admins can update all recruitment bookings" on public.recruitment_bookings for update to authenticated using ((select public.is_lso_admin())) with check ((select public.is_lso_admin()) and position='APPLICANT' and duration_minutes=60);
create policy "LSO admins can delete all recruitment bookings" on public.recruitment_bookings for delete to authenticated using ((select public.is_lso_admin()));

-- Realtime for both bookings and active calendar changes.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='recruitment_bookings') then alter publication supabase_realtime add table public.recruitment_bookings; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='recruitment_batches') then alter publication supabase_realtime add table public.recruitment_batches; end if;
end $$;

commit;

-- RESULT:
-- • Existing Aug 24–29 bookings remain unchanged and are linked to the original batch.
-- • Admin can publish the next batch from admin.html.
-- • Applicant index.html automatically displays whichever batch is active.
-- • Historical bookings remain accessible in the Admin batch filter.

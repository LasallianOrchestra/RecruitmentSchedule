-- LSO Recruitment Scheduler — instrument selection upgrade
-- Safe to run after supabase-setup.sql or supabase-upgrade-v13-batches.sql.
-- Existing bookings are preserved. Legacy rows receive "Not specified".

begin;

alter table public.recruitment_bookings
  add column if not exists instrument text;

update public.recruitment_bookings
set instrument = 'Not specified'
where instrument is null or char_length(trim(instrument)) = 0;

alter table public.recruitment_bookings
  alter column instrument set default 'Not specified';

alter table public.recruitment_bookings
  alter column instrument set not null;

drop constraint if exists recruitment_bookings_instrument_check on public.recruitment_bookings;
alter table public.recruitment_bookings
  add constraint recruitment_bookings_instrument_check
  check (char_length(trim(instrument)) between 1 and 160);

commit;

-- RESULT:
-- • Existing bookings remain unchanged and are retained.
-- • Legacy bookings without an instrument display as "Not specified".
-- • New bookings must include an instrument or an "Other: ..." value.

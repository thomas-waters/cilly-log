-- Record who logged each entry, and give each sign-in a display name.
-- Run once per database (staging and live), in the Supabase SQL editor.
-- Safe to run more than once.

alter table public.sleeps add column if not exists created_by text;
alter table public.feeds  add column if not exists created_by text;
alter table public.solids add column if not exists created_by text;

alter table public.allowed_users add column if not exists display_name text;

-- The app reads the names to show a chip on each entry, so family members
-- need to be able to read this table (they already could not see it at all).
drop policy if exists "family can read" on public.allowed_users;
create policy "family can read" on public.allowed_users
  for select to authenticated using (public.is_family());

-- Then set a name per sign-in, for example:
--   update public.allowed_users set display_name = 'Dad' where email = 'name@example.com';

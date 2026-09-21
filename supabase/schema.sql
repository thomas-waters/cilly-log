-- Cilly Log database schema. Run once in the Supabase SQL editor.

-- Who may use the app, and the name shown on the entries they log.
create table if not exists public.allowed_users (
  email        text primary key,
  display_name text
);

create table if not exists public.sleeps (
  id           text primary key,
  date         date not null,
  start_time   text not null,
  end_time     text not null,
  put_down     text not null default '',
  settle_notes text not null default '',
  wake_notes   text not null default '',
  created_by   text,
  updated_at   timestamptz not null default now()
);

create table if not exists public.feeds (
  id         text primary key,
  date       date not null,
  time       text not null,
  kind       text,            -- 'breast' or 'bottle'
  amount_ml  numeric,         -- bottles only; always stored in millilitres
  notes      text not null default '',
  created_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.solids (
  id         text primary key,
  date       date not null,
  time       text not null,
  foods      jsonb not null default '[]'::jsonb,
  notes      text not null default '',
  created_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.meds (
  id         text primary key,
  date       date not null,
  time       text not null,
  name       text not null default '',
  dose       text not null default '',
  gap_min    integer,         -- hours between doses, in minutes; null if not set
  notes      text not null default '',
  created_by text,
  updated_at timestamptz not null default now()
);

-- Key/value state. 'status' is the current sleep and 'settings' the shared
-- settings (DOB, night hours) - both single rows the whole family reads.
-- 'prefs:<email>' is one row per person for their own preferences, such as
-- light or dark; the app only ever reads the row matching who is signed in.
create table if not exists public.app_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on edits.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists sleeps_touch on public.sleeps;
create trigger sleeps_touch before update on public.sleeps for each row execute function public.touch_updated_at();
drop trigger if exists feeds_touch on public.feeds;
create trigger feeds_touch before update on public.feeds for each row execute function public.touch_updated_at();
drop trigger if exists solids_touch on public.solids;
create trigger solids_touch before update on public.solids for each row execute function public.touch_updated_at();
drop trigger if exists meds_touch on public.meds;
create trigger meds_touch before update on public.meds for each row execute function public.touch_updated_at();
drop trigger if exists app_state_touch on public.app_state;
create trigger app_state_touch before update on public.app_state for each row execute function public.touch_updated_at();

-- Access: only signed-in users whose email is in allowed_users.
create or replace function public.is_family()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.allowed_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.allowed_users enable row level security;
alter table public.sleeps        enable row level security;
alter table public.feeds         enable row level security;
alter table public.solids        enable row level security;
alter table public.meds          enable row level security;
alter table public.app_state     enable row level security;

drop policy if exists "family can read" on public.allowed_users;
create policy "family can read" on public.allowed_users
  for select to authenticated using (public.is_family());

drop policy if exists "family only" on public.sleeps;
create policy "family only" on public.sleeps
  for all to authenticated using (public.is_family()) with check (public.is_family());

drop policy if exists "family only" on public.feeds;
create policy "family only" on public.feeds
  for all to authenticated using (public.is_family()) with check (public.is_family());

drop policy if exists "family only" on public.solids;
create policy "family only" on public.solids
  for all to authenticated using (public.is_family()) with check (public.is_family());

drop policy if exists "family only" on public.meds;
create policy "family only" on public.meds
  for all to authenticated using (public.is_family()) with check (public.is_family());

drop policy if exists "family only" on public.app_state;
create policy "family only" on public.app_state
  for all to authenticated using (public.is_family()) with check (public.is_family());

-- Live updates between phones (skips tables already in the publication).
do $$
declare t text;
begin
  foreach t in array array['sleeps', 'feeds', 'solids', 'meds', 'app_state'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Who may sign in (lowercase emails), and the name shown on what they log.
-- Run one of these per parent in the SQL editor. The display name is what the
-- chip on an entry says and what the "Logged by" switch offers, and that
-- switch only appears once two of them have one:
--   insert into public.allowed_users (email, display_name)
--   values (lower('name@example.com'), 'Mum')
--   on conflict (email) do update set display_name = excluded.display_name;

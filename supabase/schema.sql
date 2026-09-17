-- Cilly Log database schema. Run once in the Supabase SQL editor.

-- Who may use the app. Add each parent's sign-in email here.
create table if not exists public.allowed_users (
  email text primary key
);

create table if not exists public.sleeps (
  id           text primary key,
  date         date not null,
  start_time   text not null,
  end_time     text not null,
  put_down     text not null default '',
  settle_notes text not null default '',
  wake_notes   text not null default '',
  updated_at   timestamptz not null default now()
);

create table if not exists public.feeds (
  id         text primary key,
  date       date not null,
  time       text not null,
  amount_ml  numeric,
  notes      text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.solids (
  id         text primary key,
  date       date not null,
  time       text not null,
  foods      jsonb not null default '[]'::jsonb,
  notes      text not null default '',
  updated_at timestamptz not null default now()
);

-- Single-row settings: key = 'status' (current sleep) or 'settings' (DOB, night hours).
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
alter table public.app_state     enable row level security;

drop policy if exists "family only" on public.sleeps;
create policy "family only" on public.sleeps
  for all to authenticated using (public.is_family()) with check (public.is_family());

drop policy if exists "family only" on public.feeds;
create policy "family only" on public.feeds
  for all to authenticated using (public.is_family()) with check (public.is_family());

drop policy if exists "family only" on public.solids;
create policy "family only" on public.solids
  for all to authenticated using (public.is_family()) with check (public.is_family());

drop policy if exists "family only" on public.app_state;
create policy "family only" on public.app_state
  for all to authenticated using (public.is_family()) with check (public.is_family());

-- Live updates between phones.
alter publication supabase_realtime add table public.sleeps, public.feeds, public.solids, public.app_state;

-- Who may sign in (lowercase emails). Run one insert per parent in the SQL editor:
--   insert into public.allowed_users (email) values ('name@example.com') on conflict (email) do nothing;

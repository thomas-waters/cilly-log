-- Medicine: what was given, and when the next dose may be given.
-- Run once on a database that already has the other tables.

create table if not exists public.meds (
  id         text primary key,
  date       date not null,
  time       text not null,
  name       text not null default '',
  dose       text not null default '',
  gap_min    integer,          -- hours between doses, in minutes; null if not set
  notes      text not null default '',
  created_by text,
  updated_at timestamptz not null default now()
);

drop trigger if exists meds_touch on public.meds;
create trigger meds_touch before update on public.meds for each row execute function public.touch_updated_at();

alter table public.meds enable row level security;

drop policy if exists "family only" on public.meds;
create policy "family only" on public.meds
  for all to authenticated using (public.is_family()) with check (public.is_family());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meds'
  ) then
    alter publication supabase_realtime add table public.meds;
  end if;
end $$;

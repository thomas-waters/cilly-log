-- Names for the family list, taken from Google rather than typed in.
--
-- Supabase keeps each provider's profile in auth.identities.identity_data,
-- refreshed every time that provider signs you in, and a copy of the first one
-- in auth.users.raw_user_meta_data. Neither is reachable from the browser, so
-- this function reaches them on the app's behalf.
--
-- It is locked down twice: it only ever returns people already on
-- allowed_users, and only when the caller is one of them. That means it
-- exposes nothing the app could not already read, since the family list is
-- selectable by the family as it is - it just adds the name.
--
-- The chain matters, because a user row created by the old emailed sign-in
-- link has no Google profile at all:
--   1. allowed_users.display_name, where somebody typed one. Always wins:
--      Google's idea of a name is not always what belongs on a 3am entry.
--   2. The name on the Google identity, first word only, so "Mary Murphy"
--      signs entries as "Mary" and fits the chip.
--   3. The name copied into the user record when the account was made.
--   4. The part of the address before the @, so there is always something.

create or replace function public.family_names()
returns table (email text, display_name text)
language sql
security definer
stable
set search_path = public, auth
as $$
  select
    a.email,
    coalesce(
      nullif(trim(a.display_name), ''),
      split_part(nullif(trim(g.name), ''), ' ', 1),
      split_part(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), ' ', 1),
      split_part(nullif(trim(u.raw_user_meta_data ->> 'name'), ''), ' ', 1),
      split_part(a.email, '@', 1)
    )
  from public.allowed_users a
  left join auth.users u on lower(u.email) = a.email
  left join lateral (
    select coalesce(i.identity_data ->> 'full_name', i.identity_data ->> 'name') as name
    from auth.identities i
    where i.user_id = u.id and i.provider = 'google'
    order by i.last_sign_in_at desc nulls last
    limit 1
  ) g on true
  where public.is_family();
$$;

revoke all on function public.family_names() from public;
grant execute on function public.family_names() to authenticated;

-- What the app will show. Run this after the function to check it:
--   select * from public.family_names();

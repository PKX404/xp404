alter table public.xparty_profiles add column username text
  check (username ~ '^[a-z][a-z0-9_]{2,23}$');
create unique index xparty_profile_username on public.xparty_profiles(username) where username is not null;
grant update(username) on public.xparty_profiles to authenticated;

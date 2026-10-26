-- Inspect the existing project schema and migration history before applying.
-- Do not rerun the bootstrap schema over an installed account schema.
-- No auth or provider secrets belong in this file.
alter table public.xparty_profiles add column if not exists bio text not null default '' check(length(bio)<=240);
alter table public.xparty_profiles add column if not exists interests text[] not null default '{}' check(cardinality(interests)<=8 and octet_length(interests::text)<=2048);
alter table public.xparty_profiles add column if not exists likes text[] not null default '{}' check(cardinality(likes)<=8 and octet_length(likes::text)<=2048);
alter table public.xparty_profiles add column if not exists dislikes text[] not null default '{}' check(cardinality(dislikes)<=8 and octet_length(dislikes::text)<=2048);
grant update(bio,interests,likes,dislikes) on public.xparty_profiles to authenticated;

-- Return only a mutual intersection to an accepted friend, never either full graph.
create or replace function public.xparty_mutual_friends(target uuid)
returns table(id uuid,display_name text,photo_data text)
language sql stable security definer set search_path='' as $$
 select p.id,p.display_name,p.photo_data from public.xparty_profiles p
 where auth.uid() is not null and target<>auth.uid()
 and exists(select 1 from public.xparty_friends f where f.status='accepted'
   and ((f.requester=auth.uid() and f.addressee=target) or (f.requester=target and f.addressee=auth.uid())))
 and exists(select 1 from public.xparty_friends f where f.status='accepted'
   and ((f.requester=auth.uid() and f.addressee=p.id) or (f.requester=p.id and f.addressee=auth.uid())))
 and exists(select 1 from public.xparty_friends f where f.status='accepted'
   and ((f.requester=target and f.addressee=p.id) or (f.requester=p.id and f.addressee=target)))
 order by p.display_name,p.id limit 100;
$$;
revoke all on function public.xparty_mutual_friends(uuid) from public,anon;
grant execute on function public.xparty_mutual_friends(uuid) to authenticated;

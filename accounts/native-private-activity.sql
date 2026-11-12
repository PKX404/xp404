create table public.xparty_device_activity (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id uuid not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=131072),
  primary key(owner_id,device_id)
);
alter table public.xparty_device_activity enable row level security;
revoke all on public.xparty_device_activity from public,anon,authenticated;
grant select,insert,delete on public.xparty_device_activity to authenticated;
grant update(snapshot) on public.xparty_device_activity to authenticated;
create policy own_activity on public.xparty_device_activity for all to authenticated
using(owner_id=auth.uid()) with check(owner_id=auth.uid());

create function public.xparty_save_device_activity(device uuid, activity jsonb)
returns void language sql security invoker set search_path='' as $$
  insert into public.xparty_device_activity(owner_id,device_id,snapshot)
  values(auth.uid(),device,activity)
  on conflict(owner_id,device_id) do update set snapshot=excluded.snapshot;
$$;
revoke all on function public.xparty_save_device_activity(uuid,jsonb) from public,anon;
grant execute on function public.xparty_save_device_activity(uuid,jsonb) to authenticated;

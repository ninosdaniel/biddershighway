begin;
create table website_private.identity_orders (
  id uuid primary key default gen_random_uuid(),auth_id uuid not null references auth.users(id),
  provider text not null,provider_id text not null unique,data jsonb not null,
  created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '3 minutes',
  completed_at timestamptz
);
alter table website_private.identity_orders enable row level security;
create function public.website_identity_order(p_auth_id uuid,p_id uuid default null,p_provider_id text default null,p_data jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare order_row website_private.identity_orders;
begin
  perform website_private.resolve_user(p_auth_id);
  if p_id is null then
    if p_provider_id is null or p_data is null then raise exception 'invalid_request'; end if;
    insert into website_private.identity_orders(auth_id,provider,provider_id,data)
    values(p_auth_id,'bankid',p_provider_id,p_data) returning * into order_row;
  else
    select * into order_row from website_private.identity_orders where id=p_id and auth_id=p_auth_id and expires_at>now();
    if not found then raise exception 'not_found'; end if;
  end if;
  return to_jsonb(order_row);
end $$;
revoke all on function public.website_identity_order(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.website_identity_order(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;

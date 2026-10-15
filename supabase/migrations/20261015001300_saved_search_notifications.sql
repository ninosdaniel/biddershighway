begin;
create function public.website_saved_search_batch(p_auction uuid,p_after uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare listing jsonb; searches jsonb;
begin
  select jsonb_build_object('slug',a.slug,'text',concat_ws(' ',l.name,l.data->>'data_year',l.data->>'data_manufacturer',l.data->>'data_model')) into listing
    from public.auctions a join public.lots l on l.id=a.lot_id where a.id=p_auction and a.published_status=1 and a.lifecycle_status in (2,3);
  if listing is null then return jsonb_build_object('searches','[]'::jsonb); end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into searches from (
    select s.id,s.term from public.saved_searches s where (p_after is null or s.id>p_after)
      and exists(select 1 from public.users u join auth.users a on lower(a.email)=lower(u.email)
        where lower(u.email)=lower(s.email) and a.email_confirmed_at is not null and not u.banned)
      order by s.id limit 500
  ) x;
  return listing||jsonb_build_object('searches',searches);
end $$;
create function public.website_saved_search_notify(p_auction uuid,p_search uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.saved_searches; a public.auctions; u public.users;
begin
  select * into s from public.saved_searches where id=p_search;
  if not found then return; end if;
  select * into a from public.auctions where id=p_auction and published_status=1 and lifecycle_status in (2,3);
  if not found then return; end if;
  select * into u from public.users where lower(email)=lower(s.email) and not banned;
  if not found then return; end if;
  perform website_private.notify_user(u.id,'saved_search_match','search-match:'||p_search||':'||p_auction,
    jsonb_build_object('slug',a.slug,'saved_search_id',p_search,'auction_id',p_auction));
end $$;

-- Recheck opt-outs immediately before delivery, including jobs queued before
-- the customer removed a search or changed notification preferences.
create or replace function public.website_job_data(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_kind='payments' then
    return coalesce((select jsonb_agg(to_jsonb(p)) from website_private.payments p where reconciled_at is null and created_at>now()-interval '14 days'),'[]');
  elsif p_kind='sitemap' then
    return coalesce((select jsonb_agg(jsonb_build_object('slug',slug,'updated_at',updated_at)) from public.auctions where published_status=1),'[]');
  elsif p_kind='lead' then
    return (select jsonb_build_object('id',id,'email',email,'phone',phone,'owner',owner,'registration_number',registration_number,'comment',comment) from public.leads where id=(p_payload->>'lead_id')::uuid);
  elsif p_kind='email' then
    return (select jsonb_build_object('email',u.email,'name',u.name,'locale',u.locale,'disabled',u.banned
      or (p_payload->>'template'='daily_update' and not u.email_daily_updates)
      or (p_payload ? 'saved_search_id' and not exists(select 1 from public.saved_searches s where s.id=(p_payload->>'saved_search_id')::uuid and lower(s.email)=lower(u.email))))
      from public.users u where id=(p_payload->>'user_id')::uuid);
  elsif p_kind='settlement' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount_cents',p.amount_cents,'kind',p.kind,'user_id',p.user_id,'name',u.name,'email',u.email,'fortnox_customer_id',u.fortnox_customer_id,'provider_id',p.provider_id))
      from website_private.payments p join public.users u on u.id=p.user_id where p.auction_id=(p_payload->>'auction_id')::uuid),'[]');
  end if;
  raise exception 'unknown_job_query';
end $$;
revoke all on function public.website_saved_search_batch(uuid,uuid),public.website_saved_search_notify(uuid,uuid) from public,anon,authenticated;
grant execute on function public.website_saved_search_batch(uuid,uuid),public.website_saved_search_notify(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;

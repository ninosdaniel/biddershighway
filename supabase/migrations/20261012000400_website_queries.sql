begin;
create table website_private.provider_operations (
  key text primary key, result jsonb, created_at timestamptz not null default now()
);
alter table website_private.provider_operations enable row level security;
create function public.website_provider_operation(p_key text,p_result jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
  if p_result is not null then
    update website_private.provider_operations set result=p_result where key=p_key and result is null;
    return jsonb_build_object('status','completed','result',p_result);
  end if;
  insert into website_private.provider_operations(key) values(p_key) on conflict do nothing;
  if found then return '{"status":"new"}'; end if;
  select result into previous from website_private.provider_operations where key=p_key;
  return jsonb_build_object('status',case when previous is null then 'started' else 'completed' end,'result',previous);
end $$;
create function public.website_enqueue_continuation(p_kind text,p_key text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_kind not in ('scrape_sajab_page','payment_check') then raise exception 'invalid_job'; end if;
  perform website_private.enqueue(p_kind,p_key,p_payload);
end $$;
create function public.get_website_auction(p_slug text,p_locale text default 'en') returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'slug',a.slug,'title',concat_ws(' ',l.data->>'year',l.name),
    'body',case p_locale when 'sv' then l.body_sv when 'de' then l.body_de else l.body_en end,
    'location',l.location,'data',jsonb_build_object('year',l.data->>'year','manufacturer',l.data->>'manufacturer','model',l.data->>'model','odometer',l.data->>'odometer','transmission',l.data->>'transmission','color',l.data->>'color'),
    'hero_image_filename',l.hero_image_filename,'status',a.lifecycle_status,'closed_at',a.closed_at,
    'amount_cents',case when a.hidden_sale_price then null when a.lifecycle_status=9 then a.sale_price_cents else a.highest_bid_amount_cents end,
    'reserve_met',a.highest_bid_amount_cents>=coalesce(a.reserve_price_cents,0),
    'minimum_bid_cents',a.highest_bid_amount_cents+website_private.bid_increment(a.highest_bid_amount_cents),
    'commission_percent',a.commission_buyer_percent,
    'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'filename',i.image_filename,'album',al.name) order by al.name,i.position)
      from public.images i join public.albums al on al.id=i.album_id where al.lot_id=l.id),'[]'::jsonb),
    'bids',case when a.hidden_sale_price then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(b)) from
      (select b.amount_cents,b.created_at,coalesce(u.username,'Bidder') as bidder from public.bids b join public.users u on u.id=b.user_id where b.auction_id=a.id order by b.amount_cents desc,b.created_at desc limit 100) b),'[]'::jsonb) end,
    'comments',coalesce((select jsonb_agg(to_jsonb(c)) from
      (select c.id,c.body,c.created_at,c.parent_id,coalesce(u.username,'Member') as author from public.comments c join public.users u on u.id=c.user_id where c.commentable_id=a.id and c.commentable_type='Auction' and c.published_status=1 order by c.created_at limit 200) c),'[]'::jsonb))
  from public.auctions a join public.lots l on l.id=a.lot_id
  where a.slug=p_slug and a.published_status=1 and a.lifecycle_status in (2,3,4,6,7,9,10);
$$;
revoke all on function public.get_website_auction(text,text) from public;
grant execute on function public.get_website_auction(text,text) to anon,authenticated,service_role;

create function public.website_comment(p_auth_id uuid,p_slug text,p_body text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid; a public.auctions; prior website_private.requests; v_result jsonb; id uuid;
begin
  v_user_id:=website_private.resolve_user(p_auth_id);
  if p_request_id is null or length(trim(p_body)) not between 1 and 5000 then raise exception 'invalid_comment'; end if;
  select * into a from public.auctions where slug=p_slug and published_status=1 and lifecycle_status in (2,3,6) for update;
  if not found then raise exception 'auction_closed'; end if;
  insert into website_private.requests(actor,request_id,action,input) values(v_user_id::text,p_request_id,'comment',jsonb_build_object('slug',p_slug,'body',p_body)) on conflict do nothing;
  select * into prior from website_private.requests where actor=v_user_id::text and request_id=p_request_id for update;
  if prior.action<>'comment' or prior.input<>jsonb_build_object('slug',p_slug,'body',p_body) then raise exception 'idempotency_conflict'; end if;
  if prior.result is not null then return prior.result; end if;
  -- New comments await moderation; HTML is rendered as text by the Next client.
  insert into public.comments(user_id,commentable_id,commentable_type,body,published_status,created_at,updated_at)
    values(v_user_id,a.id,'Auction',trim(p_body),0,now(),now()) returning public.comments.id into id;
  v_result:=jsonb_build_object('id',id,'moderation_pending',true);
  update website_private.requests set result=v_result where actor=v_user_id::text and request_id=p_request_id;
  return v_result;
end $$;

create function public.website_maintenance(p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_time timestamptz:=now(); u record; count integer:=0;
begin
  if p_kind='refresh_listings' then
    if exists(select 1 from pg_matviews where schemaname='public' and matviewname='listings') then
      refresh materialized view public.listings;
    end if;
  elsif p_kind='compute_interests' then
    with signals as (
      select tg.taggable_id as user_id,t.name as category,3::numeric as weight from public.taggings tg
        join public.tags t on t.id=tg.tag_id join public.users u on u.id=tg.taggable_id where tg.taggable_type='User' and tg.context='categories'
      union all
      select b.user_id,t.name,2*power(.5,extract(epoch from(current_time-b.created_at))/86400/365)
        from public.bookmarks b join public.taggings tg on tg.taggable_id=b.auction_id and tg.taggable_type='Auction' and tg.context='categories'
        join public.tags t on t.id=tg.tag_id where b.user_id is not null and b.created_at>=current_time-interval '3 years'
      union all
      select b.user_id,t.name,6*power(.5,extract(epoch from(current_time-b.created_at))/86400/365)
        from (select distinct on (user_id,auction_id) user_id,auction_id,created_at from public.bids where created_at>=current_time-interval '3 years' order by user_id,auction_id,created_at desc) b
        join public.taggings tg on tg.taggable_id=b.auction_id and tg.taggable_type='Auction' and tg.context='categories' join public.tags t on t.id=tg.tag_id
    ), totals as (select user_id,category,sum(weight) as score from signals group by user_id,category),
    ranked as (select user_id,category,score/max(score) over(partition by user_id) as ratio,row_number() over(partition by user_id order by score desc,category) as position from totals)
    insert into public.user_interests(user_id,category,score,created_at,updated_at)
      select user_id,category,round(ratio::numeric,4),current_time,current_time from ranked where ratio>=.2 and position<=8
      on conflict(user_id,category) do update set score=excluded.score,updated_at=excluded.updated_at;
    delete from public.user_interests where updated_at<current_time;
  elsif p_kind='daily_update' then
    for u in select us.id,array_agg(distinct a.slug) as slugs from public.users us
      join public.user_interests i on i.user_id=us.id join public.tags t on t.name=i.category
      join public.taggings tg on tg.tag_id=t.id and tg.context='categories' and tg.taggable_type='Auction'
      join public.auctions a on a.id=tg.taggable_id
      where us.email_daily_updates and not us.banned and a.published_status=1 and a.lifecycle_status in (2,3)
        and (a.published_at>now()-interval '1 day' or a.lifecycle_status=3 and a.closed_at>now() and a.closed_at<((now() at time zone 'Europe/Stockholm')::date+1)::timestamp at time zone 'Europe/Stockholm')
      group by us.id loop
      perform website_private.enqueue('email','digest:'||(now() at time zone 'Europe/Stockholm')::date||':'||u.id,
        jsonb_build_object('user_id',u.id,'template','daily_update','slugs',u.slugs),now()+make_interval(secs=>count/14.0));
      count:=count+1;
    end loop;
  else raise exception 'unknown_maintenance'; end if;
  return jsonb_build_object('processed',count);
end $$;

create function public.website_external_result(p_provider text,p_id text,p_data jsonb) returns void
language sql security definer set search_path='' as $$
  insert into website_private.external_auctions(provider,external_id,data) values(p_provider,p_id,p_data)
    on conflict(provider,external_id) do update set data=excluded.data,updated_at=now();
$$;

create function public.website_external_results(p_provider text,p_rows jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_provider not in ('sajab','bilweb') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>250 then raise exception 'invalid_import'; end if;
  insert into website_private.external_auctions(provider,external_id,data)
    select p_provider,item->>'id',item->'data' from jsonb_array_elements(p_rows) item
    on conflict(provider,external_id) do update set data=excluded.data,updated_at=now();
end $$;

create function public.website_contact(p_auth_id uuid,p_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid; a public.auctions; counterpart uuid;
begin
  v_user_id:=website_private.resolve_user(p_auth_id);
  select * into a from public.auctions where slug=p_slug and lifecycle_status=9 and paid and (seller_id=v_user_id or buyer_id=v_user_id);
  if not found then raise exception 'forbidden'; end if;
  counterpart:=case when a.seller_id=v_user_id then a.buyer_id else a.seller_id end;
  return (select jsonb_build_object('name',u.name,'email',u.email,'phone',ac.address->>'phone') from public.users u left join website_private.accounts ac on ac.user_id=u.id where u.id=counterpart);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'website_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;

begin;

create function website_private.notify_user(p_user uuid,p_kind text,p_key text,p_payload jsonb) returns void
language plpgsql set search_path='' as $$
declare locale text;
begin
  if p_user is null then return; end if;
  if website_private.enqueue('email',p_key||':'||p_user,jsonb_build_object('user_id',p_user,'template',p_kind)||p_payload) then
    select u.locale into locale from public.users u where id=p_user;
    insert into public.notifications(user_id,title,text,link,created_at,updated_at)
      values(p_user,initcap(replace(p_kind,'_',' ')),initcap(replace(p_kind,'_',' ')),
        '/'||coalesce(locale,'en')||case when p_payload->>'slug' is null then '/account' else '/auctions/'||(p_payload->>'slug') end,now(),now());
  end if;
end $$;

create function website_private.settle(p_auction uuid,p_buyer uuid,p_price bigint,p_manual boolean default false) returns void
language plpgsql set search_path='' as $$
declare a public.auctions; buyer_fee bigint; seller_fee bigint; buyer_vat numeric:=1.25; seller_vat numeric:=1.25;
begin
  select * into a from public.auctions where id=p_auction for update;
  if a.lifecycle_status in (9,10) then return; end if;
  buyer_fee:=least(6000000,greatest(400000,round(p_price*a.commission_buyer_percent*.008)));
  seller_fee:=case when a.commission_seller_percent=0 then 0 else greatest(200000,round(p_price*a.commission_seller_percent*.008)) end;
  -- Original international-company VAT exemption is derived from billing data,
  -- never an amount or VAT flag submitted with a bid.
  select case when customer_type=2 then 1 else 1.25 end into buyer_vat from public.users where id=p_buyer;
  select case when customer_type=2 then 1 else 1.25 end into seller_vat from public.users where id=a.seller_id;
  update public.auctions set lifecycle_status=9,buyer_id=p_buyer,sale_price_cents=p_price,sale_price_currency='SEK',
    commission_cents=buyer_fee,commission_currency='SEK',commission_vat=coalesce(buyer_vat,1.25),
    commission_seller_cents=seller_fee,commission_seller_currency='SEK',commission_seller_vat=coalesce(seller_vat,1.25),
    reserve_shortfall_cents=greatest(coalesce(reserve_price_cents,0)-p_price,0),paid=false,
    sale_type=case when p_manual then 'manual_sale' else 'auction' end,updated_at=now() where id=a.id;
  insert into website_private.payments(auction_id,user_id,kind,amount_cents)
    values(a.id,p_buyer,'buyer_commission',round(buyer_fee*coalesce(buyer_vat,1.25))) on conflict do nothing;
  if seller_fee>0 then
    insert into website_private.payments(auction_id,user_id,kind,amount_cents)
      values(a.id,a.seller_id,'seller_commission',round(seller_fee*coalesce(seller_vat,1.25))) on conflict do nothing;
  end if;
  perform website_private.enqueue('settlement','settled:'||a.id,jsonb_build_object('auction_id',a.id));
  perform website_private.notify_user(p_buyer,'auction_won','won:'||a.id,jsonb_build_object('auction_id',a.id));
  perform website_private.notify_user(a.seller_id,'auction_sold','sold:'||a.id,jsonb_build_object('auction_id',a.id));
  perform website_private.enqueue('sold_followup','followup:'||a.id,jsonb_build_object('auction_id',a.id),now()+interval '14 days');
end $$;

create function public.website_offer_decision(p_auth_id uuid,p_offer_id uuid,p_accept boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid; o public.offers; a public.auctions;
begin
  v_user_id:=website_private.resolve_user(p_auth_id);
  if not (select value='true'::jsonb from website_private.settings where key='transactions_enabled') then raise exception 'transactions_not_enabled'; end if;
  select * into o from public.offers where id=p_offer_id;
  if not found then raise exception 'not_found'; end if;
  select * into a from public.auctions where id=o.auction_id for update;
  if a.seller_id is distinct from v_user_id then raise exception 'forbidden'; end if;
  select * into o from public.offers where id=p_offer_id for update;
  if (o.status='accepted' and p_accept) or (o.status='rejected' and not p_accept) then return jsonb_build_object('saved',true); end if;
  if o.status<>'pending' or a.lifecycle_status<>2 or a.published_status<>1 then raise exception 'offer_closed'; end if;
  update public.offers set status=case when p_accept then 'accepted' else 'rejected' end,updated_at=now() where id=o.id;
  if p_accept then
    perform website_private.settle(a.id,o.user_id,o.amount_cents,true);
    update public.offers set status='rejected',updated_at=now() where auction_id=a.id and status='pending';
  else
    perform website_private.notify_user(o.user_id,'offer_rejected','offer-rejected:'||o.id,jsonb_build_object('auction_id',a.id));
  end if;
  return jsonb_build_object('saved',true);
end $$;

create function public.website_tick() returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.auctions; b public.bids; cutoff bigint; fee bigint; n integer:=0; event text; u record;
begin
  if not (select value='true'::jsonb from website_private.settings where key='jobs_enabled') then return '{"enabled":false}'; end if;
  if not pg_try_advisory_xact_lock(685147092) then return '{"busy":true}'; end if;
  for a in select * from public.auctions where published_status=1 and lifecycle_status in (2,3,4,6)
    and closed_at is not null order by closed_at for update skip locked loop
    if a.lifecycle_status=2 and a.closed_at>clock_timestamp() and
      ((a.closed_at at time zone 'Europe/Stockholm')::date-7+time '07:00') at time zone 'Europe/Stockholm'<=clock_timestamp() then
      update public.auctions set lifecycle_status=3,updated_at=now() where id=a.id;
      a.lifecycle_status:=3;
      perform website_private.enqueue('auction_live','live:'||a.id,jsonb_build_object('auction_id',a.id));
    end if;
    if a.closed_at<=clock_timestamp() then
      select * into b from public.bids where auction_id=a.id order by amount_cents desc,created_at desc limit 1;
      fee:=least(6000000,greatest(400000,round(coalesce(b.amount_cents,0)*a.commission_buyer_percent*.008)));
      cutoff:=coalesce(a.reserve_price_cents,0);
      if (select value='true'::jsonb from website_private.settings where key='shortfall_enabled') then
        cutoff:=cutoff-least(round(cutoff*a.commission_buyer_percent*.008),7500000,fee);
      end if;
      if b.id is not null and b.amount_cents>=cutoff then
        perform website_private.settle(a.id,b.user_id,b.amount_cents);
      else
        update public.auctions set lifecycle_status=10,updated_at=now() where id=a.id;
        perform website_private.notify_user(a.seller_id,'auction_unsold','unsold:'||a.id,jsonb_build_object('auction_id',a.id));
        perform website_private.enqueue('rerun_question','rerun:'||a.id,jsonb_build_object('auction_id',a.id),now()+interval '7 days');
      end if;
      n:=n+1;
    elsif a.lifecycle_status=3 then
      foreach event in array array['lower_reserve','ending_soon','ending_in_fifteen_minutes'] loop
        if a.closed_at<=now()+(case event when 'lower_reserve' then interval '3 hours' when 'ending_soon' then interval '2 hours' else interval '15 minutes' end) then
          perform website_private.enqueue(event,event||':'||a.id,jsonb_build_object('auction_id',a.id));
        end if;
      end loop;
    end if;
  end loop;
  -- Session counters contain hashes, not raw addresses, and expire promptly.
  delete from website_private.rate_limits where starts_at<now()-interval '1 day';
  delete from website_private.requests where created_at<now()-interval '30 days';
  delete from website_private.lead_access where expires_at<now();
  return jsonb_build_object('enabled',true,'settled',n);
end $$;

create function public.website_schedule(p_kind text,p_key text) returns void
language sql security definer set search_path='' as $$
  select website_private.enqueue(p_kind,p_key,'{}') where
    (select value='true'::jsonb from website_private.settings where key='jobs_enabled')
    and p_kind in ('refresh_listings','generate_sitemap','sync_payments','compute_interests','daily_update','scrape_bilweb','scrape_sajab');
$$;

create function public.website_claim_jobs(p_limit integer default 10) returns setof website_private.jobs
language sql security definer set search_path='' as $$
  with exhausted as (
    update website_private.jobs set status='failed',lease_until=null,lease_token=null,last_error='worker_lease_expired'
    where status='running' and lease_until<now() and attempts>=8 returning id
  )
  update website_private.jobs j set status='running',attempts=attempts+1,
    lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid()
  where id in (select id from website_private.jobs where
    (status='pending' and available_at<=now() or status='running' and lease_until<now()) and attempts<8
    and (select value='true'::jsonb from website_private.settings where key='jobs_enabled')
    order by available_at for update skip locked limit least(greatest(p_limit,1),20)) returning j.*;
$$;
create function public.website_finish_job(p_id uuid,p_lease uuid,p_error text default null) returns void
language sql security definer set search_path='' as $$
  update website_private.jobs set status=case when p_error is null then 'done' when attempts>=8 then 'failed' else 'pending' end,
    finished_at=case when p_error is null then now() else null end,
    available_at=now()+make_interval(secs=>least(3600,(power(2,attempts)*15)::integer)),
    lease_until=null,lease_token=null,last_error=left(p_error,500)
  where id=p_id and lease_token=p_lease and status='running';
$$;

create function public.website_job_data(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb; a public.auctions; u uuid;
begin
  if p_kind='payments' then
    return coalesce((select jsonb_agg(to_jsonb(p)) from website_private.payments p where reconciled_at is null and created_at>now()-interval '14 days'),'[]');
  elsif p_kind='sitemap' then
    return coalesce((select jsonb_agg(jsonb_build_object('slug',slug,'updated_at',updated_at)) from public.auctions where published_status=1),'[]');
  elsif p_kind='lead' then
    return (select jsonb_build_object('id',id,'email',email,'phone',phone,'owner',owner,'registration_number',registration_number,'comment',comment) from public.leads where id=(p_payload->>'lead_id')::uuid);
  elsif p_kind='email' then
    return (select jsonb_build_object('email',email,'name',name,'locale',locale,'disabled',banned) from public.users where id=(p_payload->>'user_id')::uuid);
  elsif p_kind='settlement' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount_cents',p.amount_cents,'kind',p.kind,'user_id',p.user_id,'name',u.name,'email',u.email,'fortnox_customer_id',u.fortnox_customer_id,'provider_id',p.provider_id))
      from website_private.payments p join public.users u on u.id=p.user_id where p.auction_id=(p_payload->>'auction_id')::uuid),'[]');
  end if;
  raise exception 'unknown_job_query';
end $$;

create function public.website_expand_notifications(p_kind text,p_key text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a public.auctions; b public.bids; v_user_id uuid; template text;
begin
  select * into a from public.auctions where id=(p_payload->>'auction_id')::uuid;
  if not found then raise exception 'not_found'; end if;
  select * into b from public.bids where auction_id=a.id order by amount_cents desc,created_at desc limit 1;
  if p_kind in ('ending_soon','ending_in_fifteen_minutes','auction_live') then
    if a.lifecycle_status<>3 or a.closed_at<=now() then return; end if;
    for v_user_id in select user_id from public.bids where auction_id=a.id union select user_id from public.bookmarks where auction_id=a.id loop
      if v_user_id is distinct from b.user_id and v_user_id is distinct from a.seller_id then
        perform website_private.notify_user(v_user_id,p_kind,p_key,p_payload||jsonb_build_object('slug',a.slug));
      end if;
    end loop;
  elsif p_kind='bid_notifications' then
    v_user_id:=(p_payload->>'previous_bidder')::uuid;
    if v_user_id is not null and v_user_id is distinct from b.user_id then perform website_private.notify_user(v_user_id,'outbid',p_key,p_payload||jsonb_build_object('slug',a.slug)); end if;
    perform website_private.notify_user(a.seller_id,'new_bid',p_key||':seller',p_payload||jsonb_build_object('slug',a.slug));
  else
    template:=p_kind;
    if template='rerun_question' and a.lifecycle_status<>10 then return; end if;
    if template='lower_reserve' and (a.lifecycle_status<>3 or coalesce(a.reserve_price_cents,0)<=a.highest_bid_amount_cents) then return; end if;
    perform website_private.notify_user(a.seller_id,template,p_key,p_payload||jsonb_build_object('slug',a.slug));
  end if;
end $$;

create function public.website_record_payment(p_id uuid,p_provider text,p_provider_id text,p_url text default null,p_paid boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare p website_private.payments; a public.auctions;
begin
  if p_provider<>'fortnox' or coalesce(p_provider_id,'')='' then raise exception 'invalid_payment_reference'; end if;
  select * into p from website_private.payments where id=p_id for update;
  if not found then raise exception 'not_found'; end if;
  if p.provider_id is not null and (p.provider_id<>p_provider_id or p.provider<>p_provider) then raise exception 'payment_reference_mismatch'; end if;
  update website_private.payments set provider=p_provider,provider_id=p_provider_id,provider_url=coalesce(p_url,provider_url),
    paid_at=case when p_paid then coalesce(paid_at,now()) else paid_at end,
    reconciled_at=case when p_paid then coalesce(reconciled_at,now()) else reconciled_at end where id=p_id;
  if p_paid and p.kind='buyer_commission' then
    update public.auctions set paid=true,updated_at=now() where id=p.auction_id and not paid returning * into a;
    if found then
      perform website_private.notify_user(a.buyer_id,'payment_received','payment-buyer:'||p.id,jsonb_build_object('slug',a.slug));
      perform website_private.notify_user(a.seller_id,'buyer_paid','payment-seller:'||p.id,jsonb_build_object('slug',a.slug));
    end if;
  end if;
end $$;

create function public.website_verify_identity(p_auth_id uuid,p_provider text,p_reference text,p_event_id text) returns void
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid;
begin
  if p_provider not in ('stripe_identity','bankid') or p_reference is null or p_event_id is null then raise exception 'invalid_verification'; end if;
  v_user_id:=website_private.resolve_user(p_auth_id);
  insert into website_private.provider_events(provider,event_id) values(p_provider,p_event_id) on conflict do nothing;
  if not found then return; end if;
  update website_private.accounts set verification_provider=p_provider,verification_reference=p_reference,verified_at=now() where user_id=v_user_id;
end $$;

-- Only the validated Edge Functions may call these routines.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname like 'website_%') or n.nspname='website_private' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.nspname='public' then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;

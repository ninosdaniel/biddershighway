-- Additive backend for the imported Highway schema. Never expose the Rails
-- tables wholesale: all customer writes enter through service-only RPCs.
begin;
-- The imported Bidders schema predates the source repository's billing email.
alter table public.users add column if not exists company_billing_email text;
create schema if not exists website_private;
revoke all on schema website_private from public, anon, authenticated;
grant usage on schema website_private to service_role;

create table website_private.accounts (
  auth_id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null unique references public.users(id),
  address jsonb not null default '{}',
  verification_provider text,
  verification_reference text unique,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create table website_private.requests (
  actor text not null, request_id uuid not null, action text not null,
  input jsonb not null, result jsonb, created_at timestamptz not null default now(),
  primary key(actor, request_id)
);
create table website_private.jobs (
  id uuid primary key default gen_random_uuid(), kind text not null,
  payload jsonb not null default '{}', dedupe_key text not null unique,
  status text not null default 'pending' check(status in ('pending','running','done','failed')),
  attempts integer not null default 0, available_at timestamptz not null default now(),
  lease_until timestamptz, lease_token uuid, last_error text,
  created_at timestamptz not null default now(), finished_at timestamptz
);
create index website_jobs_due on website_private.jobs(available_at) where status in ('pending','running');
create table website_private.settings (
  key text primary key, value jsonb not null
);
insert into website_private.settings values
  ('shortfall_enabled','false'), ('transactions_enabled','false'), ('jobs_enabled','false');
create table website_private.lead_access (
  lead_id uuid primary key references public.leads(id), token_hash text not null,
  expires_at timestamptz not null default now() + interval '7 days'
);
create table website_private.rate_limits (
  key text primary key, starts_at timestamptz not null, hits integer not null
);
create table website_private.provider_events (
  provider text not null, event_id text not null, received_at timestamptz not null default now(),
  primary key(provider,event_id)
);
create table website_private.payments (
  id uuid primary key default gen_random_uuid(), auction_id uuid not null references public.auctions(id),
  user_id uuid not null references public.users(id), kind text not null check(kind in ('buyer_commission','seller_commission')),
  amount_cents bigint not null check(amount_cents>=0), currency text not null default 'SEK',
  provider text, provider_id text, provider_url text, paid_at timestamptz, reconciled_at timestamptz,
  created_at timestamptz not null default now(), unique(auction_id,kind), unique(provider,provider_id)
);
create table website_private.external_auctions (
  provider text not null, external_id text not null, data jsonb not null,
  updated_at timestamptz not null default now(), primary key(provider,external_id)
);
create table website_private.interests (
  user_id uuid not null references public.users(id), manufacturer text not null,
  weight numeric not null, updated_at timestamptz not null default now(), primary key(user_id,manufacturer)
);
-- Defense in depth if this schema is accidentally added to the Data API.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='website_private' loop
    execute format('alter table website_private.%I enable row level security',t.tablename);
  end loop;
end $$;

create function website_private.enqueue(p_kind text,p_key text,p_payload jsonb,p_at timestamptz default now())
returns boolean language plpgsql set search_path='' as $$
begin
  insert into website_private.jobs(kind,dedupe_key,payload,available_at)
  values(p_kind,p_key,p_payload,p_at) on conflict(dedupe_key) do nothing;
  return found;
end;
$$;

create function website_private.resolve_user(p_auth_id uuid) returns uuid
language plpgsql set search_path='' as $$
declare a auth.users; u public.users; linked uuid;
begin
  select * into a from auth.users where id=p_auth_id and email_confirmed_at is not null;
  if not found then raise exception 'authentication_required' using errcode='P0001'; end if;
  -- Serialize email linking as well as first sign-in on separate devices.
  perform pg_advisory_xact_lock(hashtextextended(lower(a.email),0));
  select user_id into linked from website_private.accounts where auth_id=p_auth_id;
  if linked is null then
    select * into u from public.users where lower(email)=lower(a.email);
    if not found then
      insert into public.users(email,name,locale,token,created_at,updated_at)
      values(lower(a.email),left(coalesce(nullif(a.raw_user_meta_data->>'name',''),split_part(a.email,'@',1)),100),
        case when a.raw_user_meta_data->>'locale' in ('en','sv','de') then a.raw_user_meta_data->>'locale' else 'en' end,
        gen_random_uuid()::text,now(),now()) returning * into u;
    end if;
    insert into website_private.accounts(auth_id,user_id) values(p_auth_id,u.id);
    if a.raw_user_meta_data->>'newsletter_optin'='true' then
      update public.users set email_daily_updates=true,updated_at=now() where id=u.id;
    end if;
    linked:=u.id;
  end if;
  select * into u from public.users where id=linked;
  if u.banned then raise exception 'account_disabled' using errcode='P0001'; end if;
  return linked;
end $$;

create function website_private.require_bidder(p_auth uuid,p_user uuid) returns void
language plpgsql set search_path='' as $$
declare a website_private.accounts; u public.users;
begin
  select * into u from public.users where id=p_user;
  select * into a from website_private.accounts where auth_id=p_auth;
  if u.accepted_terms_at is null or u.accepted_terms_at < timestamp '2025-12-22' then raise exception 'terms_required'; end if;
  if a.verified_at is null then raise exception 'verification_required'; end if;
  if exists(select 1 from unnest(array['line1','city','country','phone','postal_code']) k where coalesce(a.address->>k,'')='') then
    raise exception 'address_required';
  end if;
end $$;

create function website_private.bid_increment(p_amount bigint) returns bigint
language sql immutable set search_path='' as $$
 select case when p_amount>=50000000 then 500000 when p_amount>=10000000 then 250000 else 100000 end::bigint;
$$;

create function website_private.record_bid(p_auction uuid,p_max public.max_bids,p_amount bigint) returns void
language plpgsql set search_path='' as $$
begin
  insert into public.bids(auction_id,user_id,max_bid_id,amount_cents,amount_currency,created_at,updated_at)
    values(p_auction,p_max.user_id,p_max.id,p_amount,'SEK',clock_timestamp(),clock_timestamp());
  update public.auctions set bids_count=bids_count+1,
    highest_bid_amount_cents=greatest(highest_bid_amount_cents,p_amount),
    closed_at=case when closed_at-clock_timestamp()<interval '2 minutes' then closed_at+interval '2 minutes' else closed_at end,
    updated_at=clock_timestamp() where id=p_auction;
end $$;

create function website_private.place_bid(p_auth uuid,p_user uuid,p_slug text,p_amount bigint,p_auto boolean)
returns jsonb language plpgsql set search_path='' as $$
declare a public.auctions; prev public.bids; incumbent public.max_bids; incoming public.max_bids;
  winner public.max_bids; loser public.max_bids;
begin
  perform website_private.require_bidder(p_auth,p_user);
  select * into a from public.auctions where slug=p_slug for update;
  if not found or a.published_status<>1 or a.lifecycle_status<>3 or a.closed_at<=clock_timestamp() then raise exception 'auction_closed'; end if;
  if a.seller_id=p_user then raise exception 'seller_cannot_bid'; end if;
  if p_amount is null or p_amount<=0 or p_amount>2147483647 or p_amount%50000<>0 then raise exception 'invalid_bid_increment'; end if;
  if p_amount<a.highest_bid_amount_cents+website_private.bid_increment(a.highest_bid_amount_cents) then raise exception 'bid_too_low'; end if;
  select * into prev from public.bids where auction_id=a.id order by amount_cents desc,created_at desc limit 1;
  select * into incumbent from public.max_bids where id=prev.max_bid_id;
  if p_amount=incumbent.amount_cents then raise exception 'bid_matches_existing_maximum'; end if;
  insert into public.max_bids(auction_id,user_id,amount_cents,amount_currency,auto_bid,created_at,updated_at)
    values(a.id,p_user,p_amount,'SEK',p_auto,clock_timestamp(),clock_timestamp()) returning * into incoming;
  if prev.user_id=p_user then
    if p_auto then
      update public.bids set max_bid_id=incoming.id,updated_at=clock_timestamp() where id=prev.id;
      -- Rails Bid.after_save also extends the clock when raising one's own cap.
      update public.auctions set closed_at=case when closed_at-clock_timestamp()<interval '2 minutes' then closed_at+interval '2 minutes' else closed_at end,updated_at=clock_timestamp() where id=a.id;
    else perform website_private.record_bid(a.id,incoming,p_amount); end if;
  elsif not p_auto and not coalesce(incumbent.auto_bid,false) then
    perform website_private.record_bid(a.id,incoming,p_amount);
  elsif incumbent.id is null then
    perform website_private.record_bid(a.id,incoming,website_private.bid_increment(0));
  else
    if p_amount>incumbent.amount_cents then winner:=incoming; loser:=incumbent;
    else winner:=incumbent; loser:=incoming; end if;
    if not p_auto and winner.id=incoming.id then
      if prev.amount_cents<>loser.amount_cents then perform website_private.record_bid(a.id,loser,loser.amount_cents); end if;
      perform website_private.record_bid(a.id,winner,winner.amount_cents);
    elsif not p_auto then
      perform website_private.record_bid(a.id,winner,least(loser.amount_cents+website_private.bid_increment(loser.amount_cents),winner.amount_cents));
      perform website_private.record_bid(a.id,loser,loser.amount_cents);
    else
      if prev.amount_cents<>loser.amount_cents then perform website_private.record_bid(a.id,loser,loser.amount_cents); end if;
      perform website_private.record_bid(a.id,winner,least(loser.amount_cents+website_private.bid_increment(loser.amount_cents),winner.amount_cents));
    end if;
  end if;
  perform website_private.enqueue('bid_notifications','bid:'||incoming.id,jsonb_build_object('auction_id',a.id,'previous_bidder',prev.user_id,'bidder',p_user));
  perform website_private.enqueue('refresh_listings','refresh:'||incoming.id,'{}');
  select * into a from public.auctions where id=a.id;
  return jsonb_build_object('accepted',true,'amount_cents',a.highest_bid_amount_cents,'closes_at',a.closed_at,'maximum_cents',p_amount);
end $$;

create function public.website_account(p_auth_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid; v_result jsonb;
begin
  v_user_id:=website_private.resolve_user(p_auth_id);
  select jsonb_build_object('id',u.id,'name',u.name,'email',u.email,'locale',u.locale,'username',u.username,
    'terms_accepted',u.accepted_terms_at>=timestamp '2025-12-22','verified',a.verified_at is not null,
    'address',a.address,'email_daily_updates',u.email_daily_updates,
    'bookmarks',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'slug',x.slug,'title',l.name,'amount_cents',x.highest_bid_amount_cents)) from public.bookmarks b join public.auctions x on x.id=b.auction_id join public.lots l on l.id=x.lot_id where b.user_id=v_user_id),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(n)) from (select id,title,text,link,read,created_at from public.notifications where user_id=v_user_id order by created_at desc limit 100) n),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'auction_id',p.auction_id,'amount_cents',p.amount_cents,'currency',p.currency,'kind',p.kind,'paid_at',p.paid_at,'url',p.provider_url,'invoice_number',p.provider_id)) from website_private.payments p where user_id=v_user_id),'[]'::jsonb),
    'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'slug',x.slug,'amount_cents',o.amount_cents,'status',o.status,'can_decide',x.seller_id=v_user_id)) from public.offers o join public.auctions x on x.id=o.auction_id where o.user_id=v_user_id or x.seller_id=v_user_id),'[]'::jsonb),
    'auctions',coalesce((select jsonb_agg(jsonb_build_object('slug',x.slug,'title',l.name,'status',x.lifecycle_status,'role',case when x.seller_id=v_user_id then 'seller' else 'buyer' end,'paid',x.paid)) from public.auctions x join public.lots l on l.id=x.lot_id where x.seller_id=v_user_id or x.buyer_id=v_user_id),'[]'::jsonb)) into v_result
    from public.users u join website_private.accounts a on a.user_id=u.id where u.id=v_user_id;
  return v_result;
end $$;

create function public.website_command(p_auth_id uuid,p_action text,p_input jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid; a public.auctions; o public.offers; v_result jsonb; prior website_private.requests; amount bigint; id uuid;
begin
  v_user_id:=website_private.resolve_user(p_auth_id);
  if p_request_id is null then raise exception 'request_id_required'; end if;
  insert into website_private.requests(actor,request_id,action,input) values(v_user_id::text,p_request_id,p_action,p_input) on conflict do nothing;
  select * into prior from website_private.requests where actor=v_user_id::text and request_id=p_request_id for update;
  if prior.action<>p_action or prior.input<>p_input then raise exception 'idempotency_conflict'; end if;
  if prior.result is not null then return prior.result; end if;
  case p_action
  when 'bid' then
    if not (select value='true'::jsonb from website_private.settings where key='transactions_enabled') then raise exception 'transactions_not_enabled'; end if;
    v_result:=website_private.place_bid(p_auth_id,v_user_id,p_input->>'slug',(p_input->>'amount_cents')::bigint,coalesce((p_input->>'auto_bid')::boolean,false));
  when 'profile' then
    if length(trim(coalesce(p_input->>'name',''))) not between 1 and 100 then raise exception 'invalid_name'; end if;
    if coalesce(p_input->>'locale','') not in ('en','sv','de') then raise exception 'invalid_locale'; end if;
    update public.users set name=trim(p_input->>'name'),locale=p_input->>'locale',
      email_daily_updates=coalesce((p_input->>'email_daily_updates')::boolean,email_daily_updates),updated_at=now() where public.users.id=v_user_id;
    update website_private.accounts set address=jsonb_build_object('line1',left(p_input->>'line1',200),'city',left(p_input->>'city',100),
      'country',left(p_input->>'country',2),'postal_code',left(p_input->>'postal_code',20),'phone',left(p_input->>'phone',30)) where user_id=v_user_id;
    v_result:=jsonb_build_object('saved',true);
  when 'accept_terms' then
    if coalesce((p_input->>'accepted')::boolean,false) is not true then raise exception 'terms_required'; end if;
    update public.users set accepted_terms_at=now(),updated_at=now() where public.users.id=v_user_id;
    v_result:=jsonb_build_object('saved',true);
  when 'bookmark' then
    select * into a from public.auctions where slug=p_input->>'slug' and published_status=1;
    if not found then raise exception 'not_found'; end if;
    if coalesce((p_input->>'saved')::boolean,true) then
      insert into public.bookmarks(auction_id,user_id,email,created_at,updated_at)
      select a.id,v_user_id,email,now(),now() from public.users where public.users.id=v_user_id on conflict(auction_id,user_id) do nothing;
    else delete from public.bookmarks where auction_id=a.id and user_id=v_user_id; end if;
    v_result:=jsonb_build_object('saved',coalesce((p_input->>'saved')::boolean,true));
  when 'notification_read' then
    update public.notifications set read=true,updated_at=now() where user_id=v_user_id and public.notifications.id=(p_input->>'id')::uuid;
    v_result:=jsonb_build_object('saved',true);
  when 'offer' then
    if not (select value='true'::jsonb from website_private.settings where key='transactions_enabled') then raise exception 'transactions_not_enabled'; end if;
    perform website_private.require_bidder(p_auth_id,v_user_id);
    select * into a from public.auctions where slug=p_input->>'slug' for update;
    if not found or a.published_status<>1 or a.lifecycle_status<>2 then raise exception 'offers_closed'; end if;
    if a.seller_id=v_user_id then raise exception 'seller_cannot_bid'; end if;
    amount:=(p_input->>'amount_cents')::bigint;
    if amount is null or amount<=100000 or amount>2147483647 or amount%50000<>0 then raise exception 'invalid_bid_increment'; end if;
    insert into public.offers(auction_id,user_id,amount_cents,amount_currency,status,created_at,updated_at)
      values(a.id,v_user_id,amount,'SEK','pending',now(),now()) returning public.offers.id into id;
    perform website_private.enqueue('offer_notification','offer:'||id,jsonb_build_object('auction_id',a.id,'offer_id',id));
    v_result:=jsonb_build_object('accepted',true,'id',id);
  else raise exception 'unknown_action';
  end case;
  update website_private.requests set result=v_result where actor=v_user_id::text and request_id=p_request_id;
  return v_result;
end $$;

create function public.website_submit_lead(p_input jsonb,p_request_id uuid,p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare id uuid; prior website_private.requests; reg text; kind text; v_result jsonb;
begin
  if p_request_id is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
  if length(p_input->>'email')>254 or coalesce(p_input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email'; end if;
  if length(trim(coalesce(p_input->>'phone',''))) not between 5 and 30 then raise exception 'invalid_phone'; end if;
  kind:=p_input->>'kind';
  if kind not in ('sale','collection','estate','classified') or kind is null then raise exception 'invalid_lead_type'; end if;
  reg:=case kind when 'collection' then 'SAMLING' when 'estate' then 'DÖDSBO' else upper(trim(p_input->>'registration_number')) end;
  if reg is null or length(reg) not between 1 and 30 then raise exception 'registration_required'; end if;
  insert into website_private.requests(actor,request_id,action,input) values('guest',p_request_id,'lead',p_input) on conflict do nothing;
  select * into prior from website_private.requests where actor='guest' and request_id=p_request_id for update;
  if prior.input<>p_input then raise exception 'idempotency_conflict'; end if;
  if prior.result is not null then return prior.result; end if;
  insert into public.leads(email,owner,phone,registration_number,lead_generator,classified,utm_source,created_at,updated_at)
    values(lower(trim(p_input->>'email')),left(trim(p_input->>'owner'),100),trim(p_input->>'phone'),reg,
      kind,kind='classified',left(p_input->>'utm_source',200),now(),now()) returning public.leads.id into id;
  insert into website_private.lead_access(lead_id,token_hash) values(id,p_token_hash);
  perform website_private.enqueue('lead_received','lead:'||id,jsonb_build_object('lead_id',id));
  v_result:=jsonb_build_object('accepted',true,'id',id);
  update website_private.requests set result=v_result where actor='guest' and request_id=p_request_id;
  return v_result;
end $$;

create function public.website_update_lead(p_id uuid,p_token_hash text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from website_private.lead_access where lead_id=p_id and token_hash=p_token_hash and expires_at>now()) then raise exception 'not_found'; end if;
  update public.leads set comment=left(p_input->>'comment',10000),location=left(p_input->>'location',200),
    data_manufacturer=left(p_input->>'manufacturer',100),data_model=left(p_input->>'model',100),data_year=left(p_input->>'year',4),updated_at=now() where id=p_id;
  perform website_private.enqueue('lead_received','lead-update:'||p_id||':'||md5(p_input::text),jsonb_build_object('lead_id',p_id));
  return jsonb_build_object('saved',true);
end $$;

create function public.website_rate_limit(p_key text,p_limit integer,p_window integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  insert into website_private.rate_limits(key,starts_at,hits) values(p_key,now(),1)
  on conflict(key) do update set hits=case when website_private.rate_limits.starts_at<now()-make_interval(secs=>p_window) then 1 else website_private.rate_limits.hits+1 end,
    starts_at=case when website_private.rate_limits.starts_at<now()-make_interval(secs=>p_window) then now() else website_private.rate_limits.starts_at end returning hits into n;
  return n<=p_limit;
end $$;

-- No function here can be called with a browser's publishable key or user JWT.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname like 'website_%') or n.nspname='website_private' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.signature::text like 'website_%' then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;

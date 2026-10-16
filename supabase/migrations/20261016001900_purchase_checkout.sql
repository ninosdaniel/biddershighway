begin;

create table website_private.purchase_quotes (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null references auth.users(id),
  auction_id uuid not null references public.auctions(id),
  kind text not null check(kind in ('purchase','after_sale')),
  snapshot jsonb not null,
  expires_at timestamptz not null default now()+interval '15 minutes',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table website_private.purchase_quotes enable row level security;
revoke all on website_private.purchase_quotes from public,anon,authenticated;

-- Prices and tax are read from trusted records, never the submitted total.
create function website_private.purchase_snapshot(a public.auctions,p_actor uuid,p_kind text) returns jsonb
language plpgsql set search_path='' as $$
declare buyer_vat numeric; seller_vat numeric; fee bigint; total_fee bigint; lot_name text; lot_updated_at timestamptz;
begin
  if p_kind not in ('purchase','after_sale') or p_kind is null then raise exception 'invalid_input'; end if;
  if a.id is null or a.published_status<>1 or a.hidden_sale_price or a.buyer_id is not null
    or a.seller_id is null or a.reserve_price_cents is null or a.reserve_price_cents<=0
    or coalesce(a.reserve_price_currency,'SEK')<>'SEK'
    or (p_kind='purchase' and a.lifecycle_status<>6)
    or (p_kind='after_sale' and a.lifecycle_status<>10) then raise exception 'purchase_unavailable'; end if;
  if a.seller_id=p_actor then raise exception 'seller_cannot_purchase'; end if;
  select name,updated_at into lot_name,lot_updated_at from public.lots where id=a.lot_id;
  select case when customer_type=2 then 1 else 1.25 end into buyer_vat from public.users where id=p_actor;
  select case when customer_type=2 then 1 else 1.25 end into seller_vat from public.users where id=a.seller_id;
  fee:=least(6000000,greatest(400000,round(a.reserve_price_cents*a.commission_buyer_percent::numeric*.008)));
  total_fee:=round(fee*coalesce(buyer_vat,1.25));
  return jsonb_build_object('slug',a.slug,'kind',p_kind,'title',lot_name,'lot_id',a.lot_id,'lot_updated_at',lot_updated_at,'price_cents',a.reserve_price_cents,
    'buyer_fee_ex_vat_cents',fee,'buyer_fee_cents',total_fee,'vat_multiplier',coalesce(buyer_vat,1.25),
    'total_cents',a.reserve_price_cents::bigint+total_fee,'currency','SEK',
    'buyer_percent',a.commission_buyer_percent,'seller_id',a.seller_id,
    'seller_percent',a.commission_seller_percent,'seller_vat',coalesce(seller_vat,1.25));
end $$;

create function public.website_purchase_quote(p_auth_id uuid,p_slug text,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid; a public.auctions; q website_private.purchase_quotes; details jsonb;
begin
  v_actor:=website_private.resolve_user(p_auth_id);
  select * into a from public.auctions where slug=p_slug;
  details:=website_private.purchase_snapshot(a,v_actor,p_kind);
  delete from website_private.purchase_quotes where auth_id=p_auth_id and expires_at<now()-interval '30 days';
  insert into website_private.purchase_quotes(auth_id,auction_id,kind,snapshot)
    values(p_auth_id,a.id,p_kind,details) returning * into q;
  return (details-array['seller_id','seller_percent','seller_vat','lot_id','lot_updated_at']) || jsonb_build_object(
    'id',q.id,'expires_at',q.expires_at);
end $$;

create function public.website_purchase(p_auth_id uuid,p_quote_id uuid,p_accepted boolean,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid; a public.auctions; q website_private.purchase_quotes; prior website_private.requests;
  request_input jsonb; details jsonb; receipt jsonb;
begin
  v_actor:=website_private.resolve_user(p_auth_id);
  if p_request_id is null then raise exception 'request_id_required'; end if;
  if p_accepted is distinct from true then raise exception 'purchase_confirmation_required'; end if;
  request_input:=jsonb_build_object('quote_id',p_quote_id,'accepted',p_accepted);
  insert into website_private.requests(actor,request_id,action,input)
    values(v_actor::text,p_request_id,'purchase',request_input) on conflict do nothing;
  select * into prior from website_private.requests r where r.actor=v_actor::text and r.request_id=p_request_id for update;
  if prior.action<>'purchase' or prior.input<>request_input then raise exception 'idempotency_conflict'; end if;
  if prior.result is not null then return prior.result; end if;
  if not coalesce((select value='true'::jsonb from website_private.settings where key='transactions_enabled'),false) then raise exception 'transactions_not_enabled'; end if;
  perform website_private.require_bidder(p_auth_id,v_actor);
  select * into q from website_private.purchase_quotes where id=p_quote_id and auth_id=p_auth_id for update;
  if not found then raise exception 'not_found'; end if;
  if q.completed_at is not null then raise exception 'purchase_unavailable'; end if;
  if q.expires_at<=clock_timestamp() then raise exception 'purchase_quote_expired'; end if;
  -- Competing buyers and the auction clock serialize on this same row lock.
  select * into a from public.auctions where id=q.auction_id for update;
  perform id from public.users where id in (v_actor,a.seller_id) order by id for share;
  perform id from public.lots where id=a.lot_id for share;
  -- Lock contention must not extend the validity of a price confirmation.
  if q.expires_at<=clock_timestamp() then raise exception 'purchase_quote_expired'; end if;
  details:=website_private.purchase_snapshot(a,v_actor,q.kind);
  if details<>q.snapshot then raise exception 'purchase_quote_changed'; end if;
  if q.kind='purchase' then
    update public.auctions set closed_at=clock_timestamp()-interval '1 second' where id=a.id;
  end if;
  perform website_private.settle(a.id,v_actor,a.reserve_price_cents,true);
  update public.offers set status='rejected',updated_at=now() where auction_id=a.id and status='pending';
  update website_private.purchase_quotes set completed_at=now() where id=q.id;
  receipt:=(details-array['seller_id','seller_percent','seller_vat','lot_id','lot_updated_at']) || jsonb_build_object('purchased',true,'paid',false);
  update website_private.requests r set result=receipt where r.actor=v_actor::text and r.request_id=p_request_id;
  return receipt;
end $$;

-- Research records use the committed price. Browser-supplied amounts cannot
-- populate the comparison dataset. The worker adds the shared name tokenizer.
create function public.website_sale_report_source(p_auction uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('name',l.name) from public.auctions a join public.lots l on l.id=a.lot_id
    where a.id=p_auction and a.lifecycle_status=9 and a.sale_price_cents is not null;
$$;
create function public.website_record_sale_report(p_auction uuid,p_make text,p_tokens text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.auctions; l public.lots; record_id uuid; canonical_url text; model_year integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('sale-report:'||p_auction,0));
  select * into a from public.auctions where id=p_auction and lifecycle_status=9 and sale_price_cents is not null;
  if not found then return; end if;
  select * into l from public.lots where id=a.lot_id;
  canonical_url:='https://www.biddershighway.com/sv/auctions/'||a.slug;
  model_year:=case when l.data->>'data_year' ~ '^[0-9]{4}$' then (l.data->>'data_year')::integer else null end;
  select id into record_id from public.reported_auctions where name=l.name and url=canonical_url limit 1 for update;
  if record_id is null then
    insert into public.reported_auctions(name,url,closed_at,highest_bid_amount_cents,highest_bid_amount_currency,sold,source,year,make,search_tokens,body,created_at,updated_at)
      values(l.name,canonical_url,coalesce(a.closed_at,now()),a.sale_price_cents,'SEK',true,'biddershighway',model_year,left(p_make,100),left(p_tokens,2000),
        concat_ws('. ',l.name,'Status: såld','Högsta bud: '||(a.sale_price_cents::numeric/100)||' SEK','Källa: biddershighway'),now(),now());
  else
    update public.reported_auctions set closed_at=coalesce(a.closed_at,now()),highest_bid_amount_cents=a.sale_price_cents,
      highest_bid_amount_currency='SEK',sold=true,source='biddershighway',year=model_year,
      make=left(p_make,100),search_tokens=left(p_tokens,2000),updated_at=now() where id=record_id;
  end if;
end $$;

revoke all on function website_private.purchase_snapshot(public.auctions,uuid,text) from public,anon,authenticated;
revoke all on function public.website_purchase_quote(uuid,text,text),public.website_purchase(uuid,uuid,boolean,uuid),public.website_sale_report_source(uuid),public.website_record_sale_report(uuid,text,text) from public,anon,authenticated;
grant execute on function public.website_purchase_quote(uuid,text,text),public.website_purchase(uuid,uuid,boolean,uuid),public.website_sale_report_source(uuid),public.website_record_sale_report(uuid,text,text) to service_role;

-- Settlement replacement follows below; preserve earlier migrations verbatim.

create or replace function website_private.settle(p_auction uuid,p_buyer uuid,p_price bigint,p_manual boolean default false) returns void
language plpgsql set search_path='' as $$
declare a public.auctions; buyer_fee bigint; seller_fee bigint; buyer_vat numeric:=1.25; seller_vat numeric:=1.25;
begin
  select * into a from public.auctions where id=p_auction for update;
  if a.lifecycle_status=9 or (a.lifecycle_status=10 and not p_manual) then return; end if;
  buyer_fee:=least(6000000,greatest(400000,round(p_price*a.commission_buyer_percent::numeric*.008)));
  seller_fee:=case when a.commission_seller_percent=0 then 0 else greatest(200000,round(p_price*a.commission_seller_percent::numeric*.008)) end;
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
  perform website_private.enqueue('report_sale','report-sale:'||a.id,jsonb_build_object('auction_id',a.id));
  perform website_private.enqueue('refresh_listings','settled-refresh:'||a.id,'{}');
  perform website_private.enqueue('settlement','settled:'||a.id,jsonb_build_object('auction_id',a.id));
  perform website_private.notify_user(p_buyer,'auction_won','won:'||a.id,jsonb_build_object('auction_id',a.id));
  perform website_private.notify_user(a.seller_id,'auction_sold','sold:'||a.id,jsonb_build_object('auction_id',a.id));
  perform website_private.enqueue('sold_followup','followup:'||a.id,jsonb_build_object('auction_id',a.id),now()+interval '14 days');
end $$;


revoke all on function website_private.settle(uuid,uuid,bigint,boolean) from public,anon,authenticated;
-- Advertise eligibility without exposing an unsold vehicle's reserve price.
create or replace function public.get_website_auction(p_slug text,p_locale text default 'en') returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'slug',a.slug,'title',concat_ws(' ',l.data->>'year',l.name),
    'body',case p_locale when 'sv' then l.body_sv when 'de' then l.body_de else l.body_en end,
    'location',l.location,'data',jsonb_build_object('year',l.data->>'year','manufacturer',l.data->>'manufacturer','model',l.data->>'model','odometer',l.data->>'odometer','transmission',l.data->>'transmission','color',l.data->>'color'),
    'hero_image_filename',l.hero_image_filename,'status',a.lifecycle_status,'closed_at',a.closed_at,
    'amount_cents',case when a.hidden_sale_price then null when a.lifecycle_status=9 then a.sale_price_cents else a.highest_bid_amount_cents end,
    'reserve_met',case when a.hidden_sale_price then null else a.highest_bid_amount_cents>=coalesce(a.reserve_price_cents,0) end,
    'minimum_bid_cents',case when not a.hidden_sale_price and a.lifecycle_status in (2,3,6) then a.highest_bid_amount_cents+website_private.bid_increment(a.highest_bid_amount_cents) else null end,
    'commission_percent',a.commission_buyer_percent,
    'purchase_kind',case when not a.hidden_sale_price and a.buyer_id is null and a.seller_id is not null and a.reserve_price_cents>0 and coalesce(a.reserve_price_currency,'SEK')='SEK'
      then case a.lifecycle_status when 6 then 'purchase' when 10 then 'after_sale' end else null end,
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


notify pgrst,'reload schema';
commit;

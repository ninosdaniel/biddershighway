begin;

create table website_private.swish_orders (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references website_private.payments(id),
  request_id uuid not null,
  instruction_id text not null unique default upper(replace(gen_random_uuid()::text,'-','')),
  callback_identifier uuid not null default gen_random_uuid(),
  payer_alias text, provider_token text,
  status text not null default 'new' check(status in ('new','creating','CREATED','PAID','DECLINED','ERROR','CANCELLED')),
  payment_reference text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(payment_id,request_id)
);
create unique index website_one_active_swish_order on website_private.swish_orders(payment_id)
  where status in ('new','creating','CREATED','PAID');
alter table website_private.swish_orders enable row level security;

-- Only the Edge service can retrieve provider secrets. The response sent to the
-- browser is a separate projection in swish.ts.
create function public.website_swish_order(p_auth_id uuid,p_payment_id uuid,p_request_id uuid default null,p_payer_alias text default null,p_order_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; payment website_private.payments; order_row website_private.swish_orders;
begin
  actor:=website_private.resolve_user(p_auth_id);
  select * into payment from website_private.payments where id=p_payment_id and user_id=actor for update;
  if not found then raise exception 'not_found'; end if;
  if p_order_id is not null then
    select * into order_row from website_private.swish_orders where id=p_order_id and payment_id=payment.id;
    if not found then raise exception 'not_found'; end if;
  else
    if not coalesce((select value='true'::jsonb from website_private.settings where key='transactions_enabled'),false) then raise exception 'transactions_not_enabled'; end if;
    if payment.paid_at is not null then raise exception 'already_paid'; end if;
    if payment.provider is distinct from 'fortnox' or payment.provider_id is null then raise exception 'invoice_not_ready'; end if;
    if p_request_id is null or (p_payer_alias is not null and p_payer_alias !~ '^[0-9]{8,15}$') then raise exception 'invalid_phone'; end if;
    select * into order_row from website_private.swish_orders where payment_id=payment.id and request_id=p_request_id;
    if found then
      if order_row.payer_alias is distinct from p_payer_alias then raise exception 'idempotency_conflict'; end if;
    else
      select * into order_row from website_private.swish_orders where payment_id=payment.id and status in ('new','creating','CREATED','PAID');
      if not found then
        insert into website_private.swish_orders(payment_id,request_id,payer_alias)
          values(payment.id,p_request_id,p_payer_alias) returning * into order_row;
      end if;
    end if;
  end if;
  return to_jsonb(order_row)||jsonb_build_object('amount_cents',payment.amount_cents,'invoice_number',payment.provider_id,'currency',payment.currency);
end $$;

create function public.website_swish_provider(p_instruction text) returns jsonb
language sql security definer set search_path='' as $$
  select to_jsonb(s)||jsonb_build_object('amount_cents',p.amount_cents,'invoice_number',p.provider_id,'currency',p.currency)
    from website_private.swish_orders s join website_private.payments p on p.id=s.payment_id where s.instruction_id=p_instruction;
$$;

create function public.website_swish_claim(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare instruction text;
begin
  update website_private.swish_orders set status='creating',updated_at=now() where id=p_id and status='new' returning instruction_id into instruction;
  if not found then return false; end if;
  perform website_private.enqueue('swish_check','swish-reconcile:'||p_id,jsonb_build_object('instruction_id',instruction),now()+interval '181 seconds');
  return true;
end $$;

create function public.website_swish_token(p_id uuid,p_token text) returns void
language sql security definer set search_path='' as $$
  update website_private.swish_orders set provider_token=p_token where id=p_id and provider_token is null;
$$;

-- Called only after an authenticated mTLS GET of the merchant's own order.
create function public.website_swish_result(p_id uuid,p_status text,p_reference text default null) returns void
language plpgsql security definer set search_path='' as $$
declare s website_private.swish_orders; p website_private.payments; a public.auctions;
begin
  if p_status not in ('CREATED','PAID','DECLINED','ERROR','CANCELLED') then raise exception 'invalid_payment_state'; end if;
  select * into s from website_private.swish_orders where id=p_id;
  if not found then raise exception 'not_found'; end if;
  -- Match lock order with checkout creation to avoid payment/order deadlocks.
  select * into p from website_private.payments where id=s.payment_id for update;
  select * into s from website_private.swish_orders where id=p_id for update;
  if s.status='PAID' then
    if p_status='PAID' and p_reference is distinct from s.payment_reference then raise exception 'payment_reference_mismatch'; end if;
    return;
  end if;
  if s.status in ('DECLINED','ERROR','CANCELLED') then return; end if;
  if p_status='PAID' and coalesce(p_reference,'')='' then raise exception 'invalid_payment_reference'; end if;
  update website_private.swish_orders set status=p_status,payment_reference=p_reference,updated_at=now(),
    paid_at=case when p_status='PAID' then now() else null end where id=s.id;
  if p_status='PAID' then
    update website_private.payments set paid_at=coalesce(paid_at,now()) where id=p.id;
    if p.kind='buyer_commission' then
      update public.auctions set paid=true,updated_at=now() where id=p.auction_id and not paid returning * into a;
      if found then
        perform website_private.notify_user(a.buyer_id,'payment_received','payment-buyer:'||p.id,jsonb_build_object('slug',a.slug));
        perform website_private.notify_user(a.seller_id,'buyer_paid','payment-seller:'||p.id,jsonb_build_object('slug',a.slug));
      end if;
    end if;
  end if;
end $$;

create function public.website_pending_swish() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(instruction_id),'[]') from website_private.swish_orders
    where status in ('creating','CREATED') and created_at>now()-interval '7 days';
$$;

create or replace function public.website_enqueue_continuation(p_kind text,p_key text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_kind not in ('scrape_sajab_page','payment_check','swish_check','invoice_issue') then raise exception 'invalid_job'; end if;
  perform website_private.enqueue(p_kind,p_key,p_payload);
end $$;

create function public.website_own_invoice(p_auth_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; number text;
begin
  actor:=website_private.resolve_user(p_auth_id);
  select provider_id into number from website_private.payments where id=p_id and user_id=actor and provider='fortnox';
  if number is null then raise exception 'not_found'; end if;
  return jsonb_build_object('number',number);
end $$;

create function public.website_billing_customer(p_user uuid,p_number text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_number is not null then
    update public.users set fortnox_customer_id=p_number,updated_at=now() where id=p_user and fortnox_customer_id is null;
  end if;
  return (select jsonb_build_object('id',u.id,'name',u.name,'email',u.email,'customer_type',u.customer_type,'locale',u.locale,'vat_id',u.vat_id,
    'company_name',u.company_name,'company_country',u.company_country,'company_billing_email',u.company_billing_email,
    'company_address',jsonb_build_object('line1',u.company_address_line1,'line2',u.company_address_line2,'city',u.company_city,'country',u.company_country,'postal_code',u.company_postal_code,'phone',u.company_phone),
    'fortnox_customer_id',u.fortnox_customer_id,'address',ac.address)
    from public.users u left join website_private.accounts ac on ac.user_id=u.id where u.id=p_user);
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

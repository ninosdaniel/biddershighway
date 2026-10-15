-- Customer workflows omitted by the first migration. Uses the imported Rails
-- conversation/search tables so existing customer history remains available.
begin;

create function public.website_conversations(p_auth_id uuid, p_id uuid default null, p_before timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; result jsonb;
begin
  actor:=website_private.resolve_user(p_auth_id);
  if p_id is not null and not exists(select 1 from public.conversation_users where conversation_id=p_id and user_id=actor) then
    raise exception 'not_found';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
    select c.id,c.updated_at,cl.slug,l.name as title,
      (select cm.body from public.conversation_messages cm where cm.conversation_id=c.id order by cm.created_at desc,cm.id desc limit 1) as preview
    from public.conversations c join public.conversation_users cu on cu.conversation_id=c.id
    join public.classifieds cl on cl.id=c.classified_id join public.lots l on l.id=cl.lot_id
    where cu.user_id=actor order by c.updated_at desc,c.id limit 100
  ) x;
  return jsonb_build_object('conversations',result,'messages',case when p_id is null then '[]'::jsonb else
    coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from (
      select m.id,m.body,m.created_at,m.user_id=actor as own,
        coalesce(nullif(u.username,''),case when m.user_id=l.seller_id then 'Seller' else 'Buyer' end) as sender
      from public.conversation_messages m join public.users u on u.id=m.user_id
      join public.conversations c on c.id=m.conversation_id join public.classifieds cl on cl.id=c.classified_id
      join public.lots l on l.id=cl.lot_id
      where m.conversation_id=p_id and (p_before is null or m.created_at<p_before)
      order by m.created_at desc,m.id desc limit 100
    ) x),'[]') end);
end $$;

create function public.website_customer_command(p_auth_id uuid,p_action text,p_input jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid; prior website_private.requests; result jsonb; conversation_id uuid; message_id uuid;
  seller_id uuid; classified_id uuid; body text; recipient record; term text; search_id uuid; u public.users;
begin
  actor:=website_private.resolve_user(p_auth_id);
  select * into u from public.users where id=actor;
  if p_request_id is null then raise exception 'request_id_required'; end if;
  insert into website_private.requests(actor,request_id,action,input) values(actor::text,p_request_id,p_action,p_input) on conflict do nothing;
  select * into prior from website_private.requests where requests.actor=actor::text and request_id=p_request_id for update;
  if prior.action<>p_action or prior.input<>p_input then raise exception 'idempotency_conflict'; end if;
  if prior.result is not null then return prior.result; end if;
  case p_action
  when 'conversation_start','conversation_reply' then
    body:=trim(p_input->>'body');
    if body is null or length(body) not between 1 and 5000 then raise exception 'invalid_message'; end if;
    if p_action='conversation_start' then
      select c.id,l.seller_id into classified_id,seller_id from public.classifieds c join public.lots l on l.id=c.lot_id
        where c.slug=p_input->>'slug' and c.published_status=1 and c.lifecycle_status='live' for share of c;
      if classified_id is null or seller_id is null then raise exception 'not_found'; end if;
      if seller_id=actor then raise exception 'own_listing'; end if;
      -- resolve_user serializes requests for this actor, including duplicate starts.
      select c.id into conversation_id from public.conversations c
        where c.classified_id=classified_id
          and exists(select 1 from public.conversation_users cu where cu.conversation_id=c.id and cu.user_id=actor)
          and exists(select 1 from public.conversation_users cu where cu.conversation_id=c.id and cu.user_id=seller_id)
        order by c.created_at limit 1;
      if conversation_id is null then
        insert into public.conversations(classified_id,created_at,updated_at) values(classified_id,now(),now()) returning id into conversation_id;
        insert into public.conversation_users(conversation_id,user_id,created_at,updated_at)
          values(conversation_id,actor,now(),now()),(conversation_id,seller_id,now(),now());
      end if;
    else
      conversation_id:=(p_input->>'id')::uuid;
      if not exists(select 1 from public.conversation_users cu where cu.conversation_id=conversation_id and cu.user_id=actor) then raise exception 'not_found'; end if;
    end if;
    insert into public.conversation_messages(conversation_id,user_id,body,created_at,updated_at)
      values(conversation_id,actor,body,now(),now()) returning id into message_id;
    update public.conversations set updated_at=now() where id=conversation_id;
    for recipient in select r.id,r.locale from public.conversation_users cu join public.users r on r.id=cu.user_id
      where cu.conversation_id=conversation_id and cu.user_id<>actor and not r.banned loop
      perform website_private.enqueue('email','conversation:'||message_id||':'||recipient.id,
        jsonb_build_object('user_id',recipient.id,'template','conversation_message','conversation_id',conversation_id));
      insert into public.notifications(user_id,title,text,link,created_at,updated_at) values(recipient.id,
        case recipient.locale when 'sv' then 'Nytt meddelande' when 'de' then 'Neue Nachricht' else 'New message' end,
        left(body,200),'/'||recipient.locale||'/account/conversations/'||conversation_id,now(),now());
    end loop;
    result:=jsonb_build_object('id',conversation_id,'message_id',message_id);
  when 'saved_search_create' then
    term:=trim(p_input->>'term');
    if term is null or length(term) not between 2 and 200 then raise exception 'invalid_search'; end if;
    select s.id into search_id from public.saved_searches s where lower(s.email)=lower(u.email) and lower(s.term)=lower(term) limit 1;
    if search_id is null then
      if (select count(*) from public.saved_searches where lower(email)=lower(u.email))>=100 then raise exception 'search_limit'; end if;
      insert into public.saved_searches(email,term,locale,created_at,updated_at) values(lower(u.email),term,u.locale,now(),now()) returning id into search_id;
    end if;
    result:=jsonb_build_object('id',search_id,'saved',true);
  when 'saved_search_delete' then
    delete from public.saved_searches where id=(p_input->>'id')::uuid and lower(email)=lower(u.email);
    if not found then raise exception 'not_found'; end if;
    result:='{"saved":true}';
  when 'preferences' then
    if p_input->>'locale' not in ('sv','en','de') then raise exception 'invalid_locale'; end if;
    update public.users set locale=coalesce(p_input->>'locale',locale),
      email_daily_updates=coalesce((p_input->>'email_daily_updates')::boolean,email_daily_updates),
      email_features=coalesce((p_input->>'email_features')::boolean,email_features),
      email_welcome_series=coalesce((p_input->>'email_welcome_series')::boolean,email_welcome_series),
      accepted_sms=coalesce((p_input->>'accepted_sms')::boolean,accepted_sms),updated_at=now() where id=actor;
    result:='{"saved":true}';
  when 'notification_delete' then
    delete from public.notifications where id=(p_input->>'id')::uuid and user_id=actor;
    result:='{"saved":true}';
  when 'notifications_read' then
    update public.notifications set read=true,updated_at=now() where user_id=actor and not read;
    result:='{"saved":true}';
  else raise exception 'unknown_action';
  end case;
  update website_private.requests set result=result where requests.actor=actor::text and request_id=p_request_id;
  return result;
end $$;

-- Add bid history: the previous account query only included winners and sellers.
create function public.website_account_activity(p_auth_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; u public.users;
begin
  actor:=website_private.resolve_user(p_auth_id);
  select * into u from public.users where id=actor;
  return jsonb_build_object(
    'preferences',jsonb_build_object('locale',u.locale,'email_daily_updates',u.email_daily_updates,'email_features',u.email_features,'email_welcome_series',u.email_welcome_series,'accepted_sms',u.accepted_sms),
    'saved_searches',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,term,locale,created_at from public.saved_searches where lower(email)=lower(u.email) order by created_at desc,id) x),'[]'),
    'auctions',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select a.id,a.slug,l.name as title,a.lifecycle_status as status,a.paid,a.closed_at,
        case when a.seller_id=actor then 'seller' else 'buyer' end as role,
        a.buyer_id=actor as won,(select max(b.amount_cents) from public.bids b where b.auction_id=a.id and b.user_id=actor) as own_bid_cents,
        (select max(m.amount_cents) from public.max_bids m where m.auction_id=a.id and m.user_id=actor) as own_maximum_cents
      from public.auctions a join public.lots l on l.id=a.lot_id
      where a.seller_id=actor or a.buyer_id=actor or exists(select 1 from public.bids b where b.auction_id=a.id and b.user_id=actor)
      order by a.updated_at desc,a.id limit 500
    ) x),'[]'));
end $$;

revoke all on function public.website_conversations(uuid,uuid,timestamptz),public.website_customer_command(uuid,text,jsonb,uuid),public.website_account_activity(uuid) from public,anon,authenticated;
grant execute on function public.website_conversations(uuid,uuid,timestamptz),public.website_customer_command(uuid,text,jsonb,uuid),public.website_account_activity(uuid) to service_role;
notify pgrst,'reload schema';
commit;

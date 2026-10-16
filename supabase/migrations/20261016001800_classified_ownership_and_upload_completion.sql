-- Follow-up to migrations 015/016. Keep their history intact.
-- A NULL owner must not pass a customer ownership check. Explicit staff access
-- remains unchanged. Use a distinct local name for the completed image ID;
-- a function-qualified local declaration is not a SQL table reference.
begin;

create or replace function public.website_classified_command(p_auth_id uuid,p_action text,p_input jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid; c public.classifieds; l public.lots; u public.users; prior website_private.requests;
  result jsonb; is_staff boolean; lead_id uuid; lot_id uuid; new_id uuid; price bigint; description text; title text;
begin
  actor:=website_private.resolve_user(p_auth_id);
  select * into u from public.users where id=actor;
  is_staff:=exists(select 1 from website_private.staff where auth_id=p_auth_id);
  if p_request_id is null then raise exception 'request_id_required'; end if;
  insert into website_private.requests(actor,request_id,action,input) values(actor::text,p_request_id,p_action,p_input) on conflict do nothing;
  select * into prior from website_private.requests where requests.actor=actor::text and request_id=p_request_id for update;
  if prior.action<>p_action or prior.input<>p_input then raise exception 'idempotency_conflict'; end if;
  if prior.result is not null then return prior.result; end if;
  if p_action<>'classified_create' then
    select * into c from public.classifieds where slug=p_input->>'slug' for update;
    if not found then raise exception 'not_found'; end if;
    select * into l from public.lots where id=c.lot_id for update;
    if l.seller_id is distinct from actor and not is_staff then raise exception 'not_found'; end if;
    if p_input->>'updated_at' is not null and c.updated_at<>(p_input->>'updated_at')::timestamptz then raise exception 'stale_record'; end if;
  end if;
  if p_action in ('classified_create','classified_update') then
    if p_action='classified_update' and not is_staff and (c.published_status<>0 or c.lifecycle_status='awaiting_moderation') then raise exception 'forbidden'; end if;
    title:=trim(concat_ws(' ',nullif(trim(p_input->>'manufacturer'),''),nullif(trim(p_input->>'model'),'')));
    if length(title) not between 2 and 200 or coalesce(trim(p_input->>'manufacturer'),'')='' or coalesce(trim(p_input->>'model'),'')='' then raise exception 'invalid_input'; end if;
    if coalesce(p_input->>'year','')!~'^[0-9]{4}$' or (p_input->>'year')::int not between 1886 and extract(year from now())+1 then raise exception 'invalid_input'; end if;
    if length(coalesce(trim(p_input->>'registration_number'),'')) not between 1 and 30 then raise exception 'registration_required'; end if;
    price:=(p_input->>'asking_price_cents')::bigint;
    if price is null or price not between 1 and 2147483647 then raise exception 'invalid_input'; end if;
    description:=coalesce(p_input->>'body_sv','');
    if length(description)>20000 then raise exception 'invalid_input'; end if;
    if p_action='classified_create' then
      insert into public.leads(registration_number,email,owner,user_id,classified,data_manufacturer,data_model,data_year,location,attribution,created_at,updated_at)
        values(upper(trim(p_input->>'registration_number')),u.email,u.name,actor,true,p_input->>'manufacturer',p_input->>'model',p_input->>'year',left(p_input->>'location',200),1,now(),now()) returning id into lead_id;
      insert into public.lots(name,registration_number,seller_id,lead_id,created_at,updated_at)
        values(title,upper(trim(p_input->>'registration_number')),actor,lead_id,now(),now()) returning id into lot_id;
      new_id:=gen_random_uuid();
      insert into public.classifieds(id,slug,lot_id,published_status,lifecycle_status,asking_price_cents,created_at,updated_at)
        values(new_id,trim(both '-' from regexp_replace(lower(title),'[^a-z0-9]+','-','g'))||'-'||left(new_id::text,8),lot_id,0,'hidden',price,now(),now()) returning * into c;
    end if;
    -- Only explicit vehicle fields are writable. Seller, lifecycle and staff
    -- flags submitted by the browser are deliberately ignored.
    update public.lots set name=title,registration_number=upper(trim(p_input->>'registration_number')),
      body_sv=description,excerpt_sv=left(coalesce(p_input->>'excerpt_sv',''),120),location=left(p_input->>'location',200),
      data=data||jsonb_build_object('data_manufacturer',left(p_input->>'manufacturer',100),'data_model',left(p_input->>'model',100),'data_year',p_input->>'year',
        'data_odometer',left(p_input->>'odometer',20),'data_transmission',left(p_input->>'transmission',100),'data_exterior_color',left(p_input->>'color',100)),updated_at=now() where id=c.lot_id;
    update public.classifieds set asking_price_cents=price,updated_at=now() where id=c.id;
  elsif p_action='classified_submit' then
    if c.lifecycle_status='awaiting_moderation' then raise exception 'invalid_input'; end if;
    if coalesce(l.body_sv,'')='' or coalesce(l.hero_image_filename,'')='' then raise exception 'listing_incomplete'; end if;
    update public.classifieds set published_status=0,lifecycle_status='awaiting_moderation',updated_at=now() where id=c.id;
  elsif p_action in ('classified_publish','classified_hide','classified_sold','classified_reopen') then
    if not is_staff then raise exception 'forbidden'; end if;
    if p_action='classified_publish' and (coalesce(l.body_sv,'')='' or coalesce(l.hero_image_filename,'')='') then raise exception 'listing_incomplete'; end if;
    update public.classifieds set published_status=case when p_action='classified_publish' then 1 else published_status end,
      lifecycle_status=case p_action when 'classified_publish' then 'live' when 'classified_hide' then 'hidden' when 'classified_sold' then 'sold' else 'live' end,updated_at=now() where id=c.id;
  else raise exception 'invalid_input'; end if;
  result:=jsonb_build_object('saved',true,'slug',c.slug,'id',c.id);
  update website_private.requests set result=result where requests.actor=actor::text and request_id=p_request_id;
  return result;
end $$;

create or replace function public.website_vehicle_upload(p_auth_id uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid; c public.classifieds; l public.lots; ticket website_private.uploads; album_id uuid; new_image_id uuid;
begin
  actor:=website_private.resolve_user(p_auth_id);
  if p_action='reserve' then
    select * into c from public.classifieds where slug=p_input->>'slug' for update;
  else
    select * into ticket from website_private.uploads where id=(p_input->>'id')::uuid and auth_id=p_auth_id for update;
    if not found then raise exception 'not_found'; end if;
    select * into c from public.classifieds where lot_id=ticket.lot_id order by created_at desc limit 1 for update;
  end if;
  if c.id is null then raise exception 'not_found'; end if;
  select * into l from public.lots where id=c.lot_id for update;
  if not exists(select 1 from website_private.staff where auth_id=p_auth_id) and (l.seller_id is distinct from actor or c.published_status<>0 or c.lifecycle_status='awaiting_moderation') then raise exception 'forbidden'; end if;
  if p_action='reserve' then
    if p_input->>'mime' not in ('image/jpeg','image/png','image/webp') then raise exception 'invalid_input'; end if;
    if (select count(*) from website_private.uploads where auth_id=p_auth_id and created_at>now()-interval '1 day')>=200 then raise exception 'too_many_requests'; end if;
    insert into website_private.uploads(auth_id,lot_id,filename,mime,size) values(p_auth_id,l.id,left(p_input->>'filename',200),p_input->>'mime',(p_input->>'size')::int) returning * into ticket;
  elsif p_action='complete' then
    if ticket.image_id is not null then return jsonb_build_object('id',ticket.id,'image_id',ticket.image_id); end if;
    if ticket.created_at<now()-interval '2 hours' then raise exception 'not_found'; end if;
    if coalesce(p_input->>'url','') !~ '^https://[^/]+/storage/v1/object/public/website-vehicle-images/' then raise exception 'invalid_input'; end if;
    select id into album_id from public.albums where lot_id=l.id and name='Bilder' order by created_at limit 1;
    if album_id is null then insert into public.albums(lot_id,name,created_at,updated_at) values(l.id,'Bilder',now(),now()) returning id into album_id; end if;
    insert into public.images(album_id,image_filename,position,created_at,updated_at)
      select album_id,p_input->>'url',coalesce(max(position),-1)+1,now(),now() from public.images where images.album_id=album_id returning id into new_image_id;
    update website_private.uploads set image_id=new_image_id where id=ticket.id;
    update public.lots set hero_image_filename=coalesce(nullif(hero_image_filename,''),p_input->>'url'),updated_at=now() where id=l.id;
    update public.classifieds set updated_at=now() where id=c.id;
    ticket.image_id:=new_image_id;
  elsif p_action<>'read' then raise exception 'invalid_input'; end if;
  return jsonb_build_object('id',ticket.id,'path',ticket.auth_id||'/'||ticket.id,'mime',ticket.mime,'size',ticket.size,'image_id',ticket.image_id);
end $$;

revoke all on function public.website_classified_command(uuid,text,jsonb,uuid),public.website_vehicle_upload(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.website_classified_command(uuid,text,jsonb,uuid),public.website_vehicle_upload(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;

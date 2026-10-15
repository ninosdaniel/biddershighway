begin;
create table website_private.uploads (
  id uuid primary key default gen_random_uuid(), auth_id uuid not null references auth.users(id),
  lot_id uuid not null references public.lots(id), filename text not null, mime text not null,
  size integer not null check(size between 1 and 10485760), image_id uuid,
  created_at timestamptz not null default now()
);
alter table website_private.uploads enable row level security;
revoke all on website_private.uploads from public,anon,authenticated;

create function public.website_vehicle_upload(p_auth_id uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid; c public.classifieds; l public.lots; ticket website_private.uploads; album_id uuid; image_id uuid;
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
  if not exists(select 1 from website_private.staff where auth_id=p_auth_id) and (l.seller_id<>actor or c.published_status<>0 or c.lifecycle_status='awaiting_moderation') then raise exception 'forbidden'; end if;
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
      select album_id,p_input->>'url',coalesce(max(position),-1)+1,now(),now() from public.images where images.album_id=album_id returning id into image_id;
    update website_private.uploads set image_id=website_vehicle_upload.image_id where id=ticket.id;
    update public.lots set hero_image_filename=coalesce(nullif(hero_image_filename,''),p_input->>'url'),updated_at=now() where id=l.id;
    update public.classifieds set updated_at=now() where id=c.id;
    ticket.image_id:=image_id;
  elsif p_action<>'read' then raise exception 'invalid_input'; end if;
  return jsonb_build_object('id',ticket.id,'path',ticket.auth_id||'/'||ticket.id,'mime',ticket.mime,'size',ticket.size,'image_id',ticket.image_id);
end $$;
revoke all on function public.website_vehicle_upload(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.website_vehicle_upload(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;

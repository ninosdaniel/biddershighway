begin;

-- Blog fields fall back through Swedish and English; other editorial models
-- use TotallyTranslatable's English fallback. Keep the chosen HTML unchanged.
create function website_private.editorial_text(p_record jsonb,p_field text,p_locale text,p_blog boolean default false) returns text
language sql immutable set search_path='' as $$
  select value from unnest(case when p_blog then array[p_locale,'sv','en'] else array[p_locale,'en'] end)
    with ordinality locales(locale,position)
    cross join lateral (select p_record->>(p_field||'_'||locale) as value) field
    where nullif(btrim(value),'') is not null order by position limit 1;
$$;
create function website_private.editorial_author(a public.authors,p_locale text) returns jsonb
language sql stable set search_path='' as $$
  select case when a.id is null then null else jsonb_build_object('name',a.name,'slug',a.slug,
    'description',website_private.editorial_text(to_jsonb(a),'description',p_locale)) end;
$$;
create function website_private.editorial_post(b public.blog_posts,p_locale text,p_body boolean default false) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',b.id,
    'slug',website_private.editorial_text(to_jsonb(b),'slug',p_locale,true),
    'name',website_private.editorial_text(to_jsonb(b),'name',p_locale,true),
    'excerpt',website_private.editorial_text(to_jsonb(b),'excerpt',p_locale,true),
    'body',case when p_body then website_private.editorial_text(to_jsonb(b),'body',p_locale,true) end,
    'published_at',b.published_at,'updated_at',b.updated_at,
    'image',case when b.hero_image_metadata ? 'main' then md5(b.hero_image_filename||'main') else b.hero_image_filename end,
    'thumbnail',case when b.hero_image_metadata ? 'thumb' then md5(b.hero_image_filename||'thumb') else b.hero_image_filename end,
    'slugs',jsonb_build_object('sv',website_private.editorial_text(to_jsonb(b),'slug','sv',true),
      'en',website_private.editorial_text(to_jsonb(b),'slug','en',true),'de',website_private.editorial_text(to_jsonb(b),'slug','de',true)),
    'author',(select website_private.editorial_author(a,p_locale) from public.authors a where a.id=b.author_id),
    'tags',coalesce((select jsonb_agg(distinct t.name) from public.taggings tg join public.tags t on t.id=tg.tag_id
      where tg.taggable_type='BlogPost' and tg.taggable_id=b.id and tg.context='tags'),'[]'::jsonb));
$$;
create function website_private.editorial_page(p public.pages,p_locale text,p_body boolean default false) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'slug',p.slug,
    'name',website_private.editorial_text(to_jsonb(p),'name',p_locale),
    'excerpt',website_private.editorial_text(to_jsonb(p),'meta_description',p_locale),
    'body',case when p_body then website_private.editorial_text(to_jsonb(p),'body',p_locale) end,
    'published_at',p.published_at,'updated_at',p.updated_at,
    'image',case when p.hero_image_metadata ? 'main' then md5(p.hero_image_filename||'main') else p.hero_image_filename end,
    'thumbnail',case when p.hero_image_metadata ? 'thumb' then md5(p.hero_image_filename||'thumb') else p.hero_image_filename end);
$$;

create function public.get_website_editorial(p_resource text,p_locale text default 'en',p_slug text default null,p_page integer default 1,p_tag text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b public.blog_posts; a public.authors; p public.pages; hero public.blog_posts;
  items jsonb; item_count integer; page_number integer:=greatest(1,least(coalesce(p_page,1),10000));
  selected_tag text; page_size constant integer:=15;
begin
  if p_locale is null or p_locale not in ('sv','en','de') or p_resource is null then raise exception 'invalid_input'; end if;
  if p_tag in ('collections','event','jacobs_takes','guides','our_cars','featured_cars') then selected_tag:=p_tag; end if;
  if p_resource='post' then
    select * into b from public.blog_posts x where x.published_at<=now() and p_slug in (x.slug_sv,x.slug_en,x.slug_de)
      order by case when to_jsonb(x)->>('slug_'||p_locale)=p_slug then 0 when x.slug_sv=p_slug then 1 when x.slug_en=p_slug then 2 else 3 end,x.id limit 1;
    if not found then return null; end if;
    return jsonb_build_object('kind','post','record',website_private.editorial_post(b,p_locale,true),
      'comments',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id) from
        (select c.id,c.body,c.parent_id,c.created_at,coalesce(nullif(u.username,''),'Member') as author
          from public.comments c join public.users u on u.id=c.user_id
          where c.commentable_type='BlogPost' and c.commentable_id=b.id and c.published_status=1
          order by c.created_at,c.id) c),'[]'::jsonb));
  elsif p_resource in ('posts','author') then
    if p_resource='author' then
      select * into a from public.authors where slug=p_slug;
      if not found then return null; end if;
      selected_tag:=null;
    elsif selected_tag is null then
      select * into hero from public.blog_posts x where x.published_at<=now()
        and website_private.editorial_text(to_jsonb(x),'slug',p_locale,true) is not null
        order by x.published_at desc,x.id limit 1;
    end if;
    select count(*) into item_count from public.blog_posts x where x.published_at<=now()
      and website_private.editorial_text(to_jsonb(x),'slug',p_locale,true) is not null
      and (p_resource<>'author' or x.author_id=a.id) and x.id is distinct from hero.id
      and (selected_tag is null or exists(select 1 from public.taggings tg join public.tags t on t.id=tg.tag_id
        where tg.taggable_type='BlogPost' and tg.taggable_id=x.id and tg.context='tags' and t.name=selected_tag));
    select coalesce(jsonb_agg(website_private.editorial_post(x,p_locale) order by x.published_at desc,x.id),'[]'::jsonb) into items from
      (select x.* from public.blog_posts x where x.published_at<=now()
        and website_private.editorial_text(to_jsonb(x),'slug',p_locale,true) is not null
        and (p_resource<>'author' or x.author_id=a.id) and x.id is distinct from hero.id
        and (selected_tag is null or exists(select 1 from public.taggings tg join public.tags t on t.id=tg.tag_id
          where tg.taggable_type='BlogPost' and tg.taggable_id=x.id and tg.context='tags' and t.name=selected_tag))
        order by x.published_at desc,x.id limit page_size offset (page_number-1)*page_size) x;
    return jsonb_build_object('kind',p_resource,'items',items,'total',item_count,'page',page_number,'page_size',page_size,'tag',selected_tag,
      'author',website_private.editorial_author(a,p_locale),
      'hero',case when hero.id is not null and page_number=1 then website_private.editorial_post(hero,p_locale) end,
      'podcasts',case when p_resource='posts' then coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from
        (select id,name,summary,link,image_filename as image,created_at from public.media_posts where tag=1 and published_at<=now() order by created_at,id limit 5) m),'[]'::jsonb) else '[]'::jsonb end);
  elsif p_resource='page' then
    select * into p from public.pages where slug=p_slug and published_at<=now();
    if not found then return null; end if;
    return jsonb_build_object('kind','page','record',website_private.editorial_page(p,p_locale,true),
      'parent',(select website_private.editorial_page(parent,p_locale) from public.pages parent where parent.id=p.parent_id and parent.published_at<=now()),
      'items',coalesce((select jsonb_agg(website_private.editorial_page(child,p_locale) order by child.published_at desc,child.id)
        from public.pages child where child.parent_id=p.id and child.published_at<=now()),'[]'::jsonb));
  elsif p_resource='pages' then
    select count(*) into item_count from public.pages where parent_id is null and published_at<=now();
    select coalesce(jsonb_agg(website_private.editorial_page(x,p_locale) order by x.published_at desc,x.id),'[]'::jsonb) into items
      from (select * from public.pages where parent_id is null and published_at<=now() order by published_at desc,id limit page_size offset (page_number-1)*page_size) x;
    return jsonb_build_object('kind','pages','items',items,'total',item_count,'page',page_number,'page_size',page_size);
  end if;
  raise exception 'invalid_input';
end $$;

-- Preserve original BlogPost comment targets; browser input cannot choose an
-- arbitrary polymorphic type, author, publication status, or private parent.
create function public.website_post_comment(p_auth_id uuid,p_post_id uuid,p_body text,p_parent_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid; prior website_private.requests; request_input jsonb; receipt jsonb; new_id uuid;
begin
  v_actor:=website_private.resolve_user(p_auth_id);
  if p_request_id is null or p_body is null or length(btrim(p_body)) not between 1 and 5000 then raise exception 'invalid_comment'; end if;
  request_input:=jsonb_build_object('post_id',p_post_id,'body',btrim(p_body),'parent_id',p_parent_id);
  insert into website_private.requests(actor,request_id,action,input) values(v_actor::text,p_request_id,'post_comment',request_input) on conflict do nothing;
  select * into prior from website_private.requests r where r.actor=v_actor::text and r.request_id=p_request_id for update;
  if prior.action<>'post_comment' or prior.input<>request_input then raise exception 'idempotency_conflict'; end if;
  if prior.result is not null then return prior.result; end if;
  perform id from public.blog_posts where id=p_post_id and published_at<=now() for share;
  if not found then raise exception 'not_found'; end if;
  if p_parent_id is not null then
    perform id from public.comments where id=p_parent_id and commentable_type='BlogPost' and commentable_id=p_post_id and published_status=1 for share;
    if not found then raise exception 'not_found'; end if;
  end if;
  insert into public.comments(user_id,commentable_id,commentable_type,body,parent_id,published_status,created_at,updated_at)
    values(v_actor,p_post_id,'BlogPost',btrim(p_body),p_parent_id,1,now(),now()) returning id into new_id;
  receipt:=jsonb_build_object('id',new_id,'published',true);
  update website_private.requests r set result=receipt where r.actor=v_actor::text and r.request_id=p_request_id;
  return receipt;
end $$;

revoke all on function website_private.editorial_text(jsonb,text,text,boolean),website_private.editorial_author(public.authors,text),website_private.editorial_post(public.blog_posts,text,boolean),website_private.editorial_page(public.pages,text,boolean) from public,anon,authenticated;
revoke all on function public.get_website_editorial(text,text,text,integer,text) from public;
grant execute on function public.get_website_editorial(text,text,text,integer,text) to anon,authenticated,service_role;
revoke all on function public.website_post_comment(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.website_post_comment(uuid,uuid,text,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;

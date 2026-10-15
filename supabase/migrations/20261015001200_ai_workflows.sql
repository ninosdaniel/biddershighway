begin;
-- Staff access is granted explicitly; imported roles and browser metadata do
-- not confer administrative privileges in the replacement application.
create table website_private.staff (
  auth_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table website_private.ai_runs (
  id uuid primary key default gen_random_uuid(), auth_id uuid not null references auth.users(id),
  kind text not null, record_id uuid not null, request_id uuid not null,
  source jsonb not null, stage text not null, context jsonb not null default '{}',
  result jsonb, applied_at timestamptz, created_at timestamptz not null default now(),
  unique(auth_id,request_id)
);
alter table website_private.staff enable row level security;
alter table website_private.ai_runs enable row level security;
revoke all on website_private.staff,website_private.ai_runs from public,anon,authenticated;
insert into website_private.settings(key,value) values('ai_enabled','false');

create function website_private.require_staff(p_auth_id uuid) returns uuid
language plpgsql set search_path='' as $$
declare actor uuid;
begin
  actor:=website_private.resolve_user(p_auth_id);
  if not exists(select 1 from website_private.staff where auth_id=p_auth_id) then raise exception 'forbidden'; end if;
  return actor;
end $$;

create function website_private.ai_source(p_kind text,p_id uuid) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb;
begin
  if p_kind='lead_valuation' then
    select jsonb_build_object('id',id,'updated_at',updated_at,'manufacturer',data_manufacturer,'model',data_model,
      'year',data_year,'odometer',data_odometer,'condition',condition,'originality',originality,'comment',comment,
      'vehicle_type',vehicle_type,'placeholder',registration_number in ('COLLECTION','ESTATE','SAMLING','DDSBO'),
      'car_info_valuation_cents',car_info_valuation_cents,'name',concat_ws(' ',data_year,data_manufacturer,data_model))
    into result from public.leads where id=p_id;
  elsif p_kind in ('lot_text','lot_summary','lot_translate','classified_classify','classified_text') then
    select jsonb_build_object('id',l.id,'updated_at',l.updated_at,'name',l.name,'body_sv',l.body_sv,
      'excerpt_sv',l.excerpt_sv,'valuation_notes_sv',l.valuation_notes_sv,
      'data',l.data-'data_vin','questionnaire',case when p_kind='lot_text' then
        (select jsonb_build_object('answers',q.answers,'updated_at',q.updated_at) from public.questionnaires q where q.lead_id=l.lead_id) else null end,
      'categories',coalesce((select jsonb_agg(t.name) from public.tags t join public.taggings tg on tg.tag_id=t.id where tg.taggable_id=l.id and tg.taggable_type='Lot' and tg.context='categories'),'[]'))
      into result from public.lots l where id=p_id;
  elsif p_kind='brand_summary' then
    select jsonb_build_object('id',id,'updated_at',updated_at,'name',name,'brand',name,'vehicles',case when vehicle_type=1 then 'motorcyklar' else 'bilar' end,
      'inventory',coalesce((select jsonb_agg(jsonb_build_object('name',l.name,'year',l.data->>'data_year')) from public.lots l
        where lower(l.data->>'data_manufacturer')=lower(b.name)),'[]')) into result from public.brands b where id=p_id;
  elsif p_kind='model_summary' then
    select jsonb_build_object('id',m.id,'updated_at',m.updated_at,'name',m.name,'model',m.name,'brand',b.name,'vehicles',case when b.vehicle_type=1 then 'motorcyklar' else 'bilar' end,
      'inventory',coalesce((select jsonb_agg(jsonb_build_object('name',l.name,'year',l.data->>'data_year')) from public.lots l
        where lower(l.data->>'data_manufacturer')=lower(b.name) and lower(l.data->>'data_model')=lower(m.name)),'[]'))
      into result from public.vehicle_models m join public.brands b on b.id=m.brand_id where m.id=p_id;
  elsif p_kind='blog_translate' then
    select jsonb_build_object('id',id,'updated_at',updated_at,'name',name_sv,'excerpt',excerpt_sv,'body',body_sv,'source','Swedish','targets','English and German')
      into result from public.blog_posts where id=p_id;
  elsif p_kind='page_translate' then
    select jsonb_build_object('id',id,'updated_at',updated_at,'body_sv',body_sv) into result from public.pages where id=p_id;
  else raise exception 'invalid_input'; end if;
  if result is null then raise exception 'not_found'; end if;
  return result;
end $$;

create function public.website_staff_data(p_auth_id uuid,p_resource text default 'leads',p_id uuid default null,p_query text default '',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; table_name text; label text;
begin
  perform website_private.require_staff(p_auth_id);
  if p_resource='ai_runs' then
    return coalesce((select jsonb_agg(to_jsonb(x)) from (
      select r.id,r.kind,r.record_id,r.stage,r.result,r.applied_at,r.created_at,r.source,
        (select j.status from website_private.jobs j where j.payload->>'run_id'=r.id::text order by j.created_at desc limit 1) as job_status,
        (select j.last_error from website_private.jobs j where j.payload->>'run_id'=r.id::text order by j.created_at desc limit 1) as last_error
      from website_private.ai_runs r where p_id is null or r.id=p_id order by r.created_at desc limit 50 offset (greatest(p_page,1)-1)*50
    ) x),'[]');
  end if;
  if p_resource not in ('leads','lots','brands','vehicle_models','blog_posts','pages','sales_reports') then raise exception 'invalid_input'; end if;
  table_name:=p_resource;
  label:=case when p_resource='leads' then 'concat_ws('' '',data_year,data_manufacturer,data_model,registration_number)'
    when p_resource in ('pages','blog_posts') then 'name_sv' else 'name' end;
  execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]'') from (select id,%s as name,updated_at from public.%I where ($1 is null or id=$1) and ($2='''' or %s ilike ''%%''||$2||''%%'') order by updated_at desc,id limit 50 offset $3) x',label,table_name,label)
    into result using p_id,left(p_query,200),(greatest(p_page,1)-1)*50;
  return result;
end $$;

create function public.website_ai_request(p_auth_id uuid,p_kind text,p_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r website_private.ai_runs; snapshot jsonb;
begin
  perform website_private.require_staff(p_auth_id);
  select * into r from website_private.ai_runs where auth_id=p_auth_id and request_id=p_request_id;
  if found then
    if r.kind<>p_kind or r.record_id<>p_id then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('id',r.id,'stage',r.stage);
  end if;
  if not coalesce((select value='true'::jsonb from website_private.settings where key='ai_enabled'),false) then raise exception 'ai_not_enabled'; end if;
  snapshot:=website_private.ai_source(p_kind,p_id);
  if p_kind='lot_text' and snapshot->'questionnaire'='null'::jsonb then raise exception 'invalid_input'; end if;
  insert into website_private.ai_runs(auth_id,kind,record_id,request_id,source,stage)
    values(p_auth_id,p_kind,p_id,p_request_id,snapshot,case when p_kind='lead_valuation' then 'queries' else 'generate' end) returning * into r;
  perform website_private.enqueue('ai','ai:'||r.id||':'||r.stage,jsonb_build_object('run_id',r.id,'stage',r.stage));
  return jsonb_build_object('id',r.id,'stage',r.stage);
end $$;

create function public.website_ai_run(p_id uuid) returns jsonb
language sql security definer set search_path='' as $$ select to_jsonb(r) from website_private.ai_runs r where id=p_id
  and exists(select 1 from website_private.staff where auth_id=r.auth_id)
  and exists(select 1 from auth.users where id=r.auth_id and email_confirmed_at is not null)
  and not exists(select 1 from website_private.accounts a join public.users u on u.id=a.user_id where a.auth_id=r.auth_id and u.banned) $$;

-- Each model call is a separate leased job. Retrying a completed stage cannot
-- repeat a transition, overwrite a newer result, or create duplicate reports.
create function public.website_ai_advance(p_id uuid,p_stage text,p_context jsonb,p_result jsonb default null,p_job_id uuid default null,p_lease uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare r website_private.ai_runs; next_stage text;
begin
  if not exists(select 1 from website_private.jobs where id=p_job_id and lease_token=p_lease and status='running' and lease_until>now()
    and payload->>'run_id'=p_id::text and payload->>'stage'=p_stage) then raise exception 'stale_record'; end if;
  select * into r from website_private.ai_runs where id=p_id for update;
  if not found then raise exception 'not_found'; end if;
  if r.stage<>p_stage then return; end if;
  next_stage:=case when p_result is not null then 'ready' when p_stage='queries' then 'qualify' when p_stage='qualify' then 'value' else null end;
  if next_stage is null then raise exception 'invalid_input'; end if;
  update website_private.ai_runs set context=context||p_context,result=p_result,stage=next_stage where id=p_id;
  if next_stage<>'ready' then perform website_private.enqueue('ai','ai:'||p_id||':'||next_stage,jsonb_build_object('run_id',p_id,'stage',next_stage)); end if;
end $$;

create function public.website_reported_candidates(p_tokens text[],p_makes text[] default '{}',p_year integer default null) returns jsonb
language sql security definer set search_path='' as $$
  with candidates as (
    (select r.* from public.reported_auctions r where closed_at between '2000-01-01' and now()
      and exists(select 1 from unnest(p_tokens[1:30]) t where length(t)>=2 and strpos(lower(search_tokens),lower(t))>0)
      order by closed_at desc limit 300)
    union
    (select r.* from public.reported_auctions r where closed_at between '2000-01-01' and now() and make=any(p_makes)
      order by abs(coalesce(year,0)-coalesce(p_year,0)),closed_at desc limit 200)
    union
    (select r.* from public.reported_auctions r where closed_at between '2000-01-01' and now()
      and exists(select 1 from unnest(p_tokens[1:30]) t where length(t)>=4 and t~'^[a-z]+$' and strpos(lower(body),lower(t))>0)
      order by closed_at desc limit 100)
  ) select coalesce(jsonb_agg(to_jsonb(c)),'[]') from candidates c;
$$;

create function public.website_ai_apply(p_auth_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r website_private.ai_runs; snapshot jsonb; result jsonb; report_id uuid; comparison jsonb; field text; columns text[]; target text; statement text;
begin
  perform website_private.require_staff(p_auth_id);
  select * into r from website_private.ai_runs where id=p_id for update;
  if not found then raise exception 'not_found'; end if;
  if r.applied_at is not null then return jsonb_build_object('saved',true); end if;
  if r.stage<>'ready' then raise exception 'invalid_input'; end if;
  -- Lock the destination before comparing the snapshot. A human edit made
  -- while Claude runs wins; the operator must request a fresh generation.
  target:=case when r.kind='lead_valuation' then 'leads' when r.kind='brand_summary' then 'brands'
    when r.kind='model_summary' then 'vehicle_models' when r.kind='blog_translate' then 'blog_posts'
    when r.kind='page_translate' then 'pages' else 'lots' end;
  execute format('select id from public.%I where id=$1 for update',target) using r.record_id;
  snapshot:=website_private.ai_source(r.kind,r.record_id);
  if snapshot<>r.source then raise exception 'stale_record'; end if;
  result:=r.result;
  if r.kind='lead_valuation' then
    if jsonb_typeof(result->'qualified')<>'boolean' or jsonb_typeof(result->'confidence')<>'number'
      or (result->>'confidence')::numeric not between 0 and 1 then raise exception 'invalid_input'; end if;
    if result->>'estimated_value' is not null and ((result->>'estimated_value')::numeric not between 0 and 21474836 or (result->>'estimated_value')!~'^[0-9]+$') then raise exception 'invalid_input'; end if;
    if jsonb_array_length(coalesce(result->'matches','[]'))>0 then
      -- Only comparison IDs retrieved for this run may be included.
      for comparison in select value from jsonb_array_elements(result->'matches') loop
        if not exists(select 1 from jsonb_array_elements(r.context->'comparisons') c where c->>'id'=comparison->>'id') then raise exception 'invalid_input'; end if;
      end loop;
      insert into public.sales_reports(name,source,valuation_cents,valuation_currency,reasoning,created_at,updated_at)
        values(r.source->>'name','llm',((result->>'estimated_value')::bigint*100)::integer,'SEK',result->>'reasoning',now(),now()) returning id into report_id;
      insert into public.sales_report_reported_auctions(sales_report_id,reported_auction_id,created_at,updated_at)
        select report_id,(value->>'id')::uuid,now(),now() from jsonb_array_elements(result->'matches') on conflict do nothing;
    end if;
    update public.leads set qualification_result_data=result-'matches',sales_report_id=coalesce(report_id,sales_report_id),updated_at=now() where id=r.record_id;
  else
    columns:=case r.kind
      when 'lot_text' then array['body_sv'] when 'lot_summary' then array['excerpt_sv']
      when 'lot_translate' then array['body_en','body_de','excerpt_en','excerpt_de','valuation_notes_en','valuation_notes_de']
      when 'classified_text' then array['body_en','body_de','excerpt_sv','excerpt_en','excerpt_de']
      when 'brand_summary' then array['summary_sv','summary_en','summary_de']
      when 'model_summary' then array['summary_sv','summary_en','summary_de']
      when 'blog_translate' then array['name_en','name_de','body_en','body_de','excerpt_en','excerpt_de']
      when 'page_translate' then array['body_en','body_de']
      when 'classified_classify' then array[]::text[] else null end;
    if columns is null then raise exception 'invalid_input'; end if;
    statement:='updated_at=now()';
    foreach field in array columns loop
      if jsonb_typeof(result->field)<>'string' or not result ? field then raise exception 'invalid_input'; end if;
      statement:=statement||format(',%I=$1->>%L',field,field);
    end loop;
    execute format('update public.%I set %s where id=$2',target,statement) using result,r.record_id;
    -- Curated categories outrank model suggestions, as in WriteLotSummaryJob.
    if result ? 'categories' and not exists(select 1 from public.taggings where taggable_id=r.record_id and taggable_type='Lot' and context='categories') then
      for field in select jsonb_array_elements_text(result->'categories') loop
        perform pg_advisory_xact_lock(hashtextextended('category:'||field,0));
        insert into public.tags(name,taggings_count,created_at,updated_at) select field,0,now(),now() where not exists(select 1 from public.tags where name=field);
        insert into public.taggings(tag_id,taggable_id,taggable_type,context,created_at)
          select id,r.record_id,'Lot','categories',now() from public.tags where name=field limit 1;
        update public.tags t set taggings_count=(select count(*) from public.taggings tg where tg.tag_id=t.id),updated_at=now() where name=field;
      end loop;
    end if;
  end if;
  update website_private.ai_runs set applied_at=now() where id=p_id;
  return jsonb_build_object('saved',true,'report_id',report_id);
end $$;

-- AI can be accepted independently of financial writes and outbound mail.
create or replace function public.website_claim_jobs(p_limit integer default 10) returns setof website_private.jobs
language sql security definer set search_path='' as $$
  with exhausted as (
    update website_private.jobs set status='failed',lease_until=null,lease_token=null,last_error='worker_lease_expired'
      where status='running' and lease_until<now() and attempts>=8 returning id
  ) update website_private.jobs j set status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid()
  where id in (select id from website_private.jobs where
    (status='pending' and available_at<=now() or status='running' and lease_until<now()) and attempts<8
    and coalesce((select value='true'::jsonb from website_private.settings where key=case when kind='ai' then 'ai_enabled' else 'jobs_enabled' end),false)
    order by available_at for update skip locked limit least(greatest(p_limit,1),20)) returning j.*;
$$;

revoke all on function website_private.require_staff(uuid),website_private.ai_source(text,uuid) from public,anon,authenticated;
revoke all on function public.website_staff_data(uuid,text,uuid,text,integer),public.website_ai_request(uuid,text,uuid,uuid),public.website_ai_run(uuid),public.website_ai_advance(uuid,text,jsonb,jsonb,uuid,uuid),public.website_reported_candidates(text[],text[],integer),public.website_ai_apply(uuid,uuid) from public,anon,authenticated;
grant execute on function public.website_staff_data(uuid,text,uuid,text,integer),public.website_ai_request(uuid,text,uuid,uuid),public.website_ai_run(uuid),public.website_ai_advance(uuid,text,jsonb,jsonb,uuid,uuid),public.website_reported_candidates(text[],text[],integer),public.website_ai_apply(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;

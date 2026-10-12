-- pg_cron/pg_net are Supabase extensions. Business tests run migrations 002-004
-- in PGlite; this deployment migration requires a Supabase Postgres instance.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function website_private.schedule_due() returns void
language plpgsql security definer set search_path='' as $$
declare local_now timestamp:=now() at time zone 'Europe/Stockholm'; item record; bucket text;
begin
  if not (select value='true'::jsonb from website_private.settings where key='jobs_enabled') then return; end if;
  perform public.website_schedule('refresh_listings','refresh:'||date_trunc('minute',now()));
  for item in select * from (values
    ('generate_sitemap',time '03:00'),('compute_interests',time '04:30'),('daily_update',time '08:30'),
    ('scrape_bilweb',time '06:03'),('scrape_sajab',time '06:33')) as tasks(kind,due) loop
    if local_now::time>=item.due and (item.kind not like 'scrape_%' or extract(isodow from local_now)=5) then
      perform public.website_schedule(item.kind,item.kind||':'||local_now::date);
    end if;
  end loop;
  bucket:=floor(extract(epoch from now()-interval '7 minutes')/900)::bigint::text;
  perform public.website_schedule('sync_payments','payments:'||bucket);
end $$;

create function website_private.invoke_worker() returns bigint
language plpgsql security definer set search_path='' as $$
declare origin text; secret text; request_id bigint;
begin
  if not (select value='true'::jsonb from website_private.settings where key='jobs_enabled') then return null; end if;
  select decrypted_secret into origin from vault.decrypted_secrets where name='website_project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='website_cron_secret';
  if origin is null or secret is null then raise exception 'Website scheduler secrets are not configured in Vault'; end if;
  select net.http_post(url:=origin||'/functions/v1/website-cron',headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=55000) into request_id;
  return request_id;
end $$;
revoke all on function website_private.schedule_due() from public,anon,authenticated;
revoke all on function website_private.invoke_worker() from public,anon,authenticated;

-- Jobs are deliberately disabled by the runtime settings until cutover. All
-- schedules are installed now, and can be inspected without making requests.
select cron.schedule('website-auction-clock','1 second','select public.website_tick()');
select cron.schedule('website-schedules','* * * * *','select website_private.schedule_due()');
select cron.schedule('website-worker','10 seconds','select website_private.invoke_worker()');
select cron.alter_job(job_id:=jobid,active:=false) from cron.job where jobname in ('website-auction-clock','website-schedules','website-worker');
commit;

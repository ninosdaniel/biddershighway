-- Supabase-only scheduler adapter. No cron entries or processing flags enabled.
begin;
create or replace function website_private.invoke_worker() returns bigint
language plpgsql security definer set search_path='' as $$
declare origin text; secret text; gateway_key text; request_id bigint;
begin
  if not exists(select 1 from website_private.settings where key in ('jobs_enabled','ai_enabled') and value='true'::jsonb) then return null; end if;
  select decrypted_secret into origin from vault.decrypted_secrets where name='website_project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='website_cron_secret';
  select decrypted_secret into gateway_key from vault.decrypted_secrets where name='website_publishable_key';
  if nullif(origin,'') is null or nullif(secret,'') is null or nullif(gateway_key,'') is null then raise exception 'Website scheduler gateway and worker configuration is missing from Vault'; end if;
  select net.http_post(url:=origin||'/functions/v1/website-cron',headers:=jsonb_build_object('Content-Type','application/json','apikey',gateway_key,'x-cron-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=110000) into request_id;
  return request_id;
end $$;
revoke all on function website_private.invoke_worker() from public,anon,authenticated;
commit;

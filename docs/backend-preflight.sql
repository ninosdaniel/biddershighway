-- Read-only schema and extension inventory; no data or credentials selected.
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name in
 ('users','auctions','lots','bids','max_bids','offers','bookmarks','leads',
  'notifications','comments','albums','images','tags','taggings','user_interests')
order by table_name,ordinal_position;

select extname,extversion from pg_extension
where extname in ('pg_cron','pg_net','supabase_vault');
select schemaname,matviewname from pg_matviews where schemaname='public';
select schemaname,viewname from pg_views where schemaname='public' and viewname='live_listings';
select proname,pg_get_function_identity_arguments(oid) from pg_proc
where pronamespace='public'::regnamespace and (proname like 'website_%' or proname='get_website_listings');

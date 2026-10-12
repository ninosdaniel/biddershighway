-- Apply as postgres after approving public read access to published listings.
-- The existing live_listings view enforces published_status = 1 and the allowed
-- auction/classified lifecycle states. Its underlying tables keep their RLS and
-- existing grants. This function exposes only the fields the website needs.
begin;

create function public.get_website_listings()
returns table (
  id uuid,
  listing_type text,
  slug text,
  title text,
  description text,
  location text,
  hero_image_filename text,
  lifecycle_status text,
  listed_at timestamptz,
  ends_at timestamptz,
  reserve_lowered boolean,
  price_cents bigint,
  price_currency text,
  hidden_sale_price boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    listing.id,
    listing.listing_type::text,
    listing.slug::text,
    listing.title::text,
    listing.description::text,
    listing.location::text,
    listing.hero_image_filename::text,
    listing.lifecycle_status::text,
    listing.listed_at::timestamptz,
    listing.ends_at::timestamptz,
    listing.reserve_lowered,
    case when listing.hidden_sale_price then null else listing.price_cents::bigint end,
    listing.price_currency::text,
    listing.hidden_sale_price
  from public.live_listings as listing;
$function$;

-- Functions otherwise default to executable by PUBLIC. No write operations or
-- grants on auctions, classifieds, lots, or live_listings are added here.
revoke all on function public.get_website_listings() from public, anon, authenticated;
grant execute on function public.get_website_listings() to anon, authenticated;

comment on function public.get_website_listings() is
  'Public read-only listing cards. Uses the publication rules in live_listings; masks hidden sale prices and excludes reserve prices, registration numbers and private account data.';

notify pgrst, 'reload schema';
commit;

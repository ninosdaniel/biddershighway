begin;
-- Hidden sale prices also hide derived bid thresholds and reserve status.
create or replace function public.get_website_auction(p_slug text,p_locale text default 'en') returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'slug',a.slug,'title',concat_ws(' ',l.data->>'year',l.name),
    'body',case p_locale when 'sv' then l.body_sv when 'de' then l.body_de else l.body_en end,
    'location',l.location,'data',jsonb_build_object('year',l.data->>'year','manufacturer',l.data->>'manufacturer','model',l.data->>'model','odometer',l.data->>'odometer','transmission',l.data->>'transmission','color',l.data->>'color'),
    'hero_image_filename',l.hero_image_filename,'status',a.lifecycle_status,'closed_at',a.closed_at,
    'amount_cents',case when a.hidden_sale_price then null when a.lifecycle_status=9 then a.sale_price_cents else a.highest_bid_amount_cents end,
    'reserve_met',case when a.hidden_sale_price then null else a.highest_bid_amount_cents>=coalesce(a.reserve_price_cents,0) end,
    'minimum_bid_cents',case when not a.hidden_sale_price and a.lifecycle_status in (2,3,6) then a.highest_bid_amount_cents+website_private.bid_increment(a.highest_bid_amount_cents) else null end,
    'commission_percent',a.commission_buyer_percent,
    'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'filename',i.image_filename,'album',al.name) order by al.name,i.position)
      from public.images i join public.albums al on al.id=i.album_id where al.lot_id=l.id),'[]'::jsonb),
    'bids',case when a.hidden_sale_price then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(b)) from
      (select b.amount_cents,b.created_at,coalesce(u.username,'Bidder') as bidder from public.bids b join public.users u on u.id=b.user_id where b.auction_id=a.id order by b.amount_cents desc,b.created_at desc limit 100) b),'[]'::jsonb) end,
    'comments',coalesce((select jsonb_agg(to_jsonb(c)) from
      (select c.id,c.body,c.created_at,c.parent_id,coalesce(u.username,'Member') as author from public.comments c join public.users u on u.id=c.user_id where c.commentable_id=a.id and c.commentable_type='Auction' and c.published_status=1 order by c.created_at limit 200) c),'[]'::jsonb))
  from public.auctions a join public.lots l on l.id=a.lot_id
  where a.slug=p_slug and a.published_status=1 and a.lifecycle_status in (2,3,4,6,7,9,10);
$$;
revoke all on function public.get_website_auction(text,text) from public;
grant execute on function public.get_website_auction(text,text) to anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;

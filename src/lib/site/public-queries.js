// Explicit public projections only. Never serialize raw lots, leads, or users.
// Executed exclusively inside BEGIN READ ONLY by read-database.js.
export const catalogSql = `
SELECT p.*, coalesce(nullif(CASE $1 WHEN 'sv' THEN l.excerpt_sv WHEN 'de' THEN l.excerpt_de ELSE l.excerpt_en END,''),p.description) AS description,
  CASE WHEN l.hero_image_metadata ? 'thumb' THEN md5(l.hero_image_filename || 'thumb') ELSE l.hero_image_filename END AS hero_image_filename,
  coalesce((SELECT jsonb_agg(DISTINCT t.name) FROM public.taggings tg JOIN public.tags t ON t.id=tg.tag_id
    WHERE tg.context='categories' AND ((tg.taggable_type='Lot' AND tg.taggable_id=l.id) OR (tg.taggable_type='Auction' AND tg.taggable_id=a.id) OR (tg.taggable_type='Classified' AND tg.taggable_id=c.id))), '[]'::jsonb) AS categories,
  l.data->>'data_manufacturer' AS manufacturer, l.data->>'data_model' AS model, l.vehicle_type,
  CASE WHEN p.listing_type='auction' AND NOT p.hidden_sale_price AND p.lifecycle_status IN ('coming_soon','live') THEN coalesce(a.reserve_price_cents,0)=0 ELSE false END AS no_reserve,
  CASE WHEN p.listing_type='auction' AND NOT p.hidden_sale_price AND p.lifecycle_status IN ('coming_soon','live') THEN a.reserve_price_cents>0 AND a.highest_bid_amount_cents>=a.reserve_price_cents ELSE false END AS reserve_met,
  CASE WHEN p.listing_type='auction' AND NOT p.hidden_sale_price AND p.lifecycle_status IN ('coming_soon','live') THEN a.reserve_price_cents>0 AND a.highest_bid_amount_cents<a.reserve_price_cents AND a.highest_bid_amount_cents>=a.reserve_price_cents*(CASE WHEN a.reserve_price_cents<=15000000 THEN 0.75 ELSE 0.85 END) ELSE false END AS reserve_close
FROM public.get_website_listings() p
LEFT JOIN public.auctions a ON p.listing_type='auction' AND a.id=p.id
LEFT JOIN public.classifieds c ON p.listing_type='classified' AND c.id=p.id
JOIN public.lots l ON l.id=coalesce(a.lot_id,c.lot_id)
ORDER BY p.listed_at DESC NULLS LAST,p.id,p.listing_type`;

export const featuredSql = `SELECT slug FROM public.auctions WHERE hero AND published_status=1 AND lifecycle_status=3 AND closed_at>now() ORDER BY closed_at LIMIT 1`;

const lotPublicFields = `  'title',concat_ws(' ',l.data->>'data_year',l.name),
  'data',jsonb_build_object('year',l.data->>'data_year','manufacturer',l.data->>'data_manufacturer','model',l.data->>'data_model',
    'color',l.data->>'data_exterior_color','interior_color',l.data->>'data_interior_color','interior_material',l.data->>'data_interior_material',
    'engine_displacement',l.data->>'data_engine_displacement','drive',l.data->>'data_drive','propulsion',l.data->>'data_propulsion',
    'steering',l.data->>'data_steering','transmission',l.data->>'data_transmission','odometer',l.data->>'data_odometer'),
  'vin',CASE WHEN l.data->>'data_vin' IS NOT NULL THEN upper(left(l.data->>'data_vin',length(l.data->>'data_vin')/2+1)) || repeat('*',length(l.data->>'data_vin')/2) END,
  'hero_image_filename',CASE WHEN l.hero_image_metadata ? 'grid_hero' THEN md5(l.hero_image_filename || 'grid_hero') ELSE l.hero_image_filename END,
  'seller',u.username, 'vehicle_type',l.vehicle_type, 'excerpt',CASE $2 WHEN 'sv' THEN l.excerpt_sv WHEN 'de' THEN l.excerpt_de ELSE l.excerpt_en END,'estimated_value',l.estimated_value,'video_embed',l.video_embed,
  'valuation_notes',CASE $2 WHEN 'sv' THEN l.valuation_notes_sv WHEN 'de' THEN l.valuation_notes_de ELSE l.valuation_notes_en END,
  'consignor',coalesce(nullif(ld.pipedrive_owner_data->>'name',''),'Bidders Highway'),
  'images',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'album_id',al.id,'filename',i.image_filename,'album',al.name,
    'thumbnail',CASE WHEN i.image_metadata ? 'grid_thumb' THEN md5(i.image_filename || 'grid_thumb') ELSE i.image_filename END,'in_hero_grid',i.in_hero_grid)
    ORDER BY al.created_at,al.id,i.position) FROM public.images i JOIN public.albums al ON al.id=i.album_id WHERE al.lot_id=l.id),'[]'::jsonb),
  'function_test',(SELECT jsonb_build_object('vehicle_drivable',f.vehicle_drivable,'show_inspection_issue',f.show_inspection_issue,
    'show_ac_issue',f.show_ac_issue,'show_trip_meter_issue',f.show_trip_meter_issue,'show_media_issue',f.show_media_issue,
    'show_broken_electrics',f.show_broken_electrics,'show_warning_lights',f.show_warning_lights,'show_seat_belt_issue',f.show_seat_belt_issue,
    'show_lighting_issue',f.show_lighting_issue,'show_engine_issue',f.show_engine_issue,'show_brake_issue',f.show_brake_issue,
    'show_clutch_issue',f.show_clutch_issue,'show_transmission_issue',f.show_transmission_issue) FROM public.lead_forms f WHERE f.lead_id=l.lead_id LIMIT 1)`;

export const auctionSql = `
SELECT public.get_website_auction(a.slug,$2) || jsonb_build_object(
  ${lotPublicFields},
  'reserve_lowered',CASE WHEN NOT a.hidden_sale_price AND a.lifecycle_status IN (2,3) THEN a.reserve_lowered ELSE false END,
  'no_reserve',CASE WHEN NOT a.hidden_sale_price AND a.lifecycle_status IN (2,3) THEN coalesce(a.reserve_price_cents,0)=0 ELSE false END,
  'reserve_close',CASE WHEN NOT a.hidden_sale_price AND a.lifecycle_status IN (2,3) THEN a.reserve_price_cents>0 AND a.highest_bid_amount_cents<a.reserve_price_cents AND a.highest_bid_amount_cents>=a.reserve_price_cents*(CASE WHEN a.reserve_price_cents<=15000000 THEN 0.75 ELSE 0.85 END) ELSE false END
) AS auction
FROM public.auctions a JOIN public.lots l ON l.id=a.lot_id
LEFT JOIN public.users u ON u.id=a.seller_id LEFT JOIN public.leads ld ON ld.id=l.lead_id
WHERE a.slug=$1 AND a.published_status=1 AND a.lifecycle_status IN (2,3,4,6,7,9,10)`;

export const classifiedSql = `
SELECT jsonb_build_object(${lotPublicFields},
  'id',c.id,'slug',c.slug,'listing_type','classified','status',c.lifecycle_status,
  'location',l.location,'amount_cents',c.asking_price_cents,'currency',c.asking_price_currency,
  'body',CASE $2 WHEN 'sv' THEN l.body_sv WHEN 'de' THEN l.body_de ELSE l.body_en END,
  'comments',coalesce((SELECT jsonb_agg(to_jsonb(published_comment)) FROM
    (SELECT cm.id,cm.body,cm.created_at,cm.parent_id,coalesce(cu.username,'Member') AS author FROM public.comments cm
      JOIN public.users cu ON cu.id=cm.user_id WHERE cm.commentable_id=c.id AND cm.commentable_type='Classified'
      AND cm.published_status=1 ORDER BY cm.created_at LIMIT 200) published_comment),'[]'::jsonb)
) AS classified
FROM public.classifieds c JOIN public.lots l ON l.id=c.lot_id
LEFT JOIN public.users u ON u.id=l.seller_id LEFT JOIN public.leads ld ON ld.id=l.lead_id
WHERE c.slug=$1 AND c.published_status=1 AND c.lifecycle_status IN ('live','sold')`;

export const brandsSql = `
SELECT b.name,b.slug,b.aliases,b.vehicle_type,
  CASE $1 WHEN 'sv' THEN b.summary_sv WHEN 'de' THEN b.summary_de ELSE b.summary_en END AS summary,
  coalesce((SELECT jsonb_agg(jsonb_build_object('name',m.name,'slug',m.slug,'aliases',m.aliases,
    'summary',CASE $1 WHEN 'sv' THEN m.summary_sv WHEN 'de' THEN m.summary_de ELSE m.summary_en END) ORDER BY m.name)
    FROM public.vehicle_models m WHERE m.brand_id=b.id),'[]'::jsonb) AS models
FROM public.brands b ORDER BY b.name`;

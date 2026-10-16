begin;
-- Include the form type and existing lead fallbacks, without sending raw CarInfo
-- responses (which can contain owner details) to the model. Snapshot comparison
-- also protects review/apply when these inputs change.
create or replace function website_private.ai_source(p_kind text,p_id uuid) returns jsonb
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
        (select jsonb_build_object('answers',q.answers,'updated_at',q.updated_at,'form_type',q.form_type,
          'vehicle_name',concat_ws(' ',lead.data_year,lead.data_manufacturer,lead.data_model),
          'odometer',lead.data_odometer,
          'total_owners',nullif((select count(*) from jsonb_array_elements(
            case when jsonb_typeof(lead.car_info_data#>'{result,history}')='array'
            then lead.car_info_data#>'{result,history}' else '[]'::jsonb end) entry where entry->>'type'='owner'),0))
          from public.questionnaires q join public.leads lead on lead.id=q.lead_id where q.lead_id=l.lead_id) else null end,
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


revoke all on function website_private.ai_source(text,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;

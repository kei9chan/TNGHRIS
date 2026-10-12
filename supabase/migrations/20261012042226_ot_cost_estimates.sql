-- Optional OT cost estimates. Compensation values never leave this private helper
-- unless the viewer already has the existing salary-compensation permission.
create or replace function private.ot_cost_estimate(r public.ot_requests)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  scope_id uuid;
  package_row jsonb;
  rule_row jsonb;
  config jsonb;
  premium jsonb;
  category text := 'ordinary';
  rate_type text;
  currency_code text;
  requested_minutes integer;
  estimate_minutes integer;
  night_minutes integer;
  day_minutes integer;
  window_end_date date;
  night_start_time time;
  night_end_time time;
  start_ts timestamp;
  end_ts timestamp;
  night_start timestamp;
  night_end timestamp;
  day date;
  hourly numeric;
  ot_factor numeric;
  night_factor numeric;
  ot_pay numeric;
  night_ot_pay numeric;
  night_premium numeric;
  total numeric;
  night_known boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('available',false,'reason','Cost unavailable until an approved pay package is available.');
  end if;

  if r.ot_type::text = 'Offset' then
    return jsonb_build_object('available',false,'reason','Offset OT has no cash cost.');
  end if;

  scope_id := private.payroll_employee_bu_scope(r.employee_id);
  if scope_id is null or not private.payroll_package_permission(r.employee_id,scope_id,'view') then
    return jsonb_build_object('available',false,'reason','Cost unavailable for this viewer.');
  end if;

  select to_jsonb(p) into package_row
  from public.payroll_pay_packages p
  where p.employee_id=r.employee_id
    and p.scope_id=scope_id
    and p.stream='employee_payroll'
    and p.status='approved'
    and p.effective_from<=r.date
  order by p.effective_from desc,p.created_at desc
  limit 1;
  if package_row is null then
    return jsonb_build_object('available',false,'reason','No approved pay package for this work date.');
  end if;

  select to_jsonb(g) into rule_row
  from public.payroll_gross_rules g
  where g.scope_id=scope_id
    and g.effective_from<=r.date
    and (g.effective_to is null or g.effective_to>=r.date)
  order by g.effective_from desc
  limit 1;
  config := coalesce(rule_row->'config',private.payroll_statutory_gross_config());

  rate_type := upper(coalesce(package_row->>'rate_type',''));
  hourly := case rate_type
    when 'MONTHLY' then (package_row->>'base_amount')::numeric*12/nullif((config->>'annualDivisor')::numeric,0)/nullif((config->>'hoursPerDay')::numeric,0)
    when 'DAILY' then (package_row->>'base_amount')::numeric/nullif((config->>'hoursPerDay')::numeric,0)
    when 'HOURLY' then (package_row->>'base_amount')::numeric
    else null
  end;
  if hourly is null or hourly<0 then
    return jsonb_build_object('available',false,'reason','Pay package rate type is not ready for an OT estimate.');
  end if;
  currency_code := coalesce(nullif(package_row->>'currency',''),'PHP');

  requested_minutes := private.ot_requested_minutes(r);
  estimate_minutes := coalesce(
    r.final_approved_minutes,
    r.manager_confirmed_minutes,
    case when r.status::text='PendingBOD' then round(r.approved_hours*60)::integer end,
    case when r.approved_hours is not null then round(r.approved_hours*60)::integer end,
    requested_minutes
  );
  if estimate_minutes is null or estimate_minutes<=0 then
    return jsonb_build_object('available',false,'reason','OT hours are not confirmed yet.');
  end if;

  if lower(coalesce(r.paid_ot_type,'')) like '%legal holiday%' then
    category := 'regular';
  elsif lower(coalesce(r.paid_ot_type,'')) like '%special holiday%' then
    category := 'special_nonworking';
  elsif lower(coalesce(r.paid_ot_type,'')) like '%rest day%' then
    category := 'ordinary_rest';
  end if;
  premium := coalesce(config->'premiums'->category,config->'premiums'->'ordinary');
  ot_factor := coalesce((premium->>'ot')::numeric,1.25);
  night_factor := coalesce((premium->>'nightOt')::numeric,0.125);

  night_minutes := coalesce(r.final_night_minutes,r.manager_night_minutes);
  if night_minutes is not null then
    night_known := true;
  elsif r.start_time is not null and r.end_time is not null then
    night_start_time := coalesce((config->>'nightStart')::time,time '22:00');
    night_end_time := coalesce((config->>'nightEnd')::time,time '06:00');
    window_end_date := coalesce(r.end_date,r.date+case when r.end_time<r.start_time then 1 else 0 end);
    start_ts := r.date+r.start_time;
    end_ts := window_end_date+r.end_time;
    if end_ts<=start_ts then end_ts:=end_ts+interval '1 day'; end if;
    night_minutes := 0;
    for day in select gs::date from generate_series(r.date-1,window_end_date+1,interval '1 day') gs loop
      night_start := day+night_start_time;
      night_end := day+case when night_end_time<=night_start_time then 1 else 0 end+night_end_time;
      night_minutes := night_minutes+greatest(0,round(extract(epoch from (least(end_ts,night_end)-greatest(start_ts,night_start)))/60)::integer);
    end loop;
    night_known := true;
  else
    night_minutes := 0;
  end if;
  night_minutes := least(greatest(coalesce(night_minutes,0),0),estimate_minutes);
  day_minutes := greatest(estimate_minutes-night_minutes,0);
  ot_pay := round((day_minutes/60.0)*hourly*ot_factor,2);
  night_ot_pay := round((night_minutes/60.0)*hourly*ot_factor,2);
  night_premium := round((night_minutes/60.0)*hourly*night_factor,2);
  total := round(ot_pay+night_ot_pay+night_premium,2);

  return jsonb_build_object(
    'available',true,
    'estimated',r.final_approved_minutes is null,
    'currency',currency_code,
    'minutes',estimate_minutes,
    'hours',round(estimate_minutes/60.0,2),
    'nightMinutes',night_minutes,
    'nightMinutesKnown',night_known,
    'hourlyRate',round(hourly,2),
    'otPay',round(ot_pay+night_ot_pay,2),
    'nightPremium',night_premium,
    'total',total,
    'category',category,
    'source','Approved pay package + statutory/company OT rule',
    'note',case when r.final_approved_minutes is null then 'Estimate only; final approval or holiday/rest-day classification may change the amount.' when not night_known then 'Night split is not recorded; night premium is not included.' else 'Night premium is shown separately.' end
  );
end
$$;
revoke all on function private.ot_cost_estimate(public.ot_requests) from public,anon,authenticated;

do $$
declare
  ddl text;
  needle text := '''handoff'',(select jsonb_build_object(''state'',h.state,''note'',h.note,''returnNote'',h.return_note,''senderName'',u.full_name) from private.payroll_ot_handoffs h join public.hris_users u on u.id=h.sender_id where h.request_id=r.id))';
begin
  ddl:=pg_get_functiondef('public.get_ot_week_review(uuid[])'::regprocedure);
  if strpos(ddl,needle)=0 then
    raise exception 'OT review payload changed; cost estimate patch needs review.';
  end if;
  ddl:=replace(ddl,needle,'''handoff'',(select jsonb_build_object(''state'',h.state,''note'',h.note,''returnNote'',h.return_note,''senderName'',u.full_name) from private.payroll_ot_handoffs h join public.hris_users u on u.id=h.sender_id where h.request_id=r.id),''costEstimate'',private.ot_cost_estimate(r))');
  execute ddl;
end $$;

notify pgrst,'reload schema';

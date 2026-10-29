-- Detect likely monthly amounts entered as daily rates in completion-workbook packages.
-- Never silently change approved compensation; previews identify their reference source.
create or replace function private.payroll_package_rate_issue(p jsonb)
returns text language plpgsql stable security definer set search_path = '' as $$
declare profile_type text; profile_amount numeric;
begin
 if p->>'stream' is distinct from 'employee_payroll'
   or p->>'source_ref' is distinct from 'Employee Profile & Pay Package Completion — draft setup'
   or p->>'rate_type' is distinct from 'Daily' then return null;end if;
 select u.rate_type,u.rate_amount into profile_type,profile_amount from public.hris_users u where u.id=(p->>'employee_id')::uuid;
 if profile_type='Daily' and profile_amount>0 and (p->>'base_amount')::numeric>=profile_amount*10 then
   return 'Imported daily pay package conflicts with the employee profile. Review the amount and salary basis in Pay Package Builder before payroll.';
 end if;
 return null;
end $$;
revoke all on function private.payroll_package_rate_issue(jsonb) from public,anon,authenticated;

-- Optional OT cost estimates. Compensation values never leave this private helper
-- unless the viewer already has the existing salary-compensation permission.
create or replace function private.ot_cost_estimate(r public.ot_requests)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_scope_id uuid;
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
  rate_issue text;
  profile_daily numeric;
  hours_per_day numeric;
  requires_pay_review boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('available',false,'reason','Cost unavailable until an approved pay package is available.');
  end if;

  if r.ot_type::text = 'Offset' then
    return jsonb_build_object('available',false,'reason','Offset OT has no cash cost.');
  end if;

  v_scope_id := private.payroll_employee_bu_scope(r.employee_id);
  if v_scope_id is null or not private.payroll_package_permission(r.employee_id,v_scope_id,'view') then
    return jsonb_build_object('available',false,'reason','Cost unavailable for this viewer.');
  end if;

  select to_jsonb(p) into package_row
  from public.payroll_pay_packages p
  where p.employee_id=r.employee_id
    and p.scope_id=v_scope_id
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
  where g.scope_id=v_scope_id
    and g.effective_from<=r.date
    and (g.effective_to is null or g.effective_to>=r.date)
  order by g.effective_from desc
  limit 1;
  config := coalesce(rule_row->'config',private.payroll_statutory_gross_config());

  rate_issue := private.payroll_package_rate_issue(package_row);
  if rate_issue is not null then
    select u.rate_amount into profile_daily from public.hris_users u where u.id=r.employee_id and u.rate_type='Daily';
    if profile_daily is null or profile_daily<=0 then return jsonb_build_object('available',false,'reason',rate_issue);end if;
    package_row := package_row||jsonb_build_object('base_amount',profile_daily);
    requires_pay_review := true;
  end if;
  hours_per_day := (config->>'hoursPerDay')::numeric;
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
    'estimated',requires_pay_review or r.final_approved_minutes is null,
    'requiresPayReview',requires_pay_review,
    'rateType',initcap(rate_type),
    'baseAmount',(package_row->>'base_amount')::numeric,
    'hoursPerDay',hours_per_day,
    'otFactor',ot_factor,
    'currency',currency_code,
    'minutes',estimate_minutes,
    'hours',round(estimate_minutes/60.0,2),
    'nightMinutes',night_minutes,
    'nightMinutesKnown',night_known,
    'hourlyRate',round(hourly,6),
    'otPay',round(ot_pay+night_ot_pay,2),
    'nightPremium',night_premium,
    'total',total,
    'category',category,
    'source',case when requires_pay_review then 'Employee profile rate preview; approved pay package needs correction' else 'Approved pay package + statutory/company OT rule' end,
    'note',case when requires_pay_review then rate_issue when r.final_approved_minutes is null then 'Estimate only; final approval or holiday/rest-day classification may change the amount.' when not night_known then 'Night split is not recorded; night premium is not included.' else 'Night premium is shown separately.' end
  );
end
$$;
revoke all on function private.ot_cost_estimate(public.ot_requests) from public,anon,authenticated;

-- New calculations must not use a conflicting package, even when previously approved.
do $$
declare ddl text;needle text:='snap:=private.payroll_quarter_receipt_source(p_time_id);';
begin
 ddl:=pg_get_functiondef('private.payroll_gross_snapshot(uuid)'::regprocedure);
 if strpos(ddl,needle)=0 then raise exception 'Payroll snapshot changed; inspect the rate-check insertion point.';end if;
 ddl:=replace(ddl,'declare snap jsonb;','declare rate_package jsonb;rate_issue text;snap jsonb;');
 ddl:=replace(ddl,needle,needle||'
 for rate_package in select value from jsonb_array_elements(coalesce(snap->''packages'',''[]''::jsonb)) loop
   rate_issue:=private.payroll_package_rate_issue(rate_package);
   if rate_issue is not null then raise exception ''% Employee: %'',rate_issue,(select full_name from public.hris_users where id=(rate_package->>''employee_id'')::uuid) using errcode=''22023'';end if;
 end loop;');
 execute ddl;
end $$;

create or replace function private.guard_imported_payroll_package_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare issue text;
begin
 if new.status='approved' and (tg_op='INSERT' or old.status='draft') then
   issue:=private.payroll_package_rate_issue(to_jsonb(new));
   if issue is not null then raise exception '%',issue using errcode='22023';end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_imported_payroll_package_rate() from public,anon,authenticated;
create trigger guard_imported_payroll_package_rate before insert or update on public.payroll_pay_packages
for each row execute function private.guard_imported_payroll_package_rate();

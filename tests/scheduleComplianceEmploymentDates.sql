-- Read-only regression against an existing midweek hire; no schedules, employee
-- records, exemptions, publications or task history are changed.
begin;
set local statement_timeout='30s';
do $$
declare employee record; wk date; snapshot jsonb; person jsonb; future_week date:='2099-01-05';
begin
  select h.id,h.reports_to::uuid as manager_id,h.date_hired into strict employee
  from public.hris_users h
  where lower(h.status)='active' and not coalesce(h.is_duplicate,false)
    and h.date_hired is not null and extract(isodow from h.date_hired)>1
    and h.end_date is null and h.reports_to is not null
  order by h.date_hired desc,h.id limit 1;
  wk:=date_trunc('week',employee.date_hired)::date;
  snapshot:=schedule_compliance.snapshot(employee.manager_id,wk-7);
  if exists(select 1 from jsonb_array_elements(snapshot->'employees') p where p->>'id'=employee.id::text) then
    raise exception 'Pre-hire week incorrectly requires scheduling';
  end if;
  snapshot:=schedule_compliance.snapshot(employee.manager_id,wk);
  select p into strict person from jsonb_array_elements(snapshot->'employees') p where p->>'id'=employee.id::text;
  if exists(select 1 from jsonb_array_elements(person->'missingDates') d where (d#>>'{}')::date<employee.date_hired) then
    raise exception 'Pre-hire dates incorrectly counted missing';
  end if;
  if (select count(*) from jsonb_array_elements(person->'days') d where (d->>'date')::date<employee.date_hired and d->>'status'='Not employed')<>employee.date_hired-wk then
    raise exception 'Partial week lost its employment boundary';
  end if;
  -- An unscheduled, employed future week must still require scheduling.
  snapshot:=schedule_compliance.snapshot(employee.manager_id,future_week);
  select p into strict person from jsonb_array_elements(snapshot->'employees') p where p->>'id'=employee.id::text;
  if exists(select 1 from jsonb_array_elements(person->'days') d where d->>'status'='Not employed') then
    raise exception 'Employed future dates were excluded';
  end if;
  if exists(select 1 from jsonb_array_elements(person->'days') d where d->>'status'='Missing')
     and ((person->>'complete')::boolean or jsonb_array_length(person->'missingDates')=0) then
    raise exception 'Genuine missing schedules were hidden';
  end if;
  if has_function_privilege('anon','public.get_schedule_compliance(date,uuid)','EXECUTE') then
    raise exception 'Anonymous compliance access enabled';
  end if;
end $$;
select 'PASS: pre-hire weeks excluded, partial employment dates respected, real missing dates retained, access unchanged' as result;
rollback;

begin;
set local lock_timeout = '3s';
set local statement_timeout = '45s';
select set_config('request.jwt.claims',
  jsonb_build_object('sub','30c046c2-f4a2-48d3-98bf-9b733eb61a70','role','authenticated')::text,true);
set local role authenticated;

do $verify$
declare
  scope text := 'business_unit:d4e83811-8234-49d6-80ab-5bee7cc44e00';
  leonard uuid := '43195b70-44aa-4be9-93ea-fa90dc3c4c8f';
  sassy uuid := 'e7667bf7-deca-45d9-8a39-16f15f6b18a9';
  jennifer uuid := '0eae01f0-c7e5-4115-b617-07a93eeaa39e';
  preset uuid := 'e2fda27a-cfb8-4bb8-aa99-82aa879544f9';
  roster jsonb; review jsonb; published jsonb; denied boolean := false;
begin
  roster := public.get_schedule_builder_data(scope,'2026-08-31');
  if not exists(select 1 from jsonb_array_elements(roster->'people') p
    where p->>'id'=leonard::text and p->>'can_edit'='true'
      and p->>'end_date'='2026-08-31') then
    raise exception 'Leonard was not editable for his last employed week';
  end if;
  if not exists(select 1 from jsonb_array_elements(roster->'people') p
    where p->>'id'=sassy::text and p->>'can_edit'='true') then
    raise exception 'Sassy was not editable for her last employed week';
  end if;
  if exists(select 1 from jsonb_array_elements(roster->'people') p
    where p->>'id'=jennifer::text) then
    raise exception 'Jennifer appeared before her September 15 hire date';
  end if;

  perform public.save_schedule_builder_shift(scope,'2026-08-31',leonard,'2026-08-31',preset);
  begin
    perform public.save_schedule_builder_shift(scope,'2026-08-31',leonard,'2026-09-01',preset);
  exception when invalid_parameter_value then denied:=true;
  end;
  if not denied then raise exception 'A shift after separation was accepted';end if;
  review := public.review_payroll_schedule_week(array[leonard],'2026-08-31');
  if review#>'{0,issues}' <> '[]'::jsonb then
    raise exception 'Publication still requires schedules after the separation date: %',
      review#>'{0,issues}';
  end if;
  published := public.publish_schedule_builder_week(scope,array[leonard],'2026-08-31',
    'Rollback historical separated schedule check',
    jsonb_build_object(leonard::text,review#>>'{0,draftHash}'));
  if jsonb_array_length(published)<>1 then raise exception 'The past week was not published';end if;
end $verify$;
reset role;
select 'PASS: separated employee historical roster, saving, publication, and post-end-date denial; rolled back' result;
rollback;

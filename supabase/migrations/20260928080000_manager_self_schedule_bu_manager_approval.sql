-- Restore Eric Felipe's own schedule proposal to his direct manager Rogelio
-- Dacanay only. Do not change the routing of other business-unit managers or
-- employees. The existing version, freeze, preset and publication checks stay.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function schedule_compliance.bod_manager(p_employee uuid)
returns uuid language sql stable security definer set search_path = '' as $function$
  select approver.id
  from public.hris_users employee
  join public.hris_users approver on approver.id::text = employee.reports_to
  where employee.id = p_employee
    and employee.id <> approver.id
    and lower(employee.status::text) = 'active'
    and lower(approver.status::text) = 'active'
    and (
      private.workflow_user_has_role(approver.id, 'Board of Director')
      or private.workflow_user_has_role(approver.id, 'GeneralManager')
      or (
        employee.id = '434d1a8e-36ee-40aa-9ce6-ee1a8b1f9ac0'::uuid
        and approver.id = '207ba7fa-d7fc-4404-8bf3-2e5053f747b7'::uuid
        and private.workflow_user_has_role(employee.id, 'Manager')
        and private.workflow_user_has_role(approver.id, 'Business Unit Manager')
        and employee.business_unit_id is not null
        and employee.business_unit_id = approver.business_unit_id
      )
    );
$function$;
revoke all on function schedule_compliance.bod_manager(uuid) from public, anon, authenticated;

do $migration$
declare ddl text;
begin
  ddl := pg_get_functiondef('public.get_bod_schedule_workflow(date)'::regprocedure);
  if position('''managerRole'',case when private.workflow_user_has_role(m,''Board of Director'') then ''BOD'' when private.workflow_user_has_role(m,''GeneralManager'') then ''GM'' else null end' in ddl) = 0 then
    raise exception 'Schedule workflow metadata changed; review before enabling BU manager approval';
  end if;
  ddl := replace(ddl,
    '''managerRole'',case when private.workflow_user_has_role(m,''Board of Director'') then ''BOD'' when private.workflow_user_has_role(m,''GeneralManager'') then ''GM'' else null end',
    '''isBuManager'',private.workflow_user_has_role(actor,''Business Unit Manager''),''managerRole'',case when private.workflow_user_has_role(m,''Board of Director'') then ''BOD'' when private.workflow_user_has_role(m,''GeneralManager'') then ''GM'' when private.workflow_user_has_role(m,''Business Unit Manager'') then ''BUM'' else null end');
  execute ddl;

  ddl := pg_get_functiondef('public.submit_my_bod_schedule(date,jsonb,text)'::regprocedure);
  if position('Only active employees reporting directly to a BOD or GM can submit their own schedule here' in ddl) = 0 then
    raise exception 'Schedule submission changed; review before enabling BU manager approval';
  end if;
  execute replace(ddl,
    'Only active employees reporting directly to a BOD or GM can submit their own schedule here',
    'Only eligible employees reporting directly to a BOD, GM, or business-unit manager can submit their own schedule here');

  ddl := pg_get_functiondef('public.review_bod_schedule_submission(uuid,integer,boolean,text)'::regprocedure);
  if position('Only the current assigned BOD or GM may review this schedule' in ddl) = 0 then
    raise exception 'Schedule review changed; review before enabling BU manager approval';
  end if;
  execute replace(ddl,
    'Only the current assigned BOD or GM may review this schedule',
    'Only the current assigned BOD, GM, or business-unit manager may review this schedule');

  ddl := pg_get_functiondef('private.schedule_submission_approval_allows_preset(uuid,uuid,date,uuid,text)'::regprocedure);
  if position('or private.workflow_user_has_role(p_actor, ''GeneralManager'')' in ddl) = 0 then
    raise exception 'Submission preset guard changed; review before enabling BU manager approval';
  end if;
  execute replace(ddl,
    'or private.workflow_user_has_role(p_actor, ''GeneralManager'')',
    'or private.workflow_user_has_role(p_actor, ''GeneralManager'') or (p_employee = ''434d1a8e-36ee-40aa-9ce6-ee1a8b1f9ac0''::uuid and p_actor = ''207ba7fa-d7fc-4404-8bf3-2e5053f747b7''::uuid and private.workflow_user_has_role(p_actor, ''Business Unit Manager''))');
end $migration$;

revoke all on function public.get_bod_schedule_workflow(date), public.submit_my_bod_schedule(date,jsonb,text), public.review_bod_schedule_submission(uuid,integer,boolean,text) from public, anon, authenticated;
grant execute on function public.get_bod_schedule_workflow(date), public.submit_my_bod_schedule(date,jsonb,text), public.review_bod_schedule_submission(uuid,integer,boolean,text) to authenticated;
revoke all on function private.schedule_submission_approval_allows_preset(uuid,uuid,date,uuid,text) from public, anon, authenticated;
notify pgrst, 'reload schema';

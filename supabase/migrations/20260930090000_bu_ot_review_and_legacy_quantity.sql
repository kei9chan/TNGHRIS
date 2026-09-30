-- Only an active manager for the request's own business unit may verify OT.
create function private.is_business_unit_ot_manager(p_actor uuid,p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor<>p_employee and exists(
  select 1 from public.hris_users manager join public.hris_users employee
   on employee.id=p_employee and employee.business_unit_id=manager.business_unit_id
  where manager.id=p_actor and lower(manager.status)='active'
   and public.has_active_role('Business Unit Manager')
 );
$$;
revoke all on function private.is_business_unit_ot_manager(uuid,uuid) from public,anon,authenticated;

do $$declare ddl text;begin
 ddl:=pg_get_functiondef('private.process_time_request_approval_core(text,uuid,text,text)'::regprocedure);
 if strpos(ddl,'if not private.is_direct_reporting_manager(actor_id, employee_id) then')=0 then raise exception 'OT decision authorization changed; review routing.';end if;
 ddl:=replace(ddl,'if not private.is_direct_reporting_manager(actor_id, employee_id) then',
  'if not (case when lower(p_request_type)=''overtime'' then private.is_business_unit_ot_manager(actor_id,employee_id) else private.is_direct_reporting_manager(actor_id,employee_id) end) then');
 execute ddl;
 ddl:=pg_get_functiondef('private.ot_can_decide(public.ot_requests)'::regprocedure);
 if strpos(ddl,'private.is_direct_reporting_manager(public.current_hris_user_id(),r.employee_id)')=0 then raise exception 'OT reviewer predicate changed.';end if;
 ddl:=replace(ddl,'private.is_direct_reporting_manager(public.current_hris_user_id(),r.employee_id)', 'private.is_business_unit_ot_manager(public.current_hris_user_id(),r.employee_id)');
 execute ddl;
 ddl:=pg_get_functiondef('public.get_ot_week_review(uuid[])'::regprocedure);
 ddl:=replace(ddl,'private.is_direct_reporting_manager(actor,g.employee_id)','private.is_business_unit_ot_manager(actor,g.employee_id)');
 execute ddl;
 ddl:=pg_get_functiondef('public.confirm_ot_week_baseline(uuid,date,integer,text)'::regprocedure);
 ddl:=replace(ddl,'private.is_direct_reporting_manager(public.current_hris_user_id(),p_employee)','private.is_business_unit_ot_manager(public.current_hris_user_id(),p_employee)');
 execute ddl;
end $$;

-- Old Approved rows with empty quantity need a separate, explicit manager
-- attestation. Preserve their historical decision; never derive pay from punches.
create function public.verify_legacy_ot_hours(p_amounts jsonb,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();item record;r public.ot_requests;n integer;maximum integer;outcome jsonb:='[]';begin
 if auth.uid() is null or actor is null or jsonb_typeof(p_amounts)<>'object' or (select count(*) from jsonb_each(p_amounts)) not between 1 and 30 then raise exception 'Choose 1–30 older OT requests and their verified minutes.';end if;
 for item in select key,value from jsonb_each_text(p_amounts) order by key loop
  if item.key !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Invalid OT request ID.';end if;
  select * into r from public.ot_requests where id=item.key::uuid for update;
  if r.id is null or not private.is_business_unit_ot_manager(actor,r.employee_id) then raise exception 'Only the active business unit manager can verify this employee''s OT amount.' using errcode='42501';end if;
  if exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=r.employee_id and r.date between f.date_from and f.date_to) then raise exception 'Payroll is locked for %. Use the authorized correction path.',r.date;end if;
  if r.status::text<>'Approved' then raise exception 'Request % is not an older approved request.',r.id;end if;
  if item.value !~ '^[0-9]+$' then raise exception 'Enter whole verified minutes for %.',r.date;end if;
  n:=item.value::integer;
  maximum:=private.ot_requested_minutes(r);
  if maximum is null or n not between 0 and least(maximum,1440) then raise exception 'Verified hours for % must be within the original extra-work interval (% minutes).',r.date,maximum;end if;
  if r.final_approved_minutes is not null or r.approved_hours is not null then
   if r.final_approved_minutes=n or round(r.approved_hours*60)::integer=n then outcome:=outcome||jsonb_build_array(jsonb_build_object('id',r.id,'minutes',n,'alreadyVerified',true));continue;end if;
   raise exception 'Approved hours have already been recorded for %. Refresh before changing them.',r.date;
  end if;
  perform set_config('app.manual_ot_decision',actor::text,true);
  update public.ot_requests set approved_hours=n/60.0,final_approved_minutes=n,manager_confirmed_minutes=n,manager_confirmed_by=actor,manager_confirmed_at=clock_timestamp(),updated_at=clock_timestamp(),history_log=coalesce(history_log,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('action','Legacy approved OT hours verified','by',actor,'date',clock_timestamp(),'minutes',n,'note',p_note)) where id=r.id;
  insert into public.audit_logs(user_id,action,entity,entity_id,details) values(actor::text,'VERIFY_LEGACY_OT_HOURS','Overtime',r.id::text,jsonb_build_object('minutes',n,'originalIntervalMinutes',maximum,'note',p_note)::text);
  outcome:=outcome||jsonb_build_array(jsonb_build_object('id',r.id,'minutes',n));
 end loop;
 return outcome;
end $$;
revoke all on function public.verify_legacy_ot_hours(jsonb,text) from public,anon;
grant execute on function public.verify_legacy_ot_hours(jsonb,text) to authenticated;
notify pgrst,'reload schema';

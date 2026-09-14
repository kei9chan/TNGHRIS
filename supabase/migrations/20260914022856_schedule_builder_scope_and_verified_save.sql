-- Narrow, schedule-only planning read. Existing employee/payroll RLS remains unchanged.
create or replace function public.get_schedule_builder_data(p_scope text, p_week date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.current_hris_user_id(); ids uuid[]; people jsonb;
begin
 if auth.uid() is null or private.payroll_actor_id() is null then
  raise exception 'Sign in with an active schedule-builder account.' using errcode='42501';
 end if;
 if p_scope not in ('direct','business_unit') or p_scope is null or p_week is null or extract(isodow from p_week) <> 1 then
  raise exception 'Select a valid scope and Monday week-start date.' using errcode='22023';
 end if;
 if not (private.payroll_schedule_can_edit(actor) or exists(select 1 from public.hris_users h where h.reports_to=actor::text and lower(h.status::text)='active' and h.id<>actor)) then
  raise exception 'Schedule builder access required.' using errcode='42501';
 end if;
 select array_agg(h.id),coalesce(jsonb_agg(jsonb_build_object(
  'id',h.id,'full_name',h.full_name,'role',h.role,'status',h.status,
  'business_unit',h.business_unit,'business_unit_id',h.business_unit_id,
  'department',h.department,'department_id',h.department_id,'position',h.position,
  'reports_to',h.reports_to,'can_edit',private.payroll_schedule_can_edit(h.id)
 ) order by h.full_name),'[]') into ids,people
 from public.hris_users h join public.hris_users a on a.id=actor
 where lower(h.status::text)='active' and
 ((p_scope='direct' and h.reports_to=actor::text and h.id<>actor)
 or (p_scope='business_unit' and a.business_unit_id is not null and h.business_unit_id=a.business_unit_id));
 return jsonb_build_object('people',people,
 'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'employee_id',s.employee_id,'shift_template_id',s.shift_template_id,'date',s.date,'assigned_area_id',s.assigned_area_id) order by s.date,s.id),'[]') from public.shift_assignments s where s.employee_id=any(ids) and s.date between p_week-7 and p_week+13),
 'statuses',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'employee_id',s.employee_id,'work_date',s.work_date,'tag',s.tag,'revision',s.revision)),'[]') from public.schedule_day_statuses s where s.employee_id=any(ids) and s.work_date between p_week-7 and p_week+13 and not exists(select 1 from public.schedule_day_statuses n where n.employee_id=s.employee_id and n.work_date=s.work_date and n.revision>s.revision)));
end $$;
revoke all on function public.get_schedule_builder_data(text,date) from public,anon;
grant execute on function public.get_schedule_builder_data(text,date) to authenticated;

-- Invoker keeps table RLS, triggers and audit rules in force. No client-provided BU/creator.
create or replace function public.save_schedule_builder_shift(p_scope text,p_week date,p_employee uuid,p_date date,p_template uuid,p_expected_id uuid default null,p_expected_template uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare roster jsonb; person jsonb; current_row public.shift_assignments%rowtype; row_count integer;
begin
 if auth.uid() is null then raise exception 'Sign in before saving.' using errcode='42501'; end if;
 if p_date is null or p_date < p_week or p_date > p_week+6 then raise exception 'Shift date must belong to the selected week.' using errcode='22023'; end if;
 roster:=public.get_schedule_builder_data(p_scope,p_week);
 select value into person from jsonb_array_elements(roster->'people') where value->>'id'=p_employee::text and (value->>'can_edit')::boolean;
 if person is null then raise exception 'You cannot edit this employee in the selected scope.' using errcode='42501'; end if;
 if not exists(select 1 from public.shift_templates t where t.id=p_template and t.business_unit_id=(person->>'business_unit_id')::uuid) then raise exception 'Select a shift preset for this employee’s business unit.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_employee::text||':'||p_date::text,0));
 select count(*) into row_count from public.shift_assignments where employee_id=p_employee and date=p_date;
 if row_count>1 then raise exception 'Multiple saved shifts exist for this date. HR must resolve the conflicting drafts before saving.' using errcode='40001'; end if;
 select * into current_row from public.shift_assignments where employee_id=p_employee and date=p_date for update;
 -- A retry after a lost response is a no-op when the requested value is already saved.
 if current_row.id is not null and current_row.shift_template_id=p_template then return to_jsonb(current_row); end if;
 if current_row.id is distinct from p_expected_id or current_row.shift_template_id is distinct from p_expected_template then
  raise exception 'This shift changed in another session. Your selection is preserved; reload the saved schedule before applying it again.' using errcode='40001';
 end if;
 if current_row.id is null then
  insert into public.shift_assignments(employee_id,date,shift_template_id,business_unit_id,department_id,created_by)
  values(p_employee,p_date,p_template,(person->>'business_unit_id')::uuid,(person->>'department_id')::uuid,public.current_hris_user_id()) returning * into current_row;
 else
  update public.shift_assignments set shift_template_id=p_template,business_unit_id=(person->>'business_unit_id')::uuid where id=current_row.id returning * into current_row;
 end if;
 if current_row.id is null then raise exception 'Permission denied: no shift was saved.' using errcode='42501'; end if;
 return to_jsonb(current_row);
end $$;
revoke all on function public.save_schedule_builder_shift(text,date,uuid,date,uuid,uuid,uuid) from public,anon;
grant execute on function public.save_schedule_builder_shift(text,date,uuid,date,uuid,uuid,uuid) to authenticated;

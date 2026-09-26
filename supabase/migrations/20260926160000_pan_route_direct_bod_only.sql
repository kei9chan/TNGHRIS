-- PAN approvals follow the active reporting line. A BOD step is required only
-- when the employee directly reports to a BOD. Older pending PANs are repaired
-- to the same rule so stale BOD approvals do not block the manager workflow.

create or replace function private.pan_employee_requires_bod(p_employee_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.hris_users employee
    join public.hris_users manager on (
      manager.id::text = employee.reports_to
      or manager.auth_user_id::text = employee.reports_to
      or coalesce(manager.employee_id,'') = employee.reports_to
      or manager.full_name = employee.reports_to
    )
    where employee.id=p_employee_id and employee.id<>manager.id
      and lower(employee.status::text)='active' and lower(manager.status::text)='active'
      and private.pan_user_is_bod(manager.id::text)
  );
$$;

create or replace function private.pan_parallel_bod_steps_for_employee(p_steps jsonb,p_employee_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare steps jsonb:=coalesce(p_steps,'[]'::jsonb); step jsonb; outp jsonb:='[]'::jsonb; ready boolean; first_waiting boolean:=false; i integer:=0; requires_bod boolean:=private.pan_employee_requires_bod(p_employee_id);
begin
  if not requires_bod then
    select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into steps
    from jsonb_array_elements(steps) with ordinality route(value,ordinality)
    where not private.pan_user_is_bod(value->>'userId');
  else
    for step in
      select jsonb_build_object('id','bod-'||h.id,'userId',h.id,'name',h.full_name,'role','Board of Director','status','Waiting')
      from public.hris_users h
      where private.pan_user_is_bod(h.id::text)
        and not exists(select 1 from jsonb_array_elements(steps) s where s->>'userId'=h.id::text)
      order by h.id
    loop steps:=steps||jsonb_build_array(step); end loop;
  end if;
  ready:=not exists(select 1 from jsonb_array_elements(steps) s where not private.pan_user_is_bod(s->>'userId') and s->>'status' is distinct from 'Approved');
  for step in select value from jsonb_array_elements(steps) loop
    if private.pan_user_is_bod(step->>'userId') then
      step:=step||jsonb_build_object('role','Board of Director');
      if step->>'status' in ('Pending','Waiting') then step:=step||jsonb_build_object('status',case when ready then 'Pending' else 'Waiting' end); end if;
    elsif step->>'status' in ('Pending','Waiting') and not first_waiting then
      step:=step||jsonb_build_object('status','Pending'); first_waiting:=true;
    end if;
    outp:=outp||jsonb_build_array(step||jsonb_build_object('order',i)); i:=i+1;
  end loop;
  return outp;
end;
$$;

create or replace function private.pan_parallel_bod_route_guard()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status::text='Pending Approval' then new.routing_steps:=private.pan_parallel_bod_steps_for_employee(new.routing_steps,new.employee_id); end if;
  return new;
end;
$$;

do $$
declare ddl text;
begin
  ddl:=pg_get_functiondef('public.submit_pan(uuid)'::regprocedure);
  ddl:=replace(ddl,'private.pan_parallel_bod_steps(pan_row.routing_steps)','private.pan_parallel_bod_steps_for_employee(pan_row.routing_steps,pan_row.employee_id)');
  ddl:=replace(ddl,'private.pan_parallel_bod_steps(normalized_steps)','private.pan_parallel_bod_steps_for_employee(normalized_steps,pan_row.employee_id)');
  ddl:=replace(ddl,'if bod_count = 0 then
    raise exception ''Every PAN requires at least one active Board of Director approver.'';
  end if;','if bod_count = 0 and private.pan_employee_requires_bod(pan_row.employee_id) then
    raise exception ''A Board of Director approver is required because this employee reports directly to a BOD.'';
  end if;');
  execute ddl;
  ddl:=pg_get_functiondef('public.approve_pan(uuid,text)'::regprocedure);
  ddl:=replace(ddl,'private.pan_parallel_bod_steps(rebuilt)','private.pan_parallel_bod_steps_for_employee(rebuilt,pan_row.employee_id)');
  ddl:=replace(ddl,'if pan_row.workflow_version >= 2 and not bod_approved then','if pan_row.workflow_version >= 2 and private.pan_employee_requires_bod(pan_row.employee_id) and not bod_approved then');
  execute ddl;
  ddl:=pg_get_functiondef('public.accept_pan(uuid,text,text)'::regprocedure);
  ddl:=replace(ddl,'if pan_row.workflow_version>=2 and (not all_approved or not bod_approved) then','if pan_row.workflow_version>=2 and (not all_approved or (private.pan_employee_requires_bod(pan_row.employee_id) and not bod_approved)) then');
  ddl:=replace(ddl,'if pan_row.workflow_version >= 2 and (not all_approved or not bod_approved) then','if pan_row.workflow_version >= 2 and (not all_approved or (private.pan_employee_requires_bod(pan_row.employee_id) and not bod_approved)) then');
  execute ddl;
end;
$$;

revoke all on function private.pan_employee_requires_bod(uuid),private.pan_parallel_bod_steps_for_employee(jsonb,uuid) from public,anon,authenticated;

update public.pans p set routing_steps=private.pan_parallel_bod_steps_for_employee(p.routing_steps,p.employee_id),updated_at=clock_timestamp() where p.status::text='Pending Approval';

notify pgrst,'reload schema';
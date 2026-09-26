-- If the employee reports directly to a BOD, only that direct BOD is the
-- final approver. Other BODs must not receive a parallel approval task.

create or replace function private.pan_direct_bod_manager(p_employee_id uuid)
returns uuid language sql stable security definer set search_path=''
as $$
  select manager.id
  from public.hris_users employee
  join public.hris_users manager on (
    manager.id::text = employee.reports_to
    or manager.auth_user_id::text = employee.reports_to
    or coalesce(manager.employee_id,'') = employee.reports_to
    or manager.full_name = employee.reports_to
  )
  where employee.id=p_employee_id and employee.id<>manager.id
    and lower(employee.status::text)='active' and lower(manager.status::text)='active'
    and private.pan_user_is_bod(manager.id::text)
  limit 1;
$$;

create or replace function private.pan_employee_requires_bod(p_employee_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.pan_direct_bod_manager(p_employee_id) is not null; $$;

create or replace function private.pan_parallel_bod_steps_for_employee(p_steps jsonb,p_employee_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare steps jsonb:=coalesce(p_steps,'[]'::jsonb); step jsonb; outp jsonb:='[]'::jsonb; ready boolean; first_waiting boolean:=false; i integer:=0; direct_bod uuid:=private.pan_direct_bod_manager(p_employee_id);
begin
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into steps
  from jsonb_array_elements(steps) with ordinality route(value,ordinality)
  where not private.pan_user_is_bod(value->>'userId') or (direct_bod is not null and value->>'userId'=direct_bod::text);
  if direct_bod is not null and not exists(select 1 from jsonb_array_elements(steps) s where s->>'userId'=direct_bod::text) then
    steps:=steps||jsonb_build_array(jsonb_build_object('id','bod-'||direct_bod,'userId',direct_bod,'name',(select full_name from public.hris_users where id=direct_bod),'role','Board of Director','status','Waiting'));
  end if;
  ready:=not exists(select 1 from jsonb_array_elements(steps) s where not private.pan_user_is_bod(s->>'userId') and s->>'status' is distinct from 'Approved');
  for step in select value from jsonb_array_elements(steps) loop
    if private.pan_user_is_bod(step->>'userId') then
      step:=step||jsonb_build_object('role','Board of Director');
      if step->>'status' in ('Pending','Waiting') then step:=step||jsonb_build_object('status',case when ready then 'Pending' else 'Waiting' end); end if;
    elsif step->>'status' in ('Pending','Waiting') and not first_waiting then step:=step||jsonb_build_object('status','Pending'); first_waiting:=true;
    end if;
    outp:=outp||jsonb_build_array(step||jsonb_build_object('order',i)); i:=i+1;
  end loop;
  return outp;
end;
$$;

update public.pans p
set routing_steps=private.pan_parallel_bod_steps_for_employee(p.routing_steps,p.employee_id),updated_at=clock_timestamp()
where p.status::text='Pending Approval';

notify pgrst,'reload schema';